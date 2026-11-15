"""KharisNet: TCN residual ultraligera multisalida + perdida extreme-aware + calibracion.

Entradas: clima_ventana        [batch_size, seq_len, n_features]
          climatologia_futura  [batch_size, horizonte, n_objetivos]       (valor normal de cada dia objetivo)
Salidas : prediccion    [batch_size, horizonte, n_objetivos]              (media condicional, escala del modelo)
          cuantiles     [batch_size, horizonte, n_objetivos, n_cuantiles] (monotonos por construccion)
"""
from __future__ import annotations

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F


# =========================================================================== red
class BloqueTemporal(nn.Module):
    """Dos convoluciones causales dilatadas con conexion residual."""

    def __init__(self, canales: int, kernel: int, dilatacion: int, dropout: float):
        super().__init__()
        self.relleno = (kernel - 1) * dilatacion
        # Causal: se rellena a ambos lados y se recorta la cola (equivale a rellenar solo a la izquierda).
        # Asi el ONNX queda como Conv + Slice, limpio en Netron.
        self.conv1 = nn.Conv1d(canales, canales, kernel, dilation=dilatacion, padding=self.relleno)
        self.conv2 = nn.Conv1d(canales, canales, kernel, dilation=dilatacion, padding=self.relleno)
        self.norm1 = nn.GroupNorm(1, canales)
        self.norm2 = nn.GroupNorm(1, canales)
        self.drop = nn.Dropout(dropout)

    def forward(self, x):
        y = self.conv1(x)[:, :, :-self.relleno]
        y = self.drop(F.gelu(self.norm1(y)))
        y = self.conv2(y)[:, :, :-self.relleno]
        y = self.drop(F.gelu(self.norm2(y)))
        return x + y


class KharisNet(nn.Module):
    def __init__(self, n_features: int, n_objetivos: int, horizonte: int, n_cuantiles: int,
                 canales: int = 64, bloques: int = 5, kernel: int = 3, dropout: float = 0.1):
        super().__init__()
        self.n_features, self.n_objetivos = n_features, n_objetivos
        self.horizonte, self.n_cuantiles = horizonte, n_cuantiles
        self.entrada = nn.Conv1d(n_features, canales, 1)
        self.tcn = nn.Sequential(*[BloqueTemporal(canales, kernel, 2**i, dropout) for i in range(bloques)])
        self.cuello = nn.Sequential(nn.Linear(2 * canales, 2 * canales), nn.GELU(), nn.Dropout(dropout))
        self.cabeza_media = nn.Linear(2 * canales, horizonte * n_objetivos)
        self.cabeza_cuantiles = nn.Linear(2 * canales, horizonte * n_objetivos * n_cuantiles)
        self.campo_receptivo = 1 + 2 * (kernel - 1) * (2**bloques - 1)

    def forward(self, clima_ventana: torch.Tensor, climatologia_futura: torch.Tensor):
        """clima_ventana [B, L, F]; climatologia_futura [B, H, n_objetivos] = valor normal de cada dia objetivo.

        La red solo aprende la ANOMALIA respecto a esa climatologia: en el peor caso predice lo normal de la
        fecha, y en pronosticos largos vuelve sola a la climatologia en vez de derivar.
        """
        h = self.entrada(clima_ventana.transpose(1, 2))   # [B, C, L]
        h = self.tcn(h)
        z = torch.cat([h[:, :, -1], h.mean(dim=2)], dim=1)  # ultimo dia + resumen de la ventana
        z = self.cuello(z)
        B = z.shape[0]
        prediccion = climatologia_futura + self.cabeza_media(z).reshape(B, self.horizonte, self.n_objetivos)
        q = self.cabeza_cuantiles(z).reshape(B, self.horizonte, self.n_objetivos, self.n_cuantiles)
        # primer cuantil libre + incrementos positivos: los cuantiles nunca se cruzan
        q = torch.cat([q[..., :1], q[..., :1] + torch.cumsum(F.softplus(q[..., 1:]), dim=-1)], dim=-1)
        cuantiles = climatologia_futura.unsqueeze(-1) + q
        return prediccion, cuantiles


def crear_modelo(cfg, n_features: int) -> KharisNet:
    return KharisNet(n_features, len(cfg.objetivos), cfg.horizonte, len(cfg.cuantiles),
                     cfg.canales, cfg.bloques, cfg.kernel, cfg.dropout)


# =========================================================================== perdida extreme-aware
class PerdidaExtremos(nn.Module):
    """Huber ponderado por colas + pinball (cuantilica) + termino explicito de cola (>= p95).

    total = huber_ponderado + lambda_cuantil * pinball + lambda_cola * huber_cola
    Los pesos suben donde el valor real es extremo, para que la red no colapse al promedio.
    """

    def __init__(self, cuantiles, beta=1.0, peso_p80=1.0, peso_p95=3.0, lambda_cuantil=1.0, lambda_cola=0.25):
        super().__init__()
        self.register_buffer("q", torch.tensor(list(cuantiles), dtype=torch.float32))
        self.beta, self.peso_p80, self.peso_p95 = beta, peso_p80, peso_p95
        self.lambda_cuantil, self.lambda_cola = lambda_cuantil, lambda_cola

    def forward(self, prediccion, cuantiles, y, e80, e95):
        prediccion, cuantiles = prediccion.float(), cuantiles.float()
        m = torch.isfinite(y).float()
        y0 = torch.nan_to_num(y, nan=0.0)
        w = (1.0 + self.peso_p80 * e80 + self.peso_p95 * e95) * m
        hub = F.smooth_l1_loss(prediccion, y0, reduction="none", beta=self.beta)
        base = (hub * m).sum() / m.sum().clamp(min=1.0)
        ponderada = (hub * w).sum() / w.sum().clamp(min=1.0)
        mc = e95 * m
        cola = (hub * mc).sum() / mc.sum().clamp(min=1.0)
        dif = y0.unsqueeze(-1) - cuantiles
        pin = torch.maximum(self.q * dif, (self.q - 1.0) * dif).mean(dim=-1)
        cuantil = (pin * w).sum() / w.sum().clamp(min=1.0)
        total = ponderada + self.lambda_cuantil * cuantil + self.lambda_cola * cola
        return {"total": total, "valor": total.detach(), "base": base.detach(), "cuantil": cuantil.detach(), "cola": cola.detach()}


def crear_perdida(cfg) -> PerdidaExtremos:
    return PerdidaExtremos(cfg.cuantiles, cfg.huber_beta, cfg.peso_p80, cfg.peso_p95, cfg.lambda_cuantil, cfg.lambda_cola)


# =========================================================================== calibracion
def _pav(y: np.ndarray, w: np.ndarray) -> np.ndarray:
    """Regresion isotonica (pool adjacent violators): la mejor curva no decreciente."""
    vals, pesos, tam = [], [], []
    for yi, wi in zip(y, w):
        vals.append(float(yi)); pesos.append(float(wi)); tam.append(1)
        while len(vals) > 1 and vals[-2] > vals[-1]:
            wt = pesos[-2] + pesos[-1]
            v = (vals[-2] * pesos[-2] + vals[-1] * pesos[-1]) / wt
            n = tam[-2] + tam[-1]
            del vals[-1], pesos[-1], tam[-1]
            vals[-1], pesos[-1], tam[-1] = v, wt, n
    return np.repeat(vals, tam)


def _interp_extrap(x, xk, yk):
    """Interpolacion lineal; fuera de los nudos sigue con pendiente 1 (no aplasta lo sin precedentes)."""
    r = np.interp(x, xk, yk)
    r = np.where(x > xk[-1], yk[-1] + (x - xk[-1]), r)
    return np.where(x < xk[0], yk[0] + (x - xk[0]), r)


class Calibrador:
    """Correccion de sesgo posterior, en unidades fisicas, por (horizonte, variable).

    * Media: mapa monotono por tramos (isotonico). Corrige el sesgo condicional, incluido el de los picos.
    * Cuantiles: desplazamiento conformal para que la cobertura empirica iguale la nominal.
    Es ligero (unos cientos de numeros) y se actualiza por lotes sin reentrenar la red.
    """

    def __init__(self, cuantiles, n_bins: int = 24, min_muestras: int = 400):
        self.cuantiles = [float(q) for q in cuantiles]
        self.n_bins, self.min_muestras = int(n_bins), int(min_muestras)
        self.nudos_x = None   # [H, V, K]
        self.nudos_y = None   # [H, V, K]
        self.delta_q = None   # [H, V, Q]
        self.n_ajustes = 0

    @property
    def ajustado(self) -> bool:
        return self.nudos_x is not None

    def _ajustar_uno(self, p, o):
        ok = np.isfinite(p) & np.isfinite(o)
        p, o = p[ok], o[ok]
        K = self.n_bins
        if len(p) < self.min_muestras or np.ptp(p) < 1e-9:
            return None
        qs = np.concatenate([np.linspace(0, 95, K - 3), [97.5, 99.0, 99.7, 100.0]])
        bordes = np.unique(np.percentile(p, qs))
        if len(bordes) < 4:
            return None
        b = np.clip(np.searchsorted(bordes, p, side="right") - 1, 0, len(bordes) - 2)
        n = np.bincount(b, minlength=len(bordes) - 1).astype(float)
        sx = np.bincount(b, weights=p, minlength=len(bordes) - 1)
        sy = np.bincount(b, weights=o, minlength=len(bordes) - 1)
        m = n > 0
        x, y = sx[m] / n[m], _pav(sy[m] / n[m], n[m])
        malla = np.percentile(p, np.concatenate([np.linspace(0, 95, K - 3), [97.5, 99.0, 99.7]]))  # K nudos fijos
        malla = np.maximum.accumulate(malla + np.arange(K) * 1e-7)
        return malla, _interp_extrap(malla, x, y)

    def ajustar(self, pred, cuant, obs, olvido: float = 1.0):
        """pred/obs [N, H, V], cuant [N, H, V, Q] en unidades fisicas.

        olvido = 1 reemplaza la calibracion; 0 < olvido < 1 la mezcla con la anterior (actualizacion incremental).
        """
        _, H, V = pred.shape
        K, Q = self.n_bins, len(self.cuantiles)
        nx, ny, dq = np.zeros((H, V, K)), np.zeros((H, V, K)), np.zeros((H, V, Q))
        previo = self.ajustado and olvido < 1.0
        for h in range(H):
            for v in range(V):
                r = self._ajustar_uno(pred[:, h, v].astype(np.float64), obs[:, h, v].astype(np.float64))
                if r is None:  # sin datos suficientes: identidad (o lo que ya habia)
                    if self.ajustado:
                        nx[h, v], ny[h, v] = self.nudos_x[h, v], self.nudos_y[h, v]
                    else:
                        lo, hi = np.nanmin(pred[:, h, v]), np.nanmax(pred[:, h, v])
                        lo, hi = (lo, hi) if np.isfinite(lo) and hi > lo else (0.0, 1.0)
                        nx[h, v] = ny[h, v] = np.linspace(lo, hi, K)
                else:
                    malla, y = r
                    if previo:  # mezcla exponencial sobre la malla nueva
                        y = (1 - olvido) * _interp_extrap(malla, self.nudos_x[h, v], self.nudos_y[h, v]) + olvido * y
                        y = np.maximum.accumulate(y)
                    nx[h, v], ny[h, v] = malla, y
                res = obs[:, h, v, None].astype(np.float64) - cuant[:, h, v].astype(np.float64)
                ok = np.isfinite(res).all(axis=1)
                if ok.sum() >= self.min_muestras:
                    d = np.array([np.quantile(res[ok, i], q) for i, q in enumerate(self.cuantiles)])
                    dq[h, v] = (1 - olvido) * self.delta_q[h, v] + olvido * d if previo else d
                elif self.ajustado:
                    dq[h, v] = self.delta_q[h, v]
        self.nudos_x, self.nudos_y, self.delta_q = nx, ny, dq
        self.n_ajustes += 1
        return self

    def aplicar(self, pred, cuant):
        if not self.ajustado:
            return pred, cuant
        p = np.empty_like(pred, dtype=np.float32)
        H, V = pred.shape[-2], pred.shape[-1]
        for h in range(H):
            for v in range(V):
                p[..., h, v] = _interp_extrap(pred[..., h, v].astype(np.float64), self.nudos_x[h, v], self.nudos_y[h, v])
        c = (cuant + self.delta_q.astype(np.float32)).astype(np.float32)
        return p, np.maximum.accumulate(c, axis=-1)

    def a_dict(self) -> dict:
        return {"cuantiles": self.cuantiles, "n_bins": self.n_bins, "min_muestras": self.min_muestras,
                "nudos_x": self.nudos_x, "nudos_y": self.nudos_y, "delta_q": self.delta_q, "n_ajustes": self.n_ajustes}

    @classmethod
    def desde_dict(cls, d: dict) -> "Calibrador":
        c = cls(d["cuantiles"], d["n_bins"], d["min_muestras"])
        c.nudos_x, c.nudos_y, c.delta_q, c.n_ajustes = d["nudos_x"], d["nudos_y"], d["delta_q"], d.get("n_ajustes", 0)
        return c

    def copia(self) -> "Calibrador":
        d = self.a_dict()
        return Calibrador.desde_dict({k: (v.copy() if isinstance(v, np.ndarray) else v) for k, v in d.items()})

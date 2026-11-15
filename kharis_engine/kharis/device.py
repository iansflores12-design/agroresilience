"""Deteccion de hardware (CUDA / MPS / CPU), precision mixta y perfilado de memoria y latencia."""
from __future__ import annotations

import contextlib
import os
import time
from dataclasses import dataclass

import torch


@dataclass
class Dispositivo:
    device: torch.device
    tipo: str            # cuda | mps | cpu
    nombre: str
    amp: bool            # precision mixta activa
    amp_dtype: object    # torch.float16 | torch.bfloat16 | None
    usa_scaler: bool     # GradScaler (solo fp16 en CUDA)

    @property
    def precision(self) -> str:
        if not self.amp:
            return "fp32"
        return "fp16" if self.amp_dtype == torch.float16 else "bf16"

    def autocast(self):
        if not self.amp:
            return contextlib.nullcontext()
        return torch.autocast(device_type=self.tipo, dtype=self.amp_dtype)

    def scaler(self):
        return torch.amp.GradScaler(self.tipo, enabled=self.usa_scaler)

    def resumen(self) -> str:
        return f"{self.tipo.upper()} ({self.nombre}), precision {self.precision}"

    def con_precision(self, nombre: str) -> "Dispositivo":
        """Copia de este dispositivo con otra precision: fp32, fp16 (con GradScaler) o bf16 (sin GradScaler)."""
        if self.tipo != "cuda" or nombre == "fp32":
            return Dispositivo(self.device, self.tipo, self.nombre, False, None, False)
        dtype = torch.bfloat16 if nombre == "bf16" else torch.float16
        return Dispositivo(self.device, self.tipo, self.nombre, True, dtype, dtype == torch.float16)


def seleccionar_dispositivo(preferencia: str = "auto", amp: str = "auto") -> Dispositivo:
    """cuda si hay GPU NVIDIA, mps en Apple Silicon, cpu como respaldo. Nunca interrumpe la ejecucion."""
    tipo = "cpu"
    if preferencia in ("auto", "cuda") and torch.cuda.is_available():
        tipo = "cuda"
    elif preferencia in ("auto", "mps") and getattr(torch.backends, "mps", None) is not None and torch.backends.mps.is_available():
        tipo = "mps"
    elif preferencia not in ("auto", "cpu"):
        print(f"[device] '{preferencia}' no esta disponible: se usa CPU")

    if tipo == "cuda":
        nombre = torch.cuda.get_device_name(0)
        # Nucleos CUDA/Tensor: TF32 en convoluciones y matmul, y precision mixta (abajo).
        # cuDNN queda en modo determinista (lo fija train_eval.fijar_semilla) para que los resultados se repitan.
        torch.backends.cuda.matmul.allow_tf32 = True
        torch.backends.cudnn.allow_tf32 = True
        torch.set_float32_matmul_precision("high")
        bf16 = bf16_nativo()
        if amp == "off":
            dtype = None
        elif amp == "fp16":
            dtype = torch.float16
        elif amp == "bf16":
            if not bf16:
                print("[device] esta GPU no acelera bf16 (hace falta Ampere / RTX 30 o posterior): se usa fp16")
            dtype = torch.bfloat16 if bf16 else torch.float16
        else:  # auto: bf16 en Ampere+ (mismo rango que fp32, sin GradScaler); fp16 + GradScaler en GPUs anteriores.
            dtype = torch.bfloat16 if bf16 else torch.float16     # elegir_precision() lo confirma midiendo en la GPU real
        return Dispositivo(torch.device("cuda"), "cuda", nombre, dtype is not None, dtype, dtype == torch.float16)
    if tipo == "mps":
        return Dispositivo(torch.device("mps"), "mps", "Apple Metal", False, None, False)  # fp32 seguro
    hilos = os.cpu_count() or 1
    with contextlib.suppress(Exception):
        torch.set_num_threads(max(1, hilos - 1))
    return Dispositivo(torch.device("cpu"), "cpu", f"{hilos} hilos", False, None, False)


def bf16_nativo() -> bool:
    """bfloat16 acelerado por hardware: NVIDIA lo trae desde Ampere (capacidad de computo 8.x: RTX 30, A100...).
    is_bf16_supported() solo no basta: en GPUs anteriores puede dar True y correr emulado y lento."""
    if not torch.cuda.is_available():
        return False
    with contextlib.suppress(Exception):
        return bool(torch.cuda.is_bf16_supported()) and torch.cuda.get_device_capability(0)[0] >= 8
    return False


def elegir_precision(d: Dispositivo, crear_modelo, forma_x: tuple, forma_base: tuple, pedido: str = "auto", pasos: int = 40) -> tuple:
    """Mide pasos de entrenamiento por segundo en fp32 (TF32), fp16 y bf16 con la red real y elige.

    Regla en modo auto: la mas rapida. Si varias quedan a menos de 10% de la mejor se prefiere bf16 (mismo rango
    que fp32: no se desborda ni necesita GradScaler), luego fp16, luego fp32. En redes muy chicas la precision
    mixta puede no compensar y gana fp32 con TF32: por eso se mide en vez de suponer.
    Devuelve (dispositivo elegido, dict con la medicion). Para repetir una corrida exacta, fijar --amp.
    """
    if d.tipo != "cuda":
        return d, {"elegida": d.precision, "motivo": "sin GPU CUDA: fp32"}
    modos = ["fp32", "fp16"] + (["bf16"] if bf16_nativo() else [])
    med = {}
    for modo in modos:
        dm = d.con_precision(modo)
        torch.manual_seed(0)
        modelo = crear_modelo().to(d.device)
        opt = torch.optim.AdamW(modelo.parameters(), lr=1e-4)
        amp = dm.scaler()
        x, base = torch.randn(*forma_x, device=d.device), torch.zeros(*forma_base, device=d.device)
        finito = True
        try:
            for i in range(pasos + 5):
                if i == 5:   # 5 pasos de calentamiento fuera del cronometro
                    sincronizar(d)
                    t0 = time.perf_counter()
                opt.zero_grad(set_to_none=True)
                with dm.autocast():
                    p, q = modelo(x, base)
                    perdida = p.float().pow(2).mean() + q.float().pow(2).mean()
                amp.scale(perdida).backward()
                amp.step(opt)
                amp.update()
                finito &= bool(torch.isfinite(perdida))
            sincronizar(d)
            med[modo] = {"pasos_por_s": round(pasos / (time.perf_counter() - t0), 2), "estable": finito}
        except Exception as e:   # un modo que falla no detiene nada
            med[modo] = {"pasos_por_s": 0.0, "estable": False, "error": type(e).__name__}
        del modelo, opt, x, base
    torch.cuda.empty_cache()
    vel = lambda m: med[m]["pasos_por_s"] if med.get(m, {}).get("estable") else 0.0
    mejor = max(vel(m) for m in modos)
    if pedido in ("fp16", "bf16", "off"):
        elegida, motivo = d.precision, f"pedida con --amp {pedido}"
    elif mejor <= 0:
        elegida, motivo = "fp32", "ningun modo fue estable en la medicion"
    else:   # la mas rapida; si quedan a menos de 10% de la mejor se prefiere bf16, luego fp16 (menos VRAM)
        elegida = next(m for m in ("bf16", "fp16", "fp32") if m in modos and vel(m) >= mejor / 1.10)
        rapida = max(modos, key=vel)
        motivo = "la mas rapida en esta GPU para esta red" if elegida == rapida else f"a menos de 10% de {rapida} y con menos memoria"
        if elegida == "bf16":
            motivo += "; bf16 no necesita GradScaler"
    info = {"elegida": elegida, "motivo": motivo, "medicion": med,
            "aceleracion_vs_fp32": round(vel(elegida) / vel("fp32"), 2) if vel("fp32") > 0 and vel(elegida) > 0 else None}
    return d.con_precision(elegida), info


def sincronizar(d: Dispositivo) -> None:
    if d.tipo == "cuda":
        torch.cuda.synchronize()


def reiniciar_pico(d: Dispositivo) -> None:
    if d.tipo == "cuda":
        torch.cuda.reset_peak_memory_stats()


def memoria(d: Dispositivo) -> dict:
    """VRAM (si hay GPU) y RAM del proceso, en MB."""
    m = {"vram_mb": 0.0, "vram_pico_mb": 0.0, "ram_mb": 0.0}
    if d.tipo == "cuda":
        m["vram_mb"] = torch.cuda.memory_allocated() / 2**20
        m["vram_pico_mb"] = torch.cuda.max_memory_allocated() / 2**20
    elif d.tipo == "mps":
        with contextlib.suppress(Exception):
            m["vram_mb"] = m["vram_pico_mb"] = torch.mps.current_allocated_memory() / 2**20
    try:
        import psutil
        m["ram_mb"] = psutil.Process().memory_info().rss / 2**20
    except Exception:
        with contextlib.suppress(Exception):
            import resource
            m["ram_mb"] = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024
    return {k: round(v, 2) for k, v in m.items()}


def tamano_modelo_mb(modelo: torch.nn.Module) -> float:
    n = sum(p.numel() * p.element_size() for p in modelo.parameters())
    n += sum(b.numel() * b.element_size() for b in modelo.buffers())
    return round(n / 2**20, 4)


def contar_parametros(modelo: torch.nn.Module) -> int:
    return sum(p.numel() for p in modelo.parameters())


@torch.no_grad()
def medir_latencia(modelo: torch.nn.Module, d: Dispositivo, seq_len: int, n_features: int,
                   lotes=(1, 256), repeticiones: int = 50) -> dict:
    """Latencia de inferencia en ms (mediana) por tamano de lote."""
    modelo.eval()
    res = {}
    for b in lotes:
        x = torch.randn(b, seq_len, n_features, device=d.device)
        base = torch.zeros(b, modelo.horizonte, modelo.n_objetivos, device=d.device)
        for _ in range(5):  # calentamiento
            with d.autocast():
                modelo(x, base)
        sincronizar(d)
        t = []
        for _ in range(repeticiones):
            t0 = time.perf_counter()
            with d.autocast():
                modelo(x, base)
            sincronizar(d)
            t.append((time.perf_counter() - t0) * 1000)
        t.sort()
        res[f"latencia_ms_lote{b}"] = round(t[len(t) // 2], 4)
    return res


class Cronometro:
    """Mide tiempo por epoca y acumula un historial simple."""

    def __init__(self):
        self.t0 = time.perf_counter()
        self.epocas: list[float] = []

    def vuelta(self) -> float:
        t = time.perf_counter()
        dt, self.t0 = t - self.t0, t
        self.epocas.append(dt)
        return dt

    @property
    def media(self) -> float:
        return sum(self.epocas) / max(1, len(self.epocas))

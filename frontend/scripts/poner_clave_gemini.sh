#!/usr/bin/env bash
# Guarda la clave de Gemini en frontend/.env.local (git lo ignora: la clave nunca se sube).
# En la Mac, desde la carpeta del repo:
#   git pull
#   bash frontend/scripts/poner_clave_gemini.sh
# La clave no se muestra al escribirla.
set -euo pipefail

destino="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.env.local"
echo "Clave de Google AI Studio: https://aistudio.google.com/apikey"
read -r -s -p "Pega tu clave de Gemini y pulsa Enter: " clave
echo
clave="$(printf '%s' "$clave" | tr -d '[:space:]')"
if [ -z "$clave" ]; then
  echo "No se escribio ninguna clave. No se cambio nada."
  exit 1
fi
umask 077
printf 'GEMINI_API_KEY=%s\nGEMINI_MODELO=gemini-3.5-flash\nVITE_API_URL=/api\n' "$clave" > "$destino"
unset clave
echo "Guardada en $destino (solo tu usuario puede leerla)."
echo "Arranca el sitio con: npm --prefix frontend install && npm --prefix frontend run dev"

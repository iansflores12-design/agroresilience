# Guarda la clave de Gemini en frontend/.env.local (git lo ignora). La clave no se muestra al escribirla.
# Uso, desde frontend/:  & .\scripts\poner_clave_gemini.ps1
$destino = Join-Path (Split-Path $PSScriptRoot -Parent) '.env.local'
Write-Host 'Clave de Google AI Studio: https://aistudio.google.com/apikey'
$segura = Read-Host 'Pega tu clave de Gemini y pulsa Enter' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura)
try {
    $clave = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr).Trim()
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}
if (-not $clave) {
    Write-Host 'No se escribio ninguna clave. No se cambio nada.' -ForegroundColor Yellow
    return
}
$lineas = @(
    "GEMINI_API_KEY=$clave",
    'VITE_API_URL=/api'
)
[IO.File]::WriteAllText($destino, ($lineas -join "`n") + "`n")
Remove-Variable clave, segura
Write-Host "Guardada en $destino" -ForegroundColor Green
Write-Host 'Reinicia el sitio (npm run dev) para que la use.'

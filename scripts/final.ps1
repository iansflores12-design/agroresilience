# Espera a que terminen las descargas y procesa todo (30 puntos). Uso: powershell -File scripts\final.ps1
Set-Location (Split-Path $PSScriptRoot -Parent)
$py = ".\.venv\Scripts\python.exe"
while (@(Get-CimInstance Win32_Process | Where-Object { $_.Name -like 'python*' -and $_.CommandLine -match 'descargar_earthdata|descargar\.py|fuentes_extra' }).Count -gt 0) { Start-Sleep 60 }
Write-Output "descargas terminadas; uniendo parciales y procesando"
& $py -I scripts\unir_sufijos.py
& $py -I scripts\generar_malla_smap.py
& $py -I scripts\adaptar_gldas.py
& $py -I scripts\gaez.py
& $py -I scripts\procesar_nuevo.py 2>&1 | Select-Object -Last 30
Get-ChildItem salida -File | Select-Object Name,@{n='MB';e={[math]::Round($_.Length/1MB,1)}} | Format-Table -AutoSize
Write-Output "FINAL LISTO"

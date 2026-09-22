# Local convenience (Windows): restart API :8000, worker and `next start` :3000 in the background; logs in %TEMP%.
# Build the web app first: pnpm --filter @upstream/web build
$root = Split-Path -Parent $PSScriptRoot
foreach ($port in 3000, 8000) { Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force } }
Get-CimInstance Win32_Process -Filter "Name='python.exe'" | Where-Object { $_.CommandLine -like '*services.worker*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-Sleep 1
Start-Process -WindowStyle Hidden -WorkingDirectory $root -FilePath "cmd.exe" -ArgumentList "/c .venv\Scripts\python.exe -m uvicorn services.api.main:app --port 8000 > %TEMP%\upstream-api.log 2>&1"
Start-Process -WindowStyle Hidden -WorkingDirectory $root -FilePath "cmd.exe" -ArgumentList "/c .venv\Scripts\python.exe -m services.worker > %TEMP%\upstream-worker.log 2>&1"
Start-Process -WindowStyle Hidden -WorkingDirectory "$root\apps\web" -FilePath "cmd.exe" -ArgumentList "/c npx next start -p 3000 -H 127.0.0.1 > %TEMP%\upstream-web.log 2>&1"
Start-Sleep 6
(Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3000/api/v1/status).Content

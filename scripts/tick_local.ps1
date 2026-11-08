# tick_local.ps1 — penjadwal LOKAL (Windows Task Scheduler) memanggil /api/tick setiap 4 jam.
# Dibuat 8 Nov 2026 pasca-freeze karena fire cron GitHub tidak dapat diandalkan (banyak di-drop).
# Perbaikan OPERASIONAL: tidak mengubah aturan/parameter/universe. Baca secret dari .env (gitignored).
# Jalankan manual sekali:  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\tick_local.ps1
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root '.env'
if (-not (Test-Path $envFile)) { Write-Output 'ERROR: tidak ada .env (buat dengan CRON_SECRET dan TICK_URL)'; exit 1 }
$envVars = @{}
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') { $envVars[$matches[1]] = $matches[2].Trim('"').Trim("'") }
}
$secret = $envVars['CRON_SECRET']; $url = $envVars['TICK_URL']
if (-not $secret) { Write-Output 'ERROR: CRON_SECRET kosong di .env'; exit 1 }
if (-not $url) { $url = 'https://uasbot.vercel.app/api/tick' }
try {
  $r = Invoke-RestMethod -Uri $url -Headers @{ Authorization = "Bearer $secret" } -TimeoutSec 90
  Write-Output ("OK " + (Get-Date).ToUniversalTime().ToString('o') + " status=" + $r.status + " barT=" + $r.barT + " lateSec=" + $r.lateSec + " orders=" + $r.orders + " eq=" + $r.eq)
} catch {
  Write-Output ("ERROR " + (Get-Date).ToUniversalTime().ToString('o') + " " + $_.Exception.Message)
  exit 1
}
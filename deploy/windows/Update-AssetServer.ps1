<#
  DJJS IT Asset Management - install the latest version on the office server (run as Administrator).
  Takes a backup first, gets the newest code from GitHub, rebuilds, and restarts the app (about 1 minute offline).
#>
$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $Root
Write-Host '==> Backup before updating' -ForegroundColor Cyan
& cmd.exe /c "`"$Root\scripts\backup.cmd`""; if ($LASTEXITCODE) { throw 'Backup failed - update stopped (nothing was changed). See server\data\backup.log' }
Write-Host '==> Stopping the app (offline for a few minutes)' -ForegroundColor Cyan
# stop the task first: git must not rewrite office-server.cmd while cmd.exe is running it
Stop-ScheduledTask -TaskName 'DJJS IT Asset Management' -ErrorAction SilentlyContinue
$ServerJs = Join-Path $Root 'server\src\index.js'
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like "*$ServerJs*" -or ($_.CommandLine -like '*server\src\index.js*' -and (Get-NetTCPConnection -OwningProcess $_.ProcessId -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in 80, 443 })) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Write-Host '==> Getting the latest code' -ForegroundColor Cyan
& git pull --ff-only; if ($LASTEXITCODE) { throw 'git pull failed - local files were changed on this server?' }
Write-Host '==> Installing packages and building' -ForegroundColor Cyan
Push-Location server; & npm ci --omit=dev --no-audit --no-fund; if ($LASTEXITCODE) { throw 'npm install (server) failed' }; Pop-Location
Push-Location client; & npm ci --no-audit --no-fund; if ($LASTEXITCODE) { throw 'npm install (client) failed' }; & npm run build; if ($LASTEXITCODE) { throw 'build failed' }; Pop-Location
Write-Host '==> Starting the app' -ForegroundColor Cyan
Start-ScheduledTask -TaskName 'DJJS IT Asset Management'
$up = $false; for ($i = 0; $i -lt 30 -and -not $up; $i++) { Start-Sleep 2; $up = [bool](Get-NetTCPConnection -State Listen -LocalPort 443, 80 -ErrorAction SilentlyContinue) }
if ($up) { Write-Host 'Updated and running.' -ForegroundColor Green } else { Write-Host 'The app did not start - see server\data\server.log' -ForegroundColor Red; exit 1 }

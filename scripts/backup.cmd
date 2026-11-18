@echo off
rem Daily database backup: one file per run, keeps the last 30 days.  usage: backup.cmd [folder]
cd /d "%~dp0.."
set "DEST=%~1"
if "%DEST%"=="" set "DEST=C:\DJJS-ITAM-Backups"
if not exist "%DEST%" mkdir "%DEST%"
if not exist "server\data" mkdir "server\data"
for /f %%d in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HHmm"') do set "STAMP=%%d"
echo [%date% %time%] backup to %DEST%>> "server\data\backup.log"
node server\src\dbTransfer.js export "%DEST%\itam-%STAMP%.json" >> "server\data\backup.log" 2>&1
rem never delete old backups when today's backup failed
if errorlevel 1 (echo [%date% %time%] BACKUP FAILED>> "server\data\backup.log" & exit /b 1)
powershell -NoProfile -Command "Get-ChildItem -Path '%DEST%' -Filter 'itam-*.json' | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } | Remove-Item -Force"

@echo off
rem Runs the office server and restarts it if it ever stops. Log: server\data\server.log
cd /d "%~dp0.."
if not exist "server\data" mkdir "server\data"
:loop
echo [%date% %time%] starting server>> "server\data\server.log"
node server\src\index.js >> "server\data\server.log" 2>&1
echo [%date% %time%] server stopped - restarting in 10 seconds>> "server\data\server.log"
timeout /t 10 /nobreak > nul
goto loop

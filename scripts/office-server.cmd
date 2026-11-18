@echo off
rem Runs the office server and restarts it if it ever stops. Log: server\data\server.log
cd /d "%~dp0.."
if not exist "server\data" mkdir "server\data"
:loop
echo [%date% %time%] starting server>> "server\data\server.log"
node "%CD%\server\src\index.js" >> "server\data\server.log" 2>&1
echo [%date% %time%] server stopped - restarting in 10 seconds>> "server\data\server.log"
rem ping waits ~10 s even without a console window (timeout returns at once when hidden)
ping -n 11 127.0.0.1 > nul
goto loop

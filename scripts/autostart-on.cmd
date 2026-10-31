@echo off
rem Double-click to make the office server start automatically with Windows (and start it now).
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
> "%STARTUP%\DJJS IT Asset Management.vbs" echo CreateObject("WScript.Shell").Run """%~dp0office-server.cmd""", 0, False
echo Auto-start is ON - the server will start with Windows.
echo.
echo If the server is already running in a terminal window, close that window first.
wscript "%STARTUP%\DJJS IT Asset Management.vbs"
echo Server started in the background: http://localhost:5000
pause

@echo off
rem Double-click to stop the office server starting with Windows.
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\DJJS IT Asset Management.vbs" 2>nul
echo Auto-start is OFF.
echo A server that is already running keeps running until Windows restarts
echo (or end "node.exe" in Task Manager).
pause

@echo off
setlocal enabledelayedexpansion

:: Get the directory where the script is located
set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"

echo Launching server and ngrok in separate windows...

:: Start Node server in a new window
start "Node Server" cmd /k "node ../backend/server.js"

:: Start Ngrok in a new window
start "Ngrok" cmd /k "ngrok http 3000"

echo.
echo --------------------------------------------------
echo SERVER AND NGROK ARE RUNNING
echo Press Ctrl+C in this window to stop everything.
echo --------------------------------------------------
echo.

:loop
timeout /t 1 >nul
goto loop

:: Note: In Windows Batch, there is no easy 'trap' for window closing.
:: To stop the processes, we recommend using a separate 'stop.bat' 
:: or simply closing the spawn windows. 
:: However, if the user presses Ctrl+C, we can try to kill them.

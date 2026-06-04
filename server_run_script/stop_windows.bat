@echo off
echo Stopping server and ngrok...
taskkill /F /IM node.exe /T
taskkill /F /IM ngrok.exe /T
echo Done.
pause

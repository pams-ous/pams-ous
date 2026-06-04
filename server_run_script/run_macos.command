#!/bin/bash

# Move to the script's directory
cd "$(dirname "$0")"

# AppleScript to open two separate windows
osascript <<EOF
tell application "Terminal"
    activate
    do script "cd '$(pwd)' && node ../backend/server.js"
    do script "ngrok http 3000"
end tell
EOF

echo "--------------------------------------------------"
echo "SERVER AND NGROK ARE RUNNING"
echo "Close this window or press Ctrl+C to stop everything."
echo "--------------------------------------------------"

# Trap SIGINT (Ctrl+C) to kill processes
trap 'echo "Stopping server and ngrok..."; pkill -f node; pkill -f ngrok; exit' INT

# Keep script alive
while true; do
    sleep 1
done

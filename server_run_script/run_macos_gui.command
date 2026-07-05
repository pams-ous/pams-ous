#!/bin/bash
cd "$(dirname "$0")"
node launcher-gui.js
osascript -e 'tell application "Terminal" to close front window' &>/dev/null &
exit 0

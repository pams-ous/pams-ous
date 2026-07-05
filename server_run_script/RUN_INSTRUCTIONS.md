# Server Launch Scripts

This folder contains scripts to launch the backend server and ngrok tunnel simultaneously.

## Prerequisites

- **Node.js** (v18+) — installed and on `PATH`
- **ngrok** — installed and on `PATH` (or in a standard install location)
- **Backend dependencies** — run `npm install` in the `backend/` directory first

## Launch Methods

### Option 1: macOS

Double-click `run_macos_gui.command`, or run:

```bash
./run_macos_gui.command
```

First-time setup (make executable):

```bash
chmod +x run_macos_gui.command
```

### Option 2: Windows

Double-click `run_windows_gui.bat`, or run from cmd:

```cmd
run_windows_gui.bat
```

Either option opens a browser-based control panel at `http://localhost:3456` with:
- **Start All** button — launches server + ngrok
- **Stop All** button — gracefully stops both processes
- **Public URL** field — auto-populates with the ngrok URL once ready
- **Copy** button — copies the URL to clipboard
- **Output Log** pane — colored log output for server and ngrok

## What Happens

1. `launcher-gui.js` spawns the backend (`node backend/server.js`) and `ngrok http 3000`.
2. It serves a web UI on port `3456` (auto-increments if busy) and opens your default browser.
3. The **Public URL** auto-populates once ngrok is ready (polled every 3s via `localhost:4040`).

## How to Stop

- **GUI**: Click **Stop All**, close the browser tab, or press `Ctrl + C` in the terminal.
- **Terminal**: Press `Ctrl + C` (SIGINT). Both child processes are killed automatically.
- The launcher auto-exits 1 second after all browser tabs are closed.

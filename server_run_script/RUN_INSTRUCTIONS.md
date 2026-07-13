# Server Launch Scripts

This folder contains scripts to launch the backend server and ngrok tunnel simultaneously using a terminal user interface (TUI).

## Prerequisites

- **Node.js** (v18+) — installed and on `PATH`
- **ngrok** — installed and on `PATH`
- **Backend dependencies** — run `npm install` in the `backend/` directory first
- `.env` file — copy `backend/.env.example` to `backend/.env` (optional: set `NGROK_DOMAIN` for a custom domain)

## Launch Methods

### macOS

Double-click `run_macos_tui.command`, or run from Terminal:

```bash
chmod +x run_macos_tui.command   # first time only
./run_macos_tui.command
```

### Windows

Double-click `run_windows_tui.bat`, or run from cmd:

```cmd
run_windows_tui.bat
```

## TUI Controls

Once launched, a terminal dashboard appears with live status indicators. Use the keyboard:

| Key | Action |
|-----|--------|
| `1` | Start All — launches server + ngrok |
| `2` | Stop All — kills both processes (SIGKILL) |
| `3` | Restart — clears log and restarts both |
| `c` | Copy URL — copies ngrok public URL to clipboard |
| `l` | Clear Logs — clears on-screen log and removes persisted log files |
| `q` | Quit — confirmation prompt, then cleans up and closes terminal window |

## What Happens

1. `tui-launcher.js` spawns the backend (`node backend/server.js`) and `ngrok http 3000` (or `ngrok http 3000 --domain <NGROK_DOMAIN>` if set).
2. A TUI dashboard renders status cards for both services and polls `localhost:4040` every 3s for the ngrok URL.
3. Logs are written to `logs/pams-tui-<timestamp>.log` (auto-cleaned after 7 days).

## How to Stop

- Press `q`, then `y` to confirm. All child processes are killed and the terminal window closes.
- Press `Ctrl + C` at any time for immediate force-stop.
- Closing the terminal window also triggers cleanup via the `exit` handler.

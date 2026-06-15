# Server Launch Scripts

This folder contains scripts to easily launch the backend server and ngrok tunnel simultaneously.

## How to Launch

### macOS
Run the `.command` file:
```bash
./run_macos.command
```
*Note: If this is your first time running the script, you must make it executable. Open your terminal and run:*
```bash
cd "/path/to/your/project/server_run_script"
chmod +x run_macos.command
```

### Windows
Double-click or run the `.bat` file:
```cmd
run_windows.bat
```

## What Happens
1. The scripts execute `launcher.js`.
2. `launcher.js` starts the Node.js backend server and the `ngrok` tunnel.
3. The script will poll the ngrok API and print the **Ngrok Public URL** to the console once it becomes available.

## How to Stop
To stop both the server and the ngrok tunnel:
- Press `Ctrl + C` in the terminal window.
- Or simply close the terminal window.

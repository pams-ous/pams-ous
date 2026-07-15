#!/usr/bin/env node
const http = require('http');
const { spawn, exec, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

const BACKEND_DIR = path.join(__dirname, '..', 'backend');
const serverPath = path.join(BACKEND_DIR, 'server.js');

function loadEnv() {
  const envPath = path.join(BACKEND_DIR, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) ||
              (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          process.env[key] = val;
        }
      }
    });
  }
}
loadEnv();

let serverProc = null;
let ngrokProc = null;
let ngrokUrl = '';
let serverRunning = false;
let ngrokRunning = false;
let ngrokUrlNotified = false;
let ngrokWaitingNotified = false;
let logLines = [];
const MAX_LOG_LINES = 50;
let logFd = null;
let logFilePath = '';
const LOGS_DIR = path.join(__dirname, 'logs');
let dirty = true;
let confirmQuit = false;
let needsClear = false;

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  maroonBg: '\x1b[48;5;1m',
  goldFg: '\x1b[38;5;3m',
  white: '\x1b[37m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  purple: '\x1b[35m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  lightGreen: '\x1b[92m',
  lightRed: '\x1b[91m',
  lightBlue: '\x1b[94m',
  lightPurple: '\x1b[95m',
  lightYellow: '\x1b[93m',
  bgGreen: '\x1b[42m',
  bgRed: '\x1b[41m',
  bgGray: '\x1b[48;5;236m',
  bgWhite: '\x1b[47m',
  maroon: '\x1b[38;5;1m',
  darkMaroon: '\x1b[38;5;52m',
};

function clearScreen() {
  process.stdout.write('\x1b[2J\x1b[H');
}

function hideCursor() {
  process.stdout.write('\x1b[?25l');
}

function showCursor() {
  process.stdout.write('\x1b[?25h');
}

function moveTo(row, col) {
  process.stdout.write(`\x1b[${row};${col}H`);
}

function visLen(s) {
  return s.replace(/\x1b\[[0-9;]*m/g, '').length;
}

let toastText = '';
let toastTimer = null;

function showToast(msg) {
  toastText = msg;
  dirty = true;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastText = ''; dirty = true; }, 2000);
}

function render() {
  if (needsClear) {
    process.stdout.write('\x1b[2J\x1b[H');
    needsClear = false;
  }
  const cols = process.stdout.columns || 80;
  const w = Math.min(cols, 92);
  const offset = Math.max(0, Math.floor((cols - w) / 2));
  const h = process.stdout.rows || 24;
  let buf = '';
  let r = 1;

  function line(text) {
    buf += `\x1b[${r};${offset + 1}H` + text;
    r++;
  }

  // --- Header (row 1) ---
  const headerText = '  PAMS OUS Launcher';
  const headerRight = 'Terminal Control  ';
  const headerPad = w - headerText.length - headerRight.length;
  line(C.maroonBg + C.goldFg + C.bold + headerText + ' '.repeat(Math.max(0, headerPad)) + headerRight + C.reset);

  // --- Row 2: separator ---
  line(C.dim + '\u2500'.repeat(w) + C.reset);

  // --- Row 3: blank ---
  line('');

  // --- Rows 4-5: card headers ---
  const cardW = Math.floor((w - 3) / 2);
  const cardW2 = w - cardW - 1;
  line(' ' + C.bold + C.maroon + ' Backend Server' + ' '.repeat(Math.max(0, cardW - 16)) + C.reset + ' ' + C.bold + C.goldFg + ' Ngrok Tunnel' + ' '.repeat(Math.max(0, cardW2 - 14)) + C.reset);
  line(' ' + C.maroon + '\u250C' + '\u2500'.repeat(cardW - 2) + '\u2510' + C.reset + ' ' + C.goldFg + '\u250C' + '\u2500'.repeat(cardW2 - 2) + '\u2510' + C.reset);

  // --- Row 6: status + ports ---
  const sDot = serverRunning ? (C.green + '\u25CF' + C.reset + ' ' + C.lightGreen + 'Running' + C.reset) : (C.red + '\u25CB' + C.reset + ' ' + C.lightRed + 'Stopped' + C.reset);
  const nDot = ngrokRunning ? (C.green + '\u25CF' + C.reset + ' ' + C.lightGreen + 'Running' + C.reset) : (C.red + '\u25CB' + C.reset + ' ' + C.lightRed + 'Stopped' + C.reset);
  const left6 = ' ' + C.maroon + '\u2502' + C.reset + '  ' + sDot + '  ' + C.dim + 'Port 3000' + C.reset;
  const right6 = C.goldFg + '\u2502' + C.reset + '  ' + nDot + ' '.repeat(Math.max(0, cardW2 - visLen(nDot) - 4)) + C.goldFg + '\u2502' + C.reset;
  const left6Pad = cardW - visLen(left6);
  line(left6 + ' '.repeat(Math.max(0, left6Pad)) + C.maroon + '\u2502' + C.reset + ' ' + right6);

  // --- Row 7: protocol (left card) / blank (right card) ---
  const left7 = ' ' + C.maroon + '\u2502' + C.reset + '  ' + C.dim + 'HTTP only' + C.reset;
  const left7Pad = cardW - visLen(left7);
  line(left7 + ' '.repeat(Math.max(0, left7Pad)) + C.maroon + '\u2502' + C.reset + ' ' + C.goldFg + '\u2502' + C.reset + ' '.repeat(cardW2 - 2) + C.goldFg + '\u2502' + C.reset);

  // --- Row 8: card bottom ---
  line(' ' + C.maroon + '\u2514' + '\u2500'.repeat(cardW - 2) + '\u2518' + C.reset + ' ' + C.goldFg + '\u2514' + '\u2500'.repeat(cardW2 - 2) + '\u2518' + C.reset);

  // --- Row 9: blank ---
  line('');

  // --- Row 10: Public URL box ---
  const urlBoxLabel = ' Public URL ';
  const urlBoxInner = w - 2;
  if (ngrokUrl) {
    const urlDisplay = ngrokUrl;
    line(' ' + C.goldFg + '\u250C' + urlBoxLabel + '\u2500'.repeat(Math.max(0, urlBoxInner - urlBoxLabel.length)) + '\u2510' + C.reset);
    line(' ' + C.goldFg + '\u2502' + C.reset + ' ' + C.cyan + urlDisplay + C.reset + ' '.repeat(Math.max(0, urlBoxInner - 2 - urlDisplay.length)) + ' ' + C.goldFg + '\u2502' + C.reset);
    line(' ' + C.goldFg + '\u2514' + '\u2500'.repeat(urlBoxInner) + '\u2518' + C.reset);
  } else if (ngrokRunning) {
    line(' ' + C.goldFg + '\u250C' + urlBoxLabel + '\u2500'.repeat(Math.max(0, urlBoxInner - urlBoxLabel.length)) + '\u2510' + C.reset);
    const waitMsg = 'Waiting for ngrok tunnel to start...';
    line(' ' + C.goldFg + '\u2502' + C.reset + ' ' + C.dim + waitMsg + C.reset + ' '.repeat(Math.max(0, urlBoxInner - 2 - waitMsg.length)) + ' ' + C.goldFg + '\u2502' + C.reset);
    line(' ' + C.goldFg + '\u2514' + '\u2500'.repeat(urlBoxInner) + '\u2518' + C.reset);
  } else {
    line(' ' + C.goldFg + '\u250C' + urlBoxLabel + '\u2500'.repeat(Math.max(0, urlBoxInner - urlBoxLabel.length)) + '\u2510' + C.reset);
    const inactive = 'Ngrok tunnel is not active';
    line(' ' + C.goldFg + '\u2502' + C.reset + ' ' + C.dim + inactive + C.reset + ' '.repeat(Math.max(0, urlBoxInner - 2 - inactive.length)) + ' ' + C.goldFg + '\u2502' + C.reset);
    line(' ' + C.goldFg + '\u2514' + '\u2500'.repeat(urlBoxInner) + '\u2518' + C.reset);
  }

  // --- Row 11: blank ---
  line('');

  // --- Rows 14-17: warning banner ---
  const warnW = w - 1;
  line(' ' + C.bgRed + C.white + C.bold + '  IMPORTANT' + ' '.repeat(Math.max(0, warnW - 11)) + C.reset);
  line(' ' + C.bgRed + C.white + '  Do NOT close this terminal. Closing it shuts down' + ' '.repeat(Math.max(0, warnW - 51)) + C.reset);
  line(' ' + C.bgRed + C.white + '  the PAMS server and ngrok tunnel.' + ' '.repeat(Math.max(0, warnW - 35)) + C.reset);
  line(' ' + C.bgRed + C.white + C.dim + '  Press Ctrl+C to force-stop.' + ' '.repeat(Math.max(0, warnW - 29)) + C.reset);

  // --- Row 18: blank ---
  line('');

  // --- Row 19: controls ---
  if (confirmQuit) {
    const confirmLine1 = ' ' + C.bgRed + C.white + C.bold + '  Are you sure you want to quit? This will close the PAMS server and ngrok tunnel.  ' + C.reset;
    line(confirmLine1 + ' '.repeat(Math.max(0, w - visLen(confirmLine1))));
    const confirmLine2 = ' ' + C.red + '[y] Yes, quit' + C.reset + '  ' + C.green + '[n] No, go back' + C.reset;
    line(confirmLine2 + ' '.repeat(Math.max(0, w - visLen(confirmLine2))));
  } else {
    const ctrlLine = ' ' + C.bold + 'Controls:' + C.reset + '  ' + C.green + '[1] Start All' + C.reset + '  ' + C.red + '[2] Stop All' + C.reset + '  ' + C.yellow + '[3] Restart' + C.reset + '  ' + C.cyan + '[c] Copy URL' + C.reset + '  ' + C.purple + '[l] Clear Logs' + C.reset + '  ' + C.dim + '[q] Quit' + C.reset;
    line(ctrlLine + ' '.repeat(Math.max(0, w - visLen(ctrlLine))));
    // --- Row 20: toast (if any) ---
    if (toastText) {
      const toastLine = ' ' + C.green + C.bold + toastText + C.reset;
      line(toastLine + ' '.repeat(Math.max(0, w - visLen(toastLine))));
    } else {
      line(' '.repeat(w));
    }
  }

  // --- Row 20: separator ---
  line(C.dim + '\u2500'.repeat(w) + C.reset);

  // --- Row 21: log header ---
  const logCountStr = logLines.length + ' lines';
  line(' ' + C.bold + 'Output Log' + C.reset + ' '.repeat(Math.max(0, w - 11 - logCountStr.length)) + C.dim + logCountStr + C.reset);

  // --- Row 22: separator ---
  line(C.dim + '\u2500'.repeat(w) + C.reset);

  // --- Rows 23+: log area ---
  const logAreaHeight = Math.max(1, h - 23);
  const visibleLines = logLines.slice(-logAreaHeight);
  for (let i = 0; i < logAreaHeight; i++) {
    if (i < visibleLines.length) {
      const ln = visibleLines[i];
      const prefix = ln.source === 'server' ? (C.green + '[SERVER] ' + C.reset) :
                    ln.source === 'ngrok' ? (C.blue + '[NGROK]  ' + C.reset) :
                    (C.purple + '[SYSTEM] ' + C.reset);
      const ts = C.gray + ln.ts + ' ' + C.reset;
      const text = ln.source === 'system' ? C.dim + ln.text + C.reset : ln.text;
      const content = ts + prefix + text;
      const visible = visLen(content);
      if (visible > w - 2) {
        // Truncate visible portion, re-apply ANSI
        let cut = content;
        let vis = 0;
        let result = '';
        let inEscape = false;
        for (let ci = 0; ci < cut.length && vis < w - 2; ci++) {
          if (cut[ci] === '\x1b') { inEscape = true; result += cut[ci]; continue; }
          if (inEscape) { result += cut[ci]; if (cut[ci] === 'm') inEscape = false; continue; }
          result += cut[ci]; vis++;
        }
        line(' ' + result);
      } else {
        line(' ' + content + ' '.repeat(Math.max(0, w - 2 - visible)));
      }
    } else {
      line(' ' + ' '.repeat(w - 2));
    }
  }

  // --- Final separator ---
  line(C.dim + '\u2500'.repeat(w) + C.reset);

  process.stdout.write(buf);
}

function addLog(text, source) {
  const ts = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  logLines.push({ text, source, ts });
  if (logLines.length > MAX_LOG_LINES) logLines.shift();
  writeLogToFile(text, source);
  dirty = true;
}

function clearLog() {
  logLines = [];
  dirty = true;
}

function deleteLogFiles() {
  if (fs.existsSync(LOGS_DIR)) {
    const files = fs.readdirSync(LOGS_DIR);
    files.forEach(f => {
      if (f.endsWith('.log')) fs.unlinkSync(path.join(LOGS_DIR, f));
    });
  }
}

function initLogFile() {
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
  const now = new Date();
  const ts = now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0') + '_' +
    String(now.getHours()).padStart(2, '0') + '-' +
    String(now.getMinutes()).padStart(2, '0') + '-' +
    String(now.getSeconds()).padStart(2, '0') + '-' +
    String(now.getMilliseconds()).padStart(3, '0');
  logFilePath = path.join(LOGS_DIR, 'pams-tui-' + ts + '.log');
  logFd = fs.openSync(logFilePath, 'a');
  const header = '--- PAMS TUI Launcher session started at ' + now.toISOString() + ' ---\n';
  fs.writeSync(logFd, header);
  addLog('Logging to logs/' + path.basename(logFilePath), 'system');
}

function closeLogFile() {
  if (logFd) {
    const footer = '--- Session ended at ' + new Date().toISOString() + ' ---\n';
    try { fs.writeSync(logFd, footer); } catch (e) {}
    try { fs.closeSync(logFd); } catch (e) {}
    logFd = null;
    logFilePath = '';
  }
}

function writeLogToFile(text, source) {
  if (!logFd) return;
  const now = new Date();
  const ts = now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0') + ' ' +
    String(now.getHours()).padStart(2, '0') + ':' +
    String(now.getMinutes()).padStart(2, '0') + ':' +
    String(now.getSeconds()).padStart(2, '0');
  const src = source === 'server' ? 'SERVER' : source === 'ngrok' ? 'NGROK' : 'SYSTEM';
  const line = '[' + ts + '] [' + src + '] ' + text + '\n';
  try { fs.writeSync(logFd, line); } catch (e) {}
}

function broadcast(data) {
  if (data.type === 'log') {
    addLog(data.text, data.source);
  } else if (data.type === 'clear-log') {
    clearLog();
  } else if (data.type === 'status') {
    serverRunning = data.server;
    ngrokRunning = data.ngrok;
    ngrokUrl = data.ngrokUrl || '';
    dirty = true;
  }
}

function setupProcessLogging(proc, source) {
  let buf = '';
  const flush = (chunk) => {
    buf += chunk.toString();
    const lines = buf.split('\n');
    buf = lines.pop();
    lines.forEach(line => { if (line) broadcast({ type: 'log', text: line, source }); });
  };
  proc.stdout.on('data', flush);
  proc.stderr.on('data', flush);
}

function startServer() {
  if (serverProc) return;
  broadcast({ type: 'log', text: 'Starting server...', source: 'system' });
  loadEnv();
  serverProc = spawn('node', [serverPath], { cwd: BACKEND_DIR });
  serverRunning = true;
  broadcast({ type: 'status', server: true, ngrok: ngrokRunning, ngrokUrl });
  setupProcessLogging(serverProc, 'server');
  serverProc.on('close', (code, signal) => {
    serverRunning = false;
    serverProc = null;
    const msg = signal ? `Server killed (${signal})` : `Server exited with code ${code}`;
    broadcast({ type: 'log', text: msg, source: 'system' });
    broadcast({ type: 'status', server: false, ngrok: ngrokRunning, ngrokUrl });
  });
}

function stopServer() {
  if (!serverProc) return;
  broadcast({ type: 'log', text: 'Stopping server...', source: 'system' });
  serverProc.kill('SIGKILL');
}

function startNgrok() {
  if (ngrokProc) return;
  const ngrokDomain = process.env.NGROK_DOMAIN;
  const ngrokArgs = ngrokDomain ? ['http', '3000', '--domain', ngrokDomain] : ['http', '3000'];
  broadcast({ type: 'log', text: ngrokDomain ? `Starting ngrok tunnel with domain ${ngrokDomain}...` : 'Starting ngrok tunnel...', source: 'ngrok' });
  ngrokProc = spawn('ngrok', ngrokArgs);
  ngrokRunning = true;
  ngrokUrl = '';
  ngrokUrlNotified = false;
  ngrokWaitingNotified = false;
  broadcast({ type: 'status', server: serverRunning, ngrok: true, ngrokUrl: '' });
  setupProcessLogging(ngrokProc, 'ngrok');
  ngrokProc.on('close', (code, signal) => {
    ngrokRunning = false;
    ngrokUrl = '';
    ngrokUrlNotified = false;
    ngrokWaitingNotified = false;
    ngrokProc = null;
    const msg = signal ? `Ngrok tunnel killed (${signal})` : `Ngrok tunnel exited with code ${code}`;
    broadcast({ type: 'log', text: msg, source: 'system' });
    broadcast({ type: 'status', server: serverRunning, ngrok: false, ngrokUrl: '' });
  });
}

function stopNgrok() {
  if (!ngrokProc) return;
  broadcast({ type: 'log', text: 'Stopping ngrok tunnel...', source: 'system' });
  ngrokProc.kill('SIGKILL');
}

function startAll() {
  clearLog();
  closeLogFile();
  initLogFile();
  broadcast({ type: 'log', text: 'Starting all services...', source: 'system' });
  startServer();
  startNgrok();
}

function stopAll() {
  stopServer();
  stopNgrok();
}

function restartAll() {
  clearLog();
  closeLogFile();
  initLogFile();
  broadcast({ type: 'log', text: 'Restarting all services...', source: 'system' });
  stopServer();
  stopNgrok();
  setTimeout(() => {
    startServer();
    startNgrok();
  }, 300);
}

function fetchNgrokUrl() {
  http.get('http://localhost:4040/api/tunnels', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const tunnels = JSON.parse(data).tunnels;
        if (tunnels && tunnels.length > 0) {
          const newUrl = tunnels[0].public_url;
          if (newUrl !== ngrokUrl) {
            ngrokUrl = newUrl;
            ngrokUrlNotified = true;
            ngrokWaitingNotified = false;
            broadcast({ type: 'log', text: `Ngrok tunnel is running at ${newUrl}`, source: 'ngrok' });
            broadcast({ type: 'status', server: serverRunning, ngrok: ngrokRunning, ngrokUrl });
          }
        }
      } catch (e) {
        if (ngrokRunning && !ngrokUrlNotified && !ngrokWaitingNotified) {
          ngrokWaitingNotified = true;
          broadcast({ type: 'log', text: 'Waiting for ngrok tunnel to start...', source: 'ngrok' });
        }
      }
    });
  }).on('error', () => { /* ngrok not running */ });
}

setInterval(() => { if (ngrokRunning) fetchNgrokUrl(); }, 3000);

function closeTerminal() {
  try {
    if (process.platform === 'darwin') {
      execSync('osascript -e \'tell application "Terminal" to close front window\' 2>/dev/null', { timeout: 1000 });
    } else if (process.platform === 'win32') {
      execSync('taskkill /f /pid ' + process.ppid + ' 2>nul', { timeout: 1000 });
    }
  } catch (e) { /* ignore */ }
}

function cleanup() {
  showCursor();
  if (serverProc) { try { serverProc.kill('SIGKILL'); } catch (e) {} serverProc = null; }
  if (ngrokProc) { try { ngrokProc.kill('SIGKILL'); } catch (e) {} ngrokProc = null; }
  closeLogFile();
}

function copyToClipboard(text) {
  if (!text) return false;
  try {
    if (process.platform === 'darwin') {
      execSync('pbcopy', { input: text });
    } else if (process.platform === 'win32') {
      execSync('clip', { input: text });
    } else {
      execSync('xclip -selection clipboard', { input: text });
    }
    return true;
  } catch (e) {
    return false;
  }
}

process.on('SIGINT', () => { cleanup(); process.exit(0); });
process.on('SIGTERM', () => { cleanup(); process.exit(0); });
process.on('exit', cleanup);

// Setup raw stdin for keypress detection
process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.setEncoding('utf-8');

hideCursor();
clearScreen();

broadcast({ type: 'log', text: 'TUI Launcher ready. Press [1] to start all services.', source: 'system' });
dirty = true;

// Initial render
render();

// Key handler
process.stdin.on('data', (key) => {
  if (key === '1') {
    startAll();
  } else if (key === '2') {
    stopAll();
  } else if (key === '3') {
    restartAll();
  } else if (key === 'c' || key === 'C') {
    if (ngrokUrl) {
      if (copyToClipboard(ngrokUrl)) {
        showToast('Ngrok URL copied to clipboard!');
      } else {
        showToast('Failed to copy URL');
      }
    } else {
      showToast('No ngrok URL to copy');
    }
  } else if (key === 'l' || key === 'L') {
    clearLog();
    deleteLogFiles();
    showToast('Display and log files cleared');
  } else if (key === 'q' || key === '\x03') { // q or Ctrl+C
    if (confirmQuit) {
      cleanup();
      clearScreen();
      closeTerminal();
      process.exit(0);
    } else {
      confirmQuit = true;
      dirty = true;
    }
  } else if (key === 'y' || key === 'Y') {
    if (confirmQuit) {
      cleanup();
      clearScreen();
      closeTerminal();
      process.exit(0);
    }
  } else if (key === 'n' || key === 'N') {
    if (confirmQuit) {
      confirmQuit = false;
      dirty = true;
    }
  }
});

// Render loop
setInterval(() => {
  if (dirty) {
    render();
    dirty = false;
  }
}, 100);

// Handle terminal resize
process.stdout.on('resize', () => {
  needsClear = true;
  dirty = true;
});

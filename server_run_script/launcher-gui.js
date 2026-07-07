#!/usr/bin/env node
const http = require('http');
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const BACKEND_DIR = path.join(__dirname, '..', 'backend');

// Load backend .env so NGROK_DOMAIN is available
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
                // Strip surrounding quotes (dotenv does this too)
                if ((val.startsWith('"') && val.endsWith('"')) ||
                    (val.startsWith("'") && val.endsWith("'"))) {
                    val = val.slice(1, -1);
                }
                if (!process.env[key]) process.env[key] = val;
            }
        }
    });
}
const serverPath = path.join(BACKEND_DIR, 'server.js');
const SEAL_PATH = path.join(__dirname, '..', 'frontend', 'assets', 'pup_ous_seal.webp');

let serverProc = null;
let ngrokProc = null;
let ngrokUrl = '';
let serverRunning = false;
let ngrokRunning = false;
const logClients = [];
let shutdownTimer = null;

function broadcast(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  logClients.forEach(res => {
    try { res.write(msg); } catch (e) { /* ignore */ }
  });
}

function refreshShutdownTimer() {
  if (shutdownTimer) clearTimeout(shutdownTimer);
  if (logClients.length === 0) {
    shutdownTimer = setTimeout(() => {
      cleanup();
      process.exit(0);
    }, 1000);
  } else {
    shutdownTimer = null;
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

function clearLog() {
  broadcast({ type: 'clear-log' });
}

function startServer() {
  if (serverProc) return;
  clearLog();
  broadcast({ type: 'log', text: 'Starting server...', source: 'system' });
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
  broadcast({ type: 'status', server: serverRunning, ngrok: true, ngrokUrl: '' });
  setupProcessLogging(ngrokProc, 'ngrok');
  ngrokProc.on('close', (code, signal) => {
    ngrokRunning = false;
    ngrokUrl = '';
    ngrokUrlNotified = false;
    ngrokWaitingNotified = false;
    ngrokProc = null;
    const msg = signal ? `Ngrok tunnel killed (${signal})` : `Ngrok tunnel exited with code ${code}`;
    broadcast({ type: 'log', text: msg, source: 'ngrok' });
    broadcast({ type: 'status', server: serverRunning, ngrok: false, ngrokUrl: '' });
  });
}

function stopNgrok() {
  if (!ngrokProc) return;
  broadcast({ type: 'log', text: 'Stopping ngrok tunnel...', source: 'ngrok' });
  ngrokProc.kill('SIGKILL');
}

function startAll() {
  startServer();
  startNgrok();
}

function stopAll() {
  stopServer();
  stopNgrok();
}

function restartAll() {
  clearLog();
  stopServer();
  stopNgrok();
  setTimeout(() => {
    startServer();
    startNgrok();
  }, 300);
}

let ngrokUrlNotified = false;
let ngrokWaitingNotified = false;

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
        /* ngrok API not ready yet */
        if (ngrokRunning && !ngrokUrlNotified && !ngrokWaitingNotified) {
          ngrokWaitingNotified = true;
          broadcast({ type: 'log', text: 'Waiting for ngrok tunnel to start...', source: 'ngrok' });
        }
      }
    });
  }).on('error', () => { /* ngrok not running */ });
}

setInterval(() => { if (ngrokRunning) fetchNgrokUrl(); }, 3000);

const CSS = `
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f8f4f4;color:#2d2d2d;min-height:100vh}
.header{background:linear-gradient(#3d0510 0%,#6b0a1a 35%,#a8000d 100%);padding:14px 24px;display:flex;align-items:center;gap:12px;box-shadow:0 2px 8px rgba(0,0,0,.12)}
.header h1{color:#FFD700;font-size:18px;font-weight:700;letter-spacing:0.3px;margin-right:auto}
.header span{color:rgba(255,255,255,.7);font-size:13px}
.seal-circle{width:38px;height:38px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.container{max-width:960px;margin:0 auto;padding:24px}
.all-btns{display:flex;gap:10px;margin-bottom:20px}
.cards{display:flex;gap:20px;margin-bottom:20px}
.card{flex:1;background:#fff;border:1px solid #e9ecef;border-left:4px solid #6b0a1a;border-radius:12px;padding:20px;box-shadow:0 2px 12px rgba(0,0,0,.1)}
.card:last-child{border-left-color:#DAA520}
.card h2{font-size:11px;text-transform:uppercase;color:#6c757d;letter-spacing:0.8px;margin-bottom:12px;font-weight:600}
.status-row{display:flex;align-items:center;gap:10px}
.dot{width:10px;height:10px;border-radius:50%;background:#ccc;flex-shrink:0}
.dot.running{background:#15803d}
.dot.stopped{background:#b91c1c}
.status-label{font-size:13px;color:#6c757d}
.status-label strong{color:#2d2d2d;font-weight:600}
.btn{font-family:inherit;font-size:.875rem;font-weight:500;padding:.5rem 1.1rem;border:none;border-radius:10px;cursor:pointer;transition:all .2s ease-in-out;display:inline-flex;align-items:center;gap:.4rem}
.btn:hover{transform:scale(1.02);opacity:.9}
.btn-start{background:#6b0a1a;color:#fff}
.btn-start:hover{background:#3d0510}
.btn-stop{background:#b91c1c;color:#fff}
.btn-stop:hover{background:#991b1b}
.ngrok-box{background:#fff;border:1px solid #e9ecef;border-left:4px solid #DAA520;border-radius:12px;padding:14px 18px;margin-bottom:20px;display:flex;align-items:center;gap:12px;box-shadow:0 2px 12px rgba(0,0,0,.1)}
.ngrok-box label{font-size:11px;text-transform:uppercase;color:#6c757d;letter-spacing:.6px;font-weight:600;flex-shrink:0}
.ngrok-box a{color:#1d4ed8;font-family:'SF Mono',Consolas,'Courier New',monospace;font-size:14px;text-decoration:none}
.ngrok-box a:hover{text-decoration:underline}
.ngrok-box .copy-btn{font-size:11px;padding:4px 12px;border:1px solid #e9ecef;border-radius:8px;cursor:pointer;background:#f8f4f4;color:#6c757d;font-family:inherit;transition:all .15s}
.ngrok-box .copy-btn:hover{background:#e9ecef;color:#2d2d2d}
.ngrok-msg{color:#6c757d;font-size:13px;font-style:italic;flex:1}
.log-section{background:#fff;border:1px solid #e9ecef;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.1)}
.log-header{background:#f8f4f4;padding:10px 20px;font-size:11px;text-transform:uppercase;color:#6c757d;letter-spacing:.6px;display:flex;justify-content:space-between;border-bottom:1px solid #e9ecef;font-weight:600}
.log-header .clear-btn{background:none;border:none;color:#6c757d;cursor:pointer;font-size:12px;text-transform:none;letter-spacing:0;font-family:inherit}
.log-header .clear-btn:hover{color:#2d2d2d}
.log-area{height:340px;overflow-y:auto;padding:8px 0;font-family:'SF Mono',Consolas,'Courier New',monospace;font-size:12px;line-height:1.6;background:#fafbfc}
.log-area::-webkit-scrollbar{width:6px}
.log-area::-webkit-scrollbar-track{background:transparent}
.log-area::-webkit-scrollbar-thumb{background:#d0d7de;border-radius:3px}
.log-entry{padding:0 20px;white-space:pre-wrap;overflow-wrap:break-word}
.log-entry .ts{color:#aaa;margin-right:10px}
.log-entry .tag{display:inline-block;min-width:60px;margin-right:6px;font-weight:600}
.log-entry.server .tag{color:#15803d}
.log-entry.ngrok .tag{color:#1d4ed8}
.log-entry.system .tag{color:#8250df}
.log-entry.system{color:#6c757d}
.footer{margin-top:20px;text-align:center;font-size:11px;color:#6c757d}
`;

const HTML_END = `</body></html>`;

function serveHTML(res) {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.write(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PAMS OUS Launcher</title><style>${CSS}</style></head><body>
<div class="header"><span class="seal-circle"><img src="/seal" alt="" height="28"></span><h1>PAMS OUS Launcher</h1><span>Server Control Panel</span></div>
<div class="container">
  <div class="all-btns">
    <button class="btn btn-start" onclick="fetch('/api/start-all',{method:'POST'})">Start All</button>
    <button class="btn btn-stop" onclick="fetch('/api/stop-all',{method:'POST'})">Stop All</button>
    <button class="btn btn-start" onclick="fetch('/api/restart-all',{method:'POST'})">Restart</button>
  </div>
  <div class="cards">
    <div class="card">
      <h2>Backend Server</h2>
      <div class="status-row">
        <span class="dot" id="serverDot"></span>
        <span class="status-label">Port <strong>3000</strong> &mdash; <span id="serverStatus">Stopped</span></span>
      </div>
    </div>
    <div class="card">
      <h2>Ngrok Tunnel</h2>
      <div class="status-row">
        <span class="dot" id="ngrokDot"></span>
        <span class="status-label"><span id="ngrokStatus">Stopped</span></span>
      </div>
    </div>
  </div>
  <div class="ngrok-box" id="ngrokBox">
    <label>Public URL</label>
    <span class="ngrok-msg" id="ngrokMsg">Ngrok tunnel is not active</span>
    <a id="ngrokLink" href="#" target="_blank" rel="noopener" style="display:none"></a>
    <button class="copy-btn" id="ngrokCopyBtn" onclick="copyNgrokUrl()" style="display:none">Copy</button>
  </div>
  <div class="log-section">
    <div class="log-header">
      <span>Output Log</span>
      <button class="clear-btn" onclick="document.getElementById('logArea').innerHTML=''">Clear</button>
    </div>
    <div class="log-area" id="logArea"></div>
  </div>
  <div class="footer">Close this window or press Ctrl+C in the terminal to stop everything.</div>
</div>
<script>
const evtSource = new EventSource('/events');
evtSource.onmessage = function(e) {
  const data = JSON.parse(e.data);
  if (data.type === 'clear-log') {
    document.getElementById('logArea').innerHTML = '';
  } else if (data.type === 'log') {
    const el = document.getElementById('logArea');
    const div = document.createElement('div');
    div.className = 'log-entry ' + data.source;
    div.innerHTML = '<span class="ts">' + new Date(data.timestamp || Date.now()).toLocaleTimeString() + '</span><span class="tag">[' + data.source.toUpperCase() + ']</span>' + escapeHtml(data.text);
    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
  } else if (data.type === 'status') {
    const serverDot = document.getElementById('serverDot');
    const serverStat = document.getElementById('serverStatus');
    serverDot.className = 'dot ' + (data.server ? 'running' : 'stopped');
    serverStat.textContent = data.server ? 'Running' : 'Stopped';

    const ngrokDot = document.getElementById('ngrokDot');
    const ngrokStat = document.getElementById('ngrokStatus');
    ngrokDot.className = 'dot ' + (data.ngrok ? 'running' : 'stopped');
    ngrokStat.textContent = data.ngrok ? 'Running' : 'Stopped';

    const ngrokMsg = document.getElementById('ngrokMsg');
    const link = document.getElementById('ngrokLink');
    const copyBtn = document.getElementById('ngrokCopyBtn');
    if (data.ngrokUrl) {
      ngrokMsg.style.display = 'none';
      link.style.display = 'inline';
      copyBtn.style.display = 'inline';
      link.textContent = data.ngrokUrl;
      link.href = data.ngrokUrl;
    } else if (data.ngrok) {
      ngrokMsg.style.display = 'inline';
      link.style.display = 'none';
      copyBtn.style.display = 'none';
      ngrokMsg.textContent = 'Waiting for ngrok tunnel to start...';
    } else {
      ngrokMsg.style.display = 'inline';
      link.style.display = 'none';
      copyBtn.style.display = 'none';
      ngrokMsg.textContent = 'Ngrok tunnel is not active';
    }
  }
};
function escapeHtml(t){const d=document.createElement('div');d.appendChild(document.createTextNode(t));return d.innerHTML}
function copyNgrokUrl(){const l=document.getElementById('ngrokLink');navigator.clipboard.writeText(l.textContent)}
</script>`);
  res.end(HTML_END);
}

function handleAPI(req, res, pathname) {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    let ok = false;
    if (pathname === '/api/start-all') { startAll(); ok = true; }
    else if (pathname === '/api/stop-all') { stopAll(); ok = true; }
    else if (pathname === '/api/restart-all') { restartAll(); ok = true; }
    res.writeHead(ok ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok }));
  });
}

function handleSSE(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  res.write(`data: ${JSON.stringify({ type: 'status', server: serverRunning, ngrok: ngrokRunning, ngrokUrl })}\n\n`);
  logClients.push(res);
  refreshShutdownTimer();
  req.on('close', () => {
    const i = logClients.indexOf(res);
    if (i !== -1) logClients.splice(i, 1);
    refreshShutdownTimer();
  });
}

function cleanup() {
  if (shutdownTimer) { clearTimeout(shutdownTimer); shutdownTimer = null; }
  if (serverProc) { try { serverProc.kill('SIGKILL'); } catch (e) {} serverProc = null; }
  if (ngrokProc) { try { ngrokProc.kill('SIGKILL'); } catch (e) {} ngrokProc = null; }
  logClients.forEach(r => { try { r.end(); } catch (e) {} });
  logClients.length = 0;
}

function openBrowser(port) {
  const url = `http://localhost:${port}`;
  console.log(`Launcher GUI: ${url}`);
  const platform = process.platform;
  try {
    if (platform === 'darwin') exec(`open "${url}"`);
    else if (platform === 'win32') exec(`cmd /c start "" "${url}"`);
    else exec(`xdg-open "${url}"`);
  } catch (e) { /* browser open failed, user can navigate manually */ }
}

function startGUIServer(port) {
  const handler = (req, res) => {
    const up = new URL(req.url, `http://localhost:${port}`);
    const p = up.pathname;
    if (p === '/') serveHTML(res);
    else if (p === '/events') handleSSE(req, res);
    else if (p === '/seal') {
      try {
        const img = fs.readFileSync(SEAL_PATH);
        res.writeHead(200, { 'Content-Type': 'image/webp', 'Cache-Control': 'max-age=86400' });
        res.end(img);
      } catch (e) {
        res.writeHead(404); res.end('Not found');
      }
    }
    else if (p.startsWith('/api/')) handleAPI(req, res, p);
    else { res.writeHead(404); res.end('Not found'); }
  };
  const server = http.createServer(handler);
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && port < 3500) startGUIServer(port + 1);
    else { console.error(`Cannot start GUI on port ${port}:`, err.message); process.exit(1); }
  });
  server.listen(port, () => openBrowser(port));
}

process.on('SIGINT', () => { cleanup(); process.exit(0); });
process.on('SIGTERM', () => { cleanup(); process.exit(0); });
process.on('exit', cleanup);

startGUIServer(3456);

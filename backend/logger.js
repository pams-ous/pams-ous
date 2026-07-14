const fs = require('fs');
const path = require('path');
const util = require('util');

const LOGS_DIR = path.join(__dirname, 'logs');

(function init() {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }

  try {
    const files = fs.readdirSync(LOGS_DIR);
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    files.forEach(file => {
      if (file.endsWith('.log')) {
        const filePath = path.join(LOGS_DIR, file);
        const stat = fs.statSync(filePath);
        if (now - stat.mtimeMs > sevenDays) {
          fs.unlinkSync(filePath);
        }
      }
    });
  } catch (e) { /* ignore */ }

  const pad = (n) => String(n).padStart(2, '0');
  const d = new Date();
  const timestamp = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  const logPath = path.join(LOGS_DIR, `pams-server-${timestamp}.log`);
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });

  logStream.write(`--- PAMS Server session started at ${new Date().toISOString()} ---\n`);

  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;

  function ts() {
    const now = new Date();
    return `[${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}]`;
  }

  console.log = function(...args) {
    const msg = util.format(...args);
    origLog.apply(console, args);
    logStream.write(`${ts()} ${msg}\n`);
  };

  console.warn = function(...args) {
    const msg = util.format(...args);
    origWarn.apply(console, args);
    logStream.write(`${ts()} [WARN] ${msg}\n`);
  };

  console.error = function(...args) {
    const msg = util.format(...args);
    origError.apply(console, args);
    logStream.write(`${ts()} [ERROR] ${msg}\n`);
  };

  function flushAndClose() {
    logStream.write(`--- Session ended at ${new Date().toISOString()} ---\n`);
    logStream.end();
  }

  process.on('exit', flushAndClose);
  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));
})();

const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

const serverPath = path.join(__dirname, '..', 'backend', 'server.js');
const serverCmd = 'node';
const serverArgs = [serverPath];

const ngrokCmd = 'ngrok';
const ngrokArgs = ['http', '3000'];

console.log('🚀 Launching server and ngrok...');

const serverProc = spawn(serverCmd, serverArgs);
const ngrokProc = spawn(ngrokCmd, ngrokArgs);

const setupLogging = (proc, prefix, color) => {
    proc.stdout.on('data', (data) => {
        process.stdout.write(`${color}${prefix}${'\x1b[0m'} ${data}`);
    });
    proc.stderr.on('data', (data) => {
        process.stderr.write(`${color}${prefix} [ERROR]${'\x1b[0m'} ${data}`);
    });
    proc.on('close', (code) => {
        console.log(`${color}${prefix}${'\x1b[0m'} process exited with code ${code}`);
    });
};

setupLogging(serverProc, '[Server]', '\x1b[32m');
setupLogging(ngrokProc, '[Ngrok]', '\x1b[34m');

const fetchNgrokUrl = () => {
    http.get('http://localhost:4040/api/tunnels', (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
            try {
                const tunnels = JSON.parse(data).tunnels;
                if (tunnels && tunnels.length > 0) {
                    console.log(`\n\x1b[33mNgrok Public URL: ${tunnels[0].public_url}\x1b[0m\n`);
                } else {
                    setTimeout(fetchNgrokUrl, 2000);
                }
            } catch (e) {
                setTimeout(fetchNgrokUrl, 2000);
            }
        });
    }).on('error', () => {
        setTimeout(fetchNgrokUrl, 2000);
    });
};

console.log('Fetching Ngrok public URL... please wait.');
setTimeout(fetchNgrokUrl, 1000);

const killProcesses = () => {
    console.log('\n🛑 Stopping all processes...');
    serverProc.kill();
    ngrokProc.kill();
};

process.on('SIGINT', () => {
    killProcesses();
    process.exit();
});

process.on('SIGTERM', () => {
    killProcesses();
    process.exit();
});

// Handle window close on some platforms
process.on('exit', killProcesses);

console.log('--------------------------------------------------');
console.log('SERVER AND NGROK ARE RUNNING');
console.log('Close this window or press Ctrl+C to stop everything.');
console.log('--------------------------------------------------');

/* ===============================================================
CENTRALIZED ENTRY POINT (server.js) - DO NOT MODIFY STRUCTURE
This file contains ALL the startup logic, including module loading, 
middleware setup, database connection, and socket listeners.

Make sure that you have an existing node_modules file. If you don't have one, run this inside your terminal:
npm i argon2 mysql2 socket.io cors nodemailer express
===============================================================*/

require('dotenv').config({ path: require('path').resolve(__dirname, '.', '.env') });

const http = require('http');
const path = require('path'); // <-- ADDED: Crucial to prevent 'path is not defined' error
const mysql = require('mysql2/promise');
const { Server } = require('socket.io');
const express = require('express');

// --- 1. SETUP CORE SERVICES ---
const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: (origin, callback) => {
            // Allow requests from localhost, 127.0.0.1, configured .env origins, or any ngrok tunnel
            if (!origin || 
                origin.includes('localhost') || 
                origin.includes('127.0.0.1') || 
                origin.includes('.ngrok-free.dev') || // <-- ADDED: Dynamically matches all ngrok domains
                origin === process.env.FRONTEND_ORIGIN || 
                origin === process.env.BACKEND_ORIGIN) {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'));
            }
        },
        methods: ["GET", "POST"]
    }
});

// Serve the static files directly from your raw frontend folder
app.use(express.static(path.join(__dirname, '../frontend')));


// --- 2. DATABASE CONNECTION ---
const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'people'
});


// =======================================================
// 3. API MODULE INITIALIZATION & ROUTING
// =======================================================

const {searchAPI} = require("./UserMngmt_APIs/userSearch");
const {regiUserAPI} = require("./UserMngmt_APIs/registration");
const {manageAccountAPI} = require("./UserMngmt_APIs/manage");
const {otpAPI} = require("./UserMngmt_APIs/otp");
const {passwordResetAPI} = require("./UserMngmt_APIs/passwordReset");
const {loginAPI} = require("./UserMngmt_APIs/login");
const {reportAPI} = require("./ReportMgmt_APIs/reportHandlers");
const {dashboardAPI} = require("./TaskMgmt_APIs/dashboardHandlers");

const taskRoutes = require('./TaskMngmt_APIs/taskRoutes');
app.use(express.json());

// Initialize all APIs (The order matters!)
searchAPI(io, db);
regiUserAPI(io, db);
manageAccountAPI(io, db, app);
otpAPI(io, db);
passwordResetAPI(io, db);
loginAPI(express, db, io, app);
reportAPI(io, db);
dashboardAPI(app, io, db);

app.use('/api/tasks', taskRoutes);

// Catch-all route: Send non-API requests to your frontend index.html
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// =======================================================
// 4. FINAL STARTUP EXECUTION
// =======================================================

const PORT = process.env.PORT || process.env.port || 3000;

// make the server listen to all network interfaces (0.0.0.0)
server.listen(PORT, '0.0.0.0', () => console.log(`\n===================================================\nServer connected successfully at port ${PORT}\n===================================================`));
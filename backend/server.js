/* 
===============================================================
CENTRALIZED ENTRY POINT (server.js) - DO NOT MODIFY STRUCTURE
This file contains ALL the startup logic, including module loading, \nmiddleware setup, database connection, and socket listeners.

Make sure that you have an existing node_modules file. If you don't have one, run this inside your terminal:
npm i argon2 mysql2 socket.io cors nodemailer express

\n===============================================================*/

require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

const http = require('http');
const mysql = require('mysql2/promise');
const { Server } = require('socket.io');
const express = require('express');

// --- 1. SETUP CORE SERVICES ---
const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: process.env.FRONTEND_ORIGIN || "http://127.0.0.1:5500",
        methods: ["GET", "POST"]
    }
});

// --- 2. DATABASE CONNECTION ---
const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'hillsazucena#17',
    database: process.env.DB_NAME || 'people'
});

// =======================================================
// 3. AUTHENTICATION LOGIC (Copied from login.js)
// =======================================================

async function handle_login(socket, data) {
    const email = data.email;
    const rawPw = data.password;

    if (rawPw.trim().length <= 0 || !rawPw) {
        return socket.emit('login_backendLog', { success: false, rawData: `Enter the password!`});
    }

    const query = 
    `SELECT password FROM employees WHERE email = ? LIMIT 1;`;

    try {
        const [records] = await db.query(query, [email]);
        if (records && records.length > 0) {
            const hashedPw = records[0].password;

            const {verify_pass} = require("./passwordUtil");
            let validPw = await verify_pass(rawPw, hashedPw);
            const {getEmployeeDetails} = require("./dbChecks");
            const result = await getEmployeeDetails(db, data.email);
            const [firstName, middleName, lastName, suffix] = [result?.first_name, result?.middle_name, result?.last_name, result?.suffix];
            const empName = [firstName, middleName, lastName, suffix].filter(Boolean).join(" ");

            socket.emit('login_backendLog', {
                success: validPw,
                rawData: `Email: ${email}\\nValid: ${validPw}\\n`,
                empName: empName,
                email: email
            });
            console.log(`validPw`);
        } else {
            socket.emit('login_backendLog', {
                success: false,
                rawData: `Account not found!`
            });
        }
    } catch (err) {
        socket.emit('login_backendLog', {success: false, rawData: `${err}`});
    }
}

// 4. SOCKET CONNECTION HANDLERS
io.on('connection', (socket) => {
    console.log(`Connected!`);
    socket.on('sendAccDetails', async (data) => {
        handle_login(socket, data);
    });
});


// =======================================================
// 5. API MODULE INITIALIZATION & ROUTING
// =======================================================

const {searchAPI} = require("./UserMngmt_APIs/userSearch");
const {regiUserAPI} = require("./UserMngmt_APIs/registration");
const {manageAccountAPI} = require("./UserMngmt_APIs/manage");
const {otpAPI} = require("./UserMngmt_APIs/otp");
const {passwordResetAPI} = require("./UserMngmt_APIs/passwordReset");
const {loginAPI} = require("./UserMngmt_APIs/login");

// Initialize all APIs (The order matters!)
searchAPI(io, db);
regiUserAPI(io, db);
manageAccountAPI(io, db);
otpAPI(io, db);
passwordResetAPI(io, db);
loginAPI(express, db, io, app);

// =======================================================
// 6. FINAL STARTUP EXECUTION
// =======================================================

const PORT = process.env.PORT || process.env.port || 3000;

server.listen(PORT, () => console.log(`\n===================================================\nServer connected successfully at port ${PORT}\n===================================================`));
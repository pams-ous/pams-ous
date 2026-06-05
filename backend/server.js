/* ===============================================================
CENTRALIZED ENTRY POINT (server.js) - DO NOT MODIFY STRUCTURE
This file contains ALL the startup logic, including module loading, 
middleware setup, database connection, and socket listeners.

Make sure that you have an existing node_modules file. If you don't have one, run this inside your terminal:
npm install express socket.io mysql2 dotenv argon2 jsonwebtoken nodemailer cors
===============================================================*/

require('dotenv').config({ path: require('path').resolve(__dirname, '.', '.env') });

const http = require('http');
const path = require('path');
const mysql = require('mysql2/promise');
const { Server } = require('socket.io');
const express = require('express');

// --- 1. SETUP CORE SERVICES ---
const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: (origin, callback) => {
            if (!origin || 
                origin.includes('localhost') || 
                origin.includes('127.0.0.1') || 
                origin.includes('.ngrok-free.dev') || 
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
const {reportAPI} = require("./ReportMngmt_APIs/reportHandlers");
const {dashboardAPI} = require("./TaskMngmt_APIs/dashboardHandlers");
const { notificationsRouter } = require("./UserMngmt_APIs/notifications");

const taskRoutes = require('./TaskMngmt_APIs/taskRoutes');
app.use(express.json());

app.use("/api/notifications", notificationsRouter(db));

// ==========================================
// 🚀 NEW SYSTEM SYNC ROUTES (NO COLLISIONS)
// These MUST be placed BEFORE the API initializations below!
// ==========================================

app.get('/api/admin/sync/users', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT e.employee_id as id, e.first_name, e.last_name, e.email, e.job_title, d.name as designation_name, e.designation as system_role, e.active_status, e.approval_status,
            (
                SELECT JSON_ARRAYAGG(g.group_name)
                FROM Employees_Groups eg
                JOIN Job_Groups g ON eg.group_id = g.group_id
                WHERE eg.employee_id = e.employee_id
            ) as group_list
            FROM Employees e
            LEFT JOIN Designations d ON e.job_title = d.designation_id
        `);
        const users = rows.map(r => {
            let parsedGroups = [];
            if (r.group_list) {
                try { parsedGroups = typeof r.group_list === 'string' ? JSON.parse(r.group_list) : r.group_list; } 
                catch (err) { parsedGroups = []; }
            }
            return {
                id: r.id, name: `${r.first_name} ${r.last_name}`, email: r.email,
                role: r.system_role === 'Admin' ? 'ADMIN' : 'MEMBER',
                jobTitleId: r.job_title,
                jobTitleName: r.designation_name,
                activeStatus: r.active_status,
                approvalStatus: r.approval_status,
                groups: parsedGroups 
            };
        });
        res.json({ users });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/sync/users/:id/approve', async (req, res) => {
    try {
        const userId = req.params.id;
        await db.query("UPDATE Employees SET approval_status = 'APPROVED' WHERE employee_id = ?", [userId]);
        res.json({ success: true, message: "User approved successfully" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/sync/groups', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT g.group_id as id, g.group_name as name, g.\`desc\`,
            (SELECT e.email FROM Employees e JOIN Employees_Groups eg ON e.employee_id = eg.employee_id WHERE eg.group_id = g.group_id AND eg.role = 'Leader' LIMIT 1) as leader_email,
            (SELECT CONCAT(e.first_name, ' ', e.last_name) FROM Employees e JOIN Employees_Groups eg ON e.employee_id = eg.employee_id WHERE eg.group_id = g.group_id AND eg.role = 'Leader' LIMIT 1) as leader,
            (SELECT COUNT(DISTINCT employee_id) FROM Employees_Groups WHERE group_id = g.group_id) as members
            FROM Job_Groups g
        `);
        res.json({ groups: rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/sync/groups', async (req, res) => {
    const { name, desc, leaderEmail } = req.body;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [result] = await connection.query(`INSERT INTO Job_Groups (group_name, \`desc\`) VALUES (?, ?)`, [name, desc]);
        const newGroupId = result.insertId;
        
        if (leaderEmail) {
            const [emp] = await connection.query(`SELECT employee_id FROM Employees WHERE email = ?`, [leaderEmail]);
            if (emp.length > 0) await connection.query(`INSERT INTO Employees_Groups (employee_id, group_id, role) VALUES (?, ?, 'Leader')`, [emp[0].employee_id, newGroupId]);
        }
        await connection.commit();
        res.json({ success: true });
    } catch (e) { await connection.rollback(); res.status(500).json({ error: e.message }); } finally { connection.release(); }
});

app.put('/api/admin/sync/groups/:id', async (req, res) => {
    const { name, desc, leaderEmail } = req.body;
    const groupId = req.params.id;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        await connection.query(`UPDATE Job_Groups SET group_name = ?, \`desc\` = ? WHERE group_id = ?`, [name, desc, groupId]);
        await connection.query(`DELETE FROM Employees_Groups WHERE group_id = ? AND role = 'Leader'`, [groupId]);
        
        if (leaderEmail) {
            const [emp] = await connection.query(`SELECT employee_id FROM Employees WHERE email = ?`, [leaderEmail]);
            if (emp.length > 0) {
                const [existing] = await connection.query(`SELECT * FROM Employees_Groups WHERE group_id = ? AND employee_id = ?`, [groupId, emp[0].employee_id]);
                if (existing.length > 0) await connection.query(`UPDATE Employees_Groups SET role = 'Leader' WHERE group_id = ? AND employee_id = ?`, [groupId, emp[0].employee_id]);
                else await connection.query(`INSERT INTO Employees_Groups (employee_id, group_id, role) VALUES (?, ?, 'Leader')`, [emp[0].employee_id, groupId]);
            }
        }
        await connection.commit();
        res.json({ success: true });
    } catch (e) { await connection.rollback(); res.status(500).json({ error: e.message }); } finally { connection.release(); }
});

app.delete('/api/admin/sync/groups/:id', async (req, res) => {
    try {
        await db.query(`DELETE FROM Job_Groups WHERE group_id = ?`, [req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/sync/groups/:id/members', async (req, res) => {
    try {
        const [rows] = await db.query(`SELECT e.email FROM Employees_Groups eg JOIN Employees e ON eg.employee_id = e.employee_id WHERE eg.group_id = ?`, [req.params.id]);
        res.json({ members: rows.map(r => r.email) });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/sync/groups/:id/members', async (req, res) => {
    const connection = await db.getConnection(); 
    try {
        await connection.beginTransaction();
        const groupId = req.params.id;
        const { members } = req.body; 

        const [leaderRows] = await connection.query(`SELECT employee_id FROM Employees_Groups WHERE group_id = ? AND role = 'Leader'`, [groupId]);
        const leaderId = leaderRows.length > 0 ? leaderRows[0].employee_id : null;

        await connection.query(`DELETE FROM Employees_Groups WHERE group_id = ? AND role = 'Member'`, [groupId]);

        if (members && members.length > 0) {
            const placeholders = members.map(() => '?').join(',');
            const [empRows] = await connection.query(`SELECT employee_id FROM Employees WHERE email IN (${placeholders})`, members);

            const insertData = [];
            for (const emp of empRows) {
                if (emp.employee_id !== leaderId) insertData.push([emp.employee_id, groupId, 'Member']);
            }
            if (insertData.length > 0) await connection.query(`INSERT INTO Employees_Groups (employee_id, group_id, role) VALUES ?`, [insertData]);
        }
        await connection.commit();
        res.json({ success: true });
    } catch (e) { await connection.rollback(); res.status(500).json({ error: e.message }); } finally { connection.release(); }
});

// ==========================================
// Initialize all APIs (The order matters!)
// ==========================================
searchAPI(io, db);
regiUserAPI(io, db, app);
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
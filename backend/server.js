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
const {notificationsRouter, recordNotification} = require("./UserMngmt_APIs/notifications");
const {formatFullName} = require("./UserMngmt_APIs/userUtils");
const { authenticateToken } = require("./UserMngmt_APIs/authMiddleware");

const taskRoutes = require('./TaskMngmt_APIs/taskRoutes');
app.use(express.json());

app.use("/api/notifications", notificationsRouter(db));

// ==========================================
// 🚀 NEW SYSTEM SYNC ROUTES (NO COLLISIONS)
// These MUST be placed BEFORE the API initializations below!
// ==========================================

app.get('/api/admin/sync/users', authenticateToken, async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT e.employee_id as id, e.employee_code, e.first_name, e.last_name, e.middle_name, e.suffix, e.email, e.job_title, d.name as designation_name, e.designation as system_role, e.active_status, e.approval_status,
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
                id: r.id, 
                employeeCode: r.employee_code,
                firstName: r.first_name,
                lastName: r.last_name,
                middleName: r.middle_name,
                suffix: r.suffix,
                name: `${r.first_name} ${r.last_name}`, 
                email: r.email,
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

app.post('/api/admin/sync/users/:id/approve', authenticateToken, async (req, res) => {
    try {
        const userId = req.params.id;
        await db.query("UPDATE Employees SET approval_status = 'APPROVED' WHERE employee_id = ?", [userId]);
        res.json({ success: true, message: "User approved successfully" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/sync/groups', authenticateToken, async (req, res) => {
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

app.post('/api/admin/sync/groups', authenticateToken, async (req, res) => {
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

        const [adminData] = await db.query('SELECT first_name, last_name, suffix FROM Employees WHERE employee_id = ?', [req.user.id]);
        const adminName = formatFullName(adminData[0]);

        await recordNotification(db, {
            kind: "group_created",
            title: "New Group Created",
            body: `A new group "${name}" was created by ${adminName}`,
            relatedUrl: null,
            targetGroupId: newGroupId
        });

        res.json({ success: true });
    } catch (e) { await connection.rollback(); res.status(500).json({ error: e.message }); } finally { connection.release(); }
});

app.put('/api/admin/sync/groups/:id', authenticateToken, async (req, res) => {
    const { name, desc, leaderEmail } = req.body;
    const groupId = req.params.id;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        
        const [groupBefore] = await db.query('SELECT group_name, \`desc\`, group_id FROM Job_Groups WHERE group_id = ?', [groupId]);
        const groupNameBefore = groupBefore[0]?.group_name;
        const groupDescBefore = groupBefore[0]?.desc;

        await connection.query(`UPDATE Job_Groups SET group_name = ?, \`desc\` = ? WHERE group_id = ?`, [name, desc, groupId]);
        await connection.query(`DELETE FROM Employees_Groups WHERE group_id = ? AND role = 'Leader'`, [groupId]);
        
        if (leaderEmail) {
            const [emp] = await connection.query(`SELECT employee_id, first_name, last_name, suffix FROM Employees WHERE email = ?`, [leaderEmail]);
            if (emp.length > 0) {
                const [existing] = await connection.query(`SELECT * FROM Employees_Groups WHERE group_id = ? AND employee_id = ?`, [groupId, emp[0].employee_id]);
                if (existing.length > 0) await connection.query(`UPDATE Employees_Groups SET role = 'Leader' WHERE group_id = ? AND employee_id = ?`, [groupId, emp[0].employee_id]);
                else await connection.query(`INSERT INTO Employees_Groups (employee_id, group_id, role) VALUES (?, ?, 'Leader')`, [emp[0].employee_id, groupId]);
            }
        }
        await connection.commit();

        const [adminData] = await db.query('SELECT first_name, last_name, suffix FROM Employees WHERE employee_id = ?', [req.user.id]);
        const adminName = formatFullName(adminData[0]);

        //-group x's group name was modifed to (the new group name) by Admin y
        if (name && name !== groupNameBefore) {
            await recordNotification(db, {
                kind: "group_name_update",
                title: "Group Name Modified",
                body: `Group "${groupNameBefore}"'s group name was modified to "${name}" by ${adminName}`,
                relatedUrl: null
            });
        }
        //-group x's description was modifed by Admin y
        if (desc && desc !== groupDescBefore) {
            await recordNotification(db, {
                kind: "group_desc_update",
                title: "Group Description Modified",
                body: `Group "${groupNameBefore}"'s description was modified by ${adminName}`,
                relatedUrl: null
            });
        }
        //-group x's group leader was changed to (the new group's leader) by Admin y
        if (leaderEmail) {
            const [leaderData] = await db.query('SELECT first_name, last_name, suffix FROM Employees WHERE email = ?', [leaderEmail]);
            const leaderName = formatFullName(leaderData[0]);
            await recordNotification(db, {
                kind: "group_leader_update",
                title: "Group Leader Changed",
                body: `Group "${groupNameBefore}"'s group leader was changed to ${leaderName} by ${adminName}`,
                relatedUrl: null
            });
        }

        res.json({ success: true });
    } catch (e) { await connection.rollback(); res.status(500).json({ error: e.message }); } finally { connection.release(); }
});

app.delete('/api/admin/sync/groups/:id', authenticateToken, async (req, res) => {
    try {
        const groupId = req.params.id;
        const [group] = await db.query('SELECT group_name FROM Job_Groups WHERE group_id = ?', [groupId]);
        if (group.length === 0) return res.status(404).json({ success: false, message: "Group not found" });
        
        const groupName = group[0].group_name;
        await db.query(`DELETE FROM Job_Groups WHERE group_id = ?`, [groupId]);

        //-group x was deleted by Admin y
        const [adminData] = await db.query('SELECT first_name, last_name, suffix FROM Employees WHERE employee_id = ?', [req.user.id]);
        const adminName = formatFullName(adminData[0]);

        await recordNotification(db, {
            kind: "group_deleted",
            title: "Group Deleted",
            body: `Group "${groupName}" was deleted by ${adminName}`,
            relatedUrl: null
        });

        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/sync/groups/:id/members', async (req, res) => {
    try {
        const [rows] = await db.query(`SELECT e.email FROM Employees_Groups eg JOIN Employees e ON eg.employee_id = e.employee_id WHERE eg.group_id = ?`, [req.params.id]);
        res.json({ members: rows.map(r => r.email) });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/sync/groups/:id/members', authenticateToken, async (req, res) => {
    const connection = await db.getConnection(); 
    try {
        await connection.beginTransaction();
        const groupId = req.params.id;
        const { members } = req.body; 

        const [groupRows] = await connection.query(`SELECT group_name FROM Job_Groups WHERE group_id = ?`, [groupId]);
        const groupName = groupRows[0]?.group_name || `Group ID ${groupId}`;

        const [leaderRows] = await connection.query(`SELECT employee_id FROM Employees_Groups WHERE group_id = ? AND role = 'Leader'`, [groupId]);
        const leaderId = leaderRows.length > 0 ? leaderRows[0].employee_id : null;

        // Keep track of current members to identify new ones
        const [currentMembers] = await connection.query(`SELECT employee_id FROM Employees_Groups WHERE group_id = ? AND role = 'Member'`, [groupId]);
        const currentMemberIds = new Set(currentMembers.map(m => m.employee_id));

        await connection.query(`DELETE FROM Employees_Groups WHERE group_id = ? AND role = 'Member'`, [groupId]);

        if (members && members.length > 0) {
            const placeholders = members.map(() => '?').join(',');
            const [empRows] = await connection.query(`SELECT employee_id, first_name, last_name, suffix, designation FROM Employees WHERE email IN (${placeholders})`, members);

            const insertData = [];
            for (const emp of empRows) {
                if (emp.employee_id !== leaderId) {
                    insertData.push([emp.employee_id, groupId, 'Member']);
                    
                    //-non-admin x was added to group y
                    if (!currentMemberIds.has(emp.employee_id) && emp.designation !== 'Admin') {
                        await recordNotification(db, {
                            kind: "user_group_added",
                            title: "Group Assignment",
                            body: `${formatFullName(emp)} was added to group ${groupName}`,
                            relatedUrl: null,
                            targetUserId: emp.employee_id
                        });
                    }
                }
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
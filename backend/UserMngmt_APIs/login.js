/* 
To initialize:
npm init -y

To install the required modules:
npm i argon2 mysql2 socket.io express node-cron

To install nodemon (watcher):
npm i -D nodemon

To run all the APIs created for PAMS:
npx nodemon login.js
(NOTE: login.js is the starting nodejs file, where the server for socket.io is made, and where it connects to port of the process environment or port 3000, along with the rest of the created PAMS APIs)
*/

require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const http = require('http');
const argon2 = require('argon2');
const mysql = require('mysql2/promise');
const { Server } = require('socket.io');
const express = require('express');
const cron = require('node-cron');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: process.env.FRONTEND_ORIGIN || "http://127.0.0.1:5500",
        methods: ["GET", "POST"]
    }
});

const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'hillsazucena#17',
    database: process.env.DB_NAME || 'people'
});

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
			
			if (validPw) {
                // 1. Update the DB to show them as Online using your existing active_status ENUM
                await db.query("UPDATE Employees SET active_status = 'Online' WHERE email = ?", [email]);
                
                // 2. Attach the email to this specific socket connection so we remember who they are
                socket.userEmail = email;
            }
			
            const {getEmployeeDetails} = require("./dbChecks");
            const result = await getEmployeeDetails(db, data.email);
            const [firstName, middleName, lastName, suffix] = [result?.first_name, result?.middle_name, result?.last_name, result?.suffix];
            const empName = [firstName, middleName, lastName, suffix].filter(Boolean).join(" ");

            socket.emit('login_backendLog', {
                success: validPw,
                rawData: `Email: ${email}\nValid: ${validPw}\n`,
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

// basically the main method idk
io.on('connection', (socket) => {
    console.log(`Connected!`);

    socket.on('sendAccDetails', async (data) => {
        handle_login(socket, data);
    });

    socket.on('register_session', async (email) => {
        socket.userEmail = email; // Attach the email to this fresh socket
        try {
            await db.query("UPDATE Employees SET active_status = 'Online' WHERE email = ?", [email]);
            console.log(`[SESSION] ${email} reconnected to a new page.`);
        } catch (err) {
            console.error("Error setting online status on reconnect:", err);
        }
    });

    // Catch when the user leaves, closes their tab, or logs out
    socket.on('disconnect', async () => {
        if (socket.userEmail) {
            try {
                // Change their active_status back to Offline
                await db.query("UPDATE Employees SET active_status = 'Offline' WHERE email = ?", [socket.userEmail]);
                console.log(`[SESSION] ${socket.userEmail} went offline.`);
            } catch (err) {
                console.error("Error updating offline status:", err);
            }
        }
    });
});

const {searchAPI} = require("./userSearch");
const {regiUserAPI} = require("./registration");
const {manageAccountAPI} = require("./manage");
const {otpAPI} = require("./otp");
const {passwordResetAPI} = require("./passwordReset");
const { stringify } = require('querystring');

searchAPI(io, db);
regiUserAPI(io, db);
manageAccountAPI(io, db);
otpAPI(io, db);
passwordResetAPI(io, db);


//added 

app.use(express.json());
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") return res.sendStatus(200);
    next();
});

// Import the Task Routes
const taskRoutes = require('../TaskMngmt_APIs/taskRoutes');

// to route any '/api/tasks' requests to that file
app.use('/api/tasks', taskRoutes);

// NEW ROUTE: Catch the REST login fetch from auth.js
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    
    if (!password || password.trim().length <= 0) {
        return res.status(400).json({ success: false, message: 'Enter the password!' });
    }

    try {
        // 1. Find the user in the database
        const [records] = await db.query('SELECT password, designation, first_name, last_name FROM employees WHERE email = ? LIMIT 1;', [email]);
        
        if (records && records.length > 0) {
            const hashedPw = records[0].password;
            
            // 2. Verify Password using your existing utility
            const {verify_pass} = require("./passwordUtil");
            let validPw = await verify_pass(password, hashedPw);
            
            if (validPw) {
                // 3. Send back the exact JSON structure auth.js needs to redirect to the dashboard
                res.json({
                    success: true,
                    token: "jwt-token-active", // Placeholder token to satisfy the frontend session check
                    user: {
                        id: 1,
                        email: email,
                        role: records[0].designation === 'Admin' ? 'ADMIN' : 'MEMBER',
                        firstName: records[0].first_name,
                        lastName: records[0].last_name
                    }
                });
            } else {
                res.status(401).json({ success: false, message: 'Invalid password' });
            }
        } else {
            res.status(404).json({ success: false, message: 'Account not found!' });
        }
    } catch (err) {
        console.error("REST Login Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

app.put('/api/users/:id', async (req, res) => {
    const userId = req.params.id;
    const { role } = req.body;
    
    const designation = role === 'ADMIN' ? 'Admin' : 'Encoder';
    
    try {
        const [result] = await db.query(
            'UPDATE Employees SET designation = ? WHERE employee_id = ?', 
            [designation, userId]
        );
        
        // --- ADDED THIS TO SEE EXACTLY WHAT HAPPENS ---
        if (result.affectedRows === 0) {
            console.log(`[WARNING] Tried to update role, but could not find Employee ID: "${userId}" in the database.`);
        } else {
            console.log(`[SUCCESS] Updated Employee ID: "${userId}" to ${designation}.`);
        }
        // ----------------------------------------------

        res.json({ success: true, message: "Role update processed." });
    } catch (err) {
        console.error("SQL Error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 1. GET route to fetch all users from SQL
app.get('/api/users', async (req, res) => {
    try {
		const [rows] = await db.query(`
            SELECT employee_id AS id, 
                   CONCAT(first_name, ' ', last_name) AS name, 
                   email, 
                   CASE WHEN designation = 'Admin' THEN 'ADMIN' ELSE 'MEMBER' END AS role,
                   COALESCE(active_status, 'Offline') AS activeStatus 
            FROM Employees
        `);
        res.json(rows);
    } catch (err) {
        console.error("Error fetching users:", err);
        res.status(500).json({ error: err.message });
    }
});

//add user
app.post('/api/users', async (req, res) => {
    // Add 'code' to the expected request body
    const { code, name, email, role } = req.body;
    
    const nameParts = (name || 'Unknown').split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ');
    const designation = role === 'ADMIN' ? 'Admin' : 'Encoder';

    try {
        const [result] = await db.query(
            // Add employee_id to the INSERT command
            'INSERT INTO Employees (employee_id, first_name, last_name, email, designation) VALUES (?, ?, ?, ?, ?)',
            [code, firstName, lastName, email, designation]
        );
        res.json({ success: true, id: code, message: "User added to SQL!" });
    } catch (err) {
        console.error("Error adding user:", err);
        res.status(500).json({ error: err.message });
    }
});

// --- GROUPS API ROUTES ---

// 1. GET all groups and their assigned leader
app.get('/api/groups', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT g.group_id AS id, 
                   g.group_name AS name, 
                   g.\`desc\`, 
                   (SELECT COUNT(*) FROM Employees_Groups WHERE group_id = g.group_id) AS members,
                   (SELECT e.email 
                    FROM Employees_Groups eg 
                    JOIN Employees e ON eg.employee_id = e.employee_id 
                    WHERE eg.group_id = g.group_id AND eg.role = 'Leader' 
                    LIMIT 1) AS leader
            FROM Job_Groups g
        `);
        res.json(rows);
    } catch (err) {
        console.error("Error fetching groups:", err);
        res.status(500).json({ error: err.message });
    }
});

// 2. POST to create a new group
app.post('/api/groups', async (req, res) => {
    const { name, desc, leaderEmail } = req.body;
    try {
        // Insert into Job_Groups table
        const [result] = await db.query('INSERT INTO Job_Groups (group_name, `desc`) VALUES (?, ?)', [name, desc]);
        const newGroupId = result.insertId;

        // If a leader was selected, add them to Employees_Groups table
        if (leaderEmail) {
            const [emp] = await db.query('SELECT employee_id FROM Employees WHERE email = ?', [leaderEmail]);
            if (emp.length > 0) {
                await db.query('INSERT INTO Employees_Groups (employee_id, group_id, role) VALUES (?, ?, ?)', [emp[0].employee_id, newGroupId, 'Leader']);
            }
        }
        res.json({ success: true, message: "Group added!" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 3. PUT to edit an existing group
app.put('/api/groups/:id', async (req, res) => {
    const { name, desc, leaderEmail } = req.body;
    const groupId = req.params.id;
    try {
        await db.query('UPDATE Job_Groups SET group_name = ?, `desc` = ? WHERE group_id = ?', [name, desc, groupId]);
        
        // Remove the existing leader for this group to replace them
        await db.query("DELETE FROM Employees_Groups WHERE group_id = ? AND role = 'Leader'", [groupId]);
        
        if (leaderEmail) {
            const [emp] = await db.query('SELECT employee_id FROM Employees WHERE email = ?', [leaderEmail]);
            if (emp.length > 0) {
                await db.query('INSERT INTO Employees_Groups (employee_id, group_id, role) VALUES (?, ?, ?)', [emp[0].employee_id, groupId, 'Leader']);
            }
        }
        res.json({ success: true, message: "Group updated!" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 4. DELETE a group
app.delete('/api/groups/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM Job_Groups WHERE group_id = ?', [req.params.id]);
        res.json({ success: true, message: "Group deleted!" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- TASK AUTOMATION (CRON JOB) ---
// This runs every hour, on the hour.
cron.schedule('0 * * * *', async () => {
    try {
        console.log('Running scheduled task check...');
        
        // SQL: Update to 'pending' if it is currently 'in progress' 
        // AND it was created more than 24 hours ago.
        const query = `
            UPDATE Tasks 
            SET status = 'pending' 
            WHERE status = 'in progress' 
            AND created_at <= NOW() - INTERVAL 1 DAY
        `;
        
        const [result] = await db.query(query);
        
        if (result.affectedRows > 0) {
            console.log(`Success: Moved ${result.affectedRows} overdue tasks to 'Pending'.`);
        }
    } catch (error) {
        console.error('Failed to run scheduled task update:', error);
    }
});

const PORT = process.env.PORT || process.env.port || 3000;
server.listen(PORT, () => console.log(`Server connected at port ${PORT}`));
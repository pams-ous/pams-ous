/* ===============================================================
MODULARIZED LOGIN & APP ROUTING (UserMngmt_APIs/login.js)
===============================================================
*/
const { verify_pass, hash_password } = require("./passwordUtil");
const { getEmployeeDetails } = require("./dbChecks");
const { generateToken } = require("./authUtil");
const { authenticateToken, authorizeRole } = require("./authMiddleware");

function loginAPI(express, db, io, app) {

    // --- 1. CORE MIDDLEWARE SETUP ---
    app.use(express.json());
    app.use((req, res, next) => {
        const origin = req.headers.origin;
        // Allow any origin that matches our configured origin or localhost
        if (origin && (origin.includes('localhost') || origin.includes('127.0.0.1') || origin.includes('.ngrok-free.dev') || origin === process.env.FRONTEND_ORIGIN)) {
            res.header("Access-Control-Allow-Origin", origin);
        } else {
            res.header("Access-Control-Allow-Origin", process.env.BACKEND_ORIGIN || "http://127.0.0.1:5500");
        }
        res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
        res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
        if (req.method === "OPTIONS") return res.sendStatus(200);
        next();
    });

    async function handle_login(socket, data) {
        const email = data.email;
        const rawPw = data.password;

        if (rawPw.trim().length <= 0 || !rawPw) {
            return socket.emit('login_backendLog', { success: false, rawData: `Enter the password!`});
        }

        const query = `SELECT password, approval_status FROM employees WHERE email = ? LIMIT 1;`;

        try {
            const [records] = await db.query(query, [email]);
            if (records && records.length > 0) {
                const userRecord = records[0];
                const hashedPw = userRecord.password;
                const approvalStatus = userRecord.approval_status;

                if (approvalStatus === 'PENDING') {
                    return socket.emit('login_backendLog', { success: false, rawData: `Your account is pending admin approval.`});
                }

                let validPw = await verify_pass(rawPw, hashedPw);
                
                if (validPw) {
                    // Update active_status using database connection context from server.js
                    await db.query("UPDATE Employees SET active_status = 'Online' WHERE email = ?", [email]);
                    socket.userEmail = email;
                    
                    // BROADCAST TO ALL CLIPS: User is now online
                    io.emit('status_change', { email: email, status: 'Online' });
                }
                
                const result = await getEmployeeDetails(db, data.email);
                const [firstName, middleName, lastName, suffix] = [result?.first_name, result?.middle_name, result?.last_name, result?.suffix];
                const empName = [firstName, middleName, lastName, suffix].filter(Boolean).join(" ");

                socket.emit('login_backendLog', {
                    success: validPw,
                    rawData: `Email: ${email}\nValid: ${validPw}\n`,
                    empName: empName,
                    email: email
                });
                console.log(`validPw: ${validPw}`);
            } else {
                socket.emit('login_backendLog', { success: false, rawData: `Account not found!` });
            }
        } catch (err) {
            socket.emit('login_backendLog', { success: false, rawData: `${err}` });
        }
    }

    io.on('connection', (socket) => {
        console.log(`Connected!`);

        socket.on('sendAccDetails', async (data) => {
            handle_login(socket, data);
        });

        socket.on('register_session', async (email) => {
            socket.userEmail = email; 
            try {
                await db.query("UPDATE Employees SET active_status = 'Online' WHERE email = ?", [email]);
                console.log(`[SESSION] ${email} reconnected to a new page.`);
                
                // BROADCAST TO ALL CLIPS: Ensure other screens update to Online
                io.emit('status_change', { email: email, status: 'Online' });
            } catch (err) {
                console.error("Error setting online status on reconnect:", err);
            }
        });

        socket.on('logout', async () => {
            if (socket.userEmail) {
                try {
                    await db.query("UPDATE Employees SET active_status = 'Offline' WHERE email = ?", [socket.userEmail]);
                    io.emit('status_change', { email: socket.userEmail, status: 'Offline' });
                    console.log(`[LOGOUT] ${socket.userEmail} manually logged out.`);
                } catch (err) {
                    console.error("Error during manual logout:", err);
                }
            }
        });

        socket.on('disconnect', async () => {
            if (socket.userEmail) {
                const disconnectedEmail = socket.userEmail;
                
                // Presence Check: Only mark offline if no other sockets for this user are connected
                const otherSockets = Array.from(io.sockets.sockets.values()).filter(s => s !== socket && s.userEmail === disconnectedEmail);
                
                if (otherSockets.length === 0) {
                    try {
                        await db.query("UPDATE Employees SET active_status = 'Offline' WHERE email = ?", [disconnectedEmail]);
                        console.log(`[SESSION] ${disconnectedEmail} went offline (last session closed).`);
                        
                        // BROADCAST TO ALL CLIPS: User is now offline
                        io.emit('status_change', { email: disconnectedEmail, status: 'Offline' });
                    } catch (err) {
                        console.error("Error updating offline status:", err);
                    }
                } else {
                    console.log(`[SESSION] ${disconnectedEmail} disconnected, but still has ${otherSockets.length} active session(s).`);
                }
            }
        });
    });

    // --- 3. SUB-MODULE ROUTE DELEGATIONS ---
    // Task routes are now managed centrally in server.js to avoid duplication.

// --- 4. EXPRESS REST API ROUTING HANDLERS ---
    app.post('/api/auth/logout', async (req, res) => {
        const { email } = req.body;
        if (!email) return res.status(400).json({ success: false, message: 'Email is required' });

        try {
            await db.query("UPDATE Employees SET active_status = 'Offline' WHERE email = ?", [email]);
            io.emit('status_change', { email: email, status: 'Offline' });
            res.json({ success: true, message: 'Logged out successfully' });
        } catch (err) {
            console.error("REST Logout Error:", err);
            res.status(500).json({ success: false, message: err.message });
        }
    });

    app.get('/api/auth/verify-session', authenticateToken, (req, res) => {
        res.json({ success: true, user: req.user });
    });

    app.post('/api/auth/login', async (req, res) => {
        const { email, password } = req.body;
        
        if (!password || password.trim().length <= 0) {
            return res.status(400).json({ success: false, message: 'Enter the password!' });
        }

        try {
            const [records] = await db.query('SELECT employee_id, password, designation, first_name, last_name, approval_status FROM employees WHERE email = ? LIMIT 1;', [email]);
            
            if (records && records.length > 0) {
                const userRecord = records[0];

                if (userRecord.approval_status === 'PENDING') {
                    return res.status(403).json({ success: false, message: 'Your account is pending admin approval.' });
                }

                let validPw = await verify_pass(password, userRecord.password);
                
                if (validPw) {
                    await db.query("UPDATE Employees SET active_status = 'Online' WHERE email = ?", [email]);
                    
                    // BROADCAST TO ALL CLIPS: REST API login success online signal
                    io.emit('status_change', { email: email, status: 'Online' });

                    res.json({
                        success: true,
                        token: generateToken({ id: userRecord.employee_id, email: email, role: userRecord.designation === 'Admin' ? 'ADMIN' : 'MEMBER' }),
                        user: {
                            id: userRecord.employee_id,
                            email: email,
                            role: userRecord.designation === 'Admin' ? 'ADMIN' : 'MEMBER',
                            firstName: userRecord.first_name,
                            lastName: userRecord.last_name
                        }
                    });
                } else {
                    res.status(401).json({ success: false, message: 'Invalid password' });
                }
            } else {
                res.status(404).json({ success: false, message: 'Account not found!' });
            }
        } catch (err) {
            console.error("REST Login Error Encountered:", err);
            res.status(500).json({ success: false, message: err.message });
        }
    });

    // Update User Position/Role
    app.put('/api/users/:id', authenticateToken, authorizeRole(['ADMIN']), async (req, res) => {
        const userEmail = req.params.id;
        const { role } = req.body;
        const designation = role === 'ADMIN' ? 'Admin' : 'Encoder';
        
        try {
            const [user] = await db.query('SELECT employee_id FROM Employees WHERE email = ? LIMIT 1', [userEmail]);
            if (user.length === 0) {
                return res.status(404).json({ success: false, message: "User not found with provided email" });
            }
            const userId = user[0].employee_id;

            const [result] = await db.query('UPDATE Employees SET designation = ? WHERE employee_id = ?', [designation, userId]);
            if (result.affectedRows === 0) {
                console.log(`[WARNING] Tried to update role, but could not find Employee ID: "${userId}" in the database.`);
            } else {
                console.log(`[SUCCESS] Updated Employee ID: "${userId}" (${userEmail}) to ${designation}.`);
            }
            res.json({ success: true, message: "Role update processed." });
        } catch (err) {
            console.error("SQL Error:", err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // Fetch All Users
    app.get('/api/users', authenticateToken, authorizeRole(['ADMIN']), async (req, res) => {
        try {
            const [rows] = await db.query(`
                SELECT employee_id AS id, 
                       CONCAT(first_name, ' ', last_name) AS name, 
                       email, 
                       CASE WHEN designation = 'Admin' THEN 'ADMIN' ELSE 'MEMBER' END AS role,
                       COALESCE(active_status, 'Offline') AS activeStatus 
                FROM Employees;
            `);
            res.json(rows);
        } catch (err) {
            console.error("Error fetching users:", err);
            res.status(500).json({ error: err.message });
        }
    });

    // Fetch All Users

    // Fetch Groups Details
    app.get('/api/groups', authenticateToken, authorizeRole(['ADMIN']), async (req, res) => {
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

    // Create Group 
    app.post('/api/groups', authenticateToken, authorizeRole(['ADMIN']), async (req, res) => {
        const { name, desc, leaderEmail } = req.body;
        try {
            const [result] = await db.query('INSERT INTO Job_Groups (group_name, `desc`) VALUES (?, ?)', [name, desc]);
            const newGroupId = result.insertId;

            if (leaderEmail) {
                const [emp] = await db.query('SELECT employee_id FROM Employees WHERE email = ?', [leaderEmail]);
                if (emp.length > 0) {
                    await db.query('INSERT INTO Employees_Groups (employee_id, group_id, role) VALUES (?, ?, ?)', [emp[0].employee_id, newGroupId, 'Leader']);
                }
            }
            res.json({ success: true, message: "Group added!" });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // Update Group Configurations
    app.put('/api/groups/:id', authenticateToken, authorizeRole(['ADMIN']), async (req, res) => {
        const { name, desc, leaderEmail } = req.body;
        const groupId = req.params.id;
        try {
            await db.query('UPDATE Job_Groups SET group_name = ?, `desc` = ? WHERE group_id = ?', [name, desc, groupId]);
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

    // Drop Group Entities
    app.delete('/api/groups/:id', authenticateToken, authorizeRole(['ADMIN']), async (req, res) => {
        try {
            await db.query('DELETE FROM Job_Groups WHERE group_id = ?', [req.params.id]);
            res.json({ success: true, message: "Group deleted!" });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });
}

module.exports = { loginAPI };
async function loginAPI(express, db, io, app) {
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

    });
    
    //added 

    app.use(express.json());
    app.use((req, res, next) => {
        res.header("Access-Control-Allow-Origin", "*");
        res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
        res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
        if (req.method === "OPTIONS") return res.sendStatus(200);
        next();
    });
    
    // NEW ROUTE: Catch the REST login fetch from auth.js
    app.post('/api/auth/login', async (req, res) => {
        const { email, password } = req.body;
        
        if (!password || password.trim().length <= 0) {
            return res.status(400).json({ success: false, message: 'Enter the password!' });
        }
    
        console.log("Entering login api")
        try {
            // 1. Find the user in the database
            const [records] = await db.query('SELECT password, designation, first_name, last_name FROM employees WHERE email = ? LIMIT 1;', [email]);
            console.log(records[0]?.designation);
            
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
                       'ACTIVE' as activeStatus 
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
}

module.exports = { loginAPI };
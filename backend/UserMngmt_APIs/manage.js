const {getEmployeeDetails} = require("./dbChecks");
const { verifyToken } = require("./authUtil");
const { authenticateToken, authorizeRole } = require("./authMiddleware");
const { hash_password, validatePassword } = require("./passwordUtil");
const { recordNotification } = require("./notifications");
const { formatFullName } = require("./userUtils");

async function getEmployeeData(db, data, socket, mode, state) {

    const email = data.email;
    const queryResult = await getEmployeeDetails(db, email);
    const empID = queryResult?.employee_id;
    const empCode = queryResult?.employee_code;
    const lastName = queryResult?.last_name;
    const firstName = queryResult?.first_name;
    const middleName = queryResult?.middle_name;
    const suffix = queryResult?.suffix;
    
    if (mode === "get") {
        if (empID === undefined) {
            state.accountFound = false;
            socket.emit('managementLog', {
                success: false,
                rawData: `Account doesn't exist!`
            });
            socket.emit('returnFetchData', {
                success:false
            });
            return;
        } 
        state.accountFound = true;
        socket.emit('managementLog', {
            success: true,
            rawData: `${email}:${empID}:${state.accountFound}`
        });

        socket.emit('returnFetchData', {
            email: email,
            empCode: empCode,
            lastName: lastName,
            firstName: firstName,
            middleName: middleName,
            suffix: suffix,
            success: true
        });
    } else if (mode === "delete") {
        const query = `DELETE FROM Employees
        WHERE employee_id = ?;`;

        await db.query(query, [empID]);
    }

    return {email: email, 
        empID: empID
    }
}

async function editEmployeeData(socket, db, data, io) {
    const {empCode, email, currEmail, lastName, firstName, middleName, suffix} = data;
    const results = await getEmployeeDetails(db, currEmail);
    const empID = results?.employee_id;

    const query = `
    UPDATE Employees
    SET employee_code = ?, email = ?, last_name = ?, first_name = ?, middle_name = ?, suffix = ?
    WHERE employee_id = ?
    LIMIT 1;
    `;
    try {
        if (email === "" || lastName === "" || firstName === "") {
            socket.emit('managementLog', {
                success: false,
                rawData: `Unsuccessful: empty fields.`
            });
            return
        }
        const [updateRecord] = await db.query(query, [empCode || null, email, lastName, firstName, middleName, suffix, empID]);
        
        // Notification: User x was updated by Admin y
        const token = socket.handshake.auth?.token;
        const adminUser = verifyToken(token);
        if (adminUser) {
            const [adminData] = await db.query('SELECT first_name, last_name, suffix FROM Employees WHERE employee_id = ?', [adminUser.id]);
            const adminName = formatFullName(adminData[0]);
            const updatedUserName = formatFullName({first_name: firstName, last_name: lastName, suffix});
            
            await recordNotification(db, {
                kind: "user_updated",
                title: "User Details Updated",
                body: `${updatedUserName} was updated by ${adminName}`,
                relatedUrl: null
            }, io);
        }

        socket.emit('managementLog', {
            success: true,
            rawData: `Successfully updated the details!`
        });
    } catch (err) {
        socket.emit('managementLog', {
            success: false,
            rawData: `Unsuccessful: ${err}`
        });
    }
}

async function registerManageHandlers(socket, db, io) {
    const verifyAdmin = () => {
        const token = socket.handshake.auth?.token;
        const user = verifyToken(token);
        return user && user.role === 'ADMIN';
    };
    
    socket.on('getEmployeeData', (data) => {
        if (!verifyAdmin()) {
            socket.emit('managementLog', { success: false, rawData: `Unauthorized access.` });
            return;
        }
        getEmployeeData(db, data, socket, "get", { accountFound: false });
    });
    
    socket.on('deleteAccount', async (data) => {
        if (!verifyAdmin()) {
            socket.emit('managementLog', { success: false, rawData: `Unauthorized access.` });
            return;
        }
        const state = { accountFound: false };
        
        // Need user details before deletion for notification
        const { email } = data;
        const userDetails = await getEmployeeDetails(db, email);
        const deletedUserName = formatFullName(userDetails);
        
        const {empID} = await getEmployeeData(db, data, socket, "delete", state);
        
        if (empID !== undefined) {
            // Notification: user x was deleted by Admin y
            const token = socket.handshake.auth?.token;
            const adminUser = verifyToken(token);
            const [adminData] = await db.query('SELECT first_name, last_name, suffix FROM Employees WHERE employee_id = ?', [adminUser.id]);
            const adminName = formatFullName(adminData[0]);
    
            await recordNotification(db, {
                kind: "user_deleted",
                title: "User Deleted",
                body: `${deletedUserName} was deleted by ${adminName}`,
                relatedUrl: null
            }, io);
    
            socket.emit('managementLog', {
                success: true,
                rawData: `Deletion of ${email} by ${empID} successful.`
            });
        } else {
            socket.emit('managementLog', {
                success: false,
                rawData: `Deletion of ${email} unsucessful.`
            }); 
        }
    });
    
    socket.on('updateDetails', (data) => {
        if (!verifyAdmin()) {
            socket.emit('managementLog', { success: false, rawData: `Unauthorized access.` });
            return;
        }
        editEmployeeData(socket, db, data, io);
    });
}

async function initManageRoutes(app, db) {
    // Fetch Designations
    app.get('/api/designations', authenticateToken, authorizeRole(['ADMIN']), async (req, res) => {
        try {
            const [rows] = await db.query('SELECT designation_id AS id, name, hierarchy_position, is_default FROM Designations ORDER BY hierarchy_position ASC');
            res.json(rows);
        } catch (err) {
            console.error("Error fetching designations:", err);
            res.status(500).json({ error: err.message });
        }
    });

    // REST API: Update User Profile
    app.put('/api/users/update-profile', authenticateToken, authorizeRole(['ADMIN']), async (req, res) => {
        const { email, empCode, firstName, lastName, middleName, suffix } = req.body;
        if (!email) {
            return res.status(400).json({ success: false, message: "Email is required" });
        }
        try {
            const [result] = await db.query(
                'UPDATE Employees SET employee_code = ?, first_name = ?, last_name = ?, middle_name = ?, suffix = ? WHERE email = ?',
                [empCode || null, firstName, lastName, middleName, suffix, email]
            );
            if (result.affectedRows === 0) return res.status(404).json({ success: false, message: "User not found" });

            // Notification: User x was updated by Admin y
            const [adminData] = await db.query('SELECT first_name, last_name, suffix FROM Employees WHERE employee_id = ?', [req.user.id]);
            const adminName = formatFullName(adminData[0]);
            const updatedUserName = formatFullName({first_name: firstName, last_name: lastName, suffix});
            
            await recordNotification(db, {
                kind: "user_updated",
                title: "User Details Updated",
                body: `${updatedUserName} was updated by ${adminName}`,
                relatedUrl: null
            }, req.app.get('io'));

            res.json({ success: true, message: "Profile updated successfully" });
        } catch (err) {
            console.error("Update Profile Error:", err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // REST API: Update User Job Title
    app.put('/api/users/job-title', authenticateToken, authorizeRole(['ADMIN']), async (req, res) => {
        const { email, jobTitleId } = req.body;
        if (!email || jobTitleId === undefined) {
            return res.status(400).json({ success: false, message: "Email and Job Title ID are required" });
        }
        try {
            const idNum = parseInt(jobTitleId, 10);
            const [result] = await db.query('UPDATE Employees SET job_title = ? WHERE email = ?', [idNum, email]);
            if (result.affectedRows === 0) return res.status(404).json({ success: false, message: "User not found" });

            // Notification: User x's job title was updated by Admin y
            const [userData] = await db.query('SELECT first_name, last_name, suffix FROM Employees WHERE email = ?', [email]);
            const updatedUserName = formatFullName(userData[0]);
            const [adminData] = await db.query('SELECT first_name, last_name, suffix FROM Employees WHERE employee_id = ?', [req.user.id]);
            const adminName = formatFullName(adminData[0]);

            await recordNotification(db, {
                kind: "user_updated",
                title: "User Job Title Updated",
                body: `${updatedUserName}'s job title was updated by ${adminName}`,
                relatedUrl: null
            }, req.app.get('io'));

            res.json({ success: true, message: "Job title updated successfully" });
        } catch (err) {
            console.error("Update Job Title Error:", err);
            res.status(500).json({ error: err.message });
        }
    });

    // REST API: Delete User
    app.delete('/api/users/:id', authenticateToken, authorizeRole(['ADMIN']), async (req, res) => {
        const userEmail = req.params.id;
        try {
            const [user] = await db.query('SELECT employee_id, first_name, last_name, suffix FROM Employees WHERE email = ? LIMIT 1', [userEmail]);
            if (user.length === 0) {
                return res.status(404).json({ success: false, message: "User not found with provided email" });
            }
            const deletedUser = user[0];
            const userId = deletedUser.employee_id;

            const [result] = await db.query('DELETE FROM Employees WHERE employee_id = ?', [userId]);
            if (result.affectedRows === 0) {
                return res.status(404).json({ success: false, message: "User not found" });
            }

            // Notification: user x was deleted by Admin y
            const [adminData] = await db.query('SELECT first_name, last_name, suffix FROM Employees WHERE employee_id = ?', [req.user.id]);
            const adminName = formatFullName(adminData[0]);

            await recordNotification(db, {
                kind: "user_deleted",
                title: "User Deleted",
                body: `${formatFullName(deletedUser)} was deleted by ${adminName}`,
                relatedUrl: null
            }, req.app.get('io'));

            res.json({ success: true, message: "User deleted successfully" });
        } catch (err) {
            console.error("Delete Error:", err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // REST API: Update User Password
    app.post('/api/users/update-password', authenticateToken, authorizeRole(['ADMIN']), async (req, res) => {
        const { email, newPassword } = req.body;
        if (!email || !newPassword) {
            return res.status(400).json({ success: false, message: "Email and new password are required" });
        }

        const policy = validatePassword(newPassword);
        if (!policy.valid) {
            return res.status(400).json({ success: false, message: policy.message });
        }

        try {
            const [user] = await db.query('SELECT employee_id FROM Employees WHERE email = ? LIMIT 1', [email]);
            if (user.length === 0) {
                return res.status(404).json({ success: false, message: "User not found" });
            }
            const userId = user[0].employee_id;
            const hashedPassword = await hash_password(newPassword);

            await db.query('UPDATE Employees SET password = ? WHERE employee_id = ?', [hashedPassword, userId]);
            res.json({ success: true, message: "Password updated successfully" });
        } catch (err) {
            console.error("Password Update Error:", err);
            res.status(500).json({ success: false, error: err.message });
        }
    });
}

module.exports = { registerManageHandlers, initManageRoutes };

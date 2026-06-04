const {getEmployeeDetails} = require("./dbChecks");
const { verifyToken } = require("./authUtil");
const { authenticateToken, authorizeRole } = require("./authMiddleware");
const { hash_password } = require("./passwordUtil");

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

async function editEmployeeData(socket, db, data) {
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

async function manageAccountAPI(io, db, app) {
    io.on('connection', (socket) => {
        console.log("Management API connected.");

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
            const {email, empID} = await getEmployeeData(db, data, socket, "delete", state);
            
            if (empID !== undefined) {
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
            editEmployeeData(socket, db, data);
        });

    });

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

    // REST API: Delete User

    app.delete('/api/users/:id', authenticateToken, authorizeRole(['ADMIN']), async (req, res) => {
        const userEmail = req.params.id;
        try {
            const [user] = await db.query('SELECT employee_id FROM Employees WHERE email = ? LIMIT 1', [userEmail]);
            if (user.length === 0) {
                return res.status(404).json({ success: false, message: "User not found with provided email" });
            }
            const userId = user[0].employee_id;

            const [result] = await db.query('DELETE FROM Employees WHERE employee_id = ?', [userId]);
            if (result.affectedRows === 0) {
                return res.status(404).json({ success: false, message: "User not found" });
            }
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

module.exports = {manageAccountAPI};
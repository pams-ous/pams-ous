const crypto = require("crypto");
const { hash_password, verify_pass, validatePassword } = require("./passwordUtil");
const { ifEmployeeExists } = require("./dbChecks");
const { generateAndSendOtp, verifyOtp } = require("./otpService");
const { authenticateToken, authorizeRole } = require("./authMiddleware");
const { recordNotification } = require("./notifications");
const { formatFullName } = require("./userUtils");

function buildPayload(data) {
    const tempEmpCode = data.tempEmpCode || data.empCode || data.employeeCode;
    return {
        tempEmpCode: tempEmpCode ? String(tempEmpCode).toUpperCase() : null,
        firstName: data.firstName || "",
        middleName: data.middleName || "",
        lastName: data.lastName || "",
        suffix: data.suffix || "",
        email: data.email || "",
        tempPassword: data.tempPassword || data.password || "",
        tempConfPassword: data.tempConfPassword || data.confirmPassword || "",
        designationId: data.designationId || null
    };
}

async function handleRequest(db, socket, data) {
    const payload = buildPayload(data);
    const { tempEmpCode, firstName, lastName, email, tempPassword, tempConfPassword } = payload;

    if (!email || !tempPassword || !tempConfPassword || !firstName || !lastName) {
        return socket.emit("registrationLog", {
            success: false,
            stage: "request",
            rawData: "Please fill in all required fields."
        });
    }

    if (tempPassword !== tempConfPassword) {
        return socket.emit("registrationLog", {
            success: false,
            stage: "request",
            rawData: "Passwords do not match."
        });
    }

    const policy = validatePassword(tempPassword);
    if (!policy.valid) {
        return socket.emit("registrationLog", {
            success: false,
            stage: "request",
            rawData: policy.message
        });
    }

    try {
        const exists = await ifEmployeeExists(db, email, tempEmpCode);
        if (exists) {
            return socket.emit("registrationLog", {
                success: false,
                stage: "request",
                rawData: "User records already exist!"
            });
        }

        // Hash the password before stashing so the cleartext never sits in otp_codes.payload.
        const passwordHash = await hash_password(tempPassword);
        const storedPayload = {
            empCode: tempEmpCode,
            firstName,
            middleName: payload.middleName,
            lastName,
            suffix: payload.suffix,
            email,
            passwordHash,
            designationId: payload.designationId
        };

        await generateAndSendOtp(db, {
            email,
            channel: "email",
            purpose: "registration",
            payload: storedPayload
        });

        socket.emit("registrationLog", {
            success: true,
            stage: "request",
            awaitingOtp: true,
            email,
            rawData: `A verification code has been sent to ${email}.`
        });
    } catch (err) {
        console.log(err);
        socket.emit("registrationLog", {
            success: false,
            stage: "request",
            rawData: `${err}`
        });
    }
}

async function handleConfirm(db, socket, data, io) {
    const { email, code } = data || {};
    try {
        const result = await verifyOtp(db, { email, purpose: "registration", code });
        if (!result.ok) {
            return socket.emit("registrationLog", {
                success: false,
                stage: "confirm",
                rawData: result.reason
            });
        }

        const p = result.payload;
        if (!p) {
            return socket.emit("registrationLog", {
                success: false,
                stage: "confirm",
                rawData: "Registration payload missing. Please start over."
            });
        }

        // Re-check that the account hasn't been created in the meantime.
        const exists = await ifEmployeeExists(db, p.email, p.empCode);
        if (exists) {
            return socket.emit("registrationLog", {
                success: false,
                stage: "confirm",
                rawData: "An account with that email or employee code already exists."
            });
        }

        const uuid = crypto.randomUUID();

        // Set system role based on designation ID
        // 1: Head, 2: Chief - Admission, 3: Chief - Records -> Admin
        // 4: Staff -> Admin. Staff
        const systemRole = [1, 2, 3].includes(Number(p.designationId)) ? 'Admin' : 'Admin. Staff';
        
        let approvalStatus = 'APPROVED';
        if (systemRole === 'Admin') {
            const [adminCountRow] = await db.query("SELECT COUNT(*) as count FROM Employees WHERE designation = 'Admin'");
            const adminCount = adminCountRow[0]?.count || 0;
            approvalStatus = adminCount === 0 ? 'APPROVED' : 'PENDING';
        }

        const query = `INSERT INTO Employees (
            employee_id,
            employee_code,
            first_name,
            last_name,
            middle_name,
            suffix, email,
            job_title,
            designation,
            password,
            approval_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`;

        await db.query(query, [
            uuid,
            p.empCode,
            p.firstName,
            p.lastName,
            p.middleName,
            p.suffix,
            p.email,
            p.designationId,
            systemRole,
            p.passwordHash,
            approvalStatus
        ]);

        await recordNotification(db, {
            kind: "user_registered",
            title: "New User Registered",
            body: `A new account has been created for ${p.email}`,
            relatedUrl: uuid
        }, io);

        if (approvalStatus === 'PENDING') {
            await recordNotification(db, {
                kind: "user_approval",
                title: systemRole,
                body: p.email,
                relatedUrl: uuid
            }, io);
        }

        socket.emit("registrationLog", {
            success: true,
            stage: "confirm",
            rawData: approvalStatus === 'PENDING' 
                ? "Account created! It is now pending admin approval." 
                : "Account verified and created successfully!",
            email: p.email
        });
    } catch (err) {
        console.log(err);
        socket.emit("registrationLog", {
            success: false,
            stage: "confirm",
            rawData: `${err}`
        });
    }
}

async function registerRegistrationHandlers(socket, db, io) {
    // OTP-gated flow.
    socket.on("requestRegistration", (data) => handleRequest(db, socket, data));
    socket.on("confirmRegistration", (data) => handleConfirm(db, socket, data, io));

    // Back-compat: the original event still works but now also requires OTP confirmation.
    socket.on("newAccDetails", (data) => handleRequest(db, socket, data));
}

async function initRegistrationRoutes(app, db) {
    // REST API: Self-service registration (no OTP)
    app.post('/api/auth/register', async (req, res) => {
        const { employeeCode, firstName, middleName, lastName, suffix, email, password, confirmPassword, designationId } = req.body;

        if (!email || !password || !confirmPassword || !firstName || !lastName) {
            return res.status(400).json({ success: false, message: "Please fill in all required fields." });
        }

        if (password !== confirmPassword) {
            return res.status(400).json({ success: false, message: "Passwords do not match." });
        }

        const policy = validatePassword(password);
        if (!policy.valid) {
            return res.status(400).json({ success: false, message: policy.message });
        }

        try {
            const exists = await ifEmployeeExists(db, email, employeeCode);
            if (exists) {
                return res.status(400).json({ success: false, message: "User records already exist!" });
            }

            const passwordHash = await hash_password(password);
            const uuid = crypto.randomUUID();

            const systemRole = [1, 2, 3].includes(Number(designationId)) ? 'Admin' : 'Admin. Staff';

            let approvalStatus = 'APPROVED';
            if (systemRole === 'Admin') {
                const [adminCountRow] = await db.query("SELECT COUNT(*) as count FROM Employees WHERE designation = 'Admin'");
                const adminCount = adminCountRow[0]?.count || 0;
                approvalStatus = adminCount === 0 ? 'APPROVED' : 'PENDING';
            }

            await db.query(
                'INSERT INTO Employees (employee_id, employee_code, first_name, last_name, middle_name, suffix, email, job_title, designation, password, approval_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [uuid, employeeCode || null, firstName, lastName, middleName || '', suffix || '', email, designationId, systemRole, passwordHash, approvalStatus]
            );

            await recordNotification(db, {
                kind: "user_registered",
                title: "New User Registered",
                body: `A new account has been created for ${email}`,
                relatedUrl: uuid
            }, req.app.get('io'));

            if (approvalStatus === 'PENDING') {
                await recordNotification(db, {
                    kind: "user_approval",
                    title: systemRole,
                    body: email,
                    relatedUrl: uuid
                }, req.app.get('io'));
            }

            res.json({
                success: true,
                message: approvalStatus === 'PENDING'
                    ? "Account created! It is now pending admin approval."
                    : "Account created successfully! You can now sign in."
            });
        } catch (err) {
            console.error("Registration error:", err);
            res.status(500).json({ success: false, message: err.message });
        }
    });

    // REST API: Add Direct User (Admin managed)
    app.post('/api/users', authenticateToken, authorizeRole(['ADMIN']), async (req, res) => {
        const { code, firstName, lastName, middleName, suffix, email, role, password, designationId } = req.body;
        
        if (!email || !password || !firstName || !lastName) {
            return res.status(400).json({ success: false, message: "Email, Password, First Name, and Last Name are required" });
        }

        const policy = validatePassword(password);
        if (!policy.valid) {
            return res.status(400).json({ success: false, message: policy.message });
        }

        try {
            const exists = await ifEmployeeExists(db, email, code);
            if (exists) {
                return res.status(400).json({ success: false, message: "An account with that email or employee code already exists." });
            }

            const hashedPassword = await hash_password(password);
            const employee_id = code ? code : crypto.randomUUID();
            const employee_code = code ? code : null;

            // Use the role provided by the admin, defaulting to Admin. Staff
            const systemRole = role === 'ADMIN' ? 'Admin' : 'Admin. Staff';
            
            let approvalStatus = 'APPROVED';
            if (systemRole === 'Admin') {
                const [adminCountRow] = await db.query("SELECT COUNT(*) as count FROM Employees WHERE designation = 'Admin'");
                const adminCount = adminCountRow[0]?.count || 0;
                approvalStatus = adminCount === 0 ? 'APPROVED' : 'PENDING';
            }

            await db.query(
                'INSERT INTO Employees (employee_id, employee_code, first_name, last_name, middle_name, suffix, email, job_title, designation, password, approval_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [employee_id, employee_code, firstName, lastName, middleName, suffix, email, designationId, systemRole, hashedPassword, approvalStatus]
            );

            // Notification: A new user x was added as (designation) by Admin y
            const [designationRow] = await db.query('SELECT name FROM Designations WHERE designation_id = ?', [designationId]);
            const designationName = designationRow[0]?.name || systemRole;
            
            const [adminData] = await db.query('SELECT first_name, last_name, suffix FROM Employees WHERE employee_id = ?', [req.user.id]);
            const adminName = formatFullName(adminData[0]);

            await recordNotification(db, {
                kind: "user_added",
                title: "New User Added",
                body: `A new user ${formatFullName({first_name: firstName, last_name: lastName, suffix})} was added as ${designationName} by ${adminName}`,
                relatedUrl: null
            }, req.app.get('io'));

            if (approvalStatus === 'PENDING') {
                await recordNotification(db, {
                    kind: "user_approval",
                    title: systemRole,
                    body: email,
                    relatedUrl: employee_id
                }, req.app.get('io'));
            }
            req.app.get('io').emit('usersChanged');
            res.json({ success: true, id: employee_id, message: approvalStatus === 'PENDING' ? "User created and pending approval!" : "User added to SQL!" });
        } catch (err) {
            console.error("Admin Add User Error:", err);
            res.status(500).json({ error: err.message });
        }
    });
}

module.exports = { registerRegistrationHandlers, initRegistrationRoutes };

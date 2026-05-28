const crypto = require("crypto");
const { hash_password, verify_pass } = require("./passwordUtil");
const { ifEmployeeExists } = require("./dbChecks");
const { generateAndSendOtp, verifyOtp } = require("./otpService");

function buildPayload(data) {
    const tempEmpCode = data.tempEmpCode || data.empCode || data.employeeCode;
    return {
        tempEmpCode: tempEmpCode ? String(tempEmpCode).toUpperCase() : "",
        firstName: data.firstName || "",
        middleName: data.middleName || "",
        lastName: data.lastName || "",
        suffix: data.suffix || "",
        email: data.email || "",
        tempPassword: data.tempPassword || data.password || "",
        tempConfPassword: data.tempConfPassword || data.confirmPassword || ""
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
            passwordHash
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

async function handleConfirm(db, socket, data) {
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
        const query = `INSERT INTO Employees (
            employee_id,
            employee_code,
            first_name,
            last_name,
            middle_name,
            suffix, email,
            password)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?);`;

        await db.query(query, [
            uuid,
            p.empCode,
            p.firstName,
            p.lastName,
            p.middleName,
            p.suffix,
            p.email,
            p.passwordHash
        ]);

        socket.emit("registrationLog", {
            success: true,
            stage: "confirm",
            rawData: "Account verified and created successfully!",
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

async function regiUserAPI(io, db) {
    io.on("connection", (socket) => {
        console.log("Registration API connected.");

        // OTP-gated flow.
        socket.on("requestRegistration", (data) => handleRequest(db, socket, data));
        socket.on("confirmRegistration", (data) => handleConfirm(db, socket, data));

        // Back-compat: the original event still works but now also requires OTP confirmation.
        socket.on("newAccDetails", (data) => handleRequest(db, socket, data));
    });
}

module.exports = { regiUserAPI };

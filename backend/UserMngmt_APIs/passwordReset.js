const { getEmployeeDetails } = require("./dbChecks");
const { hash_password, validatePassword } = require("./passwordUtil");
const { generateAndSendOtp, verifyOtp } = require("./otpService");

async function handleRequest(db, socket, data) {
    const email = data?.email;
    if (!email) {
        return socket.emit("passwordResetLog", {
            success: false,
            stage: "request",
            rawData: "Email is required."
        });
    }

    try {
        const employee = await getEmployeeDetails(db, email);

        // Don't leak whether the account exists. Always claim success at this stage.
        // Only send the code if the account actually exists.
        if (employee) {
            await generateAndSendOtp(db, { email, channel: "email", purpose: "password_reset" });
        } else {
            console.log(`password reset requested for non-existent email: ${email}`);
        }

        socket.emit("passwordResetLog", {
            success: true,
            stage: "request",
            awaitingOtp: true,
            email,
            rawData: `If an account exists for ${email}, a reset code has been sent.`
        });
    } catch (err) {
        console.log(err);
        socket.emit("passwordResetLog", {
            success: false,
            stage: "request",
            rawData: `${err}`
        });
    }
}

async function handleConfirm(db, socket, data) {
    const { email, code, newPassword, confirmPassword } = data || {};

    if (!email || !code || !newPassword || !confirmPassword) {
        return socket.emit("passwordResetLog", {
            success: false,
            stage: "confirm",
            rawData: "All fields are required."
        });
    }
    if (newPassword !== confirmPassword) {
        return socket.emit("passwordResetLog", {
            success: false,
            stage: "confirm",
            rawData: "Passwords do not match."
        });
    }
    const policy = validatePassword(newPassword);
    if (!policy.valid) {
        return socket.emit("passwordResetLog", {
            success: false,
            stage: "confirm",
            rawData: policy.message
        });
    }

    try {
        const result = await verifyOtp(db, { email, purpose: "password_reset", code });
        if (!result.ok) {
            return socket.emit("passwordResetLog", {
                success: false,
                stage: "confirm",
                rawData: result.reason
            });
        }

        const employee = await getEmployeeDetails(db, email);
        if (!employee) {
            return socket.emit("passwordResetLog", {
                success: false,
                stage: "confirm",
                rawData: "Account no longer exists."
            });
        }

        const newHash = await hash_password(newPassword);
        await db.query(
            `UPDATE Employees SET password = ? WHERE employee_id = ? LIMIT 1;`,
            [newHash, employee.employee_id]
        );

        socket.emit("passwordResetLog", {
            success: true,
            stage: "confirm",
            rawData: "Password updated successfully. You can now sign in.",
            email
        });
    } catch (err) {
        console.log(err);
        socket.emit("passwordResetLog", {
            success: false,
            stage: "confirm",
            rawData: `${err}`
        });
    }
}

async function registerPasswordResetHandlers(socket, db) {
    socket.on("requestPasswordReset", (data) => handleRequest(db, socket, data));
    socket.on("confirmPasswordReset", (data) => handleConfirm(db, socket, data));
}

module.exports = { registerPasswordResetHandlers };

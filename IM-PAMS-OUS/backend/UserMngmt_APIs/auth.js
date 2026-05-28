// Authentication routes — login, register, forgot-password, verify-otp, reset-password.
// Mounts under /api/auth in server.js
//
// Authorship: this file is the REST/JWT evolution of the group's original
// Socket.IO login flow. The original socket-based handler is preserved verbatim at
// ./_group_original/login.js (sendAccDetails / login_backendLog events). REST was
// chosen here so the static frontend can use plain fetch() without a socket layer.

const express = require("express");
const crypto  = require("crypto");
const jwt     = require("jsonwebtoken");
const { hash_password, verify_pass } = require("./passwordUtil");
const { sendOtpEmail } = require("../lib/mailer");

const JWT_SECRET   = process.env.JWT_SECRET   || "pams-ous-dev-secret-change-me";
const RESET_SECRET = process.env.RESET_SECRET || "pams-ous-reset-secret-change-me";

function authRouter(db) {
    const router = express.Router();

    // POST /api/auth/login
    // body: { email, password } → { token, user }
    router.post("/login", async (req, res) => {
        const { email, password } = req.body || {};
        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required." });
        }

        try {
            const [rows] = await db.query(
                "SELECT * FROM Employees WHERE email = ? LIMIT 1",
                [email]
            );
            if (rows.length === 0) {
                return res.status(401).json({ message: "Invalid email or password." });
            }

            const emp = rows[0];
            const ok = await verify_pass(password, emp.password);
            if (!ok) {
                return res.status(401).json({ message: "Invalid email or password." });
            }

            // Mark this employee as Online for the duration of the session
            await db.query(
                "UPDATE Employees SET active_status = 'Online' WHERE employee_id = ?",
                [emp.employee_id]
            );

            // Determine role from Admin/Member side-tables (EERD specialization)
            const [adminRow] = await db.query(
                "SELECT 1 FROM Admin WHERE employee_id = ? LIMIT 1",
                [emp.employee_id]
            );
            const role = adminRow.length > 0 ? "ADMIN" : "MEMBER";

            const fullName = [emp.first_name, emp.middle_name, emp.last_name, emp.suffix]
                .filter(s => s && s.trim().length > 0).join(" ");

            const token = jwt.sign(
                { sub: emp.employee_id, email: emp.email, role },
                JWT_SECRET,
                { expiresIn: "8h" }
            );

            res.json({
                token,
                user: {
                    id:    emp.employee_id,
                    code:  emp.employee_code,
                    email: emp.email,
                    name:  fullName,
                    firstName:  emp.first_name,
                    lastName:   emp.last_name,
                    middleName: emp.middle_name,
                    suffix:     emp.suffix,
                    role
                }
            });
        } catch (err) {
            console.error("Login error:", err);
            res.status(500).json({ message: "Server error during login." });
        }
    });

    // POST /api/auth/register
    // body: { employeeCode, lastName, firstName, middleName?, suffix?, email, password }
    router.post("/register", async (req, res) => {
        const { employeeCode, lastName, firstName, middleName, suffix, email, password } = req.body || {};

        if (!firstName || !lastName || !email || !password) {
            return res.status(400).json({ message: "First name, last name, email and password are required." });
        }

        try {
            // Reject duplicates on email OR employee_code (Employees.employee_code has no UNIQUE in dump,
            // but treating it as unique avoids messy duplicates).
            const [dup] = await db.query(
                "SELECT employee_id FROM Employees WHERE email = ? OR (employee_code IS NOT NULL AND employee_code = ?) LIMIT 1",
                [email, employeeCode || null]
            );
            if (dup.length > 0) {
                return res.status(409).json({ message: "Email or employee code already registered." });
            }

            const employee_id  = crypto.randomUUID();
            const passwordHash = await hash_password(password);

            await db.query(
                `INSERT INTO Employees
                    (employee_id, employee_code, first_name, last_name, middle_name, suffix, email, password)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [employee_id,
                 employeeCode || null,
                 firstName,
                 lastName,
                 middleName  || null,
                 suffix      || null,
                 email,
                 passwordHash]
            );

            // New accounts default to Member specialization
            await db.query("INSERT INTO Member (employee_id) VALUES (?)", [employee_id]);

            // Grant the default designation if one is defined; otherwise the
            // migration backfill will pick it up on the next server start.
            try {
                const [defRows] = await db.query(
                    "SELECT designation_id FROM Designations WHERE is_default = 1 LIMIT 1"
                );
                if (defRows.length > 0) {
                    await db.query(
                        "INSERT IGNORE INTO Employee_Designations (employee_id, designation_id) VALUES (?, ?)",
                        [employee_id, defRows[0].designation_id]
                    );
                }
            } catch { /* designation table may not exist yet on first boot */ }

            res.status(201).json({ message: "Account created. You can now log in." });
        } catch (err) {
            console.error("Register error:", err);
            res.status(500).json({ message: "Server error during registration." });
        }
    });

    // POST /api/auth/forgot-password
    // body: { email } — generates a 6-digit OTP, stores it on the Employees row
    // with a 10-minute expiry, and emails it to the registered address.
    //
    // The OTP is NEVER returned to the client — it must reach the user
    // through their real inbox. If the SMTP transport is misconfigured this
    // route returns 500 so we surface the failure rather than silently
    // pretending the code was sent.
    router.post("/forgot-password", async (req, res) => {
        const { email } = req.body || {};
        if (!email) return res.status(400).json({ message: "Email is required." });

        try {
            const [rows] = await db.query(
                "SELECT employee_id, first_name, last_name FROM Employees WHERE email = ? LIMIT 1",
                [email]
            );
            if (rows.length === 0) {
                return res.status(404).json({ message: "Email address is not registered." });
            }

            const emp = rows[0];
            const otp = Math.floor(100000 + Math.random() * 900000);
            const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // +10 min

            await db.query(
                "UPDATE Employees SET otp = ?, otp_expires_at = ? WHERE employee_id = ?",
                [otp, expiresAt, emp.employee_id]
            );

            const recipientName = [emp.first_name, emp.last_name].filter(Boolean).join(" ");
            const mailResult = await sendOtpEmail({ to: email, recipientName, otp });

            // Safety net: never let a dev-mode (JSON transport) deployment leak
            // through. The .env must be configured with real Gmail credentials
            // before this route can succeed in production.
            if (mailResult.devMode) {
                console.error("SMTP not configured — refusing to issue OTP without a real send.");
                return res.status(500).json({
                    message: "Email service is not configured. Contact the administrator."
                });
            }

            res.json({ message: "A verification code has been sent to your email." });
        } catch (err) {
            console.error("Forgot-password error:", err);
            res.status(500).json({ message: "Server error sending code." });
        }
    });

    // POST /api/auth/verify-otp
    // body: { email, otp } → { resetToken }
    router.post("/verify-otp", async (req, res) => {
        const { email, otp } = req.body || {};
        if (!email || !otp) return res.status(400).json({ message: "Email and OTP are required." });

        try {
            const [rows] = await db.query(
                "SELECT employee_id, otp, otp_expires_at FROM Employees WHERE email = ? LIMIT 1",
                [email]
            );
            const row = rows[0];
            if (!row || row.otp == null || String(row.otp) !== String(otp)) {
                return res.status(400).json({ message: "Invalid or expired OTP." });
            }
            if (row.otp_expires_at && new Date(row.otp_expires_at).getTime() < Date.now()) {
                return res.status(400).json({ message: "Invalid or expired OTP." });
            }

            // Clear the OTP so it can't be reused
            await db.query(
                "UPDATE Employees SET otp = NULL, otp_expires_at = NULL WHERE employee_id = ?",
                [row.employee_id]
            );

            const resetToken = jwt.sign(
                { sub: rows[0].employee_id, purpose: "reset" },
                RESET_SECRET,
                { expiresIn: "15m" }
            );
            res.json({ resetToken });
        } catch (err) {
            console.error("Verify-OTP error:", err);
            res.status(500).json({ message: "Server error." });
        }
    });

    // POST /api/auth/reset-password
    // body: { resetToken, password }
    router.post("/reset-password", async (req, res) => {
        const { resetToken, password } = req.body || {};
        if (!resetToken || !password) {
            return res.status(400).json({ message: "Reset token and new password are required." });
        }

        try {
            const payload = jwt.verify(resetToken, RESET_SECRET);
            if (payload.purpose !== "reset") {
                return res.status(400).json({ message: "Invalid reset token." });
            }
            const passwordHash = await hash_password(password);
            await db.query(
                "UPDATE Employees SET password = ? WHERE employee_id = ?",
                [passwordHash, payload.sub]
            );
            res.json({ message: "Password updated successfully." });
        } catch (err) {
            // jwt errors are 4xx, anything else is server-side
            if (err.name === "TokenExpiredError" || err.name === "JsonWebTokenError") {
                return res.status(400).json({ message: "Reset token invalid or expired." });
            }
            console.error("Reset-password error:", err);
            res.status(500).json({ message: "Server error." });
        }
    });

    // POST /api/auth/logout — flips active_status back to Offline (token is client-discarded)
    router.post("/logout", async (req, res) => {
        const auth = req.headers.authorization || "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
        if (!token) return res.json({ message: "Logged out." });

        try {
            const payload = jwt.verify(token, JWT_SECRET);
            await db.query(
                "UPDATE Employees SET active_status = 'Offline' WHERE employee_id = ?",
                [payload.sub]
            );
        } catch { /* ignore — logout is best-effort */ }
        res.json({ message: "Logged out." });
    });

    return router;
}

// Shared bearer-token guard, also exported so route modules can use it
function requireAuth(req, res, next) {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ message: "Missing auth token." });
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ message: "Invalid or expired token." });
    }
}

module.exports = { authRouter, requireAuth };

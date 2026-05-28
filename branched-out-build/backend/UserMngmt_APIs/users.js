// User management routes — list/search/create/update employees.
// Mounts under /api/users in server.js
//
// Authorship: the registration, search, and account-management logic here
// is the REST/JWT evolution of the group's original Socket.IO modules,
// preserved verbatim at ./_group_original/{registration,manage,userSearch,dbChecks}.js.
// The CRUD shapes, parameterized search query, and "check-before-insert" pattern
// follow the group's design; this version adds JWT-derived identity, role/permission
// gating, and the cascade-safe delete added in this session.

const express = require("express");
const crypto  = require("crypto");
const { hash_password } = require("./passwordUtil");
const { requireAuth } = require("./auth");
const { requirePerm } = require("./designations");
const { recordNotification } = require("./notifications");

function usersRouter(db) {
    const router = express.Router();

    // Every route in this module requires a valid session. Permission gating
    // for write/destroy routes is added per-route below.
    router.use(requireAuth);

    // GET /api/users — list everyone with their role and active_status.
    // Role is derived from membership in Admin or Member side tables (EERD specialization).
    router.get("/", async (req, res) => {
        try {
            const [rows] = await db.query(`
                SELECT e.employee_id, e.employee_code, e.first_name, e.last_name,
                       e.middle_name, e.suffix, e.email, e.active_status,
                       e.created_at, e.updated_at,
                       CASE WHEN a.employee_id IS NOT NULL THEN 'ADMIN' ELSE 'MEMBER' END AS role
                FROM Employees e
                LEFT JOIN Admin a ON e.employee_id = a.employee_id
                ORDER BY e.last_name ASC, e.first_name ASC
            `);

            res.json({ users: rows.map(formatUser) });
        } catch (err) {
            console.error("List users error:", err);
            res.status(500).json({ message: "Server error." });
        }
    });

    // GET /api/users/search?q=... — fuzzy-match on concatenated name
    router.get("/search", async (req, res) => {
        const q = (req.query.q || "").trim();
        if (!q) return res.json({ users: [] });

        try {
            const wildcard = `%${q}%`;
            const [rows] = await db.query(`
                SELECT employee_id, employee_code, first_name, last_name, middle_name, suffix,
                       email, active_status,
                       CONCAT_WS(' ', first_name, middle_name, last_name, suffix) AS full_name
                FROM Employees
                WHERE CONCAT_WS(' ', first_name, middle_name, last_name, suffix) LIKE ?
                   OR email LIKE ?
                   OR employee_code LIKE ?
            `, [wildcard, wildcard, wildcard]);
            res.json({ users: rows });
        } catch (err) {
            console.error("Search users error:", err);
            res.status(500).json({ message: "Server error." });
        }
    });

    // GET /api/users/:id — single user with role
    router.get("/:id", async (req, res) => {
        try {
            const [rows] = await db.query(`
                SELECT e.*,
                       CASE WHEN a.employee_id IS NOT NULL THEN 'ADMIN' ELSE 'MEMBER' END AS role
                FROM Employees e
                LEFT JOIN Admin a ON e.employee_id = a.employee_id
                WHERE e.employee_id = ?
                LIMIT 1
            `, [req.params.id]);
            if (rows.length === 0) return res.status(404).json({ message: "User not found." });
            res.json({ user: formatUser(rows[0]) });
        } catch (err) {
            console.error("Get user error:", err);
            res.status(500).json({ message: "Server error." });
        }
    });

    // POST /api/users — admin-side "Add User" from users-groups.html.
    // body: { name, email, role, status, employeeCode?, password?, designationIds?: number[] }
    router.post("/", requirePerm(db, "manage_users"), async (req, res) => {
        const { name, email, role, status, employeeCode, password, designationIds } = req.body || {};
        if (!name || !email) return res.status(400).json({ message: "Name and email are required." });

        // Split a "First Middle Last Suffix" string into parts.
        const parts = name.trim().split(/\s+/);
        const firstName  = parts[0];
        const lastName   = parts.length > 1 ? parts[parts.length - 1] : "";
        const middleName = parts.length > 2 ? parts.slice(1, -1).join(" ") : null;

        try {
            const [dup] = await db.query(
                "SELECT employee_id FROM Employees WHERE email = ? LIMIT 1",
                [email]
            );
            if (dup.length > 0) return res.status(409).json({ message: "Email already exists." });

            const employee_id  = crypto.randomUUID();
            // Admin-created accounts get a default password the user must change later.
            const passwordHash = await hash_password(password || "ChangeMe123!");
            const active       = status === "INACTIVE" ? "Offline" : "Offline"; // schema has no INACTIVE; default Offline

            await db.query(
                `INSERT INTO Employees
                    (employee_id, employee_code, first_name, last_name, middle_name, email, password, active_status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [employee_id, employeeCode || null, firstName, lastName, middleName, email, passwordHash, active]
            );

            // Specialization side-table membership
            if ((role || "MEMBER").toUpperCase() === "ADMIN") {
                await db.query("INSERT INTO Admin (employee_id) VALUES (?)", [employee_id]);
            } else {
                await db.query("INSERT INTO Member (employee_id) VALUES (?)", [employee_id]);
            }

            // Assign designations if supplied; otherwise the default designation
            // is granted automatically on the next migration backfill.
            const desigList = Array.isArray(designationIds) && designationIds.length > 0
                ? designationIds
                : await defaultDesignationIds(db);
            for (const d of desigList) {
                await db.query(
                    "INSERT IGNORE INTO Employee_Designations (employee_id, designation_id) VALUES (?, ?)",
                    [employee_id, d]
                );
            }

            res.status(201).json({
                message: "User created.",
                user: { id: employee_id, name, email, role: (role || "MEMBER").toUpperCase(), status: "ACTIVE" }
            });
        } catch (err) {
            console.error("Create user error:", err);
            res.status(500).json({ message: "Server error." });
        }
    });

    // PATCH /api/users/:id/toggle-status — flip Online <-> Offline.
    // The frontend uses ACTIVE/INACTIVE; we map to Online/Offline from the schema.
    router.patch("/:id/toggle-status", requirePerm(db, "manage_users"), async (req, res) => {
        try {
            const [rows] = await db.query(
                "SELECT active_status FROM Employees WHERE employee_id = ? LIMIT 1",
                [req.params.id]
            );
            if (rows.length === 0) return res.status(404).json({ message: "User not found." });

            const newStatus = rows[0].active_status === "Online" ? "Offline" : "Online";
            await db.query(
                "UPDATE Employees SET active_status = ? WHERE employee_id = ?",
                [newStatus, req.params.id]
            );
            res.json({ message: "Status updated.", status: newStatus });
        } catch (err) {
            console.error("Toggle status error:", err);
            res.status(500).json({ message: "Server error." });
        }
    });

    // PUT /api/users/:id — edit basic profile fields. Users may edit their own
    // profile; editing anyone else's requires manage_users.
    router.put("/:id", (req, res, next) => {
        if (req.params.id === req.user.sub) return next();
        return requirePerm(db, "manage_users")(req, res, next);
    }, async (req, res) => {
        const { firstName, lastName, middleName, suffix, email, employeeCode } = req.body || {};
        try {
            const [existing] = await db.query(
                "SELECT employee_id FROM Employees WHERE employee_id = ? LIMIT 1",
                [req.params.id]
            );
            if (existing.length === 0) return res.status(404).json({ message: "User not found." });

            await db.query(
                `UPDATE Employees
                 SET first_name    = COALESCE(?, first_name),
                     last_name     = COALESCE(?, last_name),
                     middle_name   = COALESCE(?, middle_name),
                     suffix        = COALESCE(?, suffix),
                     email         = COALESCE(?, email),
                     employee_code = COALESCE(?, employee_code)
                 WHERE employee_id = ?`,
                [firstName || null, lastName || null, middleName || null, suffix || null,
                 email || null, employeeCode || null, req.params.id]
            );
            res.json({ message: "User updated." });
        } catch (err) {
            console.error("Update user error:", err);
            res.status(500).json({ message: "Server error." });
        }
    });

    // POST /api/users/:id/admin-reset-password — admin sets a user's password
    // directly. The OTP / forgot-password flow stays as a self-service fallback.
    // body: { newPassword }
    router.post("/:id/admin-reset-password", requirePerm(db, "reset_passwords"),
        async (req, res) => {
            const { newPassword } = req.body || {};
            if (!newPassword || String(newPassword).length < 6) {
                return res.status(400).json({ message: "Password must be at least 6 characters." });
            }
            try {
                const [exists] = await db.query(
                    "SELECT employee_id, first_name, last_name FROM Employees WHERE employee_id = ? LIMIT 1",
                    [req.params.id]
                );
                if (exists.length === 0) return res.status(404).json({ message: "User not found." });

                const hash = await hash_password(newPassword);
                await db.query(
                    "UPDATE Employees SET password = ?, otp = NULL, otp_expires_at = NULL WHERE employee_id = ?",
                    [hash, req.params.id]
                );

                // Notify the target user so they know an admin touched their account.
                await recordNotification(db, {
                    employeeId: req.params.id,
                    kind:       "password_reset",
                    title:      "Your password was reset by an administrator",
                    body:       "If you didn't expect this, contact your administrator immediately.",
                    relatedUrl: null
                });

                res.json({ message: "Password updated." });
            } catch (err) {
                console.error("Admin reset password error:", err);
                res.status(500).json({ message: "Server error." });
            }
        }
    );

    // DELETE /api/users/:id — cascades through Admin/Member/Employees_Groups via FK
    router.delete("/:id", requirePerm(db, "delete_users"), async (req, res) => {
        try {
            // Refuse self-delete: an admin who removes their own account would lock
            // themselves out mid-session and there's no recovery path inside the app.
            if (req.params.id === req.user.sub) {
                return res.status(400).json({ message: "You cannot delete your own account." });
            }
            // Refuse to delete the last remaining admin — leaves the system unmanageable.
            const [target] = await db.query("SELECT 1 FROM Admin WHERE employee_id = ?", [req.params.id]);
            if (target.length > 0) {
                const [[{ admin_count }]] = await db.query("SELECT COUNT(*) AS admin_count FROM Admin");
                if (admin_count <= 1) {
                    return res.status(400).json({ message: "Cannot delete the last administrator." });
                }
            }
            const [result] = await db.query("DELETE FROM Employees WHERE employee_id = ?", [req.params.id]);
            if (result.affectedRows === 0) return res.status(404).json({ message: "User not found." });
            res.json({ message: "User deleted." });
        } catch (err) {
            console.error("Delete user error:", err);
            res.status(500).json({ message: "Server error." });
        }
    });

    return router;
}

// Shape a DB row into the JSON the frontend expects.
function formatUser(row) {
    const fullName = [row.first_name, row.middle_name, row.last_name, row.suffix]
        .filter(s => s && String(s).trim().length > 0).join(" ");
    return {
        id:           row.employee_id,
        code:         row.employee_code,
        firstName:    row.first_name,
        lastName:     row.last_name,
        middleName:   row.middle_name,
        suffix:       row.suffix,
        name:         fullName,
        email:        row.email,
        role:         row.role || "MEMBER",
        // schema only encodes presence/absence via active_status (Online/Offline) — treat both as ACTIVE accounts,
        // and "INACTIVE" as a UI concept for soft-deactivation that the schema doesn't model.
        status:       "ACTIVE",
        activeStatus: row.active_status
    };
}

// Fetch the canonical default designation id(s). Returns [] if the migration
// hasn't run yet so registration never blocks on missing seed data.
async function defaultDesignationIds(db) {
    try {
        const [rows] = await db.query(
            "SELECT designation_id FROM Designations WHERE is_default = 1 LIMIT 1"
        );
        return rows.map(r => r.designation_id);
    } catch { return []; }
}

module.exports = { usersRouter };

// Designations & granular-permission API.
//
// Mental model (Discord-style):
//   - A Designation is a named role with a colour and an ordered hierarchy_position.
//   - A Permission is an atomic capability identified by a string key.
//   - Each Designation has zero or more Permissions (M-to-M via Designation_Permissions).
//   - Each Employee has zero or more Designations (M-to-M via Employee_Designations).
//   - An employee's effective permission set is the UNION of all their
//     designations' permissions.
//
// The legacy ADMIN/MEMBER split (from the Admin side-table) still drives the
// JWT role claim for backward compatibility. Permission checks use the new
// resolver below.

const express = require("express");
const { requireAuth } = require("./auth");

function designationsRouter(db) {
    const router = express.Router();

    // Every route in this router needs a valid JWT.
    router.use(requireAuth);

    // ── Permissions catalogue ─────────────────────────────────────────────
    // GET /api/designations/permissions — list every permission the system
    // knows about, grouped by category so the UI can render checkboxes neatly.
    router.get("/permissions", async (_req, res) => {
        try {
            const [rows] = await db.query(
                "SELECT perm_key, label, category FROM Permissions ORDER BY category, label"
            );
            const grouped = rows.reduce((acc, p) => {
                (acc[p.category] = acc[p.category] || []).push({ key: p.perm_key, label: p.label });
                return acc;
            }, {});
            res.json({ permissions: rows, grouped });
        } catch (err) {
            console.error("List permissions error:", err);
            res.status(500).json({ message: "Server error." });
        }
    });

    // GET /api/designations/me — the calling user's effective perms.
    // Frontend uses this to gate UI affordances beyond the broad ADMIN check.
    router.get("/me", async (req, res) => {
        try {
            const perms = await resolveEffectivePermissions(db, req.user.sub);
            const [desigs] = await db.query(`
                SELECT d.designation_id, d.name, d.color, d.hierarchy_position
                FROM Employee_Designations ed
                JOIN Designations d ON d.designation_id = ed.designation_id
                WHERE ed.employee_id = ?
                ORDER BY d.hierarchy_position ASC
            `, [req.user.sub]);
            res.json({ permissions: perms, designations: desigs });
        } catch (err) {
            console.error("Me-perms error:", err);
            res.status(500).json({ message: "Server error." });
        }
    });

    // ── Designations CRUD ─────────────────────────────────────────────────
    // GET /api/designations — every designation with its perm keys + member count.
    router.get("/", async (_req, res) => {
        try {
            const [desigs] = await db.query(`
                SELECT d.designation_id, d.name, d.description, d.color,
                       d.hierarchy_position, d.is_default, d.is_system,
                       (SELECT COUNT(*) FROM Employee_Designations
                          WHERE designation_id = d.designation_id) AS member_count
                FROM Designations d
                ORDER BY d.hierarchy_position ASC, d.name ASC
            `);
            // Pull perm keys per designation in a single round trip
            const [perms] = await db.query(`
                SELECT designation_id, perm_key FROM Designation_Permissions
            `);
            const permMap = perms.reduce((acc, r) => {
                (acc[r.designation_id] = acc[r.designation_id] || []).push(r.perm_key);
                return acc;
            }, {});
            res.json({
                designations: desigs.map(d => ({
                    id:                 d.designation_id,
                    name:               d.name,
                    description:        d.description,
                    color:              d.color,
                    hierarchyPosition:  d.hierarchy_position,
                    isDefault:          !!d.is_default,
                    isSystem:           !!d.is_system,
                    memberCount:        Number(d.member_count) || 0,
                    permissions:        permMap[d.designation_id] || []
                }))
            });
        } catch (err) {
            console.error("List designations error:", err);
            res.status(500).json({ message: "Server error." });
        }
    });

    // POST /api/designations — create new designation (admin-only)
    router.post("/", requirePerm(db, "manage_designations"), async (req, res) => {
        const { name, description, color, hierarchyPosition, permissions } = req.body || {};
        if (!name) return res.status(400).json({ message: "Name is required." });

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            const [r] = await conn.query(
                `INSERT INTO Designations (name, description, color, hierarchy_position, is_default, is_system)
                 VALUES (?, ?, ?, ?, 0, 0)`,
                [name, description || null, color || "#6B0A1A", Number(hierarchyPosition) || 100]
            );
            const designationId = r.insertId;
            if (Array.isArray(permissions)) {
                for (const k of permissions) {
                    await conn.query(
                        "INSERT IGNORE INTO Designation_Permissions (designation_id, perm_key) VALUES (?, ?)",
                        [designationId, k]
                    );
                }
            }
            await conn.commit();
            res.status(201).json({ id: designationId });
        } catch (err) {
            await conn.rollback();
            if (err.code === "ER_DUP_ENTRY") {
                return res.status(409).json({ message: "A designation with that name already exists." });
            }
            console.error("Create designation error:", err);
            res.status(500).json({ message: "Server error." });
        } finally {
            conn.release();
        }
    });

    // PUT /api/designations/:id — update fields + replace perm set
    router.put("/:id", requirePerm(db, "manage_designations"), async (req, res) => {
        const { name, description, color, hierarchyPosition, permissions } = req.body || {};
        const id = Number(req.params.id);

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            await conn.query(
                `UPDATE Designations SET
                    name = COALESCE(?, name),
                    description = COALESCE(?, description),
                    color = COALESCE(?, color),
                    hierarchy_position = COALESCE(?, hierarchy_position)
                 WHERE designation_id = ?`,
                [name || null, description || null, color || null,
                 hierarchyPosition != null ? Number(hierarchyPosition) : null, id]
            );
            if (Array.isArray(permissions)) {
                await conn.query("DELETE FROM Designation_Permissions WHERE designation_id = ?", [id]);
                for (const k of permissions) {
                    await conn.query(
                        "INSERT IGNORE INTO Designation_Permissions (designation_id, perm_key) VALUES (?, ?)",
                        [id, k]
                    );
                }
            }
            await conn.commit();
            res.json({ message: "Designation updated." });
        } catch (err) {
            await conn.rollback();
            console.error("Update designation error:", err);
            res.status(500).json({ message: "Server error." });
        } finally {
            conn.release();
        }
    });

    // DELETE /api/designations/:id — system designations are protected
    router.delete("/:id", requirePerm(db, "manage_designations"), async (req, res) => {
        try {
            const [chk] = await db.query(
                "SELECT is_system FROM Designations WHERE designation_id = ?", [req.params.id]
            );
            if (chk.length === 0) return res.status(404).json({ message: "Not found." });
            if (chk[0].is_system)  return res.status(403).json({ message: "Cannot delete a system designation." });

            await db.query("DELETE FROM Designations WHERE designation_id = ?", [req.params.id]);
            res.json({ message: "Designation deleted." });
        } catch (err) {
            console.error("Delete designation error:", err);
            res.status(500).json({ message: "Server error." });
        }
    });

    // ── Employee ↔ Designation links ──────────────────────────────────────
    // POST /api/designations/:id/members  body: { employeeId }
    router.post("/:id/members", requirePerm(db, "manage_designations"), async (req, res) => {
        const { employeeId } = req.body || {};
        if (!employeeId) return res.status(400).json({ message: "employeeId required." });
        try {
            await db.query(
                "INSERT IGNORE INTO Employee_Designations (employee_id, designation_id) VALUES (?, ?)",
                [employeeId, req.params.id]
            );
            res.json({ message: "Designation assigned." });
        } catch (err) {
            console.error("Assign designation error:", err);
            res.status(500).json({ message: "Server error." });
        }
    });

    // DELETE /api/designations/:id/members/:employeeId
    router.delete("/:id/members/:employeeId", requirePerm(db, "manage_designations"), async (req, res) => {
        try {
            await db.query(
                "DELETE FROM Employee_Designations WHERE designation_id = ? AND employee_id = ?",
                [req.params.id, req.params.employeeId]
            );
            res.json({ message: "Designation removed." });
        } catch (err) {
            console.error("Unassign designation error:", err);
            res.status(500).json({ message: "Server error." });
        }
    });

    return router;
}

// ── shared helpers exported for other routers ──────────────────────────────

// Resolve the effective permission set for an employee (UNION across designations).
// Admin-table membership grants every permission as a hard override.
async function resolveEffectivePermissions(db, employeeId) {
    const [adminCheck] = await db.query("SELECT 1 FROM Admin WHERE employee_id = ? LIMIT 1", [employeeId]);
    if (adminCheck.length > 0) {
        const [all] = await db.query("SELECT perm_key FROM Permissions");
        return all.map(r => r.perm_key);
    }
    const [rows] = await db.query(`
        SELECT DISTINCT dp.perm_key
        FROM Employee_Designations ed
        JOIN Designation_Permissions dp ON dp.designation_id = ed.designation_id
        WHERE ed.employee_id = ?
    `, [employeeId]);
    return rows.map(r => r.perm_key);
}

// Express middleware factory: 403 unless the caller has `permKey`.
// Admins (Admin table members) bypass the check entirely — they have all
// permissions by definition, independent of whether the Permissions catalogue
// is fully seeded. This prevents a cold-start race where migrations haven't
// finished before the first request arrives.
function requirePerm(db, permKey) {
    return async (req, res, next) => {
        try {
            const [adminCheck] = await db.query(
                "SELECT 1 FROM Admin WHERE employee_id = ? LIMIT 1", [req.user.sub]
            );
            if (adminCheck.length > 0) return next(); // admins have all permissions

            const perms = await resolveEffectivePermissions(db, req.user.sub);
            if (!perms.includes(permKey)) {
                return res.status(403).json({ message: `Missing permission: ${permKey}` });
            }
            next();
        } catch (err) {
            console.error("Permission check error:", err);
            res.status(500).json({ message: "Server error." });
        }
    };
}

module.exports = { designationsRouter, resolveEffectivePermissions, requirePerm };

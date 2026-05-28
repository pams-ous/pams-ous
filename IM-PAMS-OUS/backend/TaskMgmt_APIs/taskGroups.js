// Job_Groups + Employees_Groups routes.
// Mounts under /api/groups in server.js
//
// Schema notes:
//   - Job_Groups.group_id is INT AUTO_INCREMENT
//   - Employees_Groups.role ENUM('Leader','Member')   ← Title case in DB
//   - A group can have many Leaders; UI usually shows one — we surface the *first* Leader.

const express = require("express");
const { requireAuth } = require("../UserMngmt_APIs/auth");
const { requirePerm } = require("../UserMngmt_APIs/designations");

function taskGroupsRouter(db) {
    const router = express.Router();

    // Every group route requires a valid session.
    router.use(requireAuth);

    // GET /api/groups — every group with member count and primary leader
    router.get("/", async (req, res) => {
        try {
            const [rows] = await db.query(`
                SELECT g.group_id, g.group_name, g.\`desc\`,
                       g.group_created_at, g.group_updated_at,
                       (SELECT COUNT(*) FROM Employees_Groups WHERE group_id = g.group_id) AS member_count,
                       (SELECT CONCAT_WS(' ', e.first_name, e.last_name)
                          FROM Employees_Groups eg
                          JOIN Employees e ON eg.employee_id = e.employee_id
                         WHERE eg.group_id = g.group_id AND eg.role = 'Leader'
                         ORDER BY eg.joined_at ASC LIMIT 1) AS leader_name
                FROM Job_Groups g
                ORDER BY g.group_name ASC
            `);
            res.json({ groups: rows.map(formatGroup) });
        } catch (err) {
            console.error("List groups error:", err);
            res.status(500).json({ message: "Server error." });
        }
    });

    // GET /api/groups/:id/members
    router.get("/:id/members", async (req, res) => {
        try {
            const [rows] = await db.query(`
                SELECT e.employee_id, e.first_name, e.last_name, e.middle_name, e.suffix,
                       e.email, e.active_status,
                       eg.role, eg.joined_at,
                       CONCAT_WS(' ', e.first_name, e.middle_name, e.last_name, e.suffix) AS full_name
                FROM Employees_Groups eg
                JOIN Employees e ON eg.employee_id = e.employee_id
                WHERE eg.group_id = ?
                ORDER BY eg.role DESC, eg.joined_at ASC
            `, [req.params.id]);
            res.json({ members: rows });
        } catch (err) {
            console.error("Group members error:", err);
            res.status(500).json({ message: "Server error." });
        }
    });

    // POST /api/groups
    // body: { name, desc, leaderName? }  — leaderName matches the full name shown in the UI
    router.post("/", requirePerm(db, "manage_groups"), async (req, res) => {
        const { name, desc, leaderName, leaderEmail } = req.body || {};
        if (!name) return res.status(400).json({ message: "name is required." });

        try {
            const [dup] = await db.query(
                "SELECT group_id FROM Job_Groups WHERE group_name = ? LIMIT 1", [name]
            );
            if (dup.length > 0) return res.status(409).json({ message: "Group already exists." });

            const [result] = await db.query(
                "INSERT INTO Job_Groups (group_name, `desc`) VALUES (?, ?)",
                [name.slice(0, 45), (desc || "").slice(0, 128)]
            );
            const groupId = result.insertId;

            // Optionally seed an initial leader
            const leaderId = await resolveLeader(db, leaderEmail, leaderName);
            if (leaderId) {
                await db.query(
                    "INSERT INTO Employees_Groups (employee_id, group_id, role) VALUES (?, ?, 'Leader')",
                    [leaderId, groupId]
                );
            }

            res.status(201).json({ message: "Group created.", groupId });
        } catch (err) {
            console.error("Create group error:", err);
            res.status(500).json({ message: "Server error." });
        }
    });

    // PUT /api/groups/:id — update name/desc + (optionally) replace leader
    router.put("/:id", requirePerm(db, "manage_groups"), async (req, res) => {
        const { name, desc, leaderName, leaderEmail } = req.body || {};
        try {
            await db.query(
                "UPDATE Job_Groups SET group_name = COALESCE(?, group_name), `desc` = COALESCE(?, `desc`), group_updated_at = NOW() WHERE group_id = ?",
                [name ? name.slice(0, 45) : null,
                 desc != null ? String(desc).slice(0, 128) : null,
                 req.params.id]
            );

            if (leaderName || leaderEmail) {
                const newLeaderId = await resolveLeader(db, leaderEmail, leaderName);
                if (newLeaderId) {
                    // Demote any existing leaders, then promote the new one (or insert if not already a member)
                    await db.query(
                        "UPDATE Employees_Groups SET role = 'Member' WHERE group_id = ? AND role = 'Leader'",
                        [req.params.id]
                    );
                    const [existing] = await db.query(
                        "SELECT 1 FROM Employees_Groups WHERE employee_id = ? AND group_id = ? LIMIT 1",
                        [newLeaderId, req.params.id]
                    );
                    if (existing.length === 0) {
                        await db.query(
                            "INSERT INTO Employees_Groups (employee_id, group_id, role) VALUES (?, ?, 'Leader')",
                            [newLeaderId, req.params.id]
                        );
                    } else {
                        await db.query(
                            "UPDATE Employees_Groups SET role = 'Leader' WHERE employee_id = ? AND group_id = ?",
                            [newLeaderId, req.params.id]
                        );
                    }
                }
            }
            res.json({ message: "Group updated." });
        } catch (err) {
            console.error("Update group error:", err);
            res.status(500).json({ message: "Server error." });
        }
    });

    // POST /api/groups/:id/members — add a member
    // body: { email, role? }
    router.post("/:id/members", requirePerm(db, "manage_groups"), async (req, res) => {
        const { email, role } = req.body || {};
        if (!email) return res.status(400).json({ message: "email is required." });

        try {
            const [emp] = await db.query(
                "SELECT employee_id FROM Employees WHERE email = ? LIMIT 1", [email]
            );
            if (emp.length === 0) return res.status(404).json({ message: "User not found." });

            const [dup] = await db.query(
                "SELECT 1 FROM Employees_Groups WHERE employee_id = ? AND group_id = ? LIMIT 1",
                [emp[0].employee_id, req.params.id]
            );
            if (dup.length > 0) return res.status(409).json({ message: "User already in group." });

            await db.query(
                "INSERT INTO Employees_Groups (employee_id, group_id, role) VALUES (?, ?, ?)",
                [emp[0].employee_id, req.params.id, normalizeRole(role)]
            );
            res.status(201).json({ message: "Member added." });
        } catch (err) {
            console.error("Add member error:", err);
            res.status(500).json({ message: "Server error." });
        }
    });

    // DELETE /api/groups/:id/members/:employeeId
    router.delete("/:id/members/:employeeId", requirePerm(db, "manage_groups"), async (req, res) => {
        try {
            const [result] = await db.query(
                "DELETE FROM Employees_Groups WHERE group_id = ? AND employee_id = ?",
                [req.params.id, req.params.employeeId]
            );
            if (result.affectedRows === 0) return res.status(404).json({ message: "Membership not found." });
            res.json({ message: "Member removed." });
        } catch (err) {
            console.error("Remove member error:", err);
            res.status(500).json({ message: "Server error." });
        }
    });

    // DELETE /api/groups/:id — Employees_Groups rows cascade via FK ON DELETE CASCADE
    router.delete("/:id", requirePerm(db, "manage_groups"), async (req, res) => {
        try {
            const [result] = await db.query("DELETE FROM Job_Groups WHERE group_id = ?", [req.params.id]);
            if (result.affectedRows === 0) return res.status(404).json({ message: "Group not found." });
            res.json({ message: "Group deleted." });
        } catch (err) {
            console.error("Delete group error:", err);
            res.status(500).json({ message: "Server error." });
        }
    });

    return router;
}

// Resolve an Employees.employee_id from either email (preferred) or display name.
async function resolveLeader(db, email, name) {
    if (email) {
        const [rows] = await db.query(
            "SELECT employee_id FROM Employees WHERE email = ? LIMIT 1", [email]
        );
        if (rows.length > 0) return rows[0].employee_id;
    }
    if (name) {
        const [rows] = await db.query(
            "SELECT employee_id FROM Employees WHERE CONCAT_WS(' ', first_name, middle_name, last_name, suffix) = ? LIMIT 1",
            [name]
        );
        if (rows.length > 0) return rows[0].employee_id;
    }
    return null;
}

// Frontend uses "ADMIN/MEMBER" for system roles but groups use "LEADER/MEMBER" (Title case in DB).
function normalizeRole(r) {
    const v = String(r || "").toLowerCase();
    return v === "leader" ? "Leader" : "Member";
}

function formatGroup(row) {
    return {
        id:          row.group_id,
        name:        row.group_name,
        desc:        row.desc,
        members:     Number(row.member_count) || 0,
        leader:      row.leader_name || null,
        createdAt:   row.group_created_at,
        updatedAt:   row.group_updated_at
    };
}

module.exports = { taskGroupsRouter };

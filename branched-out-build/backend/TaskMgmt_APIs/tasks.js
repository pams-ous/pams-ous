// Task routes — CRUD for the Tasks table.
// Mounts under /api/tasks in server.js
//
// Schema notes (PAMS_OUS.sql):
//   - Tasks.status   ENUM: 'pending','in progress','completed','cancelled'   (space, NOT underscore)
//   - Tasks.priority ENUM: 'low','medium','high','urgent'
//   - Tasks.due_date DATE (not DATETIME)
//   - Tasks.assigned_by is NOT NULL — every task records who assigned it.
//   - Either assigned_to_user OR assigned_to_group is set (or neither — both nullable).

const express = require("express");
const { requireAuth } = require("../UserMngmt_APIs/auth");
const { requirePerm } = require("../UserMngmt_APIs/designations");

function tasksRouter(db) {
    const router = express.Router();

    // Every task route requires a valid session. Mutation routes (create/delete)
    // additionally require manage_tasks; PUT is left open to authenticated
    // users so staff can move their assigned tasks through the status board.
    router.use(requireAuth);

    // GET /api/tasks — full board view with joined assignee/group/creator names
    // Optional query params:
    //   ?status=PENDING|IN PROGRESS|COMPLETED|CANCELLED  filter by status
    //   ?priority=HIGH                                   filter by priority
    //   ?groupId=1                                       filter by group
    //   ?assignee=email@x.com                            filter by assignee
    //   ?completedSince=today|all                        only meaningful with status=COMPLETED
    //
    // Daily-reset rule (May 26 meeting): standard users see only tasks
    // completed *today* on the Completed tab. Admins can pass `completedSince=all`
    // to see the full history (required for reports).
    router.get("/", async (req, res) => {
        try {
            const where = [];
            const params = [];

            // Data isolation: non-admins only see tasks assigned to them
            // directly or to a Job_Group they belong to. Admin sees everything.
            if (req.user?.role !== "ADMIN") {
                where.push(`(t.assigned_to_user = ?
                             OR t.assigned_to_group IN (
                                SELECT group_id FROM Employees_Groups WHERE employee_id = ?
                             ))`);
                params.push(req.user.sub, req.user.sub);
            }

            if (req.query.status) {
                where.push("t.status = ?");
                params.push(normalizeTaskStatus(req.query.status));
            }
            if (req.query.priority) {
                where.push("t.priority = ?");
                params.push(String(req.query.priority).toLowerCase());
            }
            if (req.query.groupId) {
                where.push("t.assigned_to_group = ?");
                params.push(req.query.groupId);
            }
            if (req.query.assignee) {
                where.push(`t.assigned_to_user = (
                    SELECT employee_id FROM Employees WHERE email = ? LIMIT 1
                )`);
                params.push(req.query.assignee);
            }

            // Daily reset: when explicitly filtering for COMPLETED, default to
            // "today only" unless the caller asks for the full history.
            const statusFilter = (req.query.status || "").toLowerCase();
            const isCompletedView = statusFilter === "completed";
            const since = (req.query.completedSince || "today").toLowerCase();
            if (isCompletedView && since !== "all") {
                // Tasks.updated_at flips whenever the row is changed; the most
                // reliable signal that it was COMPLETED today is the matching
                // Task_Updates row, but updated_at is a good-enough proxy in
                // practice and avoids a join.
                where.push("DATE(t.updated_at) = CURDATE()");
            }

            const sql = `
                SELECT ${TASK_COLS}
                FROM Tasks t
                LEFT JOIN Employees e_user   ON t.assigned_to_user  = e_user.employee_id
                LEFT JOIN Employees e_by     ON t.assigned_by       = e_by.employee_id
                LEFT JOIN Job_Groups g       ON t.assigned_to_group = g.group_id
                ${where.length ? "WHERE " + where.join(" AND ") : ""}
                ORDER BY t.due_date ASC, t.created_at DESC
            `;
            const [rows] = await db.query(sql, params);
            res.json({ tasks: rows.map(formatTask) });
        } catch (err) {
            console.error("List tasks error:", err);
            res.status(500).json({ message: "Server error." });
        }
    });

    // GET /api/tasks/me?email=... — tasks assigned to a specific user
    // (directly, or via a group they belong to)
    router.get("/me", async (req, res) => {
        const email = (req.query.email || "").trim();
        if (!email) return res.status(400).json({ message: "email query param required." });

        try {
            const [empRows] = await db.query(
                "SELECT employee_id FROM Employees WHERE email = ? LIMIT 1", [email]
            );
            if (empRows.length === 0) return res.status(404).json({ message: "User not found." });
            const empId = empRows[0].employee_id;

            const [rows] = await db.query(`
                SELECT ${TASK_COLS}
                FROM Tasks t
                LEFT JOIN Employees e_user   ON t.assigned_to_user  = e_user.employee_id
                LEFT JOIN Employees e_by     ON t.assigned_by       = e_by.employee_id
                LEFT JOIN Job_Groups g       ON t.assigned_to_group = g.group_id
                WHERE t.assigned_to_user = ?
                   OR t.assigned_to_group IN (
                       SELECT group_id FROM Employees_Groups WHERE employee_id = ?
                   )
                ORDER BY t.due_date ASC
            `, [empId, empId]);
            res.json({ tasks: rows.map(formatTask) });
        } catch (err) {
            console.error("My tasks error:", err);
            res.status(500).json({ message: "Server error." });
        }
    });

    // GET /api/tasks/:id — full task detail, including its updates log
    router.get("/:id", async (req, res) => {
        try {
            const [taskRows] = await db.query(`
                SELECT ${TASK_COLS}
                FROM Tasks t
                LEFT JOIN Employees e_user   ON t.assigned_to_user  = e_user.employee_id
                LEFT JOIN Employees e_by     ON t.assigned_by       = e_by.employee_id
                LEFT JOIN Job_Groups g       ON t.assigned_to_group = g.group_id
                WHERE t.task_id = ?
                LIMIT 1
            `, [req.params.id]);
            if (taskRows.length === 0) return res.status(404).json({ message: "Task not found." });

            const [updates] = await db.query(`
                SELECT u.update_id, u.task_id, u.updated_text, u.status_change,
                       u.attachment_url, u.logged_at,
                       CONCAT_WS(' ', e.first_name, e.middle_name, e.last_name) AS updated_by_name,
                       u.updated_by
                FROM Task_Updates u
                LEFT JOIN Employees e ON u.updated_by = e.employee_id
                WHERE u.task_id = ?
                ORDER BY u.logged_at ASC
            `, [req.params.id]);

            res.json({ task: formatTask(taskRows[0]), updates });
        } catch (err) {
            console.error("Get task error:", err);
            res.status(500).json({ message: "Server error." });
        }
    });

    // POST /api/tasks
    // body: { title, description?, priority, status?, dueDate,
    //         assigneeEmail? (individual) | groupId? (group) }
    // assignedBy is derived from the JWT so the caller cannot spoof it.
    router.post("/", requirePerm(db, "manage_tasks"), async (req, res) => {
        const {
            title, description, priority, status, dueDate,
            assigneeEmail, groupId
        } = req.body || {};

        if (!title || !priority || !dueDate) {
            return res.status(400).json({
                message: "title, priority, and dueDate are required."
            });
        }
        if (!assigneeEmail && !groupId) {
            return res.status(400).json({ message: "Provide either assigneeEmail or groupId." });
        }

        try {
            // Use the authenticated user's employee_id directly — no email lookup needed.
            const assignedBy = req.user.sub;

            let assignedToUser = null, assignedToGroup = null;
            if (assigneeEmail) {
                assignedToUser = await resolveEmpId(db, assigneeEmail);
                if (!assignedToUser) return res.status(400).json({ message: "assigneeEmail not found." });
            }
            if (groupId) assignedToGroup = parseInt(groupId, 10);

            const [result] = await db.query(
                `INSERT INTO Tasks
                    (title, description, assigned_by, assigned_to_user, assigned_to_group,
                     priority, status, due_date)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [title.slice(0, 200),
                 (description || "").slice(0, 45),
                 assignedBy, assignedToUser, assignedToGroup,
                 String(priority).toLowerCase(),
                 normalizeTaskStatus(status || "PENDING"),
                 dueDate]
            );
            res.status(201).json({ message: "Task created.", taskId: result.insertId });
        } catch (err) {
            console.error("Create task error:", err);
            res.status(500).json({ message: "Server error." });
        }
    });

    // PUT /api/tasks/:id — update editable fields; uses COALESCE to leave unspecified fields intact.
    router.put("/:id", async (req, res) => {
        const { title, description, priority, status, dueDate, assigneeEmail, groupId } = req.body || {};
        try {
            let assignedToUser = null, assignedToGroup = null;
            if (assigneeEmail) {
                assignedToUser = await resolveEmpId(db, assigneeEmail);
                if (!assignedToUser) return res.status(400).json({ message: "assigneeEmail not found." });
            }
            if (groupId != null) assignedToGroup = parseInt(groupId, 10);

            // When the caller specifies one assignee target, clear the other to keep the EERD invariant.
            const clearOther = (assigneeEmail || groupId != null);

            const [result] = await db.query(
                `UPDATE Tasks
                 SET title       = COALESCE(?, title),
                     description = COALESCE(?, description),
                     priority    = COALESCE(?, priority),
                     status      = COALESCE(?, status),
                     due_date    = COALESCE(?, due_date),
                     assigned_to_user  = ${clearOther ? "?" : "assigned_to_user"},
                     assigned_to_group = ${clearOther ? "?" : "assigned_to_group"}
                 WHERE task_id = ?`,
                clearOther
                    ? [title || null,
                       description != null ? String(description).slice(0, 45) : null,
                       priority ? String(priority).toLowerCase() : null,
                       status ? normalizeTaskStatus(status) : null,
                       dueDate || null,
                       assignedToUser, assignedToGroup,
                       req.params.id]
                    : [title || null,
                       description != null ? String(description).slice(0, 45) : null,
                       priority ? String(priority).toLowerCase() : null,
                       status ? normalizeTaskStatus(status) : null,
                       dueDate || null,
                       req.params.id]
            );
            if (result.affectedRows === 0) return res.status(404).json({ message: "Task not found." });
            res.json({ message: "Task updated." });
        } catch (err) {
            console.error("Update task error:", err);
            res.status(500).json({ message: "Server error." });
        }
    });

    // DELETE /api/tasks/:id
    router.delete("/:id", requirePerm(db, "manage_tasks"), async (req, res) => {
        try {
            const [result] = await db.query("DELETE FROM Tasks WHERE task_id = ?", [req.params.id]);
            if (result.affectedRows === 0) return res.status(404).json({ message: "Task not found." });
            res.json({ message: "Task deleted." });
        } catch (err) {
            console.error("Delete task error:", err);
            res.status(500).json({ message: "Server error." });
        }
    });

    return router;
}

// ──────────────────────────────────────────────────────────────────
// Helpers shared with related modules
// ──────────────────────────────────────────────────────────────────

const TASK_COLS = `
    t.task_id, t.title, t.description, t.priority, t.status, t.due_date,
    t.created_at, t.updated_at,
    t.assigned_by, t.assigned_to_user, t.assigned_to_group,
    CONCAT_WS(' ', e_user.first_name, e_user.last_name) AS assignee_name,
    e_user.email AS assignee_email,
    CONCAT_WS(' ', e_by.first_name, e_by.last_name) AS assigned_by_name,
    g.group_name
`;

// Convert UI status ("PENDING", "IN PROGRESS", "in progress" etc.) to the exact DB enum value.
function normalizeTaskStatus(s) {
    const v = String(s).toLowerCase().trim();
    if (v === "in_progress" || v === "in progress" || v === "inprogress") return "in progress";
    if (["pending", "completed", "cancelled"].includes(v)) return v;
    return "pending";
}

async function resolveEmpId(db, email) {
    const [rows] = await db.query(
        "SELECT employee_id FROM Employees WHERE email = ? LIMIT 1", [email]
    );
    return rows[0]?.employee_id || null;
}

// Shape a joined Tasks row into the JSON the frontend expects.
function formatTask(r) {
    return {
        id:             r.task_id,
        title:          r.title,
        description:    r.description,
        priority:       (r.priority || "").toUpperCase(),
        status:         (r.status   || "").toUpperCase(),
        dueDate:        r.due_date,
        createdAt:      r.created_at,
        updatedAt:      r.updated_at,
        assignedBy:     r.assigned_by,
        assignedByName: r.assigned_by_name,
        assignee: r.assigned_to_user
            ? { type: "user", id: r.assigned_to_user, name: r.assignee_name, email: r.assignee_email,
                initials: initialsOf(r.assignee_name) }
            : r.assigned_to_group
                ? { type: "group", id: r.assigned_to_group, name: r.group_name,
                    initials: initialsOf(r.group_name) }
                : null
    };
}

function initialsOf(name) {
    if (!name) return "?";
    return name.trim().split(/\s+/).map(w => w[0] || "").join("").slice(0, 2).toUpperCase();
}

module.exports = { tasksRouter, normalizeTaskStatus, resolveEmpId, formatTask, TASK_COLS };

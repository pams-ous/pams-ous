// Task update log routes.
// Mounts under /api/task-updates in server.js
//
// Schema note: Task_Updates.status_change uses an UNDERSCORE ('in_progress')
// while Tasks.status uses a SPACE ('in progress'). We normalize both.

const express = require("express");
const { resolveEmpId } = require("./tasks");
const { requireAuth } = require("../UserMngmt_APIs/auth");

function taskUpdatesRouter(db) {
    const router = express.Router();

    router.use(requireAuth);

    // GET /api/task-updates?taskId=NN — list updates for a specific task
    router.get("/", async (req, res) => {
        const { taskId } = req.query;
        if (!taskId) return res.status(400).json({ message: "taskId query param required." });

        try {
            const [rows] = await db.query(`
                SELECT u.update_id, u.task_id, u.updated_text, u.status_change,
                       u.attachment_url, u.logged_at, u.updated_by,
                       CONCAT_WS(' ', e.first_name, e.middle_name, e.last_name) AS updated_by_name
                FROM Task_Updates u
                LEFT JOIN Employees e ON u.updated_by = e.employee_id
                WHERE u.task_id = ?
                ORDER BY u.logged_at ASC
            `, [taskId]);
            res.json({ updates: rows });
        } catch (err) {
            console.error("List task-updates error:", err);
            res.status(500).json({ message: "Server error." });
        }
    });

    // POST /api/task-updates
    // body: { taskId, email, notes, statusChange?, attachmentUrl? }
    // If statusChange is provided, ALSO update the parent Tasks.status to keep them in sync.
    router.post("/", async (req, res) => {
        const { taskId, email, notes, statusChange, attachmentUrl } = req.body || {};
        if (!taskId || !email || !notes) {
            return res.status(400).json({ message: "taskId, email and notes are required." });
        }

        try {
            const [taskCheck] = await db.query(
                "SELECT task_id FROM Tasks WHERE task_id = ? LIMIT 1", [taskId]
            );
            if (taskCheck.length === 0) return res.status(404).json({ message: "Task not found." });

            const updatedBy = await resolveEmpId(db, email);
            if (!updatedBy) return res.status(400).json({ message: "Email not found." });

            const updatesEnum = statusChange ? normalizeUpdateStatus(statusChange) : null;

            const [result] = await db.query(
                `INSERT INTO Task_Updates
                    (task_id, updated_by, updated_text, status_change, attachment_url)
                 VALUES (?, ?, ?, ?, ?)`,
                [taskId, updatedBy,
                 String(notes).slice(0, 45),    // schema cap
                 updatesEnum,
                 attachmentUrl || null]
            );

            // Keep Tasks.status in sync (different enum spelling: 'in_progress' vs 'in progress')
            if (updatesEnum) {
                const tasksStatus = updatesEnum === "in_progress" ? "in progress" : updatesEnum;
                await db.query("UPDATE Tasks SET status = ? WHERE task_id = ?", [tasksStatus, taskId]);

                // If the task moved to 'completed', stamp Member.task_completed_at (EERD subclass attribute)
                if (tasksStatus === "completed") {
                    await db.query(
                        "UPDATE Member SET task_completed_at = NOW() WHERE employee_id = ?",
                        [updatedBy]
                    );
                }
            }

            res.status(201).json({ message: "Update logged.", updateId: result.insertId });
        } catch (err) {
            console.error("Create task-update error:", err);
            res.status(500).json({ message: "Server error." });
        }
    });

    return router;
}

// Task_Updates.status_change enum uses UNDERSCORE for 'in_progress'.
function normalizeUpdateStatus(s) {
    const v = String(s).toLowerCase().trim();
    if (v === "in progress" || v === "in_progress" || v === "inprogress") return "in_progress";
    if (["pending", "completed", "cancelled"].includes(v)) return v;
    return null;
}

module.exports = { taskUpdatesRouter };

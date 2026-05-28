// Notification feed for the bell popover.
//
// Two flavours of "notification":
//   1. CURRENT  — derived live from Tasks (overdue / due-today for the user).
//                 This is what shows at the top of the bell popover.
//   2. HISTORY  — persistent rows from the Notifications table (task assigned,
//                 task completed, password reset, etc.). Shown below the
//                 current list under a "History" heading.
//
// Other modules (tasks, auth, designations) can call `recordNotification`
// to add a row.

const express = require("express");
const { requireAuth } = require("./auth");

function notificationsRouter(db) {
    const router = express.Router();
    router.use(requireAuth);

    // GET /api/notifications — { current: [...], history: [...] }
    // ?limit=N for history (default 25)
    router.get("/", async (req, res) => {
        try {
            const empId = req.user.sub;
            const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 25));

            const current = await loadCurrent(db, empId);
            const [history] = await db.query(`
                SELECT notif_id, kind, title, body, related_url, is_read, created_at
                FROM Notifications
                WHERE employee_id = ?
                ORDER BY created_at DESC
                LIMIT ?
            `, [empId, limit]);

            const [unreadRow] = await db.query(
                "SELECT COUNT(*) AS c FROM Notifications WHERE employee_id = ? AND is_read = 0",
                [empId]
            );

            res.json({
                current,
                history: history.map(formatHistory),
                unreadCount: Number(unreadRow[0].c) || 0,
                overdueCount: current.filter(c => c.kind === "overdue").length
            });
        } catch (err) {
            console.error("List notifications error:", err);
            res.status(500).json({ message: "Server error." });
        }
    });

    // POST /api/notifications/mark-read — marks all unread as read
    router.post("/mark-read", async (req, res) => {
        try {
            await db.query(
                "UPDATE Notifications SET is_read = 1 WHERE employee_id = ? AND is_read = 0",
                [req.user.sub]
            );
            res.json({ message: "Marked all read." });
        } catch (err) {
            console.error("Mark-read error:", err);
            res.status(500).json({ message: "Server error." });
        }
    });

    // POST /api/notifications/:id/mark-read — mark ONE notification as read.
    // Owner check (employee_id = ?) prevents marking someone else's notif.
    router.post("/:id/mark-read", async (req, res) => {
        try {
            const [result] = await db.query(
                "UPDATE Notifications SET is_read = 1 WHERE notif_id = ? AND employee_id = ?",
                [req.params.id, req.user.sub]
            );
            if (result.affectedRows === 0) {
                return res.status(404).json({ message: "Notification not found." });
            }
            res.json({ message: "Marked read." });
        } catch (err) {
            console.error("Mark-one-read error:", err);
            res.status(500).json({ message: "Server error." });
        }
    });

    // GET /api/notifications/badge — lightweight summary for the bell dot.
    // Returns only counts so we can poll without pulling every row.
    router.get("/badge", async (req, res) => {
        try {
            const empId = req.user.sub;
            const [[unreadRow]] = await db.query(
                "SELECT COUNT(*) AS c FROM Notifications WHERE employee_id = ? AND is_read = 0",
                [empId]
            );
            const [[overdueRow]] = await db.query(`
                SELECT COUNT(*) AS c
                FROM Tasks t
                WHERE (t.assigned_to_user = ?
                       OR t.assigned_to_group IN (
                           SELECT group_id FROM Employees_Groups WHERE employee_id = ?
                       ))
                  AND t.status NOT IN ('completed','cancelled')
                  AND t.due_date < CURDATE()
            `, [empId, empId]);
            res.json({
                unreadCount:  Number(unreadRow.c)  || 0,
                overdueCount: Number(overdueRow.c) || 0
            });
        } catch (err) {
            console.error("Badge error:", err);
            res.status(500).json({ message: "Server error." });
        }
    });

    return router;
}

// Build the live "Current" list — overdue + due-today tasks assigned to this
// user, directly or via a group they're in.
async function loadCurrent(db, employeeId) {
    const [rows] = await db.query(`
        SELECT t.task_id, t.title, t.priority, t.status, t.due_date
        FROM Tasks t
        WHERE (t.assigned_to_user = ?
               OR t.assigned_to_group IN (
                   SELECT group_id FROM Employees_Groups WHERE employee_id = ?
               ))
          AND t.status NOT IN ('completed', 'cancelled')
          AND t.due_date <= CURDATE()
        ORDER BY t.due_date ASC
        LIMIT 20
    `, [employeeId, employeeId]);

    const today = new Date(new Date().toDateString());
    return rows.map(t => {
        const due = new Date(t.due_date);
        const overdue = due < today;
        return {
            kind:       overdue ? "overdue" : "due_today",
            taskId:     t.task_id,
            title:      t.title,
            priority:   t.priority,
            status:     t.status,
            dueDate:    t.due_date,
            message:    overdue
                ? `"${t.title}" is overdue`
                : `"${t.title}" is due today`
        };
    });
}

function formatHistory(r) {
    return {
        id:         r.notif_id,
        kind:       r.kind,
        title:      r.title,
        body:       r.body,
        relatedUrl: r.related_url,
        isRead:     !!r.is_read,
        createdAt:  r.created_at
    };
}

// Called by other modules to persist a notification.
// Safe to await but failures are swallowed — never fail the parent request
// just because we couldn't log a notification.
async function recordNotification(db, { employeeId, kind, title, body, relatedUrl }) {
    if (!employeeId || !kind || !title) return;
    try {
        await db.query(
            `INSERT INTO Notifications (employee_id, kind, title, body, related_url)
             VALUES (?, ?, ?, ?, ?)`,
            [employeeId, kind, title, body || null, relatedUrl || null]
        );
    } catch (err) {
        console.warn("Notification persist failed (non-fatal):", err.message);
    }
}

module.exports = { notificationsRouter, recordNotification };

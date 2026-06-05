// Notification feed for the bell popover.
//
// CURRENT GLOBAL IMPLEMENTATION:
// This system currently uses a global broadcast model. Notifications are not 
// targeted to specific users in the database; instead, any record inserted 
// into the Notifications table is visible to all authorized users (specifically Admins).
//
// Table structure:
//   - notification_id (PK)
//   - notif_message (contains metadata for actions, e.g., "ACTION:APPROVE_USER|userId|role|email")
//   - notif_date
//
// For approval notifications, we use a structured message format:
//   "ACTION:APPROVE_USER|userId|role|email"

const express = require("express");
const { authenticateToken } = require("./authMiddleware");

function notificationsRouter(db) {
    const router = express.Router();
    router.use(authenticateToken);

    // GET /api/notifications — Returns all notifications.
    router.get("/", async (req, res) => {
        try {
            const userId = req.user.id;
            const userRole = req.user.role; // 'ADMIN' or 'MEMBER'

            const [history] = await db.query(`
                SELECT notification_id, notif_message, notif_date
                FROM Notifications
                ORDER BY notif_date DESC
                LIMIT 100
            `);

            // Filter notifications in memory since we cannot use targeting columns in the schema
            const filteredHistory = history.filter(r => {
                const msg = r.notif_message;
                if (msg.startsWith("TARGET:USER|")) {
                    const parts = msg.split("||");
                    const targetId = parts[0].split("|")[1];
                    return targetId === String(userId);
                }
                if (msg.startsWith("TARGET:ROLE|")) {
                    const parts = msg.split("||");
                    const targetRole = parts[0].split("|")[1];
                    return targetRole.toUpperCase() === userRole.toUpperCase();
                }
                return true;
            });

            const empId = req.user.id;
            const current = await loadCurrent(db, empId);

            res.json({
                current,
                history: filteredHistory.map(r => {
                    const msg = r.notif_message;
                    let title = "System Notification";
                    let body = msg;
                    let kind = "info";

                    let cleanMsg = msg;
                    if (msg.startsWith("TARGET:USER|") || msg.startsWith("TARGET:ROLE|")) {
                        const parts = msg.split("||");
                        cleanMsg = parts.slice(1).join("||");
                    }

                    if (cleanMsg.startsWith("ACTION:APPROVE_USER|")) {
                        kind = "approval";
                        const parts = cleanMsg.split("|");
                        title = `Account Request (${parts[2] || 'User'})`;
                        body = `Approval request for ${parts[3] || 'Unknown email'}`;
                    } else if (cleanMsg.includes("||")) {
                        const [extractedTitle, extractedBody] = cleanMsg.split("||");
                        title = extractedTitle;
                        body = extractedBody;
                    } else {
                        body = cleanMsg;
                    }

                    return {
                        id: r.notification_id,
                        title: title,
                        body: body,
                        createdAt: r.notif_date,
                        kind: kind,
                        rawMessage: msg
                    };
                })
            });
        } catch (err) {
            console.error("List notifications error:", err);
            res.status(500).json({ message: "Server error." });
        }
    });

    // POST /api/notifications/:id/approve — approves a pending account
    router.post("/:id/approve", async (req, res) => {
        try {
            // Only admins should approve
            const [adminCheck] = await db.query("SELECT 1 FROM Employees WHERE employee_id = ? AND designation = 'Admin'", [req.user.id]);
            if (adminCheck.length === 0) return res.status(403).json({ message: "Forbidden: Admin only." });

            const [notif] = await db.query("SELECT notif_message FROM Notifications WHERE notification_id = ?", [req.params.id]);
            if (notif.length === 0) return res.status(404).json({ message: "Notification not found." });

            const msg = notif[0].notif_message;
            if (!msg.startsWith("ACTION:APPROVE_USER|")) {
                return res.status(400).json({ message: "This notification is not an approval request." });
            }

            const [, userId] = msg.split("|");
            await db.query("UPDATE Employees SET approval_status = 'APPROVED' WHERE employee_id = ?", [userId]);
            
            // Delete the notification once acted upon
            await db.query("DELETE FROM Notifications WHERE notification_id = ?", [req.params.id]);

            res.json({ message: "Account approved successfully." });
        } catch (err) {
            console.error("Approval error:", err);
            res.status(500).json({ message: "Server error." });
        }
    });

    // POST /api/notifications/:id/reject — rejects and deletes a pending account
    router.post("/:id/reject", async (req, res) => {
        try {
            // Only admins should reject
            const [adminCheck] = await db.query("SELECT 1 FROM Employees WHERE employee_id = ? AND designation = 'Admin'", [req.user.id]);
            if (adminCheck.length === 0) return res.status(403).json({ message: "Forbidden: Admin only." });

            const [notif] = await db.query("SELECT notif_message FROM Notifications WHERE notification_id = ?", [req.params.id]);
            if (notif.length === 0) return res.status(404).json({ message: "Notification not found." });

            const msg = notif[0].notif_message;
            if (!msg.startsWith("ACTION:APPROVE_USER|")) {
                return res.status(400).json({ message: "This notification is not an approval request." });
            }

            const [, userId] = msg.split("|");
            await db.query("DELETE FROM Employees WHERE employee_id = ?", [userId]);
            await db.query("DELETE FROM Notifications WHERE notification_id = ?", [req.params.id]);

            res.json({ message: "Account rejected and deleted." });
        } catch (err) {
            console.error("Rejection error:", err);
            res.status(500).json({ message: "Server error." });
        }
    });

    // POST /api/notifications/clear — deletes all notifications
    router.post("/clear", async (req, res) => {
        try {
            // Only admins can clear all notifications
            const [adminCheck] = await db.query("SELECT 1 FROM Employees WHERE employee_id = ? AND designation = 'Admin'", [req.user.id]);
            if (adminCheck.length === 0) return res.status(403).json({ message: "Forbidden: Admin only." });

            await db.query("DELETE FROM Notifications");
            res.json({ message: "All notifications cleared." });
        } catch (err) {
            console.error("Clear notifications error:", err);
            res.status(500).json({ message: "Server error." });
        }
    });

    // GET /api/notifications/badge — lightweight summary for the bell dot.
    router.get("/badge", async (req, res) => {
        try {
            const empId = req.user.id;
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
                unreadCount: 0,
                overdueCount: Number(overdueRow.c) || 0
            });
        } catch (err) {
            console.error("Badge error:", err);
            res.status(500).json({ message: "Server error." });
        }
    });

    return router;
}

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
            message:    overdue ? `"${t.title}" is overdue` : `"${t.title}" is due today`
        };
    });
}

async function recordNotification(db, { employeeId, kind, title, body, relatedUrl, targetUserId = null, targetRole = null }) {
    let message;
    if (kind === "user_approval") {
        // structured as: ACTION:APPROVE_USER | userId | role | email
        message = `ACTION:APPROVE_USER|${relatedUrl}|${title}|${body}`;
    } else {
        // Use a delimiter to store both title and body in the single column
        message = `${title}||${body}`;
    }
    
    // Handle targeting by prefixing the message
    if (targetUserId) {
        message = `TARGET:USER|${targetUserId}||${message}`;
    } else if (targetRole) {
        message = `TARGET:ROLE|${targetRole}||${message}`;
    }
    
    try {
        await db.query(
            `INSERT INTO Notifications (notif_message) VALUES (?)`,
            [message]
        );
    } catch (err) {
        console.warn("Notification persist failed:", err.message);
    }
}

module.exports = { notificationsRouter, recordNotification };

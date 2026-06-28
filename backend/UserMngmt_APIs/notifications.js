// Notification feed for the bell popover.
//
// TARGETED IMPLEMENTATION:
// Notifications are targeted to specific users, designations, or groups.
// Read status is tracked per-user in the User_Notifications table.

const express = require("express");
const { authenticateToken } = require("./authMiddleware");

function notificationsRouter(db) {
    const router = express.Router();
    router.use(authenticateToken);

    // GET /api/notifications — Returns notifications targeted to the user, including read status.
    // Supports pagination via ?limit=N&offset=N.
    router.get("/", async (req, res) => {
        try {
            const userId = req.user.id;
            const limit = Math.min(parseInt(req.query.limit) || 10, 100);
            const offset = parseInt(req.query.offset) || 0;

            console.log(`[NOTIF-DEBUG] Fetching notifications for userId: ${userId}, limit: ${limit}, offset: ${offset}`);

            const [[{ totalCount }]] = await db.query(`
                SELECT COUNT(*) as totalCount
                FROM Notifications n
                JOIN User_Notifications un ON n.notification_id = un.notification_id
                WHERE un.user_id = ?
            `, [userId]);

            const [history] = await db.query(`
                SELECT 
                    n.notification_id, 
                    n.notif_message, 
                    n.notif_date, 
                    un.is_read
                FROM Notifications n
                JOIN User_Notifications un ON n.notification_id = un.notification_id
                WHERE un.user_id = ?
                ORDER BY n.notif_date DESC
                LIMIT ? OFFSET ?
            `, [userId, limit, offset]);
            console.log(`[NOTIF-DEBUG] JOIN result: ${history.length} notifications fetched (total available: ${totalCount}).`);

            const empId = req.user.id;
            const current = await loadCurrent(db, empId);

            res.json({
                current,
                totalCount,
                history: history.map(r => {
                    const msg = r.notif_message;
                    let title = "System Notification";
                    let body = msg;
                    let kind = "info";

                    if (msg.startsWith("ACTION:APPROVE_USER|")) {
                        kind = "approval";
                        const parts = msg.split("|");
                        title = `Account Request (${parts[2] || 'User'})`;
                        body = `Approval request for ${parts[3] || 'Unknown email'}`;
                    } else if (msg.includes("||")) {
                        const [extractedTitle, extractedBody] = msg.split("||");
                        title = extractedTitle;
                        body = extractedBody;
                    } else {
                        body = msg;
                    }

                    return {
                        id: r.notification_id,
                        title: title,
                        body: body,
                        createdAt: r.notif_date,
                        kind: kind,
                        isRead: r.is_read,
                        rawMessage: msg
                    };
                })
            });
        } catch (err) {
            console.error("List notifications error:", err);
            res.status(500).json({ message: "Server error." });
        }
    });

    // PATCH /api/notifications/mark-all-read — marks all notifications as read for the user
    router.patch("/mark-all-read", async (req, res) => {
        try {
            const userId = req.user.id;
            await db.query("UPDATE User_Notifications SET is_read = TRUE, read_at = NOW() WHERE user_id = ? AND is_read = FALSE", [userId]);
            res.json({ success: true, message: "Notifications marked as read." });
        } catch (err) {
            console.error("Mark read error:", err);
            res.status(500).json({ message: "Server error." });
        }
    });

    // GET /api/notifications/unread-count — lightweight summary for the red bubble.
    router.get("/unread-count", async (req, res) => {
        try {
            const userId = req.user.id;
            const [[row]] = await db.query("SELECT COUNT(*) as count FROM User_Notifications WHERE user_id = ? AND is_read = FALSE", [userId]);
            res.json({ unreadCount: Number(row.count) || 0 });
        } catch (err) {
            console.error("Unread count error:", err);
            res.status(500).json({ message: "Server error." });
        }
    });

    // POST /api/notifications/:id/approve — approves a pending account
    router.post("/:id/approve", async (req, res) => {
        try {
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

    // POST /api/notifications/clear — deletes all notifications for the user
    router.post("/clear", async (req, res) => {
        try {
            const userId = req.user.id;
            await db.query("DELETE FROM User_Notifications WHERE user_id = ?", [userId]);
            res.json({ message: "Your notifications have been cleared." });
        } catch (err) {
            console.error("Clear notifications error:", err);
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

async function recordNotification(db, { kind, title, body, relatedUrl, targetUserId = null, targetDesignationId = null, targetGroupId = null }, io = null) {
    let message;
    if (kind === "user_approval") {
        message = `ACTION:APPROVE_USER|${relatedUrl}|${title}|${body}`;
    } else {
        message = `${title}||${body}`;
    }
    
    try {
        // 1. Insert into master table
        const [result] = await db.query(
            `INSERT INTO Notifications (notif_message, target_user_id, target_designation_id, target_group_id) VALUES (?, ?, ?, ?)`,
            [message, targetUserId, targetDesignationId, targetGroupId]
        );
        const notifId = result.insertId;

        // 2. Fan-out to User_Notifications
        let notifiedUserIds = [];
        if (targetUserId) {
            await db.query(`INSERT INTO User_Notifications (user_id, notification_id) VALUES (?, ?)`, [targetUserId, notifId]);
            notifiedUserIds.push(targetUserId);
        } else if (targetDesignationId) {
            const [users] = await db.query(`SELECT employee_id FROM Employees WHERE job_title = ?`, [targetDesignationId]);
            for (const u of users) {
                await db.query(`INSERT INTO User_Notifications (user_id, notification_id) VALUES (?, ?)`, [u.employee_id, notifId]);
                notifiedUserIds.push(u.employee_id);
            }
        } else if (targetGroupId) {
            const [users] = await db.query(`SELECT employee_id FROM Employees_Groups WHERE group_id = ?`, [targetGroupId]);
            for (const u of users) {
                await db.query(`INSERT INTO User_Notifications (user_id, notification_id) VALUES (?, ?)`, [u.employee_id, notifId]);
                notifiedUserIds.push(u.employee_id);
            }
        } else {
            // Global
            const [allUsers] = await db.query(`SELECT employee_id FROM Employees`);
            for (const u of allUsers) {
                await db.query(`INSERT INTO User_Notifications (user_id, notification_id) VALUES (?, ?)`, [u.employee_id, notifId]);
                notifiedUserIds.push(u.employee_id);
            }
        }

        // 3. Real-time emission via Socket.io
        if (io) {
            const notificationPayload = {
                id: notifId,
                title,
                body,
                kind,
                createdAt: new Date()
            };

            if (targetUserId) {
                console.log(`[NOTIF] Emitting new_notification (kind=${kind}) to user_${targetUserId}`);
                io.to(`user_${targetUserId}`).emit('new_notification', notificationPayload);
            } else if (targetDesignationId || targetGroupId || notifiedUserIds.length > 0) {
                // If it was a group/designation or global, we can either emit to all rooms or use a broadcast.
                // To be safe and precise, we emit to the specific rooms we just populated.
                console.log(`[NOTIF] Emitting new_notification (kind=${kind}) to ${notifiedUserIds.length} users`);
                notifiedUserIds.forEach(uid => {
                    io.to(`user_${uid}`).emit('new_notification', notificationPayload);
                });
            }
        } else {
            console.log(`[NOTIF] Skipping Socket.IO emit for kind=${kind} — io is falsy`);
        }
    } catch (err) {
        console.warn("Notification persist failed:", err.message);
    }
}

module.exports = { notificationsRouter, recordNotification };

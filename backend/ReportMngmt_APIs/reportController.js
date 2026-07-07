const db = require('../server');
const { recordNotification } = require('../UserMngmt_APIs/notifications');
const { formatFullName } = require('../UserMngmt_APIs/userUtils');

module.exports = {
    getReports: async (req, res) => {
        try {
            const page = Math.max(1, parseInt(req.query.page, 10) || 1);
            const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 10));
            const offset = (page - 1) * pageSize;

            const countQuery = `SELECT COUNT(*) AS total FROM Report`;
            const [[{ total }]] = await db.query(countQuery);

            const query = `
                SELECT r.report_id, r.report_type, r.scope_type, r.generated_at,
                       CONCAT_WS(' ', e.first_name, e.last_name) AS generated_by_name,
                       r.period_start, r.period_end,
                       COALESCE(CONCAT_WS(' ', target_e.first_name, target_e.last_name), target_g.group_name, 'System-Wide') AS scope_target
                FROM Report r
                LEFT JOIN Employees e ON r.generated_by = e.employee_id
                LEFT JOIN Employees target_e ON r.scope_user_id = target_e.employee_id
                LEFT JOIN Job_Groups target_g ON r.scope_group_id = target_g.group_id
                ORDER BY r.generated_at DESC
                LIMIT ? OFFSET ?;
            `;
            const [rows] = await db.query(query, [pageSize, offset]);

            res.json({
                success: true,
                data: rows,
                pagination: { page, pageSize, total }
            });
        } catch (err) {
            console.error('Error fetching reports:', err);
            res.status(500).json({ success: false, message: `List failed: ${err.message}` });
        }
    },

    getReportDetails: async (req, res) => {
        try {
            const reportId = parseInt(req.params.id, 10);
            if (!reportId || isNaN(reportId)) {
                return res.status(400).json({ success: false, message: "Invalid reportId: must be a numeric value." });
            }

            const taskQuery = `
                SELECT t.task_id, t.title, t.description,
                       COALESCE(re.historical_status, t.status) AS historical_status,
                       COALESCE(tu.updated_text, 'No update logged during this period.') AS historical_notes,
                       COALESCE(CONCAT_WS(' ', e.first_name, e.last_name), g.group_name, 'Unassigned') AS assignee_name
                FROM Report_Entries re
                JOIN Tasks t ON re.task_id = t.task_id
                LEFT JOIN Task_Updates tu ON re.task_update_id = tu.update_id
                LEFT JOIN Employees e ON t.assigned_to_user = e.employee_id
                LEFT JOIN Job_Groups g ON t.assigned_to_group = g.group_id
                WHERE re.report_id = ?;
            `;
            const [tasks] = await db.query(taskQuery, [reportId]);

            const updatesQuery = `
                SELECT tu.task_id, tu.logged_at, tu.updated_text, tu.status_change,
                       CONCAT_WS(' ', e.first_name, e.last_name) AS updated_by_name
                FROM Task_Updates tu
                JOIN Report r ON r.report_id = ?
                LEFT JOIN Employees e ON tu.updated_by = e.employee_id
                WHERE tu.task_id IN (
                    SELECT task_id FROM Report_Entries WHERE report_id = ?
                )
                AND tu.logged_at BETWEEN r.period_start AND r.period_end
                AND tu.logged_at <= r.generated_at
                ORDER BY tu.logged_at DESC;
            `;
            const [updates] = await db.query(updatesQuery, [reportId, reportId]);

            const updatesByTask = {};
            updates.forEach(up => {
                if (!updatesByTask[up.task_id]) {
                    updatesByTask[up.task_id] = [];
                }
                updatesByTask[up.task_id].push(up);
            });

            tasks.forEach(t => {
                t.updates = updatesByTask[t.task_id] || [];
            });

            res.json({ success: true, data: tasks });
        } catch (err) {
            console.error("Fetch report details failed:", err);
            res.status(500).json({ success: false, message: `Fetch details failed: ${err.message}` });
        }
    },

    generateReport: async (req, res) => {
        let conn;
        try {
            const { reportType, scopeType, scopeValue, periodStart, periodEnd } = req.body;

            if (!periodStart || typeof periodStart !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(periodStart)) {
                return res.status(400).json({ success: false, message: "Invalid periodStart: must be a valid ISO date (YYYY-MM-DD)." });
            }
            if (!periodEnd || typeof periodEnd !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(periodEnd)) {
                return res.status(400).json({ success: false, message: "Invalid periodEnd: must be a valid ISO date (YYYY-MM-DD)." });
            }
            const startDate = periodStart.slice(0, 10);
            const endDate = periodEnd.slice(0, 10);
            if (new Date(endDate) < new Date(startDate)) {
                return res.status(400).json({ success: false, message: "periodEnd must not be before periodStart." });
            }

            const startDateTime = periodStart.includes(' ') || periodStart.includes('T') ? periodStart : `${periodStart} 00:00:00`;
            const endDateTime = periodEnd.includes(' ') || periodEnd.includes('T') ? periodEnd : `${periodEnd} 23:59:59`;

            const adminId = req.user.id;
            if (!adminId) {
                return res.status(401).json({ success: false, message: "Admin user not found." });
            }

            let scopeUserId = null;
            let scopeGroupId = null;

            if (scopeType === 'Individual') {
                if (!scopeValue || typeof scopeValue !== 'string' || !scopeValue.includes('@')) {
                    return res.status(400).json({ success: false, message: "Invalid scope value: a valid email address is required for Individual scope." });
                }
                const [su] = await db.query("SELECT employee_id FROM Employees WHERE email = ?", [scopeValue]);
                if (!su.length) {
                    return res.status(400).json({ success: false, message: `No user found with email "${scopeValue}".` });
                }
                scopeUserId = su[0].employee_id;
            } else if (scopeType === 'Group') {
                const groupId = parseInt(scopeValue, 10);
                if (isNaN(groupId) || groupId <= 0) {
                    return res.status(400).json({ success: false, message: "Invalid scope value: a numeric group ID is required for Group scope." });
                }
                const [gr] = await db.query("SELECT group_id FROM Job_Groups WHERE group_id = ?", [groupId]);
                if (!gr.length) {
                    return res.status(400).json({ success: false, message: `No group found with ID "${scopeValue}".` });
                }
                scopeGroupId = groupId;
            }

            conn = await db.getConnection();
            await conn.beginTransaction();

            const [reportResult] = await conn.query(
                `INSERT INTO Report (report_type, generated_by, scope_type, scope_user_id, scope_group_id, period_start, period_end)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [reportType, adminId, scopeType, scopeUserId, scopeGroupId, startDateTime, endDateTime]
            );
            const reportId = reportResult.insertId;

            let taskSql = `
                SELECT DISTINCT t.task_id
                FROM Tasks t
                LEFT JOIN Task_Updates tu ON t.task_id = tu.task_id
                WHERE (t.created_at BETWEEN ? AND ?)
                   OR (tu.logged_at BETWEEN ? AND ?)
            `;
            let taskParams = [
                startDateTime, endDateTime,
                startDateTime, endDateTime
            ];

            if (scopeType === 'Group') {
                taskSql += " AND t.assigned_to_group = ?";
                taskParams.push(scopeGroupId);
            } else if (scopeType === 'Individual') {
                taskSql += " AND t.assigned_to_user = ?";
                taskParams.push(scopeUserId);
            }

            const [tasks] = await conn.query(taskSql, taskParams);

            for (const t of tasks) {
                const [latestUpdate] = await conn.query(
                    "SELECT update_id FROM Task_Updates WHERE task_id = ? AND logged_at <= ? ORDER BY logged_at DESC LIMIT 1",
                    [t.task_id, endDateTime]
                );
                const updateId = latestUpdate[0]?.update_id || null;

                const [statusRows] = await conn.query(
                    `SELECT COALESCE(
                        (SELECT status_change FROM Task_Updates WHERE task_id = ? AND logged_at <= ? AND status_change IS NOT NULL ORDER BY logged_at DESC LIMIT 1),
                        (SELECT status FROM Tasks WHERE task_id = ?)
                    ) AS status`,
                    [t.task_id, endDateTime, t.task_id]
                );
                const historicalStatus = statusRows[0]?.status || 'pending';

                await conn.query(
                    "INSERT INTO Report_Entries (task_id, report_id, task_update_id, historical_status) VALUES (?, ?, ?, ?)",
                    [t.task_id, reportId, updateId, historicalStatus]
                );
            }

            await conn.commit();
            conn.release();
            conn = null;

            const io = req.app.get('io');
            io.emit("reportGenerated", { reportId, title: `${reportType} Report Created`, by: req.user.email });

            const [adminRows] = await db.query("SELECT first_name, last_name, suffix FROM Employees WHERE email = ?", [req.user.email]);
            const adminName = formatFullName(adminRows[0]);

            await recordNotification(db, {
                kind: "report_generated",
                title: "Report Generated",
                body: `A new report was generated by ${adminName}`,
                relatedUrl: null
            }, io);

            res.json({ success: true, data: "Report Snapshot Created Successfully!" });
        } catch (err) {
            if (conn) {
                try { await conn.rollback(); } catch (_) {}
                try { conn.release(); } catch (_) {}
            }
            console.error("Generation failed:", err);
            res.status(500).json({ success: false, message: `Generation failed: ${err.message}` });
        }
    },

    deleteReport: async (req, res) => {
        try {
            const reportId = parseInt(req.params.id, 10);
            const adminEmail = req.user.email;
            let adminName = 'An administrator';

            const [userRows] = await db.query("SELECT CONCAT_WS(' ', first_name, last_name) as name FROM Employees WHERE email = ?", [adminEmail]);
            if (userRows.length > 0) adminName = userRows[0].name;

            const [deleteResult] = await db.query("DELETE FROM Report WHERE report_id = ?", [reportId]);

            if (deleteResult.affectedRows === 0) {
                return res.status(404).json({ success: false, message: "Report not found. Nothing was deleted." });
            }

            const io = req.app.get('io');
            io.emit("reportDeleted", reportId);

            await recordNotification(db, {
                kind: "report_deleted",
                title: "Report Deleted",
                body: `${adminName} deleted a report snapshot.`,
                relatedUrl: null
            }, io);

            res.json({ success: true, data: "Report deleted successfully." });
        } catch (err) {
            console.error("Deletion failed:", err);
            res.status(500).json({ success: false, message: `Deletion failed: ${err.message}` });
        }
    }
};

/**
 * reportHandlers.js (PROFESSIONAL PROTOTYPE - REFINED)
 * Purpose: Advanced real-time report management with Data Integrity Snapshotting.
 * Standard: Socket.io Event-Driven Architecture + Audit-Proof Snapshots.
 */

const { recordNotification } = require('../UserMngmt_APIs/notifications');
const { formatFullName } = require('../UserMngmt_APIs/userUtils');

async function registerReportHandlers(socket, db, io) {
    /**
     * 1. GET ALL REPORTS (History List)
     */
    socket.on("getReports", async () => {
        try {
            const query = `
                SELECT r.report_id, r.report_type, r.scope_type, r.generated_at,
                       CONCAT_WS(' ', e.first_name, e.last_name) AS generated_by_name,
                       r.period_start, r.period_end,
                       COALESCE(CONCAT_WS(' ', target_e.first_name, target_e.last_name), target_g.group_name, 'System-Wide') AS scope_target
                FROM Report r
                LEFT JOIN Employees e ON r.generated_by = e.employee_id
                LEFT JOIN Employees target_e ON r.scope_user_id = target_e.employee_id
                LEFT JOIN Job_Groups target_g ON r.scope_group_id = target_g.group_id
                ORDER BY r.generated_at DESC;
            `;
            const [rows] = await db.query(query);
            
            socket.emit("reportLog", { 
                success: true, 
                stage: "list", 
                data: rows 
            });
        } catch (err) {
            socket.emit("reportLog", { success: false, rawData: `List failed: ${err.message}` });
        }
    });

    /**
     * 2. GET REPORT DETAILS (Snapshot View)
     */
    socket.on("getReportDetails", async (reportId) => {
        try {
            const taskQuery = `
                SELECT t.task_id, t.title, t.priority, t.description,
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

            // Fetch all updates for these tasks during the report period, up to the report's generation time
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

            // Group updates by task_id
            const updatesByTask = {};
            updates.forEach(up => {
                if (!updatesByTask[up.task_id]) {
                    updatesByTask[up.task_id] = [];
                }
                updatesByTask[up.task_id].push(up);
            });

            // Attach updates array to each task
            tasks.forEach(t => {
                t.updates = updatesByTask[t.task_id] || [];
            });
            
            socket.emit("reportLog", { 
                success: true, 
                stage: "details", 
                data: tasks 
            });
        } catch (err) {
            console.error("Fetch report details failed:", err);
            socket.emit("reportLog", { success: false, rawData: `Fetch details failed: ${err.message}` });
        }
    });

    /**
     * 3. GENERATE NEW REPORT
     */
    socket.on("generateReport", async (data) => {
        const { reportType, scopeType, scopeValue, periodStart, periodEnd, generatedByEmail } = data;
        
        // Normalize start and end date boundaries to include full days
        const startDateTime = periodStart.includes(' ') || periodStart.includes('T') ? periodStart : `${periodStart} 00:00:00`;
        const endDateTime = periodEnd.includes(' ') || periodEnd.includes('T') ? periodEnd : `${periodEnd} 23:59:59`;

        try {
            const [userRows] = await db.query("SELECT employee_id FROM Employees WHERE email = ?", [generatedByEmail]);
            const adminId = userRows[0]?.employee_id;
            if (!adminId) throw new Error("Admin user not found.");

            let scopeUserId = null;
            let scopeGroupId = null;

            if (scopeType === 'Individual') {
                const [su] = await db.query("SELECT employee_id FROM Employees WHERE email = ?", [scopeValue]);
                scopeUserId = su[0]?.employee_id;
            } else if (scopeType === 'Group') {
                scopeGroupId = parseInt(scopeValue);
            }

            const [reportResult] = await db.query(
                `INSERT INTO Report (report_type, generated_by, scope_type, scope_user_id, scope_group_id, period_start, period_end) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [reportType, adminId, scopeType, scopeUserId, scopeGroupId, startDateTime, endDateTime]
            );
            const reportId = reportResult.insertId;

            // Identify tasks that were active, due, or created during this period
            let taskSql = `
                SELECT DISTINCT t.task_id 
                FROM Tasks t
                LEFT JOIN Task_Updates tu ON t.task_id = tu.task_id
                WHERE ((t.due_date BETWEEN ? AND ?)
                   OR (t.created_at BETWEEN ? AND ?)
                   OR (tu.logged_at BETWEEN ? AND ?))
            `;
            let taskParams = [
                startDateTime, endDateTime,
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

            const [tasks] = await db.query(taskSql, taskParams);

            for (const t of tasks) {
                const [latestUpdate] = await db.query(
                    "SELECT update_id FROM Task_Updates WHERE task_id = ? AND logged_at <= ? ORDER BY logged_at DESC LIMIT 1",
                    [t.task_id, endDateTime]
                );
                const updateId = latestUpdate[0]?.update_id || null;

                // Find the task's status as of endDateTime (the end of the report period)
                const [statusRows] = await db.query(
                    `SELECT COALESCE(
                        (SELECT status_change FROM Task_Updates WHERE task_id = ? AND logged_at <= ? AND status_change IS NOT NULL ORDER BY logged_at DESC LIMIT 1),
                        (SELECT status FROM Tasks WHERE task_id = ?)
                    ) AS status`,
                    [t.task_id, endDateTime, t.task_id]
                );
                const historicalStatus = statusRows[0]?.status || 'pending';

                await db.query(
                    "INSERT INTO Report_Entries (task_id, report_id, task_update_id, historical_status) VALUES (?, ?, ?, ?)",
                    [t.task_id, reportId, updateId, historicalStatus]
                );
            }

            io.emit("reportGenerated", { reportId, title: `${reportType} Report Created`, by: generatedByEmail });

            // GLOBAL NOTIFICATION: Notify everyone that a report was generated
            const [adminRows] = await db.query("SELECT first_name, last_name, suffix FROM Employees WHERE email = ?", [generatedByEmail]);
            const adminName = formatFullName(adminRows[0]);

            await recordNotification(db, {
                kind: "report_generated",
                title: "Report Generated",
                body: `A new report was generated by ${adminName}`,
                relatedUrl: null
            });

            socket.emit("reportLog", { 
                success: true, 
                stage: "generate", 
                rawData: "Report Snapshot Created Successfully!" 
            });

        } catch (err) {
            console.error("Generation failed:", err);
            socket.emit("reportLog", { success: false, rawData: `Generation failed: ${err.message}` });
        }
    });

    /**
     * 4. DELETE REPORT
     */
    socket.on("deleteReport", async (reportId) => {
        try {
            // To get the admin name for the notification, we might need the current socket's email
            // In this Socket implementation, user identification is often handled via a custom property
            // assigned during session registration (e.g., socket.userEmail)
            const adminEmail = socket.userEmail;
            let adminName = 'An administrator';
            
            if (adminEmail) {
                const [userRows] = await db.query("SELECT CONCAT_WS(' ', first_name, last_name) as name FROM Employees WHERE email = ?", [adminEmail]);
                if (userRows.length > 0) adminName = userRows[0].name;
            }

            await db.query("DELETE FROM Report WHERE report_id = ?", [reportId]);
            
            // Broadcast to all admins to sync their history list
            io.emit("reportDeleted", reportId);

            // GLOBAL NOTIFICATION: Notify everyone that a report was deleted
            await recordNotification(db, {
                kind: "report_deleted",
                title: "Report Deleted",
                body: `${adminName} deleted a report snapshot.`,
                relatedUrl: null
            });

            socket.emit("reportLog", { 
                success: true, 
                stage: "delete", 
                rawData: "Report deleted successfully." 
            });
        } catch (err) {
            console.error("Deletion failed:", err);
            socket.emit("reportLog", { success: false, rawData: `Deletion failed: ${err.message}` });
        }
    });
}

async function initReportModule(db) {
    console.log('Checking Report_Entries schema for historical_status...');
    try {
        const [columns] = await db.query("SHOW COLUMNS FROM `Report_Entries` LIKE 'historical_status'");
        if (columns.length === 0) {
            console.log('[MIGRATION] Altering Report_Entries table to add historical_status...');
            await db.query("ALTER TABLE `Report_Entries` ADD COLUMN `historical_status` VARCHAR(50) DEFAULT NULL");
            console.log('[MIGRATION] Column historical_status added successfully.');
        }

        console.log('[MIGRATION] Checking if backfill is needed for report entries...');
        const backfillQuery = `
            UPDATE Report_Entries re
            JOIN Tasks t ON re.task_id = t.task_id
            JOIN Report r ON re.report_id = r.report_id
            SET re.historical_status = COALESCE(
                (
                    SELECT tu.status_change 
                    FROM Task_Updates tu 
                    WHERE tu.task_id = re.task_id 
                      AND tu.logged_at <= r.period_end 
                      AND tu.status_change IS NOT NULL 
                    ORDER BY tu.logged_at DESC 
                    LIMIT 1
                ),
                t.status
            )
            WHERE re.historical_status IS NULL
        `;
        const [result] = await db.query(backfillQuery);
        if (result.affectedRows > 0) {
            console.log(`[MIGRATION] Backfill complete. Affected rows: ${result.affectedRows}`);
        } else {
            console.log('[MIGRATION] No backfill needed.');
        }
    } catch (err) {
        console.error('[MIGRATION] Database migration/backfill in initReportModule failed:', err);
    }
}

module.exports = { registerReportHandlers, initReportModule };

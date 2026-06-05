/**
 * reportHandlers.js (PROFESSIONAL PROTOTYPE - REFINED)
 * Purpose: Advanced real-time report management with Data Integrity Snapshotting.
 * Standard: Socket.io Event-Driven Architecture + Audit-Proof Snapshots.
 */

async function reportAPI(io, db) {
    io.on("connection", (socket) => {
        console.log("Reports API: Admin connected.");

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
                // Fetch report dates to filter updates accurately
                const [reportRows] = await db.query("SELECT period_start, period_end FROM Report WHERE report_id = ?", [reportId]);
                if (reportRows.length === 0) {
                    throw new Error("Report not found");
                }
                const { period_start, period_end } = reportRows[0];

                const taskQuery = `
                    SELECT t.task_id, t.title, t.priority,
                           COALESCE(tu.status_change, t.status) AS historical_status,
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

                // Fetch all updates for these tasks during the report period
                const updatesQuery = `
                    SELECT tu.task_id, tu.logged_at, tu.updated_text, tu.status_change,
                           CONCAT_WS(' ', e.first_name, e.last_name) AS updated_by_name
                    FROM Task_Updates tu
                    LEFT JOIN Employees e ON tu.updated_by = e.employee_id
                    WHERE tu.task_id IN (
                        SELECT task_id FROM Report_Entries WHERE report_id = ?
                    )
                    AND tu.logged_at BETWEEN ? AND ?
                    ORDER BY tu.logged_at DESC;
                `;
                const [updates] = await db.query(updatesQuery, [reportId, period_start, period_end]);

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
                    await db.query(
                        "INSERT INTO Report_Entries (task_id, report_id, task_update_id) VALUES (?, ?, ?)",
                        [t.task_id, reportId, updateId]
                    );
                }

                io.emit("reportGenerated", { reportId, title: `${reportType} Report Created`, by: generatedByEmail });

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
                await db.query("DELETE FROM Report WHERE report_id = ?", [reportId]);
                
                // Broadcast to all admins to sync their history list
                io.emit("reportDeleted", reportId);

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
    });
}

module.exports = { reportAPI };

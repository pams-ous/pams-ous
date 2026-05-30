/**
 * reportHandlers.js (PROFESSIONAL PROTOTYPE)
 * Purpose: Advanced real-time report management with Data Integrity Snapshotting.
 * Standard: Socket.io Event-Driven Architecture + Audit-Proof Snapshots.
 */

async function reportAPI(io, db) {
    io.on("connection", (socket) => {
        console.log("Reports API: Admin connected.");

        /**
         * 1. GET ALL REPORTS (History List)
         * Fetches a high-level list of all generated reports for the sidebar/history.
         */
        socket.on("getReports", async () => {
            try {
                const query = `
                    SELECT r.report_id, r.report_type, r.scope_type, r.generated_at,
                           CONCAT_WS(' ', e.first_name, e.last_name) AS generated_by_name,
                           r.period_start, r.period_end
                    FROM Report r
                    LEFT JOIN Employees e ON r.generated_by = e.employee_id
                    ORDER BY r.generated_at DESC;
                `;
                const [rows] = await db.query(query);
                
                socket.emit("reportLog", { 
                    success: true, 
                    stage: "list", 
                    data: rows 
                });
            } catch (err) {
                console.error("Fetch reports failed:", err);
                socket.emit("reportLog", { success: false, rawData: `List failed: ${err.message}` });
            }
        });

        /**
         * 2. GET REPORT DETAILS (Snapshot View)
         * This is the "Audit Trail" logic. It joins the junction table to show
         * tasks and notes exactly as they were when the report was generated.
         */
        socket.on("getReportDetails", async (reportId) => {
            try {
                // Fetch the tasks linked to this report via Report_Entries.
                // We join Task_Updates using the 'task_update_id' snapshot captured at generation time.
                const taskQuery = `
                    SELECT t.title, t.priority,
                           COALESCE(tu.status_change, t.status) AS historical_status,
                           COALESCE(tu.updated_text, 'No update logged during this period.') AS historical_notes,
                           CONCAT_WS(' ', e.first_name, e.last_name) AS assignee_name
                    FROM Report_Entries re
                    JOIN Tasks t ON re.task_id = t.task_id
                    LEFT JOIN Task_Updates tu ON re.task_update_id = tu.update_id
                    LEFT JOIN Employees e ON t.assigned_to_user = e.employee_id
                    WHERE re.report_id = ?;
                `;
                const [tasks] = await db.query(taskQuery, [reportId]);
                
                socket.emit("reportLog", { 
                    success: true, 
                    stage: "details", 
                    data: tasks 
                });
            } catch (err) {
                console.error("Details failed:", err);
                socket.emit("reportLog", { success: false, rawData: `Fetch details failed: ${err.message}` });
            }
        });

        /**
         * 3. GENERATE NEW REPORT (Snapshot Generator)
         * Logic:
         * A. Create the Report header.
         * B. Filter Tasks by scope (All/Group/Individual) and Due Date.
         * C. Find the LATEST update for each task and link it.
         */
        socket.on("generateReport", async (data) => {
            const { reportType, scopeType, scopeValue, periodStart, periodEnd, generatedByEmail } = data;
            
            try {
                // Step A: Find the admin generating the report
                const [userRows] = await db.query("SELECT employee_id FROM Employees WHERE email = ?", [generatedByEmail]);
                const adminId = userRows[0]?.employee_id;
                if (!adminId) throw new Error("Admin user not found.");

                // Step B: Insert the Report Record
                const [reportResult] = await db.query(
                    `INSERT INTO Report (report_type, generated_by, scope_type, period_start, period_end) 
                     VALUES (?, ?, ?, ?, ?)`,
                    [reportType, adminId, scopeType, periodStart, periodEnd]
                );
                const reportId = reportResult.insertId;

                // Step C: Identify all tasks in scope
                let taskSql = "SELECT task_id FROM Tasks WHERE due_date BETWEEN ? AND ?";
                let taskParams = [periodStart, periodEnd];

                if (scopeType === 'Group') {
                    taskSql += " AND assigned_to_group = ?";
                    taskParams.push(scopeValue); // ID of the group
                } else if (scopeType === 'Individual') {
                    taskSql += " AND assigned_to_user = (SELECT employee_id FROM Employees WHERE email = ? LIMIT 1)";
                    taskParams.push(scopeValue); // Email of the user
                }

                const [tasks] = await db.query(taskSql, taskParams);

                // Step D: CAPTURE SNAPSHOTS
                // For every task found, we find the most recent update ID to lock it into this report.
                for (const t of tasks) {
                    const [latestUpdate] = await db.query(
                        "SELECT update_id FROM Task_Updates WHERE task_id = ? ORDER BY logged_at DESC LIMIT 1",
                        [t.task_id]
                    );
                    
                    const updateId = latestUpdate[0]?.update_id || null;

                    await db.query(
                        "INSERT INTO Report_Entries (task_id, report_id, task_update_id) VALUES (?, ?, ?)",
                        [t.task_id, reportId, updateId]
                    );
                }

                // Step E: REAL-TIME BROADCAST
                // Notifies every connected admin that a new report is ready for viewing.
                io.emit("reportGenerated", {
                    reportId: reportId,
                    title: `${reportType} Accomplishment Report`,
                    by: generatedByEmail
                });

                socket.emit("reportLog", { 
                    success: true, 
                    stage: "generate", 
                    rawData: "Report Snapshot Created & Broadcasted!" 
                });

            } catch (err) {
                console.error("Generation failed:", err);
                socket.emit("reportLog", { success: false, rawData: `Generation failed: ${err.message}` });
            }
        });
    });
}

module.exports = { reportAPI };

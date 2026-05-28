// Report routes — generate, list, and fetch full reports.
// Mounts under /api/reports in server.js
//
// Schema notes:
//   - Report.report_type ENUM: 'Daily','Weekly','Annual'  (Title case)
//   - Report.scope_type  ENUM: 'Individual','Group','All' (Title case)
//   - Either scope_user_id (Individual) OR scope_group_id (Group) is set; both null for 'All'.

const express = require("express");
const { requireAuth } = require("../UserMngmt_APIs/auth");
const { requirePerm } = require("../UserMngmt_APIs/designations");

function reportsRouter(db) {
    const router = express.Router();

    // Every report route requires a valid session. Generating and deleting
    // reports additionally requires manage_reports.
    router.use(requireAuth);

    // GET /api/reports — history list, newest first
    router.get("/", async (req, res) => {
        try {
            const [rows] = await db.query(`
                SELECT r.report_id, r.report_type, r.scope_type, r.scope_user_id, r.scope_group_id,
                       r.period_start, r.period_end, r.generated_at,
                       r.generated_by,
                       CONCAT_WS(' ', e.first_name, e.last_name) AS generated_by_name,
                       CONCAT_WS(' ', su.first_name, su.last_name) AS scope_user_name,
                       g.group_name AS scope_group_name
                FROM Report r
                LEFT JOIN Employees e   ON r.generated_by   = e.employee_id
                LEFT JOIN Employees su  ON r.scope_user_id  = su.employee_id
                LEFT JOIN Job_Groups g  ON r.scope_group_id = g.group_id
                ORDER BY r.generated_at DESC
            `);
            res.json({ reports: rows.map(formatReport) });
        } catch (err) {
            console.error("List reports error:", err);
            res.status(500).json({ message: "Server error." });
        }
    });

    // GET /api/reports/:id — full report: header, stats, and task breakdown
    router.get("/:id", async (req, res) => {
        try {
            const [reports] = await db.query(`
                SELECT r.*,
                       CONCAT_WS(' ', e.first_name, e.last_name) AS generated_by_name,
                       CONCAT_WS(' ', su.first_name, su.last_name) AS scope_user_name,
                       g.group_name AS scope_group_name
                FROM Report r
                LEFT JOIN Employees e   ON r.generated_by   = e.employee_id
                LEFT JOIN Employees su  ON r.scope_user_id  = su.employee_id
                LEFT JOIN Job_Groups g  ON r.scope_group_id = g.group_id
                WHERE r.report_id = ?
                LIMIT 1
            `, [req.params.id]);
            if (reports.length === 0) return res.status(404).json({ message: "Report not found." });

            // Tasks pulled in through report_entries — DISTINCT in case multiple update entries
            // reference the same task (current generateReport only emits one entry per task anyway).
            const [tasks] = await db.query(`
                SELECT DISTINCT t.task_id, t.title, t.description, t.priority, t.status, t.due_date,
                       CONCAT_WS(' ', e.first_name, e.last_name) AS assignee_name,
                       g.group_name AS assignee_group
                FROM Report_Entries re
                JOIN Tasks t ON re.task_id = t.task_id
                LEFT JOIN Employees  e ON t.assigned_to_user  = e.employee_id
                LEFT JOIN Job_Groups g ON t.assigned_to_group = g.group_id
                WHERE re.report_id = ?
                ORDER BY t.due_date ASC
            `, [req.params.id]);

            // Aggregate stats for the preview header cards
            const stats = { total: tasks.length, completed: 0, inProgress: 0, pending: 0, cancelled: 0 };
            for (const t of tasks) {
                const s = (t.status || "").toLowerCase();
                if (s === "completed")        stats.completed  += 1;
                else if (s === "in progress") stats.inProgress += 1;
                else if (s === "pending")     stats.pending    += 1;
                else if (s === "cancelled")   stats.cancelled  += 1;
            }

            res.json({
                report: formatReport(reports[0]),
                tasks:  tasks.map(t => ({
                    id:       t.task_id,
                    title:    t.title,
                    desc:     t.description,
                    priority: (t.priority || "").toUpperCase(),
                    status:   (t.status   || "").toUpperCase(),
                    dueDate:  t.due_date,
                    assignee: t.assignee_name || t.assignee_group || "Unassigned"
                })),
                stats
            });
        } catch (err) {
            console.error("Get report error:", err);
            res.status(500).json({ message: "Server error." });
        }
    });

    // POST /api/reports — generate a new report; auto-fills Report_Entries.
    // body: { reportType: 'Daily'|'Weekly'|'Annual',
    //         scopeType:  'Individual'|'Group'|'All',
    //         scopeUserEmail? | scopeGroupId?,
    //         periodStart (YYYY-MM-DD), periodEnd (YYYY-MM-DD) }
    // generatedBy is derived from the JWT — no body param needed.
    router.post("/", requirePerm(db, "manage_reports"), async (req, res) => {
        const {
            reportType, scopeType, scopeUserEmail, scopeGroupId,
            periodStart, periodEnd
        } = req.body || {};

        const type  = normalizeReportType(reportType);
        const scope = normalizeScopeType(scopeType);
        if (!type)  return res.status(400).json({ message: "reportType must be Daily, Weekly or Annual." });
        if (!scope) return res.status(400).json({ message: "scopeType must be Individual, Group, or All." });
        if (!periodStart || !periodEnd) {
            return res.status(400).json({ message: "periodStart and periodEnd are required." });
        }

        try {
            // Use the authenticated user's employee_id directly — avoids an email
            // lookup that can fail when localStorage is stale after a DB change.
            const generatedBy = req.user.sub;

            let scopeUserId  = null;
            let scopeGroupNo = null;
            if (scope === "Individual") {
                if (!scopeUserEmail) return res.status(400).json({ message: "scopeUserEmail required for Individual scope." });
                const [u] = await db.query(
                    "SELECT employee_id FROM Employees WHERE email = ? LIMIT 1", [scopeUserEmail]
                );
                if (u.length === 0) return res.status(400).json({ message: "Scoped user not found." });
                scopeUserId = u[0].employee_id;
            } else if (scope === "Group") {
                if (!scopeGroupId) return res.status(400).json({ message: "scopeGroupId required for Group scope." });
                scopeGroupNo = parseInt(scopeGroupId, 10);
            }

            const [result] = await db.query(
                `INSERT INTO Report
                    (report_type, generated_by, scope_type, scope_user_id, scope_group_id,
                     period_start, period_end)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [type, generatedBy, scope, scopeUserId, scopeGroupNo, periodStart, periodEnd]
            );
            const reportId = result.insertId;

            // Collect in-scope tasks based on the discriminator + period
            let taskSql, taskParams;
            if (scope === "All") {
                taskSql    = "SELECT task_id FROM Tasks WHERE due_date BETWEEN ? AND ?";
                taskParams = [periodStart, periodEnd];
            } else if (scope === "Group") {
                taskSql    = "SELECT task_id FROM Tasks WHERE assigned_to_group = ? AND due_date BETWEEN ? AND ?";
                taskParams = [scopeGroupNo, periodStart, periodEnd];
            } else { // Individual
                taskSql    = "SELECT task_id FROM Tasks WHERE assigned_to_user = ? AND due_date BETWEEN ? AND ?";
                taskParams = [scopeUserId, periodStart, periodEnd];
            }
            const [tasks] = await db.query(taskSql, taskParams);

            // One report_entry per in-scope task; link to its most recent update (if any).
            // Schema makes task_update_id nullable so "no updates" is valid.
            for (const t of tasks) {
                const [latest] = await db.query(
                    "SELECT update_id FROM Task_Updates WHERE task_id = ? ORDER BY logged_at DESC LIMIT 1",
                    [t.task_id]
                );
                await db.query(
                    "INSERT INTO Report_Entries (task_update_id, task_id, report_id) VALUES (?, ?, ?)",
                    [latest[0]?.update_id || null, t.task_id, reportId]
                );
            }

            res.status(201).json({
                message:   `${type} report generated.`,
                reportId,
                taskCount: tasks.length
            });
        } catch (err) {
            console.error("Generate report error:", err);
            res.status(500).json({ message: "Server error." });
        }
    });

    // DELETE /api/reports/:id — cascades through Report_Entries via FK
    router.delete("/:id", requirePerm(db, "manage_reports"), async (req, res) => {
        try {
            const [result] = await db.query("DELETE FROM Report WHERE report_id = ?", [req.params.id]);
            if (result.affectedRows === 0) return res.status(404).json({ message: "Report not found." });
            res.json({ message: "Report deleted." });
        } catch (err) {
            console.error("Delete report error:", err);
            res.status(500).json({ message: "Server error." });
        }
    });

    return router;
}

function normalizeReportType(s) {
    const v = String(s || "").toLowerCase();
    if (v === "daily")   return "Daily";
    if (v === "weekly")  return "Weekly";
    if (v === "annual" || v === "yearly") return "Annual";
    return null;
}

function normalizeScopeType(s) {
    const v = String(s || "").toLowerCase();
    if (v === "individual" || v === "user")  return "Individual";
    if (v === "group")                       return "Group";
    if (v === "all" || v === "system_wide" || v === "system-wide") return "All";
    return null;
}

function formatReport(r) {
    const scopeLabel =
        r.scope_type === "All"        ? "ALL"
      : r.scope_type === "Group"      ? (r.scope_group_name || `Group ${r.scope_group_id}`)
      : r.scope_user_name             ? r.scope_user_name
      : "Individual";

    const period = `${fmt(r.period_start)} – ${fmt(r.period_end)}`;

    return {
        id:             r.report_id,
        type:           r.report_type,
        scope:          r.scope_type,
        scopeUserId:    r.scope_user_id,
        scopeUserName:  r.scope_user_name,
        scopeGroupId:   r.scope_group_id,
        scopeGroupName: r.scope_group_name,
        scopeLabel,
        periodStart:    r.period_start,
        periodEnd:      r.period_end,
        period,
        generatedAt:    r.generated_at,
        generatedBy:    r.generated_by,
        generatedByName: r.generated_by_name,
        title: `${r.report_type} Accomplishment Report${r.scope_type === "All" ? "" : ` — ${scopeLabel}`}`
    };
}

function fmt(d) {
    if (!d) return "";
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return String(d);
    const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${m[dt.getMonth()]} ${dt.getDate()}, ${dt.getFullYear()}`;
}

module.exports = { reportsRouter };

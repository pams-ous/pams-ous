// Dashboard aggregates — feeds the stat cards, charts, and rollups on dashboard.html.
// Mounts under /api/dashboard in server.js.
//
// Data-isolation rule (Nov-2026 fix):
//   ADMIN sees system-wide totals; MEMBER sees only tasks assigned to them
//   directly, or to a Job_Group they belong to. The same predicate is reused
//   by routes/TaskMgmt_APIs/tasks.js so the red banner, stat cards, and the
//   dashboard task table agree.

const express = require("express");
const { requireAuth } = require("../../UserMngmt_APIs/auth");

// Build the `(WHERE clause, params)` pair that scopes a Tasks query to the
// current user when they are a MEMBER. Admins get an open scope.
//
// Returns { sql, params } where `sql` is either "" or " AND (... )".
// Pass the result through as a string interpolation into the query template;
// the params are appended in the same order they're referenced in the SQL.
function scopeForUser(req, alias = "t") {
    if (req.user?.role === "ADMIN") return { sql: "", params: [] };
    const empId = req.user.sub;
    return {
        sql: `
            AND (${alias}.assigned_to_user = ?
                 OR ${alias}.assigned_to_group IN (
                    SELECT group_id FROM Employees_Groups WHERE employee_id = ?
                 ))`,
        params: [empId, empId]
    };
}

function dashboardRouter(db) {
    const router = express.Router();
    router.use(requireAuth);

    // GET /api/dashboard/stats
    // Returns:
    //   counts: { total, completed, inProgress, pending, cancelled, overdue }
    //   priority: { LOW, MEDIUM, HIGH, URGENT }
    //   byGroup: [{ group: 'Group 1', pending, inProgress, completed, cancelled }, ...]
    //   recentUpdates: [{ name, text, time }, ...]
    //   groupProgress: [{ name, completed, total }, ...]
    router.get("/stats", async (req, res) => {
        try {
            const scope = scopeForUser(req);
            const isAdmin = req.user?.role === "ADMIN";

            const [[totals]] = await db.query(`
                SELECT
                    COUNT(*) AS total,
                    SUM(status = 'completed')   AS completed,
                    SUM(status = 'in progress') AS inProgress,
                    SUM(status = 'pending')     AS pending,
                    SUM(status = 'cancelled')   AS cancelled,
                    SUM(status NOT IN ('completed','cancelled') AND due_date < CURDATE()) AS overdue
                FROM Tasks t
                WHERE 1=1 ${scope.sql}
            `, scope.params);

            const [priority] = await db.query(`
                SELECT priority, COUNT(*) AS c
                FROM Tasks t
                WHERE 1=1 ${scope.sql}
                GROUP BY priority
            `, scope.params);

            // Per-group rollups stay global on the admin dashboard. For staff,
            // limit to groups the user belongs to and only count their tasks
            // within them (so the chart is meaningful without leaking others).
            const memberGroupFilter = isAdmin
                ? ""
                : "WHERE g.group_id IN (SELECT group_id FROM Employees_Groups WHERE employee_id = ?)";
            const memberGroupParams = isAdmin ? [] : [req.user.sub];

            const [byGroup] = await db.query(`
                SELECT g.group_name AS \`group\`,
                       SUM(t.status = 'pending')     AS pending,
                       SUM(t.status = 'in progress') AS inProgress,
                       SUM(t.status = 'completed')   AS completed,
                       SUM(t.status = 'cancelled')   AS cancelled
                FROM Job_Groups g
                LEFT JOIN Tasks t
                  ON t.assigned_to_group = g.group_id
                  ${isAdmin ? "" : "AND (t.assigned_to_user = ? OR t.assigned_to_group IN (SELECT group_id FROM Employees_Groups WHERE employee_id = ?))"}
                ${memberGroupFilter}
                GROUP BY g.group_id, g.group_name
                ORDER BY g.group_name
            `, isAdmin ? [] : [req.user.sub, req.user.sub, ...memberGroupParams]);

            // Recent updates: admins see global activity; staff see only their own
            // updates plus updates on tasks they own.
            const recentSql = isAdmin
                ? `SELECT CONCAT_WS(' ', e.first_name, e.last_name) AS name,
                          u.updated_text AS text,
                          u.logged_at    AS time
                   FROM Task_Updates u
                   LEFT JOIN Employees e ON u.updated_by = e.employee_id
                   ORDER BY u.logged_at DESC
                   LIMIT 8`
                : `SELECT CONCAT_WS(' ', e.first_name, e.last_name) AS name,
                          u.updated_text AS text,
                          u.logged_at    AS time
                   FROM Task_Updates u
                   LEFT JOIN Employees e ON u.updated_by = e.employee_id
                   LEFT JOIN Tasks t     ON u.task_id    = t.task_id
                   WHERE u.updated_by = ?
                      OR t.assigned_to_user = ?
                      OR t.assigned_to_group IN (
                            SELECT group_id FROM Employees_Groups WHERE employee_id = ?
                         )
                   ORDER BY u.logged_at DESC
                   LIMIT 8`;
            const [recentUpdates] = await db.query(
                recentSql,
                isAdmin ? [] : [req.user.sub, req.user.sub, req.user.sub]
            );

            const [groupProgress] = await db.query(`
                SELECT g.group_name AS name,
                       SUM(t.status = 'completed') AS completed,
                       COUNT(t.task_id)            AS total
                FROM Job_Groups g
                LEFT JOIN Tasks t
                  ON t.assigned_to_group = g.group_id
                  ${isAdmin ? "" : "AND (t.assigned_to_user = ? OR t.assigned_to_group IN (SELECT group_id FROM Employees_Groups WHERE employee_id = ?))"}
                ${memberGroupFilter}
                GROUP BY g.group_id, g.group_name
                ORDER BY g.group_name
            `, isAdmin ? [] : [req.user.sub, req.user.sub, ...memberGroupParams]);

            // Coerce SUM() bigints to plain numbers for JSON
            const counts = {
                total:      Number(totals.total)      || 0,
                completed:  Number(totals.completed)  || 0,
                inProgress: Number(totals.inProgress) || 0,
                pending:    Number(totals.pending)    || 0,
                cancelled:  Number(totals.cancelled)  || 0,
                overdue:    Number(totals.overdue)    || 0
            };
            const priorityMap = { LOW: 0, MEDIUM: 0, HIGH: 0, URGENT: 0 };
            for (const p of priority) priorityMap[String(p.priority).toUpperCase()] = Number(p.c) || 0;

            res.json({
                counts,
                priority: priorityMap,
                byGroup: byGroup.map(g => ({
                    group:      g.group,
                    pending:    Number(g.pending)    || 0,
                    inProgress: Number(g.inProgress) || 0,
                    completed:  Number(g.completed)  || 0,
                    cancelled:  Number(g.cancelled)  || 0
                })),
                recentUpdates,
                groupProgress: groupProgress.map(g => ({
                    name:      g.name,
                    completed: Number(g.completed) || 0,
                    total:     Number(g.total)     || 0
                }))
            });
        } catch (err) {
            console.error("Dashboard stats error:", err);
            res.status(500).json({ message: "Server error." });
        }
    });

    return router;
}

module.exports = { dashboardRouter };

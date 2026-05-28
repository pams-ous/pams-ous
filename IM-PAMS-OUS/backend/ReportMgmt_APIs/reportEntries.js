// Report_Entries routes — low-level access to the join table.
// Mounts under /api/report-entries in server.js.
// Most pages will use /api/reports/:id (which already joins) instead.

const express = require("express");
const { requireAuth } = require("../UserMngmt_APIs/auth");

function reportEntriesRouter(db) {
    const router = express.Router();

    router.use(requireAuth);

    // GET /api/report-entries?reportId=NN — raw entries with task + update detail joined in
    router.get("/", async (req, res) => {
        const { reportId } = req.query;
        if (!reportId) return res.status(400).json({ message: "reportId query param required." });

        try {
            const [rows] = await db.query(`
                SELECT re.id AS entry_id, re.report_id, re.task_id, re.task_update_id,
                       t.title, t.description, t.priority, t.status, t.due_date,
                       CONCAT_WS(' ', eu.first_name, eu.last_name) AS assignee_name,
                       g.group_name AS assigned_group,
                       tu.updated_text, tu.status_change, tu.attachment_url, tu.logged_at,
                       CONCAT_WS(' ', euu.first_name, euu.last_name) AS updated_by_name
                FROM Report_Entries re
                JOIN Tasks t ON re.task_id = t.task_id
                LEFT JOIN Employees  eu  ON t.assigned_to_user  = eu.employee_id
                LEFT JOIN Job_Groups g   ON t.assigned_to_group = g.group_id
                LEFT JOIN Task_Updates tu ON re.task_update_id  = tu.update_id
                LEFT JOIN Employees euu  ON tu.updated_by       = euu.employee_id
                WHERE re.report_id = ?
                ORDER BY t.due_date ASC
            `, [reportId]);
            res.json({ entries: rows });
        } catch (err) {
            console.error("List report entries error:", err);
            res.status(500).json({ message: "Server error." });
        }
    });

    return router;
}

module.exports = { reportEntriesRouter };

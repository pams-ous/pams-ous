/**
 * dashboardHandlers.js
 * Purpose: Provides aggregated statistics and real-time activity data for the main Dashboard.
 * Standards: Express REST API for initial load + Socket.io broadcast support.
 */

const { authenticateToken } = require('../UserMngmt_APIs/authMiddleware');

function dashboardAPI(app, io, db) {
    
    /**
     * GET /api/dashboard/stats
     * The primary data source for the Dashboard UI.
     * Combines multiple aggregations into a single response to reduce network overhead.
     */
    app.get('/api/dashboard/stats', async (req, res) => {
        try {
            // 1. Task Counts (Stat Cards)
            const [countsRows] = await db.query(`
                SELECT 
                    COUNT(*) as total,
                    COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) as completed,
                    COALESCE(SUM(CASE WHEN status = 'in progress' THEN 1 ELSE 0 END), 0) as inProgress,
                    COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) as pending,
                    0 as overdue
                FROM Tasks
            `);
            const counts = countsRows[0];

            // 2. Tasks By Group (Bar Chart)
            const [byGroup] = await db.query(`
                SELECT 
                    g.group_name as \`group\`,
                    COALESCE(SUM(CASE WHEN t.status = 'pending' THEN 1 ELSE 0 END), 0) as pending,
                    COALESCE(SUM(CASE WHEN t.status = 'in progress' THEN 1 ELSE 0 END), 0) as inProgress,
                    COALESCE(SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END), 0) as completed,
                    COALESCE(SUM(CASE WHEN t.status = 'cancelled' THEN 1 ELSE 0 END), 0) as cancelled
                FROM Job_Groups g
                LEFT JOIN Tasks t ON g.group_id = t.assigned_to_group
                GROUP BY g.group_id
            `);

            // 3. Group Progress (Horizontal bars)
            const [groupProgress] = await db.query(`
                SELECT 
                    g.group_name as name,
                    COALESCE(SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END), 0) as completed,
                    COUNT(t.task_id) as total
                FROM Job_Groups g
                LEFT JOIN Tasks t ON g.group_id = t.assigned_to_group
                GROUP BY g.group_id
                HAVING total > 0
            `);

            res.json({
                success: true,
                counts,
                byGroup,
                groupProgress
            });

        } catch (err) {
            console.error("Dashboard Stats Error:", err);
            res.status(500).json({ success: false, message: "Failed to load dashboard statistics." });
        }
    });

    /**
     * GET /api/accomplishments
     * Returns all task updates (accomplishments) with user name and task title, newest first.
     */
    app.get('/api/accomplishments', authenticateToken, async (req, res) => {
        try {
            const [accomplishments] = await db.query(`
                SELECT 
                    COALESCE(CONCAT(e.first_name, ' ', e.last_name), 'Unknown') as name, 
                    tu.updated_text as text, 
                    tu.logged_at as time,
                    t.title as task_title
                FROM Task_Updates tu
                LEFT JOIN Employees e ON tu.updated_by = e.employee_id
                JOIN Tasks t ON tu.task_id = t.task_id
                ORDER BY tu.logged_at DESC
            `);

            res.json({ success: true, accomplishments });
        } catch (err) {
            console.error("Accomplishments Error:", err);
            res.status(500).json({ success: false, message: "Failed to load accomplishments." });
        }
    });
}

module.exports = { dashboardAPI };

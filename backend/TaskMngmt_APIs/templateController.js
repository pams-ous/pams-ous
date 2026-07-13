// Template CRUD controller — admin-only operations for Task Templates
const db = require('./db');

module.exports = {
    /**
     * GET /api/tasks/templates
     * Returns all templates with assignee info for the picker dropdown.
     */
    getTemplates: async (req, res) => {
        try {
            const [rows] = await db.query(`
                SELECT 
                    t.template_id, t.title_pattern, t.description,
                    t.default_assignee_user, t.default_assignee_group,
                    t.is_repeating, t.repeat_limit, t.use_count, t.created_at,
                    e.first_name AS assignee_fn, e.last_name AS assignee_ln,
                    g.group_name AS assignee_group_name,
                    c.first_name AS creator_fn, c.last_name AS creator_ln
                FROM Task_Templates t
                LEFT JOIN Employees e ON t.default_assignee_user = e.employee_id
                LEFT JOIN Job_Groups g ON t.default_assignee_group = g.group_id
                LEFT JOIN Employees c ON t.created_by = c.employee_id
                ORDER BY t.use_count DESC, t.created_at DESC
            `);

            const templates = rows.map(r => ({
                id: r.template_id,
                titlePattern: r.title_pattern,
                description: r.description,
                assigneeUser: r.default_assignee_user,
                assigneeGroup: r.default_assignee_group,
                assigneeName: r.assignee_fn
                    ? `${r.assignee_fn} ${r.assignee_ln}`
                    : r.assignee_group_name || null,
                assigneeType: r.default_assignee_user ? 'user' : (r.default_assignee_group ? 'group' : null),
                isRepeating: !!r.is_repeating,
                repeatLimit: r.repeat_limit,
                useCount: r.use_count,
                createdBy: r.creator_fn ? `${r.creator_fn} ${r.creator_ln}` : null,
                createdAt: r.created_at
            }));

            res.json({ templates });
        } catch (err) {
            console.error('Error fetching templates:', err);
            res.status(500).json({ message: 'Failed to fetch templates' });
        }
    },

    /**
     * POST /api/tasks/templates
     * Create a new template.
     */
    createTemplate: async (req, res) => {
        try {
            const { titlePattern, description, assigneeEmail, groupId, isRepeating, repeatLimit } = req.body;

            if (!titlePattern || !titlePattern.trim()) {
                return res.status(400).json({ message: 'Title pattern is required.' });
            }

            let assigneeUser = null;
            let assigneeGroup = null;

            if (assigneeEmail) {
                const [emp] = await db.query('SELECT employee_id FROM Employees WHERE email = ?', [assigneeEmail]);
                if (emp.length > 0) assigneeUser = emp[0].employee_id;
            } else if (groupId) {
                assigneeGroup = parseInt(groupId);
            }

            const [result] = await db.query(`
                INSERT INTO Task_Templates (title_pattern, description, default_assignee_user, default_assignee_group, is_repeating, repeat_limit, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [
                titlePattern.trim(),
                description ? description.trim() : null,
                assigneeUser,
                assigneeGroup,
                isRepeating ? 1 : 0,
                repeatLimit ? parseInt(repeatLimit) : null,
                req.user.id
            ]);

            res.status(201).json({ message: 'Template created', templateId: result.insertId });
        } catch (err) {
            console.error('Error creating template:', err);
            res.status(500).json({ message: 'Failed to create template' });
        }
    },

    /**
     * PUT /api/tasks/templates/:id
     * Update an existing template.
     */
    updateTemplate: async (req, res) => {
        try {
            const { id } = req.params;
            const { titlePattern, description, assigneeEmail, groupId, isRepeating, repeatLimit } = req.body;

            if (!titlePattern || !titlePattern.trim()) {
                return res.status(400).json({ message: 'Title pattern is required.' });
            }

            let assigneeUser = null;
            let assigneeGroup = null;

            if (assigneeEmail) {
                const [emp] = await db.query('SELECT employee_id FROM Employees WHERE email = ?', [assigneeEmail]);
                if (emp.length > 0) assigneeUser = emp[0].employee_id;
            } else if (groupId) {
                assigneeGroup = parseInt(groupId);
            }

            await db.query(`
                UPDATE Task_Templates 
                SET title_pattern = ?, description = ?, default_assignee_user = ?, default_assignee_group = ?, is_repeating = ?, repeat_limit = ?
                WHERE template_id = ?
            `, [
                titlePattern.trim(),
                description ? description.trim() : null,
                assigneeUser,
                assigneeGroup,
                isRepeating ? 1 : 0,
                repeatLimit ? parseInt(repeatLimit) : null,
                id
            ]);

            res.json({ message: 'Template updated' });
        } catch (err) {
            console.error('Error updating template:', err);
            res.status(500).json({ message: 'Failed to update template' });
        }
    },

    /**
     * DELETE /api/tasks/templates/:id
     * Remove a template.
     */
    deleteTemplate: async (req, res) => {
        try {
            const { id } = req.params;
            const [result] = await db.query('DELETE FROM Task_Templates WHERE template_id = ?', [id]);

            if (result.affectedRows === 0) {
                return res.status(404).json({ message: 'Template not found' });
            }

            res.json({ message: 'Template deleted' });
        } catch (err) {
            console.error('Error deleting template:', err);
            res.status(500).json({ message: 'Failed to delete template' });
        }
    },

    /**
     * GET /api/tasks/templates/:id/next-counter
     * Returns the next sequence number for a template.
     * Counts how many tasks have been created from this template and returns count + 1.
     */
    getNextCounter: async (req, res) => {
        try {
            const { id } = req.params;

            const [rows] = await db.query(
                'SELECT COALESCE(MAX(repeat_counter), 0) AS max_counter FROM Tasks WHERE template_id = ?',
                [id]
            );

            const nextCounter = (rows[0].max_counter || 0) + 1;
            res.json({ nextCounter });
        } catch (err) {
            console.error('Error getting next counter:', err);
            res.status(500).json({ message: 'Failed to get next counter' });
        }
    }
};

// Data layer for interacting with the Tasks table
const db = require('./db');

module.exports = {
    findAll: async (options = {}) => {
        const { showAllCompleted } = options;
        
        let whereClause = '';
        
        // If the admin hasn't checked the box, apply the daily wipe rule
        if (!showAllCompleted) {
            whereClause = `
                WHERE t.status NOT IN ('completed', 'cancelled') 
                OR (
                    t.status IN ('completed', 'cancelled') 
                    AND (
                        -- Check if the status was actually changed to completed/cancelled TODAY in the history logs
                        EXISTS (
                            SELECT 1 FROM Task_Updates tu 
                            WHERE tu.task_id = t.task_id 
                            AND tu.status_change IN ('completed', 'cancelled')
                            AND DATE(tu.logged_at) = CURDATE()
                        )
                        -- Safety fallback: If a task has no history logs at all, fall back to updated_at
                        OR (
                            DATE(t.updated_at) = CURDATE()
                            AND NOT EXISTS (
                                SELECT 1 FROM Task_Updates tu 
                                WHERE tu.task_id = t.task_id 
                                AND tu.status_change IN ('completed', 'cancelled')
                            )
                        )
                    )
                )
            `;
        }

        const query = `
            SELECT 
                t.task_id as id, t.title, t.description, t.status,
                t.is_repeating, t.repeat_counter, t.repeat_limit, t.template_id,
                t.created_at as createdAt,
                t.updated_at as updatedAt,
                t.assigned_to_user,
                t.assigned_to_group,
                a.first_name as assignee_fn, a.last_name as assignee_ln,
                g.group_id, g.group_name,
                c.first_name as creator_fn, c.last_name as creator_ln
            FROM Tasks t
            LEFT JOIN Employees a ON t.assigned_to_user = a.employee_id
            LEFT JOIN Job_Groups g ON t.assigned_to_group = g.group_id
            LEFT JOIN Employees c ON t.assigned_by = c.employee_id
            ${whereClause}
            ORDER BY t.created_at DESC
        `;
        const [rows] = await db.query(query);
        return rows;
    },

    findById: async (id) => {
        const query = 'SELECT * FROM Tasks WHERE task_id = ?';
        const [rows] = await db.query(query, [id]);
        return rows[0] || null;
    },

    findEmployeeByEmail: async (email) => {
        const [rows] = await db.query('SELECT employee_id, first_name, last_name FROM Employees WHERE email = ?', [email]);
        return rows[0] || null;
    },

    create: async (taskData) => {
        const { title, description, status, assignedBy, assignedToUser, assignedToGroup, isRepeating, repeatCounter, repeatLimit, templateId } = taskData;
        const query = `
            INSERT INTO Tasks 
            (title, description, status, assigned_by, assigned_to_user, assigned_to_group, is_repeating, repeat_counter, repeat_limit, template_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const [result] = await db.query(query, [
            title, 
            description, 
            status, 
            assignedBy, 
            assignedToUser, 
            assignedToGroup,
            isRepeating ? 1 : 0,
            repeatCounter || null,
            repeatLimit || null,
            templateId || null
        ]);
        return result.insertId;
    },

    update: async (id, updateData) => {
        const fields = [];
        const values = [];

        // Complete coverage logic for full updates
        if (updateData.title !== undefined) { fields.push('title = ?'); values.push(updateData.title); }
        if (updateData.description !== undefined) { fields.push('description = ?'); values.push(updateData.description); }
        if (updateData.status !== undefined) { fields.push('status = ?'); values.push(updateData.status); }
        if (updateData.is_repeating !== undefined) { fields.push('is_repeating = ?'); values.push(updateData.is_repeating ? 1 : 0); }
        if (updateData.repeat_limit !== undefined) { fields.push('repeat_limit = ?'); values.push(updateData.repeat_limit); }
        
        if (fields.length === 0) return 0;

        fields.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);
        const query = `UPDATE Tasks SET ${fields.join(', ')} WHERE task_id = ?`;
        
        const [result] = await db.query(query, values);
        return result.affectedRows;
    },

    delete: async (id) => {
        const [result] = await db.query('DELETE FROM Tasks WHERE task_id = ?', [id]);
        return result.affectedRows;
    },

    logUpdate: async (taskId, userId, notes, statusChange, attachmentUrl = null) => {
        // Insert the history entry into Task_Updates
        const logQuery = `
            INSERT INTO Task_Updates (task_id, updated_by, updated_text, status_change, attachment_url)
            VALUES (?, ?, ?, ?, ?)
        `;
        // Normalize status_change for the update log enum (which uses underscores)
        const logStatus = statusChange ? statusChange.toLowerCase().replace(' ', '_') : null;
        await db.query(logQuery, [taskId, userId, notes, logStatus, attachmentUrl || null]);

        // If a status change was requested, update the main Tasks table status too
        if (statusChange) {
            // Normalize for Tasks enum (which uses spaces, e.g., 'in progress')
            const taskStatus = statusChange.toLowerCase().replace('_', ' ');
            const updateTaskQuery = `UPDATE Tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE task_id = ?`;
            await db.query(updateTaskQuery, [taskStatus, taskId]);
        }
        return true;
    },

    getUpdatesByTaskId: async (taskId) => {
        const query = `
            SELECT logged_at, updated_text, status_change, attachment_url
            FROM Task_Updates
            WHERE task_id = ?
            ORDER BY logged_at DESC
        `;
        const [rows] = await db.query(query, [taskId]);
        return rows;
    },

    autoResetStaleTasks: async () => {
        // finds all 'in progress' tasks older than 24 hours 
        // and updates them to 'pending' automatically.
        const query = `
            UPDATE Tasks 
            SET status = 'pending' 
            WHERE status = 'in progress' 
            AND created_at < NOW() - INTERVAL 24 HOUR
        `;
        const [result] = await db.query(query);
        return result.affectedRows;
    },

    /**
     * Increment template use_count when a task is created from it.
     */
    incrementTemplateUseCount: async (templateId) => {
        await db.query('UPDATE Task_Templates SET use_count = use_count + 1 WHERE template_id = ?', [templateId]);
    },

    /**
     * Creates the next instance of a repeating task after the current one is completed.
     * Returns the new task ID, or null if the task is not repeating.
     */
    createNextRepeat: async (completedTask) => {
        if (!completedTask.is_repeating) return null;

        const currentCounter = completedTask.repeat_counter || 1;
        const nextCounter = currentCounter + 1;

        // If a repeat_limit is set, stop the chain when we've reached it
        if (completedTask.repeat_limit && currentCounter >= completedTask.repeat_limit) {
            return null;
        }

        // Build the next title by incrementing the number in the title.
        let nextTitle;
        const counterPattern = new RegExp(`#${currentCounter}\\b`);
        const numPattern = new RegExp(`\\b${currentCounter}$`);

        if (counterPattern.test(completedTask.title)) {
            nextTitle = completedTask.title.replace(counterPattern, `#${nextCounter}`);
        } else if (numPattern.test(completedTask.title)) {
            nextTitle = completedTask.title.replace(numPattern, `${nextCounter}`);
        } else {
            // Fallback: append the next counter
            nextTitle = `${completedTask.title} #${nextCounter}`;
        }

        const newTaskId = await module.exports.create({
            title: nextTitle,
            description: completedTask.description,
            status: 'in progress',
            assignedBy: completedTask.assigned_by,
            assignedToUser: completedTask.assigned_to_user,
            assignedToGroup: completedTask.assigned_to_group,
            isRepeating: true,
            repeatCounter: nextCounter,
            repeatLimit: completedTask.repeat_limit,
            templateId: completedTask.template_id
        });

        return { newTaskId, nextTitle, nextCounter };
    }
};
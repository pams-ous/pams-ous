// Data layer for interacting with the Tasks table
const db = require('./db');

module.exports = {
    findAll: async () => {
        const query = `
            SELECT 
                t.task_id as id, t.title, t.description, t.priority, t.status, 
                t.due_date as dueDate, t.created_at as createdAt,
                a.first_name as assignee_fn, a.last_name as assignee_ln,
                g.group_id, g.group_name,
                c.first_name as creator_fn, c.last_name as creator_ln
            FROM Tasks t
            LEFT JOIN Employees a ON t.assigned_to_user = a.employee_id
            LEFT JOIN Job_Groups g ON t.assigned_to_group = g.group_id
            LEFT JOIN Employees c ON t.assigned_by = c.employee_id
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
        const [rows] = await db.query('SELECT employee_id FROM Employees WHERE email = ?', [email]);
        return rows[0] || null;
    },

    create: async (taskData) => {
        const { title, description, priority, dueDate, status, assignedBy, assignedToUser, assignedToGroup } = taskData;
        const query = `
            INSERT INTO Tasks 
            (title, description, priority, due_date, status, assigned_by, assigned_to_user, assigned_to_group)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const [result] = await db.query(query, [
            title, 
            description, 
            priority, 
            dueDate, 
            status, 
            assignedBy, 
            assignedToUser, 
            assignedToGroup
        ]);
        return result.insertId;
    },

    update: async (id, updateData) => {
        const fields = [];
        const values = [];

        // Complete coverage logic for full updates
        if (updateData.title !== undefined) { fields.push('title = ?'); values.push(updateData.title); }
        if (updateData.description !== undefined) { fields.push('description = ?'); values.push(updateData.description); }
        if (updateData.priority !== undefined) { fields.push('priority = ?'); values.push(updateData.priority); }
        if (updateData.dueDate !== undefined) { fields.push('due_date = ?'); values.push(updateData.dueDate); }
        if (updateData.status !== undefined) { fields.push('status = ?'); values.push(updateData.status); }
        
        if (fields.length === 0) return 0;

        values.push(id);
        const query = `UPDATE Tasks SET ${fields.join(', ')} WHERE task_id = ?`;
        
        const [result] = await db.query(query, values);
        return result.affectedRows;
    },

    delete: async (id) => {
        const [result] = await db.query('DELETE FROM Tasks WHERE task_id = ?', [id]);
        return result.affectedRows;
    }
};
//Data layer for interacting with the Tasks table
const db = require('./db');

module.exports = {
    findAll: async () => {//read
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

    findEmployeeByEmail: async (email) => {//check email if exists grabe employee_id
        const [rows] = await db.query('SELECT employee_id FROM Employees WHERE email = ?', [email]);
        return rows[0] || null;
    },

    create: async (taskData) => {//create new tasks
        const { title, description, priority, dueDate, status, assignedBy, assignedToUser, assignedToGroup } = taskData;
        const query = `
            INSERT INTO Tasks 
            (title, description, priority, due_date, status, assigned_by, assigned_to_user, assigned_to_group)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const [result] = await db.query(query, [
            title, 
            description || null, 
            priority, 
            dueDate, 
            status, 
            assignedBy, 
            assignedToUser || null, 
            assignedToGroup || null
        ]);
        return result.insertId;
    },

    update: async (id, updateData) => {//update operation
        // Dynamically build the update query based on what the frontend sent
        const fields = [];
        const values = [];

        if (updateData.title) { fields.push('title = ?'); values.push(updateData.title); }
        if (updateData.status) { fields.push('status = ?'); values.push(updateData.status); }
        
        if (fields.length === 0) return 0;

        values.push(id);
        const query = `UPDATE Tasks SET ${fields.join(', ')} WHERE task_id = ?`;
        
        const [result] = await db.query(query, values);
        return result.affectedRows;
    },

    delete: async (id) => {//delete operation
        const [result] = await db.query('DELETE FROM Tasks WHERE task_id = ?', [id]);
        return result.affectedRows;
    }
};
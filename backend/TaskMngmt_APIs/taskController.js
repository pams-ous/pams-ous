//Business logic, payload formatting, and enum translations

const Task = require('./taskModel');

const getInitials = (fName, lName) => {
    if (!fName && !lName) return '?';
    return `${(fName || '')[0] || ''}${(lName || '')[0] || ''}`.toUpperCase();
};

module.exports = {
    getTasks: async (req, res) => {//data-read system routing.if/else to transform flat db rows to multilayered json
        try {
            const rawTasks = await Task.findAll();

            // Format data to match exactly what task-board.js expects
            const formattedTasks = rawTasks.map(t => {//.map() function loops over every separate task row array entry (temporarily calling each row tracking object t)
                let assigneeObj = null;
                
                if (t.assignee_fn) {
                    assigneeObj = { 
                        name: `${t.assignee_fn} ${t.assignee_ln}`, 
                        type: 'user', 
                        initials: getInitials(t.assignee_fn, t.assignee_ln) 
                    };
                } else if (t.group_name) {
                    assigneeObj = { 
                        name: t.group_name, 
                        type: 'group', 
                        initials: t.group_name.substring(0, 2).toUpperCase() 
                    };
                }

                return {
                    id: t.id,
                    title: t.title,
                    description: t.description,
                    priority: t.priority.toUpperCase(),
                    status: t.status.toUpperCase(),
                    dueDate: t.dueDate,
                    createdAt: t.createdAt,
                    assignedByName: t.creator_fn ? `${t.creator_fn} ${t.creator_ln}` : 'System',
                    assignee: assigneeObj
                };
            });

            res.status(200).json({ tasks: formattedTasks });
        } catch (error) {
            console.error('Error fetching tasks:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    },

    createTask: async (req, res) => {//process new entry submissions (POST requests). Determine whether tasks for indiv || group
        try {
            const { title, description, priority, dueDate, status, assigneeEmail, groupId } = req.body;

            let assignedToUser = null;
            let assignedToGroup = null;

            // Resolve assignee mapping based on frontend payload
            if (assigneeEmail) {
                const employee = await Task.findEmployeeByEmail(assigneeEmail);
                if (employee) assignedToUser = employee.employee_id;
            } else if (groupId) {
                assignedToGroup = parseInt(groupId);
            }
            
            // below block is placeholder in case of errors in testing
            // just remove the multi-line comment and put in HARDCODED_ADMIN_ID an actual id from table
            // Fallback for assigned_by since schema requires it.             
            // assigned_by is NOT NULL
            /* 
            const HARDCODED_ADMIN_ID = '1';

            const newTaskId = await Task.create({
                title,
                description,
                priority: priority.toLowerCase(), // Convert 'HIGH' to 'high' for DB Enum
                dueDate,
                status: status.toLowerCase(),     // Convert 'PENDING' to 'pending' for DB Enum
                assignedBy: HARDCODED_ADMIN_ID,
                assignedToUser,
                assignedToGroup
            });
            */

            res.status(201).json({ message: 'Task created successfully', taskId: newTaskId });
        } catch (error) {
            console.error('Error creating task:', error);
            res.status(500).json({ message: 'Failed to create task' });
        }
    },

    updateTask: async (req, res) => {
        try {
            const { id } = req.params;
            const { title, status } = req.body; 
            
            const updatePayload = {};
            if (title) updatePayload.title = title;
            // Translate frontend 'IN PROGRESS' to db enum 'in progress'
            if (status) updatePayload.status = status.toLowerCase(); 

            const affectedRows = await Task.update(id, updatePayload);

            if (affectedRows === 0) {
                return res.status(404).json({ message: 'Task not found' });
            }

            res.status(200).json({ message: 'Task updated successfully' });
        } catch (error) {
            console.error('Error updating task:', error);
            res.status(500).json({ message: 'Failed to update task' });
        }
    },

    deleteTask: async (req, res) => {
        try {
            const { id } = req.params;
            const affectedRows = await Task.delete(id);

            if (affectedRows === 0) {
                return res.status(404).json({ message: 'Task not found' });
            }

            res.status(200).json({ message: 'Task deleted successfully' });
        } catch (error) {
            console.error('Error deleting task:', error);
            res.status(500).json({ message: 'Failed to delete task' });
        }
    }
};
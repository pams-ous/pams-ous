// Business logic, payload formatting, and enum translations

const Task = require('./taskModel');

const getInitials = (fName, lName) => {
    if (!fName && !lName) return '?';
    return `${(fName || '')[0] || ''}${(lName || '')[0] || ''}`.toUpperCase();
};

module.exports = (db) => { // Capture central db pool
    return {
        getTasks: async (req, res) => {
            try {
                const rawTasks = await Task.findAll(db); // Pass db pool

                const formattedTasks = rawTasks.map(t => {
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

        createTask: async (req, res) => {
            try {
                const { title, description, priority, dueDate, status, assigneeEmail, groupId } = req.body;
            
                let assignedToUser = null;
                let assignedToGroup = null;
            
                if (assigneeEmail) {
                    const employee = await Task.findEmployeeByEmail(db, assigneeEmail); // Pass db pool
                    if (employee) assignedToUser = employee.employee_id;
                } else if (groupId) {
                    assignedToGroup = parseInt(groupId);
                }

                const ADMIN_ID = '3764981a-f888-4a3f-9e50-1b1416141345';

                const newTaskId = await Task.create(db, { // Pass db pool
                    title,
                    description,
                    priority: priority.toLowerCase(), 
                    dueDate,
                    status: 'in progress',    
                    assignedBy: ADMIN_ID,
                    assignedToUser: assignedToUser,
                    assignedToGroup: assignedToGroup
                });

                res.status(201).json({ message: 'Task created successfully', taskId: newTaskId });
            } catch (error) {
                console.error('FULL ERROR DETAILS:', error); 
                res.status(500).json({ message: 'Failed to create task', details: error.message });
            }
        },

        updateTask: async (req, res) => {
            try {
                const { id } = req.params;
                const { title, status } = req.body; 
                
                const updatePayload = {};
                if (title) updatePayload.title = title;
                if (status) updatePayload.status = status.toLowerCase(); 

                const affectedRows = await Task.update(db, id, updatePayload); // Pass db pool

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
                const affectedRows = await Task.delete(db, id); // Pass db pool

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
};
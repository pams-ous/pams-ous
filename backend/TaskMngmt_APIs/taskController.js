// Business logic, payload formatting, and enum translations
//

const Task = require('./taskModel');

const getInitials = (fName, lName) => {
    if (!fName && !lName) return '?';
    return `${(fName || '')[0] || ''}${(lName || '')[0] || ''}`.toUpperCase();
};

module.exports = {
    getTasks: async (req, res) => {
        try {
            const rawTasks = await Task.findAll();

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
                    priority: t.priority ? t.priority.toUpperCase() : 'MEDIUM',
                    status: t.status ? t.status.toUpperCase() : 'PENDING',
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
            const { title, description, priority, dueDate, assigneeEmail, groupId } = req.body;
        
            //input validation
            if (!title || !title.trim()) {
                return res.status(400).json({ message: 'Task title is required' });
            }

            let assignedToUser = null;
            let assignedToGroup = null;
        
            if (assigneeEmail) {
                const employee = await Task.findEmployeeByEmail(assigneeEmail);
                if (employee) assignedToUser = employee.employee_id;
            } else if (groupId) {
                assignedToGroup = parseInt(groupId);
            }
            
            console.log("Decoded Token User Object:", req.user);

            //Extracting the actual authenticated creator
            const creatorId = req.user.id; 
            if (!creatorId) {
                return res.status(401).json({ message: 'Unauthorized: Complete profile credentials missing' });
            }

            const newTaskId = await Task.create({
                title: title.trim(),
                description: description ? description.trim() : null,
                priority: priority ? priority.toLowerCase() : 'medium', // Safe handling fallback
                dueDate: dueDate || null,
                status: 'in progress',    
                assignedBy: creatorId,
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
            const { title, description, priority, dueDate, status } = req.body; 
            const userRole = req.user.role ? req.user.role.toLowerCase() : 'staff';

            // 1. Fetch the existing task to perform status/permission business rule checks
            const existingTask = await Task.findById(id);
            if (!existingTask) {
                return res.status(404).json({ message: 'Task not found' });
            }

            // 2. Enforce Role & Modification Boundary Rules
            const isAuthorizedModifier = (userRole === 'admin' || userRole === 'chief');
            
            if (!isAuthorizedModifier) {
                // Regular personnel cannot change core task metadata
                if (title || description || priority || dueDate) {
                    return res.status(403).json({ message: 'Insufficient permissions to alter core task details.' });
                }
            }

            const currentStatus = existingTask.status.toLowerCase();
            if (status) {
                const targetStatus = status.toLowerCase();

                // Lock Terminal States: Regular users cannot resurrect completed or cancelled tasks
                if (!isAuthorizedModifier && (currentStatus === 'completed' || currentStatus === 'cancelled')) {
                    return res.status(403).json({ message: 'Cannot modify a finalized or cancelled task.' });
                }
            }

            // 3. Assemble dynamic payload mapping safely
            const updatePayload = {};
            if (isAuthorizedModifier) {
                if (title) updatePayload.title = title.trim();
                if (description !== undefined) updatePayload.description = description ? description.trim() : null;
                if (priority) updatePayload.priority = priority.toLowerCase();
                if (dueDate !== undefined) updatePayload.dueDate = dueDate || null;
            }
            
            if (status) updatePayload.status = status.toLowerCase(); 

            const affectedRows = await Task.update(id, updatePayload);
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
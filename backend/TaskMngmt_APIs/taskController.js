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
            // run auto reset first
            await Task.autoResetStaleTasks();

            // capture the query string sent by the admin checkbox (?completedSince=all)
            const { completedSince } = req.query;
            
            // pass the option down into the model
            const rawTasks = await Task.findAll({ 
                showAllCompleted: completedSince === 'all' 
            });

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

    getMyTasks: async (req, res) => {
        try {
            const userEmail = req.query.email;
            if (!userEmail) return res.status(400).json({ message: 'Email required' });

            // 1. Find the logged-in employee (Returns ONLY the ID based on our debug log)
            const employee = await Task.findEmployeeByEmail(userEmail);
            if (!employee) return res.status(404).json({ message: 'User not found' });

            // Extract the known, safe ID
            const targetId = employee.employee_id;

            // 2. Fetch all raw tasks
            const rawTasks = await Task.findAll();

            // 3. Match tasks strictly by ID (and exclude closed statuses)
            const myRawTasks = rawTasks.filter(t => {
                const matchesUser = t.assigned_to_user === targetId;
                
                // Exclude tasks that are completed or cancelled
                const isClosed = t.status === 'completed' || t.status === 'cancelled';
                
                return matchesUser && !isClosed;
            });

            // DEBUG: If it's STILL empty after this, uncomment the line below to see exactly what columns Task.findAll() provides
            // console.log("DEBUG - First Task from DB:", rawTasks[0]);

            // 4. Format perfectly for my-tasks.js to prevent UI rendering bugs
            const formattedTasks = myRawTasks.map(t => {
                let assigneeObj = null;
                // If your findAll() join provides names, we still build the object for the UI
                if (t.assignee_fn) {
                    assigneeObj = { 
                        name: `${t.assignee_fn} ${t.assignee_ln}`, 
                        type: 'user', 
                        initials: getInitials(t.assignee_fn, t.assignee_ln) 
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
                    updatedAt: t.updatedAt || t.createdAt, 
                    assignedByName: t.creator_fn ? `${t.creator_fn} ${t.creator_ln}` : 'System',
                    assignee: assigneeObj
                };
            });

            res.status(200).json({ tasks: formattedTasks });
        } catch (error) {
            console.error('Error fetching my tasks:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    },

    createTask: async (req, res) => {
        try {
            const { title, description, priority, dueDate, assigneeEmail, groupId } = req.body;
        
            // --- STRICT SERVER-SIDE VALIDATION ---
            if (!title || !title.trim()) {
                return res.status(400).json({ message: 'Task title is required.' });
            }
            if (!priority || !priority.trim()) {
                return res.status(400).json({ message: 'Priority is required.' });
            }
            if (!dueDate || !dueDate.trim()) {
                return res.status(400).json({ message: 'Due date is required.' });
            }
            if (!assigneeEmail && !groupId) {
                return res.status(400).json({ message: 'Task must be assigned to a user or group.' });
            }

            // Prevent past dates from bypassing the UI
            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');
            const todayStr = `${yyyy}-${mm}-${dd}`;

            if (dueDate < todayStr) {
                return res.status(400).json({ message: 'Due date cannot be set in the past.' });
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
            
            // ... (keep the rest of your createTask logic from extracting the creator down to the catch block) ...

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
            
            // failsafe. If an Admin directly forces a status change, log it so the daily wipe logic catches it
            if (status && status.toLowerCase() !== currentStatus) {
                const newStatus = status.toLowerCase();
                if (newStatus === 'completed' || newStatus === 'cancelled') {
                    await Task.logUpdate(id, req.user.id, 'Status forcefully updated via Admin panel', newStatus);
                }
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
    },

    logTaskUpdate: async (req, res) => {
        try {
            const { taskId, email, notes, statusChange } = req.body;
            if (!taskId || !notes || !email) {
                return res.status(400).json({ message: 'Task ID, email, and notes are required.' });
            }

            // Find employee ID from email
            const employee = await Task.findEmployeeByEmail(email);
            if (!employee) return res.status(404).json({ message: 'User not found' });

            await Task.logUpdate(taskId, employee.employee_id, notes, statusChange);
            res.status(200).json({ message: 'Update logged successfully' });
        } catch (error) {
            console.error('Error logging task update:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    },

    getTaskDetails: async (req, res) => {
        try {
            const { id } = req.params;
            const updates = await Task.getUpdatesByTaskId(id);
            
            // Map underscores back to spaces for frontend display uniformity
            const formattedUpdates = updates.map(u => ({
                ...u,
                status_change: u.status_change ? u.status_change.toUpperCase().replace('_', ' ') : null
            }));

            res.status(200).json({ updates: formattedUpdates });
        } catch (error) {
            console.error('Error fetching task details:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
};
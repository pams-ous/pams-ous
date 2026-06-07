// Business logic, payload formatting, and enum translations
//

const Task = require('./taskModel');
const db = require('./db');
const { recordNotification } = require('../UserMngmt_APIs/notifications');
const { formatFullName } = require('../UserMngmt_APIs/userUtils');


const getInitials = (fName, lName) => {
    if (!fName && !lName) return '?';
    return `${(fName || '')[0] || ''}${(lName || '')[0] || ''}`.toUpperCase();
};

module.exports = {
    getTasks: async (req, res) => {
        try {
            // run auto reset first
            const resetCount = await Task.autoResetStaleTasks();
            if (resetCount > 0) {
                //-an in-progress task turned to pending after 24 hours have passed of not completing
                await recordNotification(db, {
                    kind: "system_reset",
                    title: "Tasks Auto-Reset",
                    body: `${resetCount} stale task(s) have been moved back to Pending because they were not completed within 24 hours.`,
                    relatedUrl: null
                });
            }

            //-completed tasks have refreshed, to view hidden completed tasks see Task Board > Admin > Show all completed since Day 1
            if (req.user.role === 'Admin') {
                const today = new Date().toISOString().split('T')[0];
                const [lastRefresh] = await db.query(`
                    SELECT notif_date FROM Notifications 
                    WHERE notif_message LIKE '%Completed tasks have refreshed%' 
                    ORDER BY notif_date DESC LIMIT 1
                `);
                if (!lastRefresh.length || lastRefresh[0].notif_date.split(' ')[0] !== today) {
                    await recordNotification(db, {
                        kind: "system_refresh",
                        title: "Tasks Refreshed",
                        body: "Completed tasks have refreshed, to view hidden completed tasks see Task Board > Admin > Show all completed since Day 1",
                        relatedUrl: null,
                        targetRole: 'Admin'
                    });
                }
            }

            // Check for newly overdue tasks to notify users
            const [overdueTasks] = await db.query(`
                SELECT t.task_id, t.title, a.first_name, a.last_name, a.suffix, t.assigned_to_user
                FROM Tasks t
                JOIN Employees a ON t.assigned_to_user = a.employee_id
                WHERE t.status NOT IN ('completed', 'cancelled')
                  AND t.due_date < CURDATE()
                  AND NOT EXISTS (
                      SELECT 1 FROM Notifications 
                      WHERE notif_message LIKE CONCAT('%"', t.title, '" is now overdue%') 
                      AND DATE(notif_date) = CURDATE()
                  )
            `);
            for (const ot of overdueTasks) {
                await recordNotification(db, {
                    kind: "task_overdue",
                    title: "Task Overdue",
                    body: `Task "${ot.title}" assigned to ${formatFullName(ot)} is now overdue`,
                    relatedUrl: null,
                    targetUserId: ot.assigned_to_user
                });
            }

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

            // 'completed' view opt-in; any other value (including absent) falls back to active
            const { view } = req.query;
            const showCompleted = view === 'completed';

            // Find the logged-in employee (Returns ONLY the ID based on our debug log)
            const employee = await Task.findEmployeeByEmail(userEmail);
            if (!employee) return res.status(404).json({ message: 'User not found' });

            // Extract the known, safe ID
            const targetId = employee.employee_id;

            // Fetch the groups this employee belongs to ---
            const [groupRows] = await db.query(
                'SELECT group_id FROM Employees_Groups WHERE employee_id = ?', 
                [targetId]
            );
            const myGroupIds = groupRows.map(row => row.group_id);

            // Fetch all raw tasks
            const rawTasks = await Task.findAll();

            // Match tasks strictly by ID, then apply the active/completed filter
            const myRawTasks = rawTasks.filter(t => {
                // Check both individual assignment OR group assignment 
                const matchesUser = (t.assigned_to_user === targetId) || myGroupIds.includes(t.assigned_to_group);

                if (showCompleted) {
                    // Return only completed tasks; cancelled is always excluded
                    return matchesUser && t.status === 'completed';
                }

                // Default: exclude completed and cancelled (active tasks only)
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
            // --- ROLE SECURITY CHECK ---
            // Ensure only ADMIN role can create tasks (Second layer of defense)
            const userRole = req.user.role ? req.user.role.toUpperCase() : '';
            if (userRole !== 'ADMIN') {
                return res.status(403).json({ message: 'Insufficient permissions to create tasks. Admin access required.' });
            }

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
            let targetName = 'Unknown';
        
            if (assigneeEmail) {
                const employee = await Task.findEmployeeByEmail(assigneeEmail);
                if (employee) {
                    assignedToUser = employee.employee_id;
                    targetName = `${employee.first_name} ${employee.last_name}`.trim();
                }
            } else if (groupId) {
                assignedToGroup = parseInt(groupId);
                const [groupRows] = await db.query('SELECT group_name FROM Job_Groups WHERE group_id = ?', [assignedToGroup]);
                if (groupRows.length > 0) {
                    targetName = groupRows[0].group_name;
                } else {
                    targetName = `Group ID ${groupId}`;
                }
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

            // Get creator's full name
            const [creatorRow] = await db.query('SELECT first_name, last_name, suffix FROM Employees WHERE employee_id = ?', [creatorId]);
            const creatorName = formatFullName(creatorRow[0]);

            //-Admin/chief x created task y and assigned to user z or group z, for the admins (only appears if the user is admin)
            await recordNotification(db, {
                kind: "task_created_admin",
                title: "New Task Created",
                body: `${creatorName} created task "${title.trim()}" and assigned it to ${targetName}.`,
                relatedUrl: null,
                targetRole: 'Admin'
            });

            //-admin/chief x assigned task y to you, if non admin (only appears if the user isn't an admin)
            if (assignedToUser) {
                await recordNotification(db, {
                    kind: "task_assigned_user",
                    title: "Task Assigned to You",
                    body: `${creatorName} assigned task "${title.trim()}" to you.`,
                    relatedUrl: null,
                    targetUserId: assignedToUser
                });
            } else if (assignedToGroup) {
                // If assigned to a group, notify all members of that group? 
                // The request doesn't explicitly ask for group members to be notified, 
                // but "assigned to you" if non admin implies individual targeting.
                // For group assignments, we can't easily target all in current Notifications table 
                // without multiple inserts or a target_group_id column.
                // I'll skip group member individual notifications unless I add target_group_id.
            }

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
            const isAssignee = existingTask.assigned_to_user === req.user.id;
            if (status) {
                const targetStatus = status.toLowerCase();

                // Lock Terminal States: a finalized (completed/cancelled) task may only be
                // reopened by an admin/chief OR by the task's own assignee (their My Tasks).
                // Everyone else is blocked from resurrecting it.
                if (!isAuthorizedModifier && !isAssignee && (currentStatus === 'completed' || currentStatus === 'cancelled')) {
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
                
                if (newStatus === 'completed') {
                    const task = await Task.findById(id);
                    await recordNotification(db, {
                        kind: "task_completed",
                        title: "Task Completed",
                        body: `Task "${task.title}" has been marked as completed.`,
                        relatedUrl: null
                    });
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
            
            const task = await Task.findById(id);
            if (!task) {
                return res.status(404).json({ message: 'Task not found' });
            }

            // Get assignee name for notification
            let assigneeName = 'No one';
            if (task.assigned_to_user) {
                const [emp] = await db.query('SELECT first_name, last_name, suffix FROM Employees WHERE employee_id = ?', [task.assigned_to_user]);
                if (emp.length > 0) assigneeName = formatFullName(emp[0]);
            } else if (task.assigned_to_group) {
                const [grp] = await db.query('SELECT group_name FROM Job_Groups WHERE group_id = ?', [task.assigned_to_group]);
                if (grp.length > 0) assigneeName = grp[0].group_name;
            }

            const affectedRows = await Task.delete(id);
            if (affectedRows === 0) {
                return res.status(404).json({ message: 'Task not found' });
            }

            //-task x assigned to user y was deleted by [Admin]
            const [adminRow] = await db.query('SELECT first_name, last_name, suffix FROM Employees WHERE employee_id = ?', [req.user.id]);
            const adminName = formatFullName(adminRow[0]);

            await recordNotification(db, {
                kind: "task_deleted",
                title: "Task Deleted",
                body: `Task "${task.title}" assigned to ${assigneeName} was deleted by ${adminName}`,
                relatedUrl: null
            });

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

            const task = await Task.findById(taskId);
            const updaterName = formatFullName(employee);
            const isUpdaterAdmin = (req.user.role === 'Admin'); // Actually we should check the `employee`'s role, not `req.user`'s.
            
            // Need to fetch updater's role
            const [updaterInfo] = await db.query('SELECT designation FROM Employees WHERE employee_id = ?', [employee.employee_id]);
            const isUpdaterAdminActual = updaterInfo[0]?.designation === 'Admin';

            if (!isUpdaterAdminActual) {
                //-non-admin x updated task y's update notes "(insert update notes)"
                await recordNotification(db, {
                    kind: "task_note_update",
                    title: "Task Update Notes",
                    body: `${updaterName} updated task "${task?.title || 'Task'}"'s update notes: "${notes}"`,
                    relatedUrl: null
                });

                //-non-admin x updated task y's status to (the new status)
                if (statusChange) {
                    await recordNotification(db, {
                        kind: "task_status_update",
                        title: "Task Status Changed",
                        body: `${updaterName} updated task "${task?.title || 'Task'}"'s status to ${statusChange}`,
                        relatedUrl: null
                    });
                }
            }

            //-non-admin x attached a url to the latest task update of task y
            // We can detect a URL in the notes as a simple heuristic since there is no separate URL field.
            if (!isUpdaterAdminActual && /https?:\/\/[^\s]+/.test(notes)) {
                await recordNotification(db, {
                    kind: "task_url_update",
                    title: "URL Attached",
                    body: `${updaterName} attached a url to the latest task update of task "${task?.title || 'Task'}"`,
                    relatedUrl: null
                });
            }

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
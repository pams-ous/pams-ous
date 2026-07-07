// Business logic, payload formatting, and enum translations

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
                // an in-progress task turned to pending after 24 hours have passed of not completing
                    await recordNotification(db, {
                        kind: "system_reset",
                        title: "Tasks Auto-Reset",
                        body: `${resetCount} stale task(s) have been moved back to Pending because they were not completed within 24 hours.`,
                        relatedUrl: null
                    }, req.app.get('io'));

            }

            // completed tasks have refreshed, to view hidden completed tasks see Task Board > Admin > Show all completed since Day 1
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
                        relatedUrl: null
                        // targetDesignationId will be handled globally for admins
                    }, req.app.get('io'));
                }
            }

            // Check for newly overdue tasks to notify users — removed (due date no longer tracked)

            // capture the query string sent by the admin checkbox (?completedSince=all)
            const { completedSince } = req.query;
            
            // pass the option down into the model
            const rawTasks = await Task.findAll({
                showAllCompleted: completedSince === 'all'
            });

            // Work out which tasks the current user is allowed to complete, using
            // the same ownership rule updateTask enforces: admins/chiefs may
            // complete anything; everyone else only their own (assigned to them
            // directly, or to a group they belong to).
            const role = req.user.role ? req.user.role.toLowerCase() : 'staff';
            const isManager = role === 'admin' || role === 'chief' || role === 'superadmin';
            let myGroupIds = [];
            if (!isManager) {
                const [groupRows] = await db.query(
                    'SELECT group_id FROM Employees_Groups WHERE employee_id = ?',
                    [req.user.id]
                );
                myGroupIds = groupRows.map(r => r.group_id);
            }

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

                const canComplete = isManager
                    || t.assigned_to_user === req.user.id
                    || myGroupIds.includes(t.assigned_to_group);

                return {
                    id: t.id,
                    title: t.title,
                    description: t.description,
                    status: t.status ? t.status.toUpperCase() : 'PENDING',
                    createdAt: t.createdAt,
                    assignedByName: t.creator_fn ? `${t.creator_fn} ${t.creator_ln}` : 'System',
                    assignee: assigneeObj,
                    canComplete
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

            // For debugging. Find the logged-in employee (Returns only the ID)
            const employee = await Task.findEmployeeByEmail(userEmail);
            if (!employee) return res.status(404).json({ message: 'User not found' });

            // Extract the known, safe ID
            const targetId = employee.employee_id;

            // Fetch the groups this employee belongs to
            const [groupRows] = await db.query(
                'SELECT group_id FROM Employees_Groups WHERE employee_id = ?', 
                [targetId]
            );
            const myGroupIds = groupRows.map(row => row.group_id);

            // Fetch all raw tasks. The Completed tab must show the full completion
            // history (so its details — including any attached URLs — stay
            // reachable), so bypass the daily-wipe rule there. The Active tab keeps
            // the default behaviour (it excludes completed tasks anyway).
            const rawTasks = await Task.findAll({ showAllCompleted: showCompleted });

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

            // Format perfectly for my-tasks.js to prevent UI rendering bugs
            const formattedTasks = myRawTasks.map(t => {
                let assigneeObj = null;
                let assignedToName = null;

                if (t.assignee_fn) {
                    assignedToName = `${t.assignee_fn} ${t.assignee_ln}`.trim();
                    assigneeObj = { 
                        name: `${t.assignee_fn} ${t.assignee_ln}`, 
                        type: 'user', 
                        initials: getInitials(t.assignee_fn, t.assignee_ln) 
                    };
                } else if (t.group_name) {
                    assignedToName = t.group_name;
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
                    status: t.status ? t.status.toUpperCase() : 'PENDING',
                    createdAt: t.createdAt,
                    updatedAt: t.updatedAt || t.createdAt, 
                    assignedByName: t.creator_fn ? `${t.creator_fn} ${t.creator_ln}` : 'System',
                    assignedToName: assignedToName,
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
            const userRole = req.user.role ? req.user.role.toUpperCase() : '';
            if (userRole !== 'ADMIN' && userRole !== 'SUPERADMIN') {
                return res.status(403).json({ message: 'Insufficient permissions to create tasks. Admin access required.' });
            }

            const { title, description, assigneeEmail, groupId } = req.body;
        
            // --- STRICT SERVER-SIDE VALIDATION ---
            if (!title || !title.trim()) {
                return res.status(400).json({ message: 'Task title is required.' });
            }
            if (!assigneeEmail && !groupId) {
                return res.status(400).json({ message: 'Task must be assigned to a user or group.' });
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

            //For debugging. Extract the actual authenticated creator
            const creatorId = req.user.id; 
            if (!creatorId) {
                return res.status(401).json({ message: 'Unauthorized: Complete profile credentials missing' });
            }

            const newTaskId = await Task.create({
                title: title.trim(),
                description: description ? description.trim() : null,
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
                    relatedUrl: null
                    // Global for admins
                }, req.app.get('io'));


            //-admin/chief x assigned task y to you, if non admin (only appears if the user isn't an admin)
            if (assignedToUser) {
                    await recordNotification(db, {
                        kind: "task_assigned_user",
                        title: "Task Assigned to You",
                        body: `${creatorName} assigned task "${title.trim()}" to you.`,
                        relatedUrl: null,
                        targetUserId: assignedToUser
                    }, req.app.get('io'));

            } else if (assignedToGroup) {
                    await recordNotification(db, {
                        kind: "task_assigned_group",
                        title: "Task Assigned to Your Group",
                        body: `${creatorName} assigned task "${title.trim()}" to your group.`,
                        relatedUrl: null,
                        targetGroupId: assignedToGroup
                    }, req.app.get('io'));

            }

            req.app.get('io').emit('tasksChanged', { action: 'create', taskId: newTaskId });
            res.status(201).json({ message: 'Task created successfully', taskId: newTaskId });
        } catch (error) {
            console.error('FULL ERROR DETAILS:', error); 
            res.status(500).json({ message: 'Failed to create task', details: error.message });
        }
    },

    updateTask: async (req, res) => {
        try {
            const { id } = req.params;
            const { title, description, status } = req.body; 
            const userRole = req.user.role ? req.user.role.toLowerCase() : 'staff';

            // Fetch the existing task to perform status/permission business rule checks
            const existingTask = await Task.findById(id);
            if (!existingTask) {
                return res.status(404).json({ message: 'Task not found' });
            }

            // Enforce Role & Modification Boundary Rules
            const isAuthorizedModifier = (userRole === 'admin' || userRole === 'chief' || userRole === 'superadmin');
            
            if (!isAuthorizedModifier) {
                // Regular personnel cannot change core task metadata
                if (title || description) {
                    return res.status(403).json({ message: 'Insufficient permissions to alter core task details.' });
                }
            }

            const currentStatus = existingTask.status.toLowerCase();

            // Determine ownership: the individual assignee, OR a member of the
            // group the task is assigned to. Admins/chiefs bypass this entirely.
            let isAssignee = existingTask.assigned_to_user === req.user.id;
            if (!isAssignee && existingTask.assigned_to_group) {
                const [memberRows] = await db.query(
                    'SELECT 1 FROM Employees_Groups WHERE group_id = ? AND employee_id = ? LIMIT 1',
                    [existingTask.assigned_to_group, req.user.id]
                );
                isAssignee = memberRows.length > 0;
            }

            if (status) {
                // Personnel may only change the status of tasks that are their own
                // (assigned to them directly, or to a group they belong to). This
                // stops a user from completing someone else's task from the Task
                // Board. Admins/chiefs are exempt. This also covers reopening a
                // finalized task, since that is just another status change.
                if (!isAuthorizedModifier && !isAssignee) {
                    return res.status(403).json({ message: 'You can only update the status of tasks assigned to you.' });
                }
            }

            // Assemble dynamic payload mapping safely
            const updatePayload = {};
            if (isAuthorizedModifier) {
                if (title) updatePayload.title = title.trim();
                if (description !== undefined) updatePayload.description = description ? description.trim() : null;
            }
            
            if (status) updatePayload.status = status.toLowerCase(); 

            const affectedRows = await Task.update(id, updatePayload);
            
            // Log every admin-forced status change so report snapshots track it accurately
            if (status && status.toLowerCase() !== currentStatus) {
                const newStatus = status.toLowerCase();
                await Task.logUpdate(id, req.user.id, 'Status forcefully updated via Admin panel', newStatus);

                if (newStatus === 'completed') {
                    const task = await Task.findById(id);
                    await recordNotification(db, {
                        kind: "task_completed",
                        title: "Task Completed",
                        body: `Task "${task.title}" has been marked as completed.`,
                        relatedUrl: null
                    }, req.app.get('io'));
                }
            }

            req.app.get('io').emit('tasksChanged', { action: 'update', taskId: parseInt(id) });
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
            }, req.app.get('io'));

            req.app.get('io').emit('tasksChanged', { action: 'delete', taskId: parseInt(id) });
            res.status(200).json({ message: 'Task deleted successfully' });
        } catch (error) {
            console.error('Error deleting task:', error);
            res.status(500).json({ message: 'Failed to delete task' });
        }
    },

    logTaskUpdate: async (req, res) => {
        try {
            const { taskId, email, notes, statusChange, attachmentUrl } = req.body;
            if (!taskId || !email) {
                return res.status(400).json({ message: 'Task ID and email are required.' });
            }
            const trimmedNotes = (notes || '').trim();

            // Attachment URL is optional. If provided, only accept http(s) links
            // so we never store a javascript:/data: URI that would execute when
            // rendered as a link in the task history.
            const trimmedAttachment = (attachmentUrl || '').trim();
            if (trimmedAttachment && !/^https?:\/\/[^\s]+$/i.test(trimmedAttachment)) {
                return res.status(400).json({ message: 'Attachment must be a valid http(s) URL.' });
            }
            const attachment = trimmedAttachment || null;

            // Notes are optional (e.g. the "easy complete" button only changes
            // status, or the user just attaches a URL), but the request must do
            // something: notes, a status change, or an attachment.
            if (!trimmedNotes && !statusChange && !attachment) {
                return res.status(400).json({ message: 'Provide update notes, a status change, or an attachment URL.' });
            }

            // Find employee ID from email
            const employee = await Task.findEmployeeByEmail(email);
            if (!employee) return res.status(404).json({ message: 'User not found' });

            await Task.logUpdate(taskId, employee.employee_id, trimmedNotes, statusChange, attachment);

            const task = await Task.findById(taskId);
            const updaterName = formatFullName(employee);
            const isUpdaterAdmin = (req.user.role === 'Admin'); // Actually we should check the `employee`'s role, not `req.user`'s.
            
            // Need to fetch updater's role
            const [updaterInfo] = await db.query('SELECT designation FROM Employees WHERE employee_id = ?', [employee.employee_id]);
            const isUpdaterAdminActual = updaterInfo[0]?.designation === 'Admin';

            if (!isUpdaterAdminActual) {
                //-non-admin x updated task y's update notes "(insert update notes)"
                if (trimmedNotes) {
                        await recordNotification(db, {
                            kind: "task_note_update",
                            title: "Task Update Notes",
                            body: `${updaterName} updated task "${task?.title || 'Task'}"'s update notes: "${trimmedNotes}"`,
                            relatedUrl: null
                        }, req.app.get('io'));
                }


                //-non-admin x updated task y's status to (the new status)
                if (statusChange) {
                        await recordNotification(db, {
                            kind: "task_status_update",
                            title: "Task Status Changed",
                            body: `${updaterName} updated task "${task?.title || 'Task'}"'s status to ${statusChange}`,
                            relatedUrl: null
                        }, req.app.get('io'));

                }
            }

            //-non-admin x attached a url to the latest task update of task y
            if (!isUpdaterAdminActual && attachment) {
                    await recordNotification(db, {
                        kind: "task_url_update",
                        title: "URL Attached",
                        body: `${updaterName} attached a url to the latest task update of task "${task?.title || 'Task'}"`,
                        relatedUrl: null
                    }, req.app.get('io'));

            }

            req.app.get('io').emit('tasksChanged', { action: 'logUpdate', taskId: parseInt(taskId) });
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
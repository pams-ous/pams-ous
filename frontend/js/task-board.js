/**
 * task-board.js
 * Purpose: Global task management logic (Filter, Sort, View, Modals).
 */

(function () {
    const { apiFetch, requireAuth, fmtDate, fmtHeaderDate, getUser } = PAMS;

    let tasks = [];
    let users = [];
    let groups = [];
    let viewingId = null;
    let activeStatus = 'IN PROGRESS';

    document.addEventListener('DOMContentLoaded', async () => {
        if (!requireAuth()) return;
        PAMS_UI.init();

        const dateEl = document.getElementById('headerDate');
        if (dateEl) dateEl.textContent = fmtHeaderDate();

        wireRibbon();

        // 200 char counters for description fields
        const ntDesc = document.getElementById('nt-desc');
        const ntDescCount = document.getElementById('nt-desc-count');
        if (ntDesc && ntDescCount) {
            ntDesc.addEventListener('input', () => {
                ntDescCount.textContent = ntDesc.value.length;
            });
        }
        const editDesc = document.getElementById('edit-desc');
        const editDescCount = document.getElementById('edit-desc-count');
        if (editDesc && editDescCount) {
            editDesc.addEventListener('input', () => {
                editDescCount.textContent = editDesc.value.length;
            });
        }

        await loadAll();
    });

    function wireRibbon() {
        document.querySelectorAll('.ribbon-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                const name = btn.dataset.tab;
                document.querySelectorAll('.ribbon-tab').forEach(t => t.classList.toggle('active', t === btn));
                document.querySelectorAll('.ribbon-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === name));
            });
        });

        document.querySelectorAll('.status-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                activeStatus = btn.dataset.status;
                document.querySelectorAll('.status-tab').forEach(t => t.classList.toggle('active', t === btn));
                renderList();
            });
        });

        ['filterPriority', 'filterGroup', 'filterAssignee', 'sortField', 'sortDir', 'viewDensity', 'viewGroupBy', 'adminSinceDay1', 'tbSearch']
            .forEach(id => {
                const el = document.getElementById(id);
                if (el) el.addEventListener(el.type === 'search' ? 'input' : 'change', () => {
                    if (id === 'adminSinceDay1') loadAll();
                    else renderList();
                });
            });
    }

    async function loadAll() {
        try {
            if (CONFIG.USE_MOCK_API) {
                tasks = [
                    { id: 1, title: 'Annual Performance Review', description: 'Review all staff performance for 2026.', priority: 'HIGH', status: 'PENDING', dueDate: '2026-06-15', assignee: { name: 'Juan Dela Cruz', type: 'user', initials: 'JD' }, assignedByName: 'Admin' },
                    { id: 2, title: 'Database Migration', description: 'Migrate legacy data to new schema.', priority: 'URGENT', status: 'IN PROGRESS', dueDate: '2026-05-20', assignee: { name: 'IT Dept', type: 'group', initials: 'IT' }, assignedByName: 'System' },
                    { id: 3, title: 'Document Shredding', description: 'Dispose of expired documents.', priority: 'LOW', status: 'COMPLETED', dueDate: '2026-05-10', assignee: { name: 'Maria Santos', type: 'user', initials: 'MS' }, assignedByName: 'Head' }
                ];
                users = [{ email: 'juan@pup.edu.ph', name: 'Juan Dela Cruz' }, { email: 'maria@pup.edu.ph', name: 'Maria Santos' }];
                groups = [{ id: 1, name: 'Student Records' }, { id: 2, name: 'Admission' }];
            } else {
                const sinceDay1 = document.getElementById('adminSinceDay1')?.checked;
                const qs = sinceDay1 ? '?completedSince=all' : '';
                // 1. Fetch tasks first (to crash the page if it fails)
                const t = await apiFetch('/tasks' + qs);
                tasks = t.tasks || t || [];

                // 2. Safely try to fetch users
                try {
                    const u = await apiFetch('/users');
                    users = u.users || u || [];
                } catch (error) {
                    console.warn("User list hidden for this account designation.");
                    users = [];
                }
                
                // 3. Safely try to fetch groups
                try {
                    const g = await apiFetch('/groups');
                    groups = g.groups || g || [];
                } catch (error) {
                    console.warn("Group list hidden for this account designation.");
                    groups = [];
                }
            }
            populateAssigneeSelects();
            buildFilterOptions();
            renderList();
            updateOverdueBanner();
        } catch (err) {
            console.error('Load failed:', err);
            const rowEl = document.getElementById('tbRows');
            if (rowEl) rowEl.innerHTML = `<div class="tb-empty">Failed to load tasks.</div>`;
        }
    }

    function populateAssigneeSelects() {
        // New Task uses a searchable typeahead (see filterAssignees); the Edit
        // modal still uses a plain <select>.
        const userOpts = users.map(u => `<option value="user:${u.email}">${u.name || u.email}</option>`).join('');
        const groupOpts = groups.map(g => `<option value="group:${g.id}">${g.name}</option>`).join('');
        const innerHTML = `<option value="">Select assignee</option><optgroup label="Users">${userOpts}</optgroup><optgroup label="Groups">${groupOpts}</optgroup>`;

        const edAss = document.getElementById('edit-assignee');
        if (edAss) edAss.innerHTML = innerHTML;
    }

    // Combined assignee list (users + groups) for the New Task typeahead.
    function assigneeOptions() {
        return [
            ...users.map(u => ({
                value: `user:${u.email}`,
                type: 'user',
                name: u.name || u.email,
                meta: u.email + (u.code ? ' · ' + u.code : ''),
                search: `${u.name || ''} ${u.email || ''} ${u.code || ''}`.toLowerCase()
            })),
            ...groups.map(g => ({
                value: `group:${g.id}`,
                type: 'group',
                name: g.name,
                meta: 'Group',
                search: (g.name || '').toLowerCase()
            }))
        ];
    }

    function buildFilterOptions() {
        const groupNames = [...new Set(tasks.filter(t => t.assignee?.type === 'group').map(t => t.assignee.name))].sort();
        // Only individual users here — groups are covered by the Group filter.
        const assignees = [...new Set(tasks.filter(t => t.assignee?.type === 'user').map(t => t.assignee.name).filter(Boolean))].sort();

        const gEl = document.getElementById('filterGroup');
        const aEl = document.getElementById('filterAssignee');
        if (!gEl || !aEl) return;

        const gV = gEl.value;
        const aV = aEl.value;

        gEl.innerHTML = '<option value="">All Groups</option>' + groupNames.map(n => `<option value="${n}">${n}</option>`).join('');
        aEl.innerHTML = '<option value="">All Assignees</option>' + assignees.map(n => `<option value="${n}">${n}</option>`).join('');

        gEl.value = gV;
        aEl.value = aV;
    }

    function updateOverdueBanner() {
        const today = new Date(new Date().toDateString());
        const overdue = tasks.filter(t => t.status !== 'COMPLETED' && t.status !== 'CANCELLED' && new Date(t.dueDate) < today);
        const banner = document.getElementById('alertBanner');
        const alertText = document.getElementById('alertText');
        if (!banner || !alertText) return;

        if (overdue.length > 0) {
            alertText.textContent = `${overdue.length} task${overdue.length > 1 ? 's are' : ' is'} overdue.`;
            banner.classList.remove('hidden');
        } else {
            banner.classList.add('hidden');
        }
    }

    function renderList() {
        const allTotals = { ALL: tasks.length, PENDING: 0, 'IN PROGRESS': 0, COMPLETED: 0, CANCELLED: 0 };
        tasks.forEach(t => { if (allTotals[t.status] != null) allTotals[t.status]++; });
        document.querySelectorAll('.status-tab .cnt').forEach(el => el.textContent = allTotals[el.dataset.cnt] ?? 0);

        const list = applyAllFilters();
        const rows = document.getElementById('tbRows');
        const density = document.getElementById('viewDensity')?.value || 'comfortable';
        const groupBy = document.getElementById('viewGroupBy')?.value || '';

        if (!rows) return;

        rows.className = 'tb-rows ' + (density === 'compact' ? 'is-compact' : '');

        if (list.length === 0) {
            rows.innerHTML = `<div class="tb-empty">No tasks found.</div>`;
            const resLabel = document.getElementById('tbResultsLabel');
            if (resLabel) resLabel.textContent = '0 tasks';
            return;
        }

        if (groupBy) {
            const grouped = list.reduce((acc, t) => {
                const k = groupBy === 'status' ? t.status : groupBy === 'priority' ? t.priority : (t.assignee?.type === 'group' ? t.assignee.name : 'No Group');
                (acc[k] = acc[k] || []).push(t);
                return acc;
            }, {});
            rows.innerHTML = Object.entries(grouped).map(([k, items]) => `<div class="tb-group-label">${k} <span class="tb-group-count">${items.length}</span></div>${items.map(buildRow).join('')}`).join('');
        } else {
            rows.innerHTML = list.map(buildRow).join('');
        }

        const resLabel = document.getElementById('tbResultsLabel');
        if (resLabel) {
            resLabel.textContent = `${list.length} task${list.length === 1 ? '' : 's'}` + (activeStatus !== 'ALL' ? ` · ${activeStatus}` : '');
        }
    }

    function applyAllFilters() {
        const gF = document.getElementById('filterGroup')?.value || '';
        const pF = document.getElementById('filterPriority')?.value || '';
        const aF = document.getElementById('filterAssignee')?.value || '';
        const q = (document.getElementById('tbSearch')?.value || '').toLowerCase();

        let list = tasks.filter(t => {
            if (activeStatus !== 'ALL' && t.status !== activeStatus) return false;
            if (pF && t.priority !== pF) return false;
            if (gF && !(t.assignee?.type === 'group' && t.assignee.name === gF)) return false;
            if (aF && t.assignee?.name !== aF) return false;
            if (q && !(t.title.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q))) return false;
            return true;
        });

        const field = document.getElementById('sortField')?.value || 'due';
        const dir = document.getElementById('sortDir')?.value === 'desc' ? -1 : 1;
        const pRank = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
        list.sort((a, b) => {
            let av, bv;
            if (field === 'priority') { av = pRank[a.priority] ?? 9; bv = pRank[b.priority] ?? 9; }
            else if (field === 'created') { av = new Date(a.createdAt || 0); bv = new Date(b.createdAt || 0); }
            else if (field === 'title') { av = a.title.toLowerCase(); bv = b.title.toLowerCase(); }
            else { av = new Date(a.dueDate); bv = new Date(b.dueDate); }
            return av < bv ? -1 * dir : av > bv ? 1 * dir : 0;
        });
        return list;
    }

    function buildRow(t) {
        const pCls = { URGENT: 'badge-urgent', HIGH: 'badge-urgent', MEDIUM: 'badge-in_progress', LOW: 'badge-pending' }[t.priority] || '';
        const sCls = 'badge-' + t.status.toLowerCase().replace(' ', '_');
        const isOverdue = t.status !== 'COMPLETED' && t.status !== 'CANCELLED' && new Date(t.dueDate) < new Date(new Date().toDateString());

        return `
        <div class="tb-row${isOverdue ? ' is-overdue' : ''}"${isOverdue ? ' aria-label="Overdue task"' : ''}>
            <div class="tb-row-main" onclick="window.TaskBoard.openView(${t.id})">
                <div class="tb-row-top">
                    <span class="tb-title">${t.title}</span>
                    <span class="badge ${pCls}">${t.priority}</span>
                    <span class="badge ${sCls}">${t.status}</span>
                    ${isOverdue ? '<span class="tb-flag" title="This task is past its due date"><i class="fa-solid fa-clock" aria-hidden="true"></i> OVERDUE</span>' : ''}
                </div>
                <div class="tb-desc">${t.description || ''}</div>
                <div class="tb-meta">
                    <span class="tb-meta-item"><span class="avatar-sm">${t.assignee?.initials || '?'}</span> ${t.assignee?.name || 'Unassigned'}</span>
                    <span class="tb-meta-item"><i class="fa-regular fa-calendar"></i> Due ${fmtDate(t.dueDate)}</span>
                    <span class="tb-meta-item"><i class="fa-regular fa-user"></i> By ${t.assignedByName || '—'}</span>
                </div>
            </div>
            <div class="tb-row-actions">
                <button class="ribbon-btn complete" title="${t.canComplete === false ? 'You can only complete tasks assigned to you' : 'Mark as Completed'}" aria-label="Mark '${t.title.replace(/'/g, '&#39;')}' as completed" onclick="window.TaskBoard.completeTask(${t.id})"${(t.status === 'COMPLETED' || t.status === 'CANCELLED' || t.canComplete === false) ? ' disabled aria-disabled="true"' : ''}><i class="fa-solid fa-circle-check" aria-hidden="true"></i></button>
                <button class="ribbon-btn ghost" title="Edit Details" onclick="window.TaskBoard.openEdit(${t.id})"><i class="fa-solid fa-pen"></i></button>
                <button class="ribbon-btn ghost act-delete" title="${t.canComplete === false ? 'You can only delete tasks assigned to you' : 'Remove'}" aria-label="Delete '${t.title.replace(/'/g, '&#39;')}'" onclick="window.TaskBoard.openDeleteTask(${t.id})"${t.canComplete === false ? ' disabled aria-disabled="true"' : ''}><i class="fa-solid fa-trash-can"></i></button>
            </div>
        </div>`;
    }

    /**
     * Modal Management
     */
    const openModal = (id) => document.getElementById(id)?.classList.add('open');
    const closeModal = (id) => document.getElementById(id)?.classList.remove('open');

    // Export public methods for inline handlers
    window.TaskBoard = {
        openNewTask: () => {
            ['nt-title', 'nt-desc', 'nt-priority', 'nt-due', 'nt-assignee'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            window.TaskBoard.clearAssignee();

            // Lock out past dates in the calendar picker
            const dueInput = document.getElementById('nt-due');
            if (dueInput) {
                const today = new Date();
                const yyyy = today.getFullYear();
                const mm = String(today.getMonth() + 1).padStart(2, '0');
                const dd = String(today.getDate()).padStart(2, '0');

                // Formats as YYYY-MM-DD and sets it as the minimum allowed date
                dueInput.min = `${yyyy}-${mm}-${dd}`;
            }

            openModal('newTaskModal');
            // Make the assignee search the automatically selected control so the
            // admin can start typing a name right away.
            setTimeout(() => document.getElementById('nt-assignee-search')?.focus(), 50);
        },
        filterAssignees: () => {
            const input = document.getElementById('nt-assignee-search');
            const box = document.getElementById('nt-assignee-results');
            if (!input || !box) return;

            const q = (input.value || '').trim().toLowerCase();
            const all = assigneeOptions();

            const setExpanded = (open) => input.setAttribute('aria-expanded', String(open));

            if (!all.length) {
                box.innerHTML = '<div class="text-xs color-gray text-center py-3">No assignees loaded.</div>';
                box.classList.add('open');
                setExpanded(true);
                return;
            }

            const matches = (q ? all.filter(o => o.search.includes(q)) : all).slice(0, 8);

            if (matches.length === 0) {
                box.innerHTML = '<div class="text-xs color-gray text-center py-3">No matches found.</div>';
                box.classList.add('open');
                setExpanded(true);
                return;
            }

            box.classList.add('open');
            setExpanded(true);
            box.innerHTML = matches.map(o => `
                <button type="button" class="user-search-item" role="option"
                    onclick="window.TaskBoard.pickAssignee('${encodeURIComponent(o.value)}','${encodeURIComponent(o.name)}')">
                    <div class="avatar-sm">${o.type === 'group'
                        ? '<i class="fa-solid fa-users" aria-hidden="true"></i>'
                        : (o.name || '?').charAt(0).toUpperCase()}</div>
                    <div class="user-search-meta">
                        <strong>${o.name}</strong>
                        <span class="muted">${o.meta}</span>
                    </div>
                </button>`).join('');
        },
        pickAssignee: (valueEnc, nameEnc) => {
            const value = decodeURIComponent(valueEnc);
            const name = decodeURIComponent(nameEnc);
            document.getElementById('nt-assignee').value = value;
            document.getElementById('nt-assignee-picked-name').textContent = name;
            document.getElementById('nt-assignee-picked').style.display = 'flex';
            const input = document.getElementById('nt-assignee-search');
            if (input) { input.style.display = 'none'; input.setAttribute('aria-expanded', 'false'); }
            document.getElementById('nt-assignee-results').classList.remove('open');
        },
        closeAssignees: () => {
            // Delay so a click on a suggestion registers before the list hides.
            setTimeout(() => {
                const box = document.getElementById('nt-assignee-results');
                if (box) box.classList.remove('open');
                document.getElementById('nt-assignee-search')?.setAttribute('aria-expanded', 'false');
            }, 150);
        },
        clearAssignee: () => {
            const hidden = document.getElementById('nt-assignee');
            if (hidden) hidden.value = '';
            const picked = document.getElementById('nt-assignee-picked');
            if (picked) picked.style.display = 'none';
            const input = document.getElementById('nt-assignee-search');
            if (input) { input.style.display = ''; input.value = ''; input.setAttribute('aria-expanded', 'false'); }
            const box = document.getElementById('nt-assignee-results');
            if (box) box.classList.remove('open');
        },
        createTask: async () => {
            const titleVal = document.getElementById('nt-title').value.trim();
            const descVal = document.getElementById('nt-desc').value.trim();
            const priorityVal = document.getElementById('nt-priority').value;
            const dueVal = document.getElementById('nt-due').value;
            const assigneeVal = document.getElementById('nt-assignee').value;

            // --- 1. Client-Side Validation ---
            if (!titleVal || !priorityVal || !dueVal || !assigneeVal) {
                PAMS.toast("Please fill in all required fields: Task Title, Priority, Due Date, and Assign To.", "warning");
                return; // Stops the function immediately so the task isn't created
            }

            // --- 2. Assemble Payload ---
            const body = {
                title: titleVal,
                description: descVal,
                priority: priorityVal,
                dueDate: dueVal,
                status: 'PENDING'
            };

            const [type, key] = assigneeVal.split(':');
            if (type === 'user') body.assigneeEmail = key; else body.groupId = parseInt(key);

            // --- 3. Submit ---
            if (CONFIG.USE_MOCK_API) {
                tasks.push({ ...body, id: tasks.length + 1, assignee: { name: 'New Assignee', initials: 'NA' }, assignedByName: 'You' });
                closeModal('newTaskModal'); 
                renderList(); 
                return;
            }
            
            try { 
                await apiFetch('/tasks', 'POST', body);
                closeModal('newTaskModal');
                await loadAll();
                PAMS.toast(`Task "${titleVal}" created successfully.`, 'success');
            } catch (err) {
                PAMS.toast(err.message, 'error'); 
            }
        },
        openView: (id) => {
            const t = tasks.find(x => x.id === id); if (!t) return;
            viewingId = id;
            document.getElementById('view-title').textContent = t.title;
            document.getElementById('view-desc').textContent = t.description || '—';
            document.getElementById('view-status').textContent = t.status;
            document.getElementById('view-priority').textContent = t.priority;
            document.getElementById('view-assignee').textContent = t.assignee?.name || 'Unassigned';
            document.getElementById('view-due').textContent = fmtDate(t.dueDate);
            openModal('viewModal');
        },
        openEdit: (id) => {
            const t = tasks.find(x => x.id === id); if (!t) return;
            document.getElementById('edit-id').value = id;
            document.getElementById('edit-title').value = t.title;
            document.getElementById('edit-desc').value = t.description || '';

            // Sync the 200 char counter for the edit description field
            const editDescCount = document.getElementById('edit-desc-count');
            if (editDescCount) {
                editDescCount.textContent = (t.description || '').length;
            }

            document.getElementById('edit-status').value = t.status;
            document.getElementById('edit-priority').value = t.priority;
            document.getElementById('edit-status').dispatchEvent(new Event('change', { bubbles: true }));
            document.getElementById('edit-priority').dispatchEvent(new Event('change', { bubbles: true }));
            document.getElementById('edit-due').value = t.dueDate.slice(0, 10);
            openModal('editModal');
        },
        saveEdit: async () => {
            const id = document.getElementById('edit-id').value;
            
            // Grab ALL fields from the edit modal
            const body = { 
                title: document.getElementById('edit-title').value, 
                description: document.getElementById('edit-desc').value,
                status: document.getElementById('edit-status').value,
                priority: document.getElementById('edit-priority').value,
                dueDate: document.getElementById('edit-due').value
            };
            
            if (CONFIG.USE_MOCK_API) {
                const t = tasks.find(x => x.id == id); 
                Object.assign(t, body);
                closeModal('editModal'); 
                renderList(); 
                return;
            }
            
            try { 
                await apiFetch(`/tasks/${id}`, 'PUT', body);
                closeModal('editModal');
                await loadAll();
                PAMS.toast(`Task "${body.title}" updated successfully.`, 'success');
            } catch (err) {
                PAMS.toast(err.message, 'error'); 
            }
        },
        openDeleteTask: (id) => {
            viewingId = id;
            const t = tasks.find(x => x.id == id);
            const delName = document.getElementById('delete-name');
            if (delName) delName.textContent = t?.title || '';
            openModal('deleteModal');
        },
        doDelete: async () => {
            if (CONFIG.USE_MOCK_API) {
                tasks = tasks.filter(x => x.id != viewingId);
                closeModal('deleteModal'); renderList(); return;
            }
            const deleted = tasks.find(x => x.id == viewingId);
            try { await apiFetch(`/tasks/${viewingId}`, 'DELETE'); closeModal('deleteModal'); await loadAll(); PAMS.toast(`Task "${deleted?.title || ''}" deleted successfully.`, 'success'); }
            catch (err) { PAMS.toast(err.message, 'error'); }
        },
        completeTask: async (id) => {
            const t = tasks.find(x => x.id === id);
            if (!t) return;
            if (CONFIG.USE_MOCK_API) {
                t.status = 'COMPLETED';
                renderList();
                updateOverdueBanner();
                return;
            }
            try {
                await apiFetch(`/tasks/${id}`, 'PUT', { status: 'COMPLETED' });
                await loadAll();
                PAMS.toast(`Task "${t.title}" marked as completed.`, 'success');
            } catch (err) {
                PAMS.toast(err.message, 'error');
            }
        },
        openEditFromView: () => { closeModal('viewModal'); window.TaskBoard.openEdit(viewingId); },
        openDeleteFromView: () => { closeModal('viewModal'); window.TaskBoard.openDeleteTask(viewingId); },
        closeModal: (id) => closeModal(id),
        clearFilters: () => {
            ['filterGroup', 'filterPriority', 'filterAssignee'].forEach(id => {
                const el = document.getElementById(id);
                if (el) { el.value = ''; el.dispatchEvent(new Event('change', { bubbles: true })); }
            });
            const search = document.getElementById('tbSearch');
            if (search) { search.value = ''; search.dispatchEvent(new Event('input', { bubbles: true })); }
        },
        exportVisibleTasks: () => {
            // Grab the exact list of tasks currently visible on the screen
            const list = applyAllFilters();
            
            if (list.length === 0) {
                PAMS.toast("No tasks visible to export.", "warning");
                return;
            }

            // 1. Create the CSV Header row
            let csvContent = "ID,Title,Priority,Status,Assignee,Due Date,Assigned By\n";

            // 2. Loop through the tasks and build the rows
            list.forEach(t => {
                // Helper to escape commas and quotes inside text fields (like titles)
                const escape = (str) => `"${(str || '').toString().replace(/"/g, '""')}"`;
                
                const row = [
                    t.id,
                    escape(t.title),
                    t.priority,
                    t.status,
                    escape(t.assignee?.name || 'Unassigned'),
                    t.dueDate ? t.dueDate.split('T')[0] : '', // Clean up the date format
                    escape(t.assignedByName)
                ];
                
                csvContent += row.join(",") + "\n";
            });

            // 3. Create a downloadable Blob (a raw data file in memory)
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            
            // 4. Create a hidden link, click it to trigger download, and remove it
            const link = document.createElement("a");
            link.setAttribute("href", url);
            
            // Name the file dynamically based on today's date
            const todayStr = new Date().toISOString().split('T')[0];
            link.setAttribute("download", `PAMS_Task_Export_${todayStr}.csv`);
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            PAMS.toast(`Exported ${list.length} task${list.length === 1 ? '' : 's'} to CSV.`, 'success');
        }
    };
})();

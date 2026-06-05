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
        const userOpts = users.map(u => `<option value="user:${u.email}">${u.name || u.email}</option>`).join('');
        const groupOpts = groups.map(g => `<option value="group:${g.id}">${g.name}</option>`).join('');
        const innerHTML = `<option value="">Select assignee</option><optgroup label="Users">${userOpts}</optgroup><optgroup label="Groups">${groupOpts}</optgroup>`;

        const ntAss = document.getElementById('nt-assignee');
        const edAss = document.getElementById('edit-assignee');
        if (ntAss) ntAss.innerHTML = innerHTML;
        if (edAss) edAss.innerHTML = innerHTML;
    }

    function buildFilterOptions() {
        const groupNames = [...new Set(tasks.filter(t => t.assignee?.type === 'group').map(t => t.assignee.name))].sort();
        const assignees = [...new Set(tasks.map(t => t.assignee?.name).filter(Boolean))].sort();

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
                <button class="ribbon-btn ghost" onclick="window.TaskBoard.openEdit(${t.id})"><i class="fa-solid fa-pen"></i></button>
                <button class="ribbon-btn ghost" onclick="window.TaskBoard.openDeleteTask(${t.id})"><i class="fa-solid fa-trash"></i></button>
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
        },
        createTask: async () => {
            const titleVal = document.getElementById('nt-title').value.trim();
            const descVal = document.getElementById('nt-desc').value.trim();
            const priorityVal = document.getElementById('nt-priority').value;
            const dueVal = document.getElementById('nt-due').value;
            const assigneeVal = document.getElementById('nt-assignee').value;

            // --- 1. Client-Side Validation ---
            if (!titleVal || !priorityVal || !dueVal || !assigneeVal) {
                alert("Please fill in all required fields: Task Title, Priority, Due Date, and Assign To.");
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
            } catch (err) { 
                alert(err.message); 
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
            document.getElementById('edit-status').value = t.status;
            document.getElementById('edit-priority').value = t.priority;
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
            } catch (err) { 
                alert(err.message); 
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
            try { await apiFetch(`/tasks/${viewingId}`, 'DELETE'); closeModal('deleteModal'); await loadAll(); }
            catch (err) { alert(err.message); }
        },
        openEditFromView: () => { closeModal('viewModal'); window.TaskBoard.openEdit(viewingId); },
        openDeleteFromView: () => { closeModal('viewModal'); window.TaskBoard.openDeleteTask(viewingId); },
        closeModal: (id) => closeModal(id),
        clearFilters: () => {
            ['filterGroup', 'filterPriority', 'filterAssignee', 'tbSearch'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            renderList();
        },
        exportVisibleTasks: () => alert('Export feature triggered (Mock)')
    };
})();

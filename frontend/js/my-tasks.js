/**
 * my-tasks.js
 * Purpose: Logic for individual personnel task tracking and accomplishment logging.
 */

(function () {
    const { apiFetch, requireAuth, fmtDate, fmtHeaderDate, getUser } = PAMS;

    let tasks = [];
    let deleteTarget = null;
    let currentView = 'active'; // 'active' | 'completed'

    document.addEventListener('DOMContentLoaded', async () => {
        if (!requireAuth()) return;
        PAMS_UI.init();

        const dateEl = document.getElementById('headerDate');
        if (dateEl) dateEl.textContent = fmtHeaderDate();

        injectViewToggle();
        await loadTasks();
    });

    function injectViewToggle() {
        const panelHead = document.querySelector('.my-tasks-panel .panel-head');
        if (!panelHead || document.getElementById('mtViewToggle')) return;

        const toggle = document.createElement('div');
        toggle.className = 'mt-view-toggle';
        toggle.setAttribute('role', 'group');
        toggle.setAttribute('aria-label', 'Task view selection');
        toggle.id = 'mtViewToggle';
        toggle.innerHTML = `
            <button class="mt-view-tab active" id="mtTabActive" role="button" aria-pressed="true" onclick="window.MyTasks.switchView('active')">
                <i class="fa-solid fa-list-check" aria-hidden="true"></i> Active
            </button>
            <button class="mt-view-tab" id="mtTabCompleted" role="button" aria-pressed="false" onclick="window.MyTasks.switchView('completed')">
                <i class="fa-solid fa-circle-check" aria-hidden="true"></i> Completed
            </button>`;

        // Insert the toggle before the search-wrap inside panel-head
        const searchWrap = panelHead.querySelector('.search-wrap');
        const container = searchWrap ? searchWrap.parentElement : panelHead;
        container.insertBefore(toggle, searchWrap || null);
    }

    async function loadTasks() {
        try {
            const me = getUser();
            if (CONFIG.USE_MOCK_API) {
                const allMock = [
                    { id: 1, title: 'Process Student Appeals', priority: 'URGENT', status: 'IN PROGRESS', dueDate: '2026-05-25', updatedAt: '2026-05-27', assignedByName: 'Admin', description: 'Review the latest batch of appeals for the summer semester.' },
                    { id: 2, title: 'Update Faculty Records', priority: 'MEDIUM', status: 'PENDING', dueDate: '2026-06-01', updatedAt: '2026-05-26', assignedByName: 'Head', description: 'Verify employment certificates and update database.' },
                    { id: 3, title: 'Office Inventory', priority: 'LOW', status: 'COMPLETED', dueDate: '2026-05-15', updatedAt: '2026-05-14', assignedByName: 'System', description: 'Annual inventory of office equipment and supplies.' }
                ];
                tasks = currentView === 'completed'
                    ? allMock.filter(t => t.status === 'COMPLETED')
                    : allMock.filter(t => t.status !== 'COMPLETED');
            } else {
                const emailParam = `email=${encodeURIComponent(me.email)}`;
                const url = currentView === 'completed'
                    ? `/tasks/me?${emailParam}&view=completed`
                    : `/tasks/me?${emailParam}`;
                const { tasks: rows } = await apiFetch(url);
                tasks = rows;
            }
            renderTasks();
        } catch (err) {
            console.error('Load failed:', err);
            const tbody = document.getElementById('taskTableBody');
            if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="log-empty">Failed to load your tasks.</td></tr>';
        }
    }

    function renderTasks(data = tasks) {
        const tbody = document.getElementById('taskTableBody');
        if (!tbody) return;

        const today = new Date(new Date().toDateString());

        // Overdue banner: only relevant for the active view
        const banner = document.getElementById('alertBanner');
        const alertText = document.getElementById('alertText');
        if (banner && alertText) {
            if (currentView === 'active') {
                const overdueCount = tasks.filter(t =>
                    t.status !== 'COMPLETED' && t.status !== 'CANCELLED' && new Date(t.dueDate) < today
                ).length;
                if (overdueCount > 0) {
                    alertText.textContent = `${overdueCount} task${overdueCount > 1 ? 's are' : ' is'} overdue.`;
                    banner.classList.remove('hidden');
                } else {
                    banner.classList.add('hidden');
                }
            } else {
                banner.classList.add('hidden');
            }
        }

        if (data.length === 0) {
            const emptyMsg = currentView === 'completed'
                ? 'No completed tasks yet.'
                : 'No matching tasks found.';
            tbody.innerHTML = `<tr><td colspan="7" class="log-empty">${emptyMsg}</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map((t, i) => {
            // Completed view: never show overdue highlight (also, isOverdue logic already
            // excludes COMPLETED status, so this is belt-and-suspenders for safety).
            const isOverdue = currentView === 'active'
                && t.status !== 'COMPLETED' && t.status !== 'CANCELLED'
                && new Date(t.dueDate) < today;
            const pCls = { URGENT: 'badge-urgent', HIGH: 'badge-urgent', MEDIUM: 'badge-in_progress', LOW: 'badge-pending' }[t.priority] || '';
            const sCls = 'badge-' + t.status.toLowerCase().replace(' ', '_');
            const isTerminal = t.status === 'COMPLETED' || t.status === 'CANCELLED';

            return `
            <tr class="${isOverdue ? 'task-overdue' : ''}"${isOverdue ? ' aria-label="Overdue task"' : ''}>
                <td>${i + 1}</td>
                <td class="task-name" title="${t.title.replace(/"/g, '&quot;')}">${t.title}${isOverdue ? '<span class="overdue-tag" title="This task is past its due date"><i class="fa-solid fa-clock" aria-hidden="true"></i> OVERDUE</span>' : ''}</td>
                <td><span class="badge ${pCls}">${t.priority}</span></td>
                <td><span class="badge ${sCls}">${t.status}</span></td>
                <td class="td-nowrap">${fmtDate(t.dueDate)}</td>
                <td class="td-nowrap">${fmtDate(t.updatedAt)}</td>
                <td class="td-nowrap">
                    <div class="flex gap-2">
                        ${currentView === 'completed'
                            ? `<button class="act-btn act-complete" title="Reopen (set to In Progress)" aria-label="Reopen task" onclick="window.MyTasks.reopenTask(${t.id})"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i></button>`
                            : `<button class="act-btn act-complete" title="Mark as Completed" aria-label="Mark task as completed" onclick="window.MyTasks.completeTask(${t.id})"${isTerminal ? ' disabled aria-disabled="true"' : ''}><i class="fa-solid fa-circle-check" aria-hidden="true"></i></button>`}
                        <button class="act-btn" title="View Details" aria-label="View task details" onclick="window.MyTasks.openViewTask(${t.id})"><i class="fa-solid fa-ellipsis" aria-hidden="true"></i></button>
                        <button class="act-btn act-delete" title="Remove" onclick="window.MyTasks.openDeleteTask(${t.id})"><i class="fa-solid fa-trash-can"></i></button>
                    </div>
                </td>
            </tr>`;
        }).join('');
    }

    /**
     * Modal Management
     */
    const openModal = (id) => document.getElementById(id)?.classList.add('open');
    const closeModal = (id) => document.getElementById(id)?.classList.remove('open');

    // Export public methods for inline handlers
    window.MyTasks = {
        openViewTask: async (id) => {
            const t = tasks.find(x => x.id === id);
            if (!t) return;

            let updates = [];
            if (CONFIG.USE_MOCK_API) {
                updates = [
                    { logged_at: '2026-05-27T10:00:00Z', updated_text: 'Started initial review of documents.', status_change: 'IN PROGRESS' },
                    { logged_at: '2026-05-26T14:30:00Z', updated_text: 'Received the assignment from Head Office.', status_change: 'PENDING' }
                ];
            } else {
                const data = await apiFetch(`/tasks/${id}`);
                updates = data.updates;
            }

            const logsHtml = updates.length
                ? updates.map(l => `
                    <div class="log-entry">
                        <span class="log-date">${fmtDate(l.logged_at)}</span>
                        <span class="log-note">${l.updated_text || ''}${l.status_change ? ` <em>(${l.status_change})</em>` : ''}</span>
                    </div>`).join('')
                : '<p class="log-empty">No updates logged yet.</p>';

            const bodyEl = document.getElementById('viewTaskBody');
            if (bodyEl) {
                bodyEl.innerHTML = `
                    <div class="detail-grid">
                        <div class="detail-item full"><label>Task Name</label><div class="val">${t.title}</div></div>
                        <div class="detail-item"><label>Priority</label><div class="val">${t.priority}</div></div>
                        <div class="detail-item"><label>Status</label><div class="val">${t.status}</div></div>
                        <div class="detail-item"><label>Due Date</label><div class="val">${fmtDate(t.dueDate)}</div></div>
                        <div class="detail-item"><label>Assigned By</label><div class="val">${t.assignedByName || '—'}</div></div>
                        ${t.description ? `<div class="detail-item full"><label>Description</label><div class="val" style="font-weight:400; color:var(--gray-700);">${t.description}</div></div>` : ''}
                    </div>
                    <div class="update-log">
                        <div class="update-log-title"><i class="fa-solid fa-clock-rotate-left"></i> Activity Log</div>
                        ${logsHtml}
                    </div>`;
            }
            openModal('viewTaskModal');
        },
        openModal: (id) => {
            if (id === 'logUpdateModal') {
                const sel = document.getElementById('log-task-select');
                if (sel) {
                    sel.innerHTML = '<option value="">— Choose a task —</option>' +
                        tasks.filter(t => t.status !== 'COMPLETED').map(t => `<option value="${t.id}">${t.title}</option>`).join('');
                }
                const notes = document.getElementById('log-notes');
                const status = document.getElementById('log-new-status');
                if (notes) notes.value = '';
                if (status) status.value = '';
            }
            openModal(id);
        },
        closeModal: (id) => closeModal(id),
        saveLogUpdate: async () => {
            const taskId = document.getElementById('log-task-select')?.value;
            const notes = document.getElementById('log-notes')?.value.trim();
            const statusChange = document.getElementById('log-new-status')?.value;

            if (!taskId || !notes) { alert('Please select a task and provide update notes.'); return; }

            if (CONFIG.USE_MOCK_API) {
                const t = tasks.find(x => x.id == taskId);
                if (t) {
                    if (statusChange) t.status = statusChange;
                    t.updatedAt = new Date().toISOString();
                }
                closeModal('logUpdateModal');
                renderTasks();
                return;
            }

            try {
                await apiFetch('/tasks/updates', 'POST', { taskId, email: getUser().email, notes, statusChange: statusChange || null });
                closeModal('logUpdateModal');
                await loadTasks();
            } catch (err) { alert(err.message); }
        },
        openDeleteTask: (id) => {
            deleteTarget = id;
            const delName = document.getElementById('deleteTaskName');
            if (delName) delName.textContent = tasks.find(x => x.id == id)?.title || '';
            openModal('deleteModal');
        },
        confirmDelete: async () => {
            if (CONFIG.USE_MOCK_API) {
                tasks = tasks.filter(x => x.id != deleteTarget);
                closeModal('deleteModal');
                renderTasks();
                return;
            }
            try {
                await apiFetch(`/tasks/${deleteTarget}`, 'DELETE');
                closeModal('deleteModal');
                await loadTasks();
            } catch (err) { alert(err.message); }
        },
        completeTask: async (id) => {
            const t = tasks.find(x => x.id === id);
            if (!t) return;
            if (CONFIG.USE_MOCK_API) {
                tasks = tasks.filter(x => x.id !== id);
                renderTasks();
                return;
            }
            try {
                await apiFetch(`/tasks/${id}`, 'PUT', { status: 'COMPLETED' });
                await loadTasks();
            } catch (err) {
                alert(err.message);
            }
        },
        reopenTask: async (id) => {
            const t = tasks.find(x => x.id === id);
            if (!t) return;
            if (CONFIG.USE_MOCK_API) {
                tasks = tasks.filter(x => x.id !== id); // leaves the Completed view once reopened
                renderTasks();
                return;
            }
            try {
                await apiFetch(`/tasks/${id}`, 'PUT', { status: 'IN PROGRESS' });
                await loadTasks();
            } catch (err) {
                alert(err.message);
            }
        },
        switchView: async (view) => {
            if (view === currentView) return;
            currentView = view;

            // Update toggle button states
            const tabActive = document.getElementById('mtTabActive');
            const tabCompleted = document.getElementById('mtTabCompleted');
            if (tabActive && tabCompleted) {
                const isActive = view === 'active';
                tabActive.classList.toggle('active', isActive);
                tabActive.setAttribute('aria-pressed', String(isActive));
                tabCompleted.classList.toggle('active', !isActive);
                tabCompleted.setAttribute('aria-pressed', String(!isActive));
            }

            await loadTasks();
        },
        scrollToTable: () => {
            const panel = document.querySelector('.panel');
            if (panel) panel.scrollIntoView({ behavior: 'smooth' });
        }
    };

    // SEARCH FUNCTIONALITY
    const searchInput = document.getElementById('taskSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            if (!query) {
                renderTasks(tasks);
                return;
            }

            const filtered = tasks.filter(t => 
                (t.title || '').toLowerCase().includes(query) || 
                (t.description || '').toLowerCase().includes(query)
            );
            renderTasks(filtered);
        });
    }
})();

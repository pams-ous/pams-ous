/**
 * my-tasks.js
 * Purpose: Logic for individual personnel task tracking and accomplishment logging.
 */

(function () {
    const { apiFetch, requireAuth, fmtDate, fmtHeaderDate, getUser } = PAMS;

    let tasks = [];
    let deleteTarget = null;

    document.addEventListener('DOMContentLoaded', async () => {
        if (!requireAuth()) return;
        PAMS_UI.init();

        const dateEl = document.getElementById('headerDate');
        if (dateEl) dateEl.textContent = fmtHeaderDate();

        await loadTasks();
    });

    async function loadTasks() {
        try {
            const me = getUser();
            if (CONFIG.USE_MOCK_API) {
                tasks = [
                    { id: 1, title: 'Process Student Appeals', priority: 'URGENT', status: 'IN PROGRESS', dueDate: '2026-05-25', updatedAt: '2026-05-27', assignedByName: 'Admin', description: 'Review the latest batch of appeals for the summer semester.' },
                    { id: 2, title: 'Update Faculty Records', priority: 'MEDIUM', status: 'PENDING', dueDate: '2026-06-01', updatedAt: '2026-05-26', assignedByName: 'Head', description: 'Verify employment certificates and update database.' },
                    { id: 3, title: 'Office Inventory', priority: 'LOW', status: 'COMPLETED', dueDate: '2026-05-15', updatedAt: '2026-05-14', assignedByName: 'System', description: 'Annual inventory of office equipment and supplies.' }
                ];
            } else {
                const { tasks: rows } = await apiFetch(`/tasks/me?email=${encodeURIComponent(me.email)}`);
                tasks = rows;
            }
            renderTasks();
        } catch (err) {
            console.error('Load failed:', err);
            const tbody = document.getElementById('taskTableBody');
            if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="log-empty">Failed to load your tasks.</td></tr>';
        }
    }

    function renderTasks() {
        const tbody = document.getElementById('taskTableBody');
        if (!tbody) return;

        const today = new Date(new Date().toDateString());

        const overdue = tasks.filter(t =>
            t.status !== 'COMPLETED' && t.status !== 'CANCELLED' && new Date(t.dueDate) < today
        );

        const banner = document.getElementById('alertBanner');
        const alertText = document.getElementById('alertText');
        if (banner && alertText) {
            if (overdue.length > 0) {
                alertText.textContent = `${overdue.length} task${overdue.length > 1 ? 's are' : ' is'} overdue.`;
                banner.classList.remove('hidden');
            } else {
                banner.classList.add('hidden');
            }
        }

        if (tasks.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="log-empty">No tasks assigned to you yet.</td></tr>';
            return;
        }

        tbody.innerHTML = tasks.map((t, i) => {
            const isOverdue = t.status !== 'COMPLETED' && t.status !== 'CANCELLED' && new Date(t.dueDate) < today;
            const pCls = { URGENT: 'badge-urgent', HIGH: 'badge-urgent', MEDIUM: 'badge-in_progress', LOW: 'badge-pending' }[t.priority] || '';
            const sCls = 'badge-' + t.status.toLowerCase().replace(' ', '_');

            return `
            <tr class="${isOverdue ? 'task-overdue' : ''}">
                <td>${i + 1}</td>
                <td class="task-name">${t.title}${isOverdue ? '<span class="overdue-tag">OVERDUE</span>' : ''}</td>
                <td><span class="badge ${pCls}">${t.priority}</span></td>
                <td><span class="badge ${sCls}">${t.status}</span></td>
                <td>${fmtDate(t.dueDate)}</td>
                <td>${fmtDate(t.updatedAt)}</td>
                <td>
                    <div class="flex gap-2">
                        <button class="act-btn" title="View Details" onclick="window.MyTasks.openViewTask(${t.id})"><i class="fa-solid fa-eye"></i></button>
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
            const tasks = document.querySelectorAll('.task-item, .task-card, [data-task-id]');

            tasks.forEach(task => {
                const titleEl = task.querySelector('.task-title, h3, h4');
                // Added a selector for the description (adjust the class name if yours is different)
                const descEl = task.querySelector('.task-description, .description, p');
                
                const titleText = titleEl ? titleEl.textContent.toLowerCase() : '';
                const descText = descEl ? descEl.textContent.toLowerCase() : '';

                // Check if the query matches the title OR the description
                const isVisible = titleText.includes(query) || descText.includes(query);
                
                task.style.display = isVisible ? '' : 'none';
            });
        });
    }
// END SEARCH FUNCTIONALITY
})();

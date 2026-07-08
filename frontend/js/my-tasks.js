/**
 * my-tasks.js
 * Purpose: Logic for individual personnel task tracking and accomplishment logging.
 */

(function () {
    const { apiFetch, requireAuth, fmtDate, fmtHeaderDate, getUser, escapeHtml } = PAMS;

    let tasks = [];
    let deleteTarget = null;
    let currentView = 'active'; // 'active' | 'completed'
    let searchQuery = '';

    document.addEventListener('DOMContentLoaded', async () => {
        if (!requireAuth()) return;
        PAMS_UI.init();

        const dateEl = document.getElementById('headerDate');
        if (dateEl) dateEl.textContent = fmtHeaderDate();

        injectViewToggle();

        const logNotes = document.getElementById('log-notes');
        const logNotesCount = document.getElementById('log-notes-count');
        if (logNotes && logNotesCount) {
            logNotes.addEventListener('input', () => {
                logNotesCount.textContent = logNotes.value.length;
            });
        }

        await loadTasks();

        // Listen for task changes from other users and refresh in real-time
        if (PAMS && PAMS.socket) {
            PAMS.socket.on('tasksChanged', () => {
                loadTasks();
            });
        }
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
                    { id: 1, title: 'Process Student Appeals', status: 'IN PROGRESS', updatedAt: '2026-05-27', assignedByName: 'Admin', description: 'Review the latest batch of appeals for the summer semester.' },
                    { id: 2, title: 'Update Faculty Records', status: 'PENDING', updatedAt: '2026-05-26', assignedByName: 'Head', description: 'Verify employment certificates and update database.' },
                    { id: 3, title: 'Office Inventory', status: 'COMPLETED', updatedAt: '2026-05-14', assignedByName: 'System', description: 'Annual inventory of office equipment and supplies.' }
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
            // Overdue banner removed — due date no longer tracked
            banner.classList.add('hidden');
        }

        if (data.length === 0) {
            const emptyMsg = currentView === 'completed'
                ? 'No completed tasks yet.'
                : 'No matching tasks found.';
            tbody.innerHTML = `<tr><td colspan="5" class="log-empty">${emptyMsg}</td></tr>`;
            return;
        }

        tbody.innerHTML = data.map((t, i) => {
            const sCls = 'badge-' + t.status.toLowerCase().replace(' ', '_');
            const isTerminal = t.status === 'COMPLETED' || t.status === 'CANCELLED';

            return `
            <tr>
                <td>${i + 1}</td>
                <td class="task-name" title="${escapeHtml(t.title)}">${escapeHtml(t.title)}</td>
                <td><span class="badge ${sCls}">${t.status}</span></td>
                <td class="td-nowrap">${fmtDate(t.updatedAt)}</td>
                <td class="td-nowrap">
                    <div class="flex gap-2">
                        ${currentView === 'completed'
                            ? `<button class="act-btn act-reopen" title="Reopen (Set to In Progress)" aria-label="Reopen task" onclick="window.MyTasks.reopenTask(${t.id})"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i></button>`
                            : `<button class="act-btn act-complete" title="Mark as Completed" aria-label="Mark task as completed" onclick="window.MyTasks.completeTask(${t.id})"${isTerminal ? ' disabled aria-disabled="true"' : ''}><i class="fa-solid fa-circle-check" aria-hidden="true"></i></button>`}
                        <button class="act-btn act-view" title="View Details" aria-label="View task details" onclick="window.MyTasks.openViewTask(${t.id})"><i class="fa-solid fa-circle-info" aria-hidden="true"></i></button>
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

            // Only render attachments that are real http(s) links (the backend
            // enforces this too, but guard on display as defense-in-depth).
            const safeUrl = (u) => (typeof u === 'string' && /^https?:\/\/[^\s]+$/i.test(u.trim())) ? u.trim() : '';

            const logsHtml = updates.length
                ? updates.map(l => {
                    const url = safeUrl(l.attachment_url);
                    const attachHtml = url
                        ? `<a class="log-attachment" href="${url}" target="_blank" rel="noopener noreferrer">
                                <i class="fa-solid fa-paperclip" aria-hidden="true"></i> Attachment
                           </a>`
                        : '';
                    return `
                    <div class="log-entry">
                        <span class="log-date">${fmtDate(l.logged_at)}</span>
                        <span class="log-note">${escapeHtml(l.updated_text || '')}${l.status_change ? ` <em>(${escapeHtml(l.status_change)})</em>` : ''}</span>
                        ${attachHtml}
                    </div>`;
                }).join('')
                : '<p class="log-empty">No updates logged yet.</p>';

            // Dedicated, always-visible URL section: collect every attached link
            // across the task's updates (newest first) so it is easy to find.
            const attachments = updates
                .map(l => ({ url: safeUrl(l.attachment_url), date: l.logged_at }))
                .filter(a => a.url);

            const attachmentsHtml = `
                <div class="update-log">
                    <div class="update-log-title"><i class="fa-solid fa-link" aria-hidden="true"></i> Attachments</div>
                    ${attachments.length
                        ? `<div class="attach-list">${attachments.map(a => `
                            <a class="attach-link" href="${a.url}" target="_blank" rel="noopener noreferrer">
                                <i class="fa-solid fa-paperclip" aria-hidden="true"></i>
                                <span class="attach-url">${a.url}</span>
                                <span class="attach-date">${fmtDate(a.date)}</span>
                            </a>`).join('')}</div>`
                        : '<p class="log-empty">No URL attached.</p>'}
                </div>`;

            const bodyEl = document.getElementById('viewTaskBody');
            if (bodyEl) {
                bodyEl.innerHTML = `
                    <div class="detail-grid">
                        <div class="detail-item"><label>Task Name</label><div class="val">${escapeHtml(t.title)}</div></div>
                        <div class="detail-item"><label>Status</label><div class="val">${escapeHtml(t.status)}</div></div>
                        <div class="detail-item"><label>Assigned To</label><div class="val">${escapeHtml(t.assignedToName || '—')}</div></div>
                        <div class="detail-item"><label>Assigned By</label><div class="val">${escapeHtml(t.assignedByName || '—')}</div></div>
                        ${t.description ? `<div class="detail-item full"><label>Description</label><div class="val" style="font-weight:400; color:var(--gray-700);">${escapeHtml(t.description)}</div></div>` : ''}
                    </div>
                    ${attachmentsHtml}
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
                        tasks.filter(t => t.status !== 'COMPLETED').map(t => `<option value="${t.id}">${escapeHtml(t.title.length > 60 ? t.title.slice(0, 60) + '...' : t.title)}</option>`).join('');
                }
                const notes = document.getElementById('log-notes');
                const status = document.getElementById('log-new-status');
                const attachment = document.getElementById('log-attachment');
                if (notes) notes.value = '';
                if (status) status.value = '';
                if (attachment) attachment.value = '';
            }
            openModal(id);
        },
        closeModal: (id) => closeModal(id),
        saveLogUpdate: async () => {
            const taskId = document.getElementById('log-task-select')?.value;
            const notes = document.getElementById('log-notes')?.value.trim();
            const statusChange = document.getElementById('log-new-status')?.value;
            const attachmentUrl = document.getElementById('log-attachment')?.value.trim() || '';

            // Notes are optional — a status change OR an attachment alone is a
            // valid update. We only require that the update does *something*.
            if (!taskId) { PAMS.toast('Please select a task.', 'warning'); return; }
            if (!notes && !statusChange && !attachmentUrl) {
                PAMS.toast('Provide update notes, a status change, or an attachment URL.', 'warning'); return;
            }
            if (attachmentUrl && !/^https?:\/\/[^\s]+$/i.test(attachmentUrl)) {
                PAMS.toast('Attachment must be a valid http(s) URL.', 'warning'); return;
            }

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
                await apiFetch('/tasks/updates', 'POST', { taskId, email: getUser().email, notes, statusChange: statusChange || null, attachmentUrl: attachmentUrl || null });
                closeModal('logUpdateModal');
                await loadTasks();
                PAMS.toast('Task update logged successfully.', 'success');
            } catch (err) { PAMS.toast(err.message, 'error'); }
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
                const deleted = tasks.find(x => x.id == deleteTarget);
                await apiFetch(`/tasks/${deleteTarget}`, 'DELETE');
                closeModal('deleteModal');
                await loadTasks();
                PAMS.toast(`Task "${deleted?.title || ''}" deleted successfully.`, 'success');
            } catch (err) { PAMS.toast(err.message, 'error'); }
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
                PAMS.toast(`Task "${t.title}" marked as completed.`, 'success');
            } catch (err) {
                PAMS.toast(err.message, 'error');
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
                PAMS.toast(`Task "${t.title}" reopened.`, 'success');
            } catch (err) {
                PAMS.toast(err.message, 'error');
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
            applySearch();
        },
        scrollToTable: () => {
            const panel = document.querySelector('.panel');
            if (panel) panel.scrollIntoView({ behavior: 'smooth' });
        }
    };

    function applySearch() {
        const query = searchQuery;
        if (!query) {
            renderTasks(tasks);
            return;
        }

        const filtered = tasks.filter(t =>
            (t.title || '').toLowerCase().includes(query) ||
            (t.description || '').toLowerCase().includes(query)
        );
        renderTasks(filtered);
    }

    // SEARCH FUNCTIONALITY
    const searchInput = document.getElementById('taskSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.toLowerCase().trim();
            applySearch();
        });
    }

})();

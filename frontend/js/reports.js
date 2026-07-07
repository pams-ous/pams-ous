/**
 * reports.js
 * Purpose: Admin-only report generation and history management.
 * Refactored: Uses Socket.io to match the team's professional backend standard.
 */

(function () {
    const { requireAuth, fmtDate, fmtHeaderDate, getUser } = PAMS;

    // Timezone-safe local date utilities
    function parseLocalDate(dateStr) {
        if (!dateStr) return null;
        const parts = dateStr.split('-');
        if (parts.length !== 3) return null;
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const d = parseInt(parts[2], 10);
        if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
        return new Date(y, m - 1, d);
    }

    function formatLocalDate(date) {
        if (!date || isNaN(date.getTime())) return '';
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    let reports = [];
    let activeReportId = null;
    let reportToDelete = null;
    let chart;
    let allUsers = [];
    let searchQuery = '';
    let sortMode = 'date-desc';
    let expandedTasks = new Set();
    let currentPage = 1;
    let pageSize = 10;
    let totalReports = 0;

    document.addEventListener('DOMContentLoaded', async () => {
        if (!requireAuth()) return;
        PAMS_UI.init();

        const dateEl = document.getElementById('headerDate');
        if (dateEl) dateEl.textContent = fmtHeaderDate();

        // 1. Initialize Socket Listeners for Reports
        setupSocketListeners();

        // 2. Initial Data Load (Wait for socket to be ready)
        const checkSocket = setInterval(() => {
            if (PAMS.socket && PAMS.socket.connected) {
                loadReports();
                clearInterval(checkSocket);
            }
        }, 500);
        
        // Timeout after 5 seconds
        setTimeout(() => clearInterval(checkSocket), 5000);
    });

    /**
     * Socket Logic
     */
    function setupSocketListeners() {
        if (!PAMS.socket) {
            // Silently wait for the global socket in api.js to initialize
            setTimeout(setupSocketListeners, 100);
            return;
        }

        // Clean up previous listeners if any (important for hot-reloads)
        PAMS.socket.off('reportLog');
        PAMS.socket.off('reportGenerated');

        // Listen for the unified report log event
        PAMS.socket.on('reportLog', (result) => {
            if (!result.success) {
                console.error("Report API Error:", result.rawData);
                PAMS.toast(`Report Error: ${result.rawData || 'Unknown error'}`, 'error');
                return;
            }

            switch (result.stage) {
                case 'list':
                    reports = result.data || [];
                    if (result.pagination) {
                        currentPage = result.pagination.page;
                        pageSize = result.pagination.pageSize;
                        totalReports = result.pagination.total;
                    }
                    renderHistory();
                    if (reports.length > 0 && !activeReportId) {
                        selectReport(reports[0].report_id);
                    }
                    break;
                
                case 'details':
                    renderReportPreview(result.data);
                    break;

                case 'generate':
                    PAMS.toast(result.rawData || "Report generated successfully!", 'success');
                    currentPage = 1;
                    loadReports(); // Refresh the list
                    break;

                case 'delete':
                    closeModal('deleteReportModal');
                    loadReports();
                    PAMS.toast("Report deleted successfully!", "success");
                    break;
            }
        });

        // Listen for real-time broadcasts
        PAMS.socket.on('reportGenerated', (data) => {
            currentPage = 1;
            loadReports(); 
        });

        PAMS.socket.on('reportDeleted', (id) => {
            if (activeReportId === id) activeReportId = null;
            loadReports();
        });
    }

    function loadReports() {
        if (CONFIG.USE_MOCK_API) {
            reports = [
                { report_id: 1, report_type: 'Weekly', scope_type: 'All', generated_at: '2026-05-27T08:00:00Z', generated_by_name: 'Admin', period_start: '2026-05-18', period_end: '2026-05-24' },
                { report_id: 2, report_type: 'Daily', scope_type: 'Group', generated_at: '2026-05-20T14:30:00Z', generated_by_name: 'Admin', period_start: '2026-05-11', period_end: '2026-05-17' }
            ];
            renderHistory();
            if (reports.length > 0) selectReport(reports[0].report_id);
            return;
        }

        if (PAMS.socket && PAMS.socket.connected) {
            PAMS.socket.emit('getReports', { page: currentPage, pageSize });
        } else {
            console.warn("Cannot load reports: Socket disconnected.");
        }
    }

    async function selectReport(id) {
        activeReportId = id;
        renderHistory();

        if (CONFIG.USE_MOCK_API) {
            renderReportPreview([
                {
                    task_id: 101,
                    title: 'Process Student Appeals',
                    description: 'Review and evaluate pending student appeal forms regarding grading, course credits, and retention policies, preparing recommendations for the registrar office.',
                    assignee_name: 'Juan Dela Cruz',
                    historical_status: 'IN PROGRESS',
                    priority: 'URGENT',
                    updates: [
                        { logged_at: '2026-05-20T10:00:00Z', updated_text: 'Reviewed initial batch of appeal forms.', status_change: 'in_progress', updated_by_name: 'Juan Dela Cruz' },
                        { logged_at: '2026-05-22T15:30:00Z', updated_text: 'Met with committee to discuss exceptions.', status_change: 'in_progress', updated_by_name: 'Juan Dela Cruz' }
                    ]
                },
                {
                    task_id: 102,
                    title: 'Update Faculty Records',
                    description: 'Update the official database of faculty members for the current academic term, gathering and validating current Curriculum Vitae and teaching load profiles.',
                    assignee_name: 'Maria Santos',
                    historical_status: 'COMPLETED',
                    priority: 'MEDIUM',
                    updates: [
                        { logged_at: '2026-05-19T09:00:00Z', updated_text: 'Collected updated CVs from engineering department.', status_change: 'in_progress', updated_by_name: 'Maria Santos' },
                        { logged_at: '2026-05-23T16:00:00Z', updated_text: 'All records updated in the portal. Marking as complete.', status_change: 'completed', updated_by_name: 'Maria Santos' }
                    ]
                }
            ]);
            return;
        }

        if (PAMS.socket && PAMS.socket.connected) {
            PAMS.socket.emit('getReportDetails', id);
        }
    }

    /**
     * UI Rendering
     */
    // Relative "x ago" timestamp for the report list (e.g. "2 hours ago").
    function timeAgo(dateStr) {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '';
        const secs = Math.floor((Date.now() - d.getTime()) / 1000);
        if (secs < 45) return 'just now';
        // Largest matching unit wins, so "90 mins" reads as "1 hour ago".
        const units = [
            ['year', 31536000], ['month', 2592000], ['week', 604800],
            ['day', 86400], ['hour', 3600], ['minute', 60]
        ];
        for (const [name, size] of units) {
            const v = Math.floor(secs / size);
            if (v >= 1) return `${v} ${name}${v > 1 ? 's' : ''} ago`;
        }
        return 'just now';
    }

    // Maps a report type to its colored badge class.
    function typeBadgeClass(type) {
        const map = { daily: 'rt-daily', weekly: 'rt-weekly', annual: 'rt-annual', custom: 'rt-custom' };
        return map[(type || '').toLowerCase()] || 'rt-default';
    }

    // Applies the active search query + sort mode to the report list.
    // Non-destructive: never mutates `reports` (selectReport still looks up by id there).
    function getDisplayedReports() {
        const q = searchQuery.trim().toLowerCase();
        const list = q
            ? reports.filter(r =>
                (r.report_type || '').toLowerCase().includes(q) ||
                (r.scope_type || '').toLowerCase().includes(q) ||
                (r.scope_target || '').toLowerCase().includes(q) ||
                (r.generated_by_name || '').toLowerCase().includes(q))
            : reports.slice();

        switch (sortMode) {
            case 'date-asc': list.sort((a, b) => new Date(a.generated_at) - new Date(b.generated_at)); break;
            case 'type':     list.sort((a, b) => (a.report_type || '').localeCompare(b.report_type || '')); break;
            case 'scope':    list.sort((a, b) => (a.scope_type || '').localeCompare(b.scope_type || '')); break;
            default:         list.sort((a, b) => new Date(b.generated_at) - new Date(a.generated_at)); break;
        }
        return list;
    }

    function renderHistory() {
        const list = document.getElementById('historyList');
        if (!list) return;

        if (reports.length === 0) {
            list.innerHTML = '<div class="log-empty">No reports generated yet.</div>';
            return;
        }

        const displayed = getDisplayedReports();
        if (displayed.length === 0) {
            list.innerHTML = '<div class="log-empty">No reports match your search.</div>';
            return;
        }

        list.innerHTML = displayed.map(r => `
            <div class="report-card ${r.report_id === activeReportId ? 'active' : ''}" onclick="window.Reports.selectReport(${r.report_id})">
                <button class="report-delete-btn" title="Delete Report" onclick="window.Reports.openDeleteModal(event, ${r.report_id})">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
                <div class="report-card-title">
                    <i class="fa-solid fa-file-invoice"></i>
                    <span class="report-type-badge ${typeBadgeClass(r.report_type)}">${r.report_type}</span>
                </div>
                <div class="report-card-meta">
                    <strong>Scope:</strong> ${r.scope_target || r.scope_type}<br>
                    <strong>Period:</strong> ${fmtDate(r.period_start)} – ${fmtDate(r.period_end)}<br>
                    <span class="report-card-time" title="Generated ${new Date(r.generated_at).toLocaleString()}">
                        <i class="fa-regular fa-clock"></i> ${timeAgo(r.generated_at)} · by ${r.generated_by_name || 'Admin'}
                    </span>
                </div>
            </div>
        `).join('');

        renderPagination();
    }

    function renderPagination() {
        const container = document.getElementById('paginationControls');
        if (!container) return;

        const totalPages = Math.max(1, Math.ceil(totalReports / pageSize));
        if (totalPages <= 1) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = `
            <div class="pagination">
                <button class="pagination-btn" onclick="window.Reports.goToPage(${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''}>
                    <i class="fa-solid fa-chevron-left"></i> Prev
                </button>
                <span class="pagination-info">Page ${currentPage} of ${totalPages}</span>
                <button class="pagination-btn" onclick="window.Reports.goToPage(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''}>
                    Next <i class="fa-solid fa-chevron-right"></i>
                </button>
            </div>
        `;
    }

    function renderReportPreview(tasks) {
        const report = reports.find(r => r.report_id === activeReportId);
        if (!report) return;

        document.getElementById('previewTitle').textContent = `${report.report_type} Accomplishment Report`;
        document.getElementById('previewPeriod').textContent = `Period: ${fmtDate(report.period_start)} – ${fmtDate(report.period_end)} | Scope: ${report.scope_type}`;
        
        expandedTasks.clear();

        // Calculate stats from snapshot data
        const stats = { total: tasks.length, completed: 0, inProgress: 0, pending: 0, cancelled: 0 };
        tasks.forEach(t => {
            const s = (t.historical_status || "").toLowerCase().replace('_', ' ');
            if (s === 'completed') stats.completed++;
            else if (s === 'in progress') stats.inProgress++;
            else if (s === 'pending') stats.pending++;
            else if (s === 'cancelled') stats.cancelled++;
        });

        document.getElementById('statTotal').textContent = stats.total;
        document.getElementById('statCompleted').textContent = stats.completed;
        document.getElementById('statInProgress').textContent = stats.inProgress;

        const statusMap = { 
            'COMPLETED': 'badge-completed', 
            'IN PROGRESS': 'badge-in_progress', 
            'IN_PROGRESS': 'badge-in_progress', 
            'PENDING': 'badge-pending', 
            'CANCELLED': 'badge-cancelled' 
        };
        const tbody = document.getElementById('taskBody');
        if (tbody) {
            if (tasks.length === 0) {
                tbody.innerHTML = '<tr><td colspan="3" class="log-empty">No tasks in this report.</td></tr>';
            } else {
                tbody.innerHTML = tasks.map((t, idx) => {
                    const taskId = t.task_id || `temp-${idx}`;
                    const displayStatus = (t.historical_status || '').replace('_', ' ');
                    return `
                        <tr class="task-main-row" onclick="window.Reports.toggleTaskDetails('${taskId}')">
                            <td class="fw-600">
                                <span class="expand-icon" id="icon-${taskId}">
                                    <i class="fa-solid fa-chevron-right"></i>
                                </span>
                                ${t.title}
                            </td>
                            <td>${t.assignee_name || '—'}</td>
                            <td><span class="badge ${statusMap[t.historical_status.toUpperCase()] || ''}">${displayStatus}</span></td>
                        </tr>
                        <tr class="task-details-row collapsed" id="details-${taskId}">
                            <td colspan="3">
                                <div class="task-details-wrapper">
                                    ${renderTimeline(t)}
                                </div>
                            </td>
                        </tr>`;
                }).join('');
            }
        }

        renderChart(stats);
        renderPrintReport(report, tasks, stats);
    }

    function renderPrintReport(report, tasks, stats) {
        const container = document.getElementById('printReportContainer');
        if (!container) return;

        const statusMap = {
            'COMPLETED': 'Completed',
            'IN PROGRESS': 'In Progress',
            'IN_PROGRESS': 'In Progress',
            'PENDING': 'Pending',
            'CANCELLED': 'Cancelled'
        };

        const taskBlocks = tasks.map((t, idx) => {
            const displayStatus = statusMap[(t.historical_status || '').toUpperCase()] || t.historical_status || 'Pending';

            // Build updates logs
            let updatesHTML = '';
            if (!t.updates || t.updates.length === 0) {
                updatesHTML = `<div class="print-timeline-empty">No updates logged during this period.</div>`;
            } else {
                updatesHTML = `
                    <table class="print-updates-table">
                        <thead>
                            <tr>
                                <th style="width: 25%">Date & Time</th>
                                <th style="width: 20%">User</th>
                                <th style="width: 15%">Status</th>
                                <th style="width: 40%">Activity Details</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${t.updates.map(up => {
                                const upStatus = statusMap[(up.status_change || '').toUpperCase()] || up.status_change || '—';
                                return `
                                    <tr>
                                        <td>${new Date(up.logged_at).toLocaleString()}</td>
                                        <td>${up.updated_by_name || 'System'}</td>
                                        <td><span class="print-badge-inline print-status-${(up.status_change || '').toLowerCase()}">${upStatus}</span></td>
                                        <td>${up.updated_text || 'No description provided.'}</td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                `;
            }

            return `
                <div class="print-task-block">
                    <h3 class="print-task-title">${idx + 1}. ${t.title}</h3>
                    <div class="print-task-meta">
                        <strong>Assignee:</strong> ${t.assignee_name || '—'} &nbsp;|&nbsp; 
                        <strong>Current Status:</strong> <span class="print-badge-inline print-status-${(t.historical_status || '').toLowerCase()}">${displayStatus}</span>
                    </div>
                    <div class="print-task-desc">
                        <strong>Description:</strong> ${t.description || 'No description provided.'}
                    </div>
                    <div class="print-task-updates">
                        <div class="print-section-sublabel">Activity & Status Log:</div>
                        ${updatesHTML}
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = `
            <div class="print-document">
                <!-- Institutional Header -->
                <div class="print-letterhead">
                    <img class="print-logo" src="../assets/pup_ous_seal.webp" alt="PUP OUS Seal">
                    <div class="print-institution-details">
                        <div class="print-inst-name">POLYTECHNIC UNIVERSITY OF THE PHILIPPINES</div>
                        <div class="print-inst-sub">OPEN UNIVERSITY SYSTEM</div>
                        <div class="print-inst-office">Personnel Accomplishment Management System</div>
                    </div>
                </div>
                
                <div class="print-divider"></div>
                
                <!-- Document Title -->
                <h1 class="print-doc-title">${report.report_type.toUpperCase()} ACCOMPLISHMENT REPORT</h1>
                
                <!-- Metadata Block -->
                <div class="print-metadata-grid">
                    <div class="print-meta-col">
                        <div><strong>Report ID:</strong> #${report.report_id}</div>
                        <div><strong>Reporting Period:</strong> ${fmtDate(report.period_start)} – ${fmtDate(report.period_end)}</div>
                        <div><strong>Scope:</strong> ${report.scope_target || report.scope_type}</div>
                    </div>
                    <div class="print-meta-col">
                        <div><strong>Date Generated:</strong> ${new Date(report.generated_at).toLocaleString()}</div>
                        <div><strong>Generated By:</strong> ${report.generated_by_name || 'Admin'}</div>
                    </div>
                </div>

                <!-- Executive Summary Statistics -->
                <div class="print-section-title">EXECUTIVE SUMMARY STATISTICS</div>
                <table class="print-stats-table">
                    <thead>
                        <tr>
                            <th>Total Tasks</th>
                            <th>Completed</th>
                            <th>In Progress</th>
                            <th>Pending</th>
                            <th>Cancelled</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><strong>${stats.total}</strong></td>
                            <td class="print-stat-green">${stats.completed}</td>
                            <td class="print-stat-blue">${stats.inProgress}</td>
                            <td class="print-stat-amber">${stats.pending}</td>
                            <td class="print-stat-gray">${stats.cancelled}</td>
                        </tr>
                    </tbody>
                </table>

                <!-- Detailed Accomplishments -->
                <div class="print-section-title">DETAILED TASK ACCOMPLISHMENTS</div>
                <div class="print-tasks-container">
                    ${taskBlocks.length > 0 ? taskBlocks : '<div class="print-empty-state">No tasks recorded for this report.</div>'}
                </div>

                <!-- Footer Signatures -->
                <div class="print-signatures-section">
                    <div class="print-signature-block">
                        <div class="print-sig-line"></div>
                        <div class="print-sig-name">${(report.generated_by_name || 'Admin').toUpperCase()}</div>
                        <div class="print-sig-role">Prepared By</div>
                    </div>
                </div>
            </div>
        `;
    }

    function renderTimeline(task) {
        if (!task.updates || task.updates.length === 0) {
            return `
                <div class="report-task-timeline empty">
                    <div class="timeline-empty-state">
                        <i class="fa-regular fa-comment-dots"></i>
                        <span>No updates logged during this period.</span>
                        <div class="timeline-fallback-notes">
                            <strong>Latest Status Snapshot:</strong> ${task.historical_notes || 'No notes available.'}
                        </div>
                    </div>
                </div>
            `;
        }

        const statusMap = { 
            'COMPLETED': 'badge-completed', 
            'IN PROGRESS': 'badge-in_progress', 
            'IN_PROGRESS': 'badge-in_progress', 
            'PENDING': 'badge-pending', 
            'CANCELLED': 'badge-cancelled' 
        };

        return `
            <div class="report-task-timeline">
                <div class="timeline-header-title">Status Updates Log</div>
                ${task.updates.map(up => {
                    const statusVal = (up.status_change || '').toUpperCase();
                    const displayStatus = statusVal.replace('_', ' ');
                    const statusBadge = statusVal ? `<span class="badge ${statusMap[statusVal] || ''}">${displayStatus}</span>` : '';
                    return `
                        <div class="timeline-item">
                            <div class="timeline-marker"></div>
                            <div class="timeline-content">
                                <div class="timeline-meta">
                                    <span class="timeline-author"><i class="fa-solid fa-user-circle"></i> ${up.updated_by_name || 'System'}</span>
                                    <span class="timeline-time"><i class="fa-regular fa-clock"></i> ${new Date(up.logged_at).toLocaleString()}</span>
                                    ${statusBadge}
                                </div>
                                <div class="timeline-text">${up.updated_text || 'No description provided.'}</div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    function renderChart(stats) {
        const ctxEl = document.getElementById('statusChart');
        if (!ctxEl) return;

        const data = [stats.pending, stats.inProgress, stats.completed, stats.cancelled];
        if (chart) {
            chart.data.datasets[0].data = data;
            chart.update();
        } else {
            chart = new Chart(ctxEl.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: ['Pending', 'In Progress', 'Completed', 'Cancelled'],
                    datasets: [{
                        data,
                        backgroundColor: ['#f59e0b', '#3b82f6', '#16a34a', '#9ca3af'],
                        borderRadius: 6,
                        borderSkipped: false
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, ticks: { stepSize: 1, font: { family: 'Poppins', size: 11 } }, grid: { color: '#f3f4f6' } },
                        x: { ticks: { font: { family: 'Poppins', size: 11 } }, grid: { display: false } }
                    }
                }
            });
        }
    }

    /**
     * Modal Management
     */
    const openModal = (id) => document.getElementById(id)?.classList.add('open');
    const closeModal = (id) => document.getElementById(id)?.classList.remove('open');

    // Export public methods
    window.Reports = {
        openGenerateModal: async () => {
            const today = new Date();
            const todayStr = formatLocalDate(today);

            const startInput = document.getElementById('gen-start');
            const endInput = document.getElementById('gen-end');
            if (startInput) startInput.value = todayStr;
            if (endInput) endInput.value = todayStr;

            // Populate Year dropdown for Annual selection
            const yearSelect = document.getElementById('gen-year');
            if (yearSelect) {
                const currentYear = today.getFullYear();
                let options = '';
                for (let y = currentYear; y >= currentYear - 10; y--) {
                    options += `<option value="${y}">${y}</option>`;
                }
                yearSelect.innerHTML = options;
                yearSelect.value = currentYear;
            }

            try {
                if (CONFIG.USE_MOCK_API) {
                    document.getElementById('gen-group').innerHTML = '<option value="1">Student Records</option><option value="2">Admission</option>';
                    allUsers = [{ email: 'juan@pup.edu.ph', name: 'Juan Dela Cruz', code: 'PUP-001' }];
                } else {
                    // Use centralized lookup services from api.js
                    const [groupsList, usersList] = await Promise.all([
                        PAMS.getGroups(),
                        PAMS.getUsers()
                    ]);

                    document.getElementById('gen-group').innerHTML = groupsList.map(x => `<option value="${x.id}">${x.name}</option>`).join('');
                    allUsers = usersList;
                }
                window.Reports.filterUserResults();
            } catch (err) {
                console.error("Failed to populate generation modal:", err);
            }

            window.Reports.clearPickedUser();
            window.Reports.onScopeChange();
            window.Reports.onTypeChange();
            openModal('genModal');
        },
        closeModal: (id) => closeModal(id),
        onScopeChange: () => {
            const scope = document.getElementById('gen-scope').value;
            document.getElementById('gen-group-wrap').style.display = scope === 'Group' ? 'flex' : 'none';
            document.getElementById('gen-user-wrap').style.display = scope === 'Individual' ? 'flex' : 'none';
        },
        onTypeChange: () => {
            const type = document.getElementById('gen-type').value;
            const startInput = document.getElementById('gen-start');
            const yearSelect = document.getElementById('gen-year');
            const endInput = document.getElementById('gen-end');
            const labelStart = document.getElementById('label-start');
            const labelEnd = document.getElementById('label-end');

            if (!startInput || !endInput) return;

            // Reset labels and visibility states
            labelStart.textContent = 'Period Start *';
            labelEnd.textContent = 'Period End *';
            startInput.style.display = '';
            if (yearSelect) yearSelect.style.display = 'none';
            endInput.disabled = false;

            if (type === 'Daily') {
                labelStart.textContent = 'Select Date *';
                labelEnd.textContent = 'Period End (Locked)';
                endInput.disabled = true;
            } else if (type === 'Weekly') {
                labelStart.textContent = 'Select Week (Mon–Sun) *';
                labelEnd.textContent = 'Period End (Locked)';
                endInput.disabled = true;
            } else if (type === 'Annual') {
                labelStart.textContent = 'Select Target Year *';
                labelEnd.textContent = 'Period End (Locked)';
                startInput.style.display = 'none';
                if (yearSelect) yearSelect.style.display = '';
                endInput.disabled = true;
            } else if (type === 'Custom') {
                endInput.disabled = false;
            }

            // Ensure start selector has default current value when switching
            const todayStr = formatLocalDate(new Date());
            if (type !== 'Annual' && (!startInput.value || startInput.value.length === 4)) {
                startInput.value = todayStr;
            }

            window.Reports.onDateChange();
        },
        onDateChange: () => {
            const type = document.getElementById('gen-type').value;
            const startInput = document.getElementById('gen-start');
            const yearSelect = document.getElementById('gen-year');
            const endInput = document.getElementById('gen-end');

            const badgeWrap = document.getElementById('gen-range-badge-wrap');
            const badgeText = document.getElementById('gen-range-text');

            // Friendly month formatter
            const formatFriendlyDate = (date) => {
                if (!date || isNaN(date.getTime())) return '';
                const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
            };

            const formatFriendlyDateStr = (dateStr) => {
                const d = parseLocalDate(dateStr);
                return d ? formatFriendlyDate(d) : '';
            };

            let rangeStr = '';

            if (type === 'Daily') {
                if (!startInput.value) return;
                endInput.value = startInput.value;
                rangeStr = `Period Covered: ${formatFriendlyDateStr(startInput.value)}`;
            } else if (type === 'Weekly') {
                if (!startInput.value) return;
                const selectedDate = parseLocalDate(startInput.value);
                if (!selectedDate) return;

                const day = selectedDate.getDay();
                const diffToMon = day === 0 ? -6 : 1 - day;
                const start = new Date(selectedDate);
                start.setDate(selectedDate.getDate() + diffToMon);
                
                const end = new Date(start);
                end.setDate(start.getDate() + 6);

                endInput.value = formatLocalDate(end);
                rangeStr = `Period Covered: Mon, ${formatFriendlyDate(start)} – Sun, ${formatFriendlyDate(end)}`;
            } else if (type === 'Annual') {
                if (!yearSelect) return;
                const year = parseInt(yearSelect.value, 10);
                if (isNaN(year)) return;

                const end = new Date(year, 11, 31);
                endInput.value = formatLocalDate(end);
                rangeStr = `Period Covered: Full Year ${year}`;
            } else if (type === 'Custom') {
                rangeStr = '';
            }

            if (badgeWrap && badgeText) {
                if (rangeStr) {
                    badgeText.textContent = rangeStr;
                    badgeWrap.style.display = 'block';
                } else {
                    badgeWrap.style.display = 'none';
                }
            }
        },
        filterUserResults: () => {
            const q = (document.getElementById('gen-user-search').value || '').trim().toLowerCase();
            const box = document.getElementById('gen-user-results');
            if (!box) return;

            if (!allUsers.length) {
                box.innerHTML = '<div class="text-xs color-gray text-center py-3">No users loaded.</div>';
                return;
            }

            const matches = (q
                ? allUsers.filter(u =>
                    (u.name || '').toLowerCase().includes(q) ||
                    (u.email || '').toLowerCase().includes(q) ||
                    (u.code || '').toLowerCase().includes(q))
                : allUsers
            ).slice(0, 8);

            if (matches.length === 0) {
                box.innerHTML = '<div class="text-xs color-gray text-center py-3">No matches found.</div>';
                return;
            }

            box.classList.add('open');
            box.innerHTML = matches.map(u => `
                <button type="button" class="user-search-item" onclick="window.Reports.pickUser('${encodeURIComponent(u.email)}','${encodeURIComponent(u.name || u.email)}')">
                    <div class="avatar-sm">${(u.name || '?').charAt(0).toUpperCase()}</div>
                    <div class="user-search-meta">
                        <strong>${u.name || u.email}</strong>
                        <span class="muted">${u.email}${u.code ? ' · ' + u.code : ''}</span>
                    </div>
                </button>`).join('');
        },
        pickUser: (emailEnc, nameEnc) => {
            const email = decodeURIComponent(emailEnc);
            const name = decodeURIComponent(nameEnc);
            document.getElementById('gen-user-email').value = email;
            document.getElementById('gen-user-picked-name').textContent = `${name} (${email})`;
            document.getElementById('gen-user-picked').style.display = 'flex';
            document.getElementById('gen-user-search').style.display = 'none';
            document.getElementById('gen-user-results').classList.remove('open');
        },
        clearPickedUser: () => {
            document.getElementById('gen-user-email').value = '';
            document.getElementById('gen-user-picked').style.display = 'none';
            document.getElementById('gen-user-search').style.display = '';
            document.getElementById('gen-user-search').value = '';
            window.Reports.filterUserResults();
        },
        generateReport: async () => {
            const type = document.getElementById('gen-type').value;
            const scope = document.getElementById('gen-scope').value;

            let start = '';
            let end = document.getElementById('gen-end').value;

            if (type === 'Annual') {
                const yearSelect = document.getElementById('gen-year');
                const year = yearSelect ? yearSelect.value : new Date().getFullYear();
                start = `${year}-01-01`;
                end = `${year}-12-31`;
            } else if (type === 'Weekly') {
                const rawVal = document.getElementById('gen-start').value;
                const selectedDate = parseLocalDate(rawVal);
                if (selectedDate) {
                    const day = selectedDate.getDay();
                    const diffToMon = day === 0 ? -6 : 1 - day;
                    const mon = new Date(selectedDate);
                    mon.setDate(selectedDate.getDate() + diffToMon);
                    start = formatLocalDate(mon);
                } else {
                    start = rawVal;
                }
            } else {
                start = document.getElementById('gen-start').value;
            }

            // --- 1. Basic Field Validation ---
            if (!type) { PAMS.toast('Please select a Report Type.', 'warning'); return; }
            if (!scope) { PAMS.toast('Please select a Scope.', 'warning'); return; }
            if (!start) { PAMS.toast('Please select the Start Date/Period.', 'warning'); return; }
            if (!end) { PAMS.toast('Please select the End Date.', 'warning'); return; }

            // Validate Custom Date Ranges (End must be after Start)
            if (type === 'Custom') {
                const startDate = parseLocalDate(start);
                const endDate = parseLocalDate(end);
                if (startDate && endDate && endDate < startDate) {
                    PAMS.toast('End Date cannot be before Start Date.', 'warning');
                    return;
                }
            }

            // --- 2. Dynamic Scope Validation ---
            let scopeValue = null;
            if (scope === 'Group') {
                scopeValue = document.getElementById('gen-group').value;
                if (!scopeValue) { PAMS.toast('Please select a Group for this report.', 'warning'); return; }
            } else if (scope === 'Individual') {
                scopeValue = document.getElementById('gen-user-email').value;
                if (!scopeValue) { PAMS.toast('Please select an Employee for this report.', 'warning'); return; }
            }

            const me = getUser();
            const body = { 
                reportType: type, 
                scopeType: scope, 
                periodStart: start, 
                periodEnd: end, 
                scopeValue
            };

            if (CONFIG.USE_MOCK_API) {
                const newId = reports.length + 1;
                reports.unshift({ report_id: newId, report_type: type, scope_type: scope, generated_at: new Date().toISOString(), generated_by_name: 'You', period_start: start, period_end: end });
                closeModal('genModal');
                renderHistory();
                selectReport(newId);
                return;
            }

            if (PAMS.socket) {
                PAMS.socket.emit('generateReport', body);
                closeModal('genModal');
            }
        },
        selectReport: (id) => selectReport(id),
        openDeleteModal: (event, id) => {
            if (event) event.stopPropagation();
            reportToDelete = id;
            openModal('deleteReportModal');
        },
        confirmDelete: () => {
            if (!reportToDelete) return;
            if (CONFIG.USE_MOCK_API) {
                reports = reports.filter(r => r.report_id !== reportToDelete);
                if (activeReportId === reportToDelete) activeReportId = null;
                closeModal('deleteReportModal');
                renderHistory();
                PAMS.toast("Report deleted successfully!", "success");
                return;
            }
            if (PAMS.socket) {
                PAMS.socket.emit('deleteReport', reportToDelete);
            }
        },
        goToPage: (page) => {
            if (page < 1) return;
            const totalPages = Math.max(1, Math.ceil(totalReports / pageSize));
            if (page > totalPages) return;
            currentPage = page;
            activeReportId = null;
            loadReports();
        },
        onSearch: (q) => { searchQuery = q || ''; renderHistory(); },
        onSort: (mode) => { sortMode = mode || 'date-desc'; renderHistory(); },
        toggleTaskDetails: (taskId) => {
            const detailsRow = document.getElementById(`details-${taskId}`);
            const icon = document.getElementById(`icon-${taskId}`);
            if (!detailsRow || !icon) return;

            if (expandedTasks.has(taskId)) {
                expandedTasks.delete(taskId);
                detailsRow.classList.add('collapsed');
                icon.querySelector('i').className = 'fa-solid fa-chevron-right';
            } else {
                expandedTasks.add(taskId);
                detailsRow.classList.remove('collapsed');
                icon.querySelector('i').className = 'fa-solid fa-chevron-down';
            }
        },
        print: () => window.print()
    };
})();

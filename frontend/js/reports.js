/**
 * reports.js
 * Purpose: Admin-only report generation and history management.
 */

(function () {
    const { apiFetch, requireAuth, fmtDate, fmtHeaderDate, getUser } = PAMS;

    let reports = [];
    let activeReportId = null;
    let chart;
    let allUsers = []; 

    document.addEventListener('DOMContentLoaded', async () => {
        if (!requireAuth()) return;
        PAMS_UI.init();
        
        const dateEl = document.getElementById('headerDate');
        if (dateEl) dateEl.textContent = fmtHeaderDate();
        
        await loadReports();
    });

    async function loadReports() {
        try {
            if (CONFIG.USE_MOCK_API) {
                reports = [
                    { id: 1, title: 'Weekly Performance Summary', generatedAt: '2026-05-27T08:00:00Z', generatedByName: 'Admin', period: 'May 18 - May 24, 2026', scopeLabel: 'System-Wide' },
                    { id: 2, title: 'Student Records Progress', generatedAt: '2026-05-20T14:30:00Z', generatedByName: 'Admin', period: 'May 11 - May 17, 2026', scopeLabel: 'Group: Student Records' }
                ];
            } else {
                const data = await apiFetch('/reports');
                reports = data.reports || [];
            }
            renderHistory();
            if (reports.length > 0) await selectReport(reports[0].id);
        } catch (err) {
            console.error('Load reports failed:', err);
        }
    }

    function renderHistory() {
        const list = document.getElementById('historyList');
        if (!list) return;

        if (reports.length === 0) {
            list.innerHTML = '<div class="log-empty">No reports generated yet.</div>';
            return;
        }

        list.innerHTML = reports.map(r => `
            <div class="report-card ${r.id === activeReportId ? 'active' : ''}" onclick="window.Reports.selectReport(${r.id})">
                <div class="report-card-title"><i class="fa-solid fa-file-invoice"></i> ${r.title}</div>
                <div class="report-card-meta">
                    Generated: ${new Date(r.generatedAt).toLocaleDateString()}
                    ${r.generatedByName ? ` &middot; By: ${r.generatedByName}` : ''}
                </div>
            </div>
        `).join('');
    }

    async function selectReport(id) {
        activeReportId = id;
        renderHistory();

        try {
            let data;
            if (CONFIG.USE_MOCK_API) {
                const report = reports.find(r => r.id === id);
                data = {
                    report,
                    tasks: [
                        { title: 'Process Student Appeals', assignee: 'Juan Dela Cruz', status: 'IN PROGRESS', priority: 'URGENT' },
                        { title: 'Update Faculty Records', assignee: 'Maria Santos', status: 'COMPLETED', priority: 'MEDIUM' }
                    ],
                    stats: { total: 10, completed: 5, inProgress: 3, pending: 1, cancelled: 1 }
                };
            } else {
                data = await apiFetch(`/reports/${id}`);
            }

            const { report, tasks, stats } = data;
            
            document.getElementById('previewTitle').textContent  = report.title;
            document.getElementById('previewPeriod').textContent = `Period: ${report.period} | Scope: ${report.scopeLabel}`;
            document.getElementById('statTotal').textContent      = stats.total;
            document.getElementById('statCompleted').textContent  = stats.completed;
            document.getElementById('statInProgress').textContent = stats.inProgress;

            const statusMap = { 'COMPLETED':'badge-completed', 'IN PROGRESS':'badge-in_progress', 'PENDING':'badge-pending', 'CANCELLED':'badge-cancelled' };
            const prioMap   = { 'URGENT':'badge-urgent', 'HIGH':'badge-urgent', 'MEDIUM':'badge-in_progress', 'LOW':'badge-pending' };

            const tbody = document.getElementById('taskBody');
            if (tbody) {
                tbody.innerHTML = tasks.length === 0
                    ? '<tr><td colspan="4" class="log-empty">No tasks in this report.</td></tr>'
                    : tasks.map(t => `
                        <tr>
                            <td class="fw-600">${t.title}</td>
                            <td>${t.assignee}</td>
                            <td><span class="badge ${statusMap[t.status] || ''}">${t.status}</span></td>
                            <td><span class="badge ${prioMap[t.priority] || ''}">${t.priority}</span></td>
                        </tr>`).join('');
            }

            renderChart(stats);
        } catch (err) {
            console.error('Load report failed:', err);
        }
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
                        backgroundColor: ['#f59e0b','#3b82f6','#16a34a','#9ca3af'], 
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
    const openModal  = (id) => document.getElementById(id)?.classList.add('open');
    const closeModal = (id) => document.getElementById(id)?.classList.remove('open');

    // Export public methods
    window.Reports = {
        openGenerateModal: async () => {
            const today = new Date();
            const monday = new Date(today);
            monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
            
            const startInput = document.getElementById('gen-start');
            const endInput = document.getElementById('gen-end');
            if (startInput) startInput.value = monday.toISOString().slice(0, 10);
            if (endInput) endInput.value = today.toISOString().slice(0, 10);

            try {
                if (CONFIG.USE_MOCK_API) {
                    document.getElementById('gen-group').innerHTML = '<option value="1">Student Records</option><option value="2">Admission</option>';
                    allUsers = [{ email: 'juan@pup.edu.ph', name: 'Juan Dela Cruz', code: 'PUP-001' }];
                } else {
                    const [g, u] = await Promise.all([apiFetch('/groups'), apiFetch('/users')]);
                    document.getElementById('gen-group').innerHTML = g.groups.map(x => `<option value="${x.id}">${x.name}</option>`).join('');
                    allUsers = u.users || [];
                }
                window.Reports.filterUserResults();
            } catch {}

            window.Reports.clearPickedUser();
            window.Reports.onScopeChange();
            openModal('genModal');
        },
        closeModal: (id) => closeModal(id),
        onScopeChange: () => {
            const scope = document.getElementById('gen-scope').value;
            document.getElementById('gen-group-wrap').style.display = scope === 'Group'      ? 'flex' : 'none';
            document.getElementById('gen-user-wrap').style.display  = scope === 'Individual' ? 'flex' : 'none';
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
                    (u.name  || '').toLowerCase().includes(q) ||
                    (u.email || '').toLowerCase().includes(q) ||
                    (u.code  || '').toLowerCase().includes(q))
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
            const name  = decodeURIComponent(nameEnc);
            document.getElementById('gen-user-email').value = email;
            document.getElementById('gen-user-picked-name').textContent = `${name} (${email})`;
            document.getElementById('gen-user-picked').style.display = 'flex';
            document.getElementById('gen-user-search').style.display  = 'none';
            document.getElementById('gen-user-results').classList.remove('open');
        },
        clearPickedUser: () => {
            document.getElementById('gen-user-email').value = '';
            document.getElementById('gen-user-picked').style.display = 'none';
            document.getElementById('gen-user-search').style.display  = '';
            document.getElementById('gen-user-search').value = '';
            window.Reports.filterUserResults();
        },
        generateReport: async () => {
            const type = document.getElementById('gen-type').value;
            const scope = document.getElementById('gen-scope').value;
            const start = document.getElementById('gen-start').value;
            const end = document.getElementById('gen-end').value;
            if (!start || !end) { alert('Please set the period.'); return; }

            const me = getUser();
            const body = { reportType: type, scopeType: scope, periodStart: start, periodEnd: end, generatedByEmail: me.email };
            
            if (scope === 'Group') body.scopeGroupId = parseInt(document.getElementById('gen-group').value);
            if (scope === 'Individual') {
                body.scopeUserEmail = document.getElementById('gen-user-email').value;
                if (!body.scopeUserEmail) { alert('Please pick an employee.'); return; }
            }

            if (CONFIG.USE_MOCK_API) {
                const newId = reports.length + 1;
                reports.unshift({ id: newId, title: `${type} Report - New`, generatedAt: new Date().toISOString(), generatedByName: 'You', period: `${start} to ${end}`, scopeLabel: scope });
                closeModal('genModal');
                renderHistory();
                await selectReport(newId);
                return;
            }

            try {
                const data = await apiFetch('/reports', 'POST', body);
                closeModal('genModal');
                await loadReports();
                if (data.reportId) await selectReport(data.reportId);
            } catch (err) {
                alert('Failed to generate: ' + err.message);
            }
        },
        selectReport: (id) => selectReport(id),
        print: () => window.print()
    };
})();

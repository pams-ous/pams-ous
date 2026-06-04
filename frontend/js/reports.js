/**
 * reports.js
 * Purpose: Admin-only report generation and history management.
 * Refactored: Uses Socket.io to match the team's professional backend standard.
 */

(function () {
    const { requireAuth, fmtDate, fmtHeaderDate, getUser } = PAMS;

    let reports = [];
    let activeReportId = null;
    let chart;
    let allUsers = [];

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
                alert(`Report Error: ${result.rawData || 'Unknown error'}`);
                return;
            }

            switch (result.stage) {
                case 'list':
                    reports = result.data || [];
                    renderHistory();
                    if (reports.length > 0 && !activeReportId) {
                        selectReport(reports[0].report_id);
                    }
                    break;
                
                case 'details':
                    renderReportPreview(result.data);
                    break;

                case 'generate':
                    alert(result.rawData || "Report generated successfully!");
                    loadReports(); // Refresh the list
                    break;
            }
        });

        // Listen for real-time broadcasts
        PAMS.socket.on('reportGenerated', (data) => {
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
            PAMS.socket.emit('getReports');
        } else {
            console.warn("Cannot load reports: Socket disconnected.");
        }
    }

    async function selectReport(id) {
        activeReportId = id;
        renderHistory();

        if (CONFIG.USE_MOCK_API) {
            renderReportPreview([
                { title: 'Process Student Appeals', assignee_name: 'Juan Dela Cruz', historical_status: 'IN PROGRESS', priority: 'URGENT' },
                { title: 'Update Faculty Records', assignee_name: 'Maria Santos', historical_status: 'COMPLETED', priority: 'MEDIUM' }
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
    function renderHistory() {
        const list = document.getElementById('historyList');
        if (!list) return;

        if (reports.length === 0) {
            list.innerHTML = '<div class="log-empty">No reports generated yet.</div>';
            return;
        }

        list.innerHTML = reports.map(r => `
            <div class="report-card ${r.report_id === activeReportId ? 'active' : ''}" onclick="window.Reports.selectReport(${r.report_id})">
                <div class="report-card-title"><i class="fa-solid fa-file-invoice"></i> ${r.report_type} Report</div>
                <div class="report-card-meta">
                    <strong>Scope:</strong> ${r.scope_target || r.scope_type}<br>
                    <strong>Period:</strong> ${fmtDate(r.period_start)} – ${fmtDate(r.period_end)}<br>
                    <span style="display:block; margin-top:4px; opacity:0.8;">Generated: ${new Date(r.generated_at).toLocaleDateString()} by ${r.generated_by_name || 'Admin'}</span>
                </div>
            </div>
        `).join('');
    }

    function renderReportPreview(tasks) {
        const report = reports.find(r => r.report_id === activeReportId);
        if (!report) return;

        document.getElementById('previewTitle').textContent = `${report.report_type} Accomplishment Report`;
        document.getElementById('previewPeriod').textContent = `Period: ${fmtDate(report.period_start)} – ${fmtDate(report.period_end)} | Scope: ${report.scope_type}`;
        
        // Calculate stats from snapshot data
        const stats = { total: tasks.length, completed: 0, inProgress: 0, pending: 0, cancelled: 0 };
        tasks.forEach(t => {
            const s = (t.historical_status || "").toLowerCase();
            if (s === 'completed') stats.completed++;
            else if (s === 'in progress') stats.inProgress++;
            else if (s === 'pending') stats.pending++;
            else if (s === 'cancelled') stats.cancelled++;
        });

        document.getElementById('statTotal').textContent = stats.total;
        document.getElementById('statCompleted').textContent = stats.completed;
        document.getElementById('statInProgress').textContent = stats.inProgress;

        const statusMap = { 'COMPLETED': 'badge-completed', 'IN PROGRESS': 'badge-in_progress', 'PENDING': 'badge-pending', 'CANCELLED': 'badge-cancelled' };
        const prioMap = { 'URGENT': 'badge-urgent', 'HIGH': 'badge-urgent', 'MEDIUM': 'badge-in_progress', 'LOW': 'badge-pending' };

        const tbody = document.getElementById('taskBody');
        if (tbody) {
            tbody.innerHTML = tasks.length === 0
                ? '<tr><td colspan="4" class="log-empty">No tasks in this report.</td></tr>'
                : tasks.map(t => `
                    <tr>
                        <td class="fw-600">${t.title}</td>
                        <td>${t.assignee_name || '—'}</td>
                        <td><span class="badge ${statusMap[t.historical_status.toUpperCase()] || ''}">${t.historical_status}</span></td>
                        <td><span class="badge ${prioMap[t.priority.toUpperCase()] || ''}">${t.priority}</span></td>
                    </tr>`).join('');
        }

        renderChart(stats);
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
            const endInput = document.getElementById('gen-end');
            const labelStart = document.getElementById('label-start');
            const labelEnd = document.getElementById('label-end');

            if (!startInput || !endInput) return;

            // Reset defaults
            labelStart.textContent = 'Period Start *';
            labelEnd.textContent = 'Period End *';
            startInput.type = 'date';
            endInput.type = 'date';
            endInput.disabled = false;

            if (type === 'Daily') {
                labelEnd.textContent = 'End Date (Locked)';
                endInput.disabled = true;
            } else if (type === 'Weekly') {
                labelStart.textContent = 'Select Week (Any Day) *';
                labelEnd.textContent = 'Calculated End Date';
                endInput.disabled = true;
            } else if (type === 'Annual') {
                labelStart.textContent = 'Select Target Year *';
                labelEnd.textContent = 'Full Year Range';
                startInput.type = 'number';
                startInput.value = new Date().getFullYear();
                endInput.disabled = true;
            } else if (type === 'Custom') {
                endInput.disabled = false;
            }

            window.Reports.onDateChange();
        },
        onDateChange: () => {
            const type = document.getElementById('gen-type').value;
            const startInput = document.getElementById('gen-start');
            const endInput = document.getElementById('gen-end');

            if (!startInput.value) return;

            if (type === 'Daily') {
                endInput.value = startInput.value;
            } else if (type === 'Weekly') {
                const selectedDate = new Date(startInput.value);
                const day = selectedDate.getDay();
                const diffToMon = selectedDate.getDate() - day + (day === 0 ? -6 : 1);
                const start = new Date(selectedDate.setDate(diffToMon));
                const end = new Date(start);
                end.setDate(start.getDate() + 6);

                startInput.value = start.toISOString().slice(0, 10);
                endInput.value = end.toISOString().slice(0, 10);
            } else if (type === 'Annual') {
                const year = parseInt(startInput.value);
                if (isNaN(year)) return;
                const start = new Date(year, 0, 1);
                const end = new Date(year, 11, 31);
                
                // We need to keep startInput as number for the user, 
                // but for generating we will use these dates.
                // However, generateReport uses .value.
                // Better approach: store calculated dates in hidden fields or 
                // just have generateReport handle it.
                endInput.value = end.toISOString().slice(0, 10);
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
            let start = document.getElementById('gen-start').value;
            let end = document.getElementById('gen-end').value;

            // --- 1. Basic Field Validation ---
            if (!type) { alert('Please select a Report Type.'); return; }
            if (!scope) { alert('Please select a Scope.'); return; }
            if (!start) { alert('Please select the Start Date/Period.'); return; }
            if (!end && type !== 'Daily') { alert('Please select the End Date.'); return; }

            // --- 2. Dynamic Scope Validation ---
            let scopeValue = null;
            if (scope === 'Group') {
                scopeValue = document.getElementById('gen-group').value;
                if (!scopeValue) { alert('Please select a Group for this report.'); return; }
            } else if (scope === 'Individual') {
                scopeValue = document.getElementById('gen-user-email').value;
                if (!scopeValue) { alert('Please select an Employee for this report.'); return; }
            }

            // --- 3. Handle Annual Year -> Date conversion ---
            if (type === 'Annual' && start.length === 4) {
                const year = parseInt(start);
                start = `${year}-01-01`;
                end = `${year}-12-31`;
            }

            const me = getUser();
            const body = { 
                reportType: type, 
                scopeType: scope, 
                periodStart: start, 
                periodEnd: end, 
                generatedByEmail: me.email,
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
        print: () => window.print()
    };
})();

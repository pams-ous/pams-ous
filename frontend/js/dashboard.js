/**
 * dashboard.js
 * Purpose: Logic for the main overview dashboard, including statistics and charts.
 */

(function () {
    const { apiFetch, requireAuth, fmtHeaderDate, getUser } = PAMS;

    let barChart;
    let userBarChart;
    let pollInterval;
    const POLL_INTERVAL_MS = 30000;

    async function refreshStats() {
        try {
            const stats = await apiFetch('/dashboard/stats');
            renderStats(stats);
        } catch (err) {
            console.error('Failed to refresh dashboard:', err);
        }
    }

    function startPolling() {
        if (pollInterval) return;
        pollInterval = setInterval(refreshStats, POLL_INTERVAL_MS);
        const indicator = document.getElementById('poll-status');
        if (indicator) indicator.style.display = 'inline';
    }

    function stopPolling() {
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }
        const indicator = document.getElementById('poll-status');
        if (indicator) indicator.style.display = 'none';
    }

    document.addEventListener('DOMContentLoaded', async () => {
        if (!requireAuth()) return;
        PAMS_UI.init();

        const u = getUser();
        if (u) {
            const welcomeEl = document.getElementById('welcomeText');
            if (welcomeEl) welcomeEl.textContent = `Welcome back, ${u.firstName || u.name || ''}`;
        }

        const dateEl = document.getElementById('headerDate');
        if (dateEl) dateEl.textContent = fmtHeaderDate();

        try {
            const stats = await apiFetch('/dashboard/stats');
            renderStats(stats);
        } catch (err) {
            console.error('Failed to load dashboard:', err);

            if (CONFIG.USE_MOCK_API) {
                renderStats({
                    counts: { total: 24, completed: 15, inProgress: 6 },
                    byGroup: [
                        { group: 'Student Records', pending: 2, inProgress: 3, completed: 8, cancelled: 1 },
                        { group: 'Admission', pending: 1, inProgress: 2, completed: 5, cancelled: 0 },
                        { group: 'Head Office', pending: 0, inProgress: 1, completed: 2, cancelled: 0 }
                    ],
                    groupProgress: [
                        { name: 'Student Records', completed: 8, total: 14 },
                        { name: 'Admission', completed: 5, total: 8 }
                    ],
                    byUser: [
                        { name: 'Juan Dela Cruz', completed: 7 },
                        { name: 'Maria Santos', completed: 5 },
                        { name: 'Pedro Reyes', completed: 3 }
                    ]
                });
            }
        }

        // Listen for task changes and refresh dashboard stats in real-time
        if (PAMS && PAMS.socket) {
            PAMS.socket.on('tasksChanged', refreshStats);

            PAMS.socket.on('disconnect', () => {
                console.warn('[Dashboard] Socket disconnected — enabling polling fallback');
                startPolling();
            });

            PAMS.socket.on('connect', () => {
                console.log('[Dashboard] Socket reconnected — disabling polling fallback');
                stopPolling();
            });
        } else {
            // No socket available at all — fall back to polling immediately
            startPolling();
        }

        // Scroll-fade: hide bottom gradient when user chart scrolled to bottom
        const userBarBox = document.querySelector('.user-chart-panel .bar-box');
        const scrollFade = userBarBox?.querySelector('.scroll-fade');
        if (userBarBox && scrollFade) {
            const toggleFade = () => {
                const atBottom = userBarBox.scrollHeight - userBarBox.scrollTop - userBarBox.clientHeight < 16;
                scrollFade.classList.toggle('hidden', atBottom);
            };
            userBarBox.addEventListener('scroll', toggleFade);
            toggleFade();
        }

        window.addEventListener('beforeunload', stopPolling);
    });

    function renderStats(s) {
        // 1. Stat cards
        document.getElementById('cnt-total').textContent = Math.round(s.counts.total);
        document.getElementById('cnt-completed').textContent = Math.round(s.counts.completed);
        document.getElementById('cnt-inprogress').textContent = Math.round(s.counts.inProgress);

        // 2. User Bar Chart (Completed per User)
        if (userBarChart) {
            userBarChart.destroy();
            userBarChart = null;
        }
        const userChartContainer = document.getElementById('userBarChartContainer');
        const userCtxEl = document.getElementById('userBarChart');
        if (userCtxEl && userChartContainer) {
            const userCtx = userCtxEl.getContext('2d');
            const userCount = (s.byUser || []).length;
            const fullHeight = Math.max(200, userCount * 55 + 60);
            const visibleHeight = Math.min(fullHeight, 5 * 55 + 60);
            userChartContainer.style.height = `${fullHeight}px`;
            const userPanel = userChartContainer.closest('.chart-panel');
            if (userPanel) userPanel.style.height = `${visibleHeight + 56}px`;
            const maxBarThickness = userCount <= 1 ? 60 : (userCount === 2 ? 70 : 80);

            userBarChart = new Chart(userCtx, {
                type: 'bar',
                data: {
                    labels: (s.byUser || []).map(u => u.name),
                    datasets: [
                        { label: 'Completed', data: (s.byUser || []).map(u => u.completed), backgroundColor: '#16a34a' }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    indexAxis: 'y',
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { beginAtZero: true, suggestedMax: 10, grid: { color: '#f3f4f6' }, ticks: { stepSize: 1, precision: 0 } },
                        y: { grid: { display: false } }
                    },
                    datasets: {
                        bar: { maxBarThickness }
                    }
                }
            });
        }

        // 3. Bar Chart — destroy previous instance before recreating
        if (barChart) {
            barChart.destroy();
            barChart = null;
        }
        const barChartContainer = document.getElementById('barChartContainer');
        const barCtxEl = document.getElementById('barChart');
        if (barCtxEl && barChartContainer) {
            const barCtx = barCtxEl.getContext('2d');
            const groupCount = s.byGroup.length;

            // Dynamically adjust container height based on group count to avoid compressing bars/labels
            // 55px per group + 80px padding for axis, legend, etc. (minimum 350px)
            const dynamicHeight = Math.max(350, groupCount * 55 + 80);
            barChartContainer.style.height = `${dynamicHeight}px`;
            const groupPanel = barChartContainer.closest('.chart-panel');
            if (groupPanel) groupPanel.style.height = `${dynamicHeight + 56}px`;

            const computedMaxBarThickness = groupCount <= 1 ? 60 : (groupCount === 2 ? 70 : 80);

            barChart = new Chart(barCtx, {
                type: 'bar',
                data: {
                    labels: s.byGroup.map(g => g.group),
                    datasets: [
                        { label: 'Pending', data: s.byGroup.map(g => g.pending), backgroundColor: '#f59e0b' },
                        { label: 'In Progress', data: s.byGroup.map(g => g.inProgress), backgroundColor: '#3b82f6' },
                        { label: 'Completed', data: s.byGroup.map(g => g.completed), backgroundColor: '#16a34a' },
                        { label: 'Cancelled', data: s.byGroup.map(g => g.cancelled), backgroundColor: '#9ca3af' }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    indexAxis: 'y',
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { stacked: true, beginAtZero: true, suggestedMax: 10, grid: { color: '#f3f4f6' }, ticks: { stepSize: 1, precision: 0 } },
                        y: { stacked: true, grid: { display: false } }
                    },
                    datasets: {
                        bar: {
                            maxBarThickness: computedMaxBarThickness
                        }
                    }
                }
            });
        }

        // 4. Group progress
        const gpList = document.getElementById('gpList');
        if (gpList) {
            if (s.groupProgress.length === 0) {
                gpList.innerHTML = '<div class="text-xs color-gray text-center py-4">No groups assigned.</div>';
            } else {
                gpList.innerHTML = s.groupProgress.map(g => {
                    const pct = g.total > 0 ? Math.round((g.completed / g.total) * 100) : 0;
                    return `
                        <div class="gp-item">
                            <div class="gp-top">
                                <span class="gp-name" title="${g.name}">${g.name}</span>
                                <span class="gp-pct">${pct}%</span>
                            </div>
                            <div class="gp-track"><div class="gp-fill" style="width:${pct}%"></div></div>
                            <div class="gp-sub">${g.completed} / ${g.total} tasks completed</div>
                        </div>
                    `;
                }).join('');
            }
        }
    }
})();

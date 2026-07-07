/**
 * dashboard.js
 * Purpose: Logic for the main overview dashboard, including statistics and charts.
 */

(function () {
    const { apiFetch, requireAuth, fmtHeaderDate, getUser } = PAMS;

    let barChart;

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
                    ]
                });
            }
        }

        // Listen for task changes and refresh dashboard stats in real-time
        if (PAMS && PAMS.socket) {
            PAMS.socket.on('tasksChanged', async () => {
                try {
                    const stats = await apiFetch('/dashboard/stats');
                    renderStats(stats);
                } catch (err) {
                    console.error('Failed to refresh dashboard:', err);
                }
            });
        }
    });

    function renderStats(s) {
        // 1. Stat cards
        document.getElementById('cnt-total').textContent = Math.round(s.counts.total);
        document.getElementById('cnt-completed').textContent = Math.round(s.counts.completed);
        document.getElementById('cnt-inprogress').textContent = Math.round(s.counts.inProgress);

        // 2. Bar Chart — destroy previous instance before recreating
        if (barChart) {
            barChart.destroy();
            barChart = null;
        }
        const barCtxEl = document.getElementById('barChart');
        if (barCtxEl) {
            const barCtx = barCtxEl.getContext('2d');
            const groupCount = s.byGroup.length;
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
                    plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, font: { family: 'Poppins', size: 11 } } } },
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

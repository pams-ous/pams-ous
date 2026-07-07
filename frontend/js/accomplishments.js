(function () {
    const { apiFetch, requireAuth, fmtHeaderDate } = PAMS;

    document.addEventListener('DOMContentLoaded', async () => {
        if (!requireAuth()) return;
        PAMS_UI.init();

        const dateEl = document.getElementById('headerDate');
        if (dateEl) dateEl.textContent = fmtHeaderDate();

        try {
            const data = await apiFetch('/accomplishments');
            renderAccomplishments(data.accomplishments);
        } catch (err) {
            console.error('Failed to load accomplishments:', err);
            const accList = document.getElementById('accList');
            if (accList) {
                accList.innerHTML = '<div class="text-xs color-gray text-center py-4">Failed to load accomplishments.</div>';
            }
        }
    });

    function renderAccomplishments(items) {
        const accList = document.getElementById('accList');
        if (!accList) return;

        if (!items || items.length === 0) {
            accList.innerHTML = '<div class="text-xs color-gray text-center py-4">No accomplishments logged yet.</div>';
            return;
        }

        accList.innerHTML = items.map(u => `
            <div class="acc-item">
                <div class="acc-dot ${/complet/i.test(u.text) ? 'green' : 'blue'}"></div>
                <div class="acc-body">
                    <div class="acc-text"><strong>${u.name}</strong>: ${u.text}</div>
                    <div class="acc-task">on "${u.task_title}"</div>
                    <div class="acc-time"><i class="fa-regular fa-clock"></i> ${new Date(u.time).toLocaleTimeString()}</div>
                </div>
            </div>
        `).join('');
    }
})();

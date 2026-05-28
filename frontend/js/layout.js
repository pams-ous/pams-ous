/**
 * layout.js
 * Purpose: Handles the global UI "Chrome" (Sidebar, Notifications, RBAC UI).
 */

window.PAMS_UI = (function () {
    
    /**
     * Role-Based Access Control (RBAC) UI Logic
     */
    const applyRBAC = () => {
        const u = PAMS.getUser();
        const isAdmin = !!u && u.role === 'ADMIN';

        document.body.classList.toggle('role-admin', isAdmin);
        document.body.classList.toggle('role-member', !isAdmin);

        if (!isAdmin) {
            // Physically remove admin-only elements
            document.querySelectorAll('[data-admin-only]').forEach(el => el.remove());
            
            // Redirect if on an admin-only page
            const path = location.pathname.split('/').pop().toLowerCase();
            const adminPages = ['reports.html', 'users-groups.html'];
            if (adminPages.includes(path)) {
                window.location.replace(PAMS.pageUrl('dashboard.html'));
            }
        }
    };

    /**
     * Sidebar Management
     */
    const setupSidebar = () => {
        const sidebar = document.querySelector('.sidebar');
        if (!sidebar) return;

        // 1. Apply initial state WITHOUT animation
        document.body.classList.add('no-transition');
        const wasOpen = localStorage.getItem('sidebar_open') === '1';
        document.body.classList.toggle('sidebar-open', wasOpen);
        
        // Force reflow to ensure the state is applied before re-enabling transitions
        void sidebar.offsetWidth; 
        document.body.classList.remove('no-transition');

        const toggleSidebar = () => {
            const isOpen = document.body.classList.toggle('sidebar-open');
            localStorage.setItem('sidebar_open', isOpen ? '1' : '0');
        };

        // 2. Click-to-Toggle for empty space (convenient for mobile/fast navigation)
        sidebar.onclick = (e) => {
            const interactive = e.target.closest('a, button, input, select');
            if (interactive && !interactive.classList.contains('sidebar-toggle')) {
                return; 
            }
            toggleSidebar();
        };

        // 3. Update User Card info
        const u = PAMS.getUser();
        if (u) {
            const initials = ((u.firstName?.[0] || '') + (u.lastName?.[0] || '')).toUpperCase() || '?';
            document.querySelectorAll('.user-avatar').forEach(el => el.textContent = initials);
            document.querySelectorAll('.user-name').forEach(el => el.textContent = `${u.firstName || ''} ${u.lastName || u.name || ''}`.trim());
            document.querySelectorAll('.user-role').forEach(el => {
                el.textContent = u.role === 'ADMIN' ? 'Administrator' : 'Personnel';
            });
        }
    };

    /**
     * Notifications
     */
    const setupNotifications = () => {
        const bell = document.querySelector('.bell-btn');
        const popover = document.querySelector('.notif-popover');
        if (!bell || !popover) return;

        bell.onclick = (e) => {
            e.stopPropagation();
            popover.classList.toggle('open');
            if (popover.classList.contains('open')) {
                loadNotifications();
            }
        };

        document.addEventListener('click', (e) => {
            if (!popover.contains(e.target) && e.target !== bell) {
                popover.classList.remove('open');
            }
        });
    };

    const loadNotifications = async () => {
        const body = document.querySelector('.notif-body');
        if (!body) return;

        body.innerHTML = '<div style="padding:20px;text-align:center;font-size:12px;color:#888;">Loading...</div>';
        
        try {
            const data = await PAMS.apiFetch('/notifications');
            if (!data.current || data.current.length === 0) {
                body.innerHTML = '<div style="padding:20px;text-align:center;font-size:12px;color:#888;">No new notifications.</div>';
                return;
            }

            body.innerHTML = data.current.map(n => `
                <a href="${PAMS.pageUrl('my-tasks.html')}" class="notif-item">
                    <i class="fa-solid fa-circle-exclamation"></i>
                    <div>
                        <div style="font-weight:600;">${n.message}</div>
                        <div style="font-size:10px;color:#888;margin-top:2px;">Due: ${PAMS.fmtDate(n.dueDate)}</div>
                    </div>
                </a>
            `).join('');
        } catch (err) {
            body.innerHTML = '<div style="padding:20px;text-align:center;font-size:11px;color:#dc2626;">Failed to load.</div>';
        }
    };

    /**
     * Initialization
     */
    const init = () => {
        applyRBAC();
        setupSidebar();
        setupNotifications();
    };

    return { init };
})();

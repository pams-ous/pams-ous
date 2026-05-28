/**
 * api.js
 * Purpose: Shared API utilities, session management, and UI "chrome" logic (Sidebar, RBAC).
 */

window.PAMS = (function () {
    
    /**
     * Session Management
     */
    const getToken = () => localStorage.getItem('authToken');
    const setToken = (t) => t ? localStorage.setItem('authToken', t) : localStorage.removeItem('authToken');
    const getUser  = () => {
        try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; }
    };
    const setUser  = (u) => u ? localStorage.setItem('user', JSON.stringify(u)) : localStorage.removeItem('user');

    /**
     * Navigation Helpers
     * Handles path resolution between /auth/ and /pages/ directories.
     */
    const _inAuth = () => /\/auth\//.test(location.pathname);
    const _inPages = () => /\/pages\//.test(location.pathname);

    const authUrl = (page) => _inPages() ? `../auth/${page}` : page;
    const pageUrl = (page) => _inAuth()  ? `../pages/${page}` : page;

    /**
     * Auth Guard
     */
    const requireAuth = () => {
        if (!getToken()) {
            window.location.href = authUrl('index.html');
            return false;
        }
        return true;
    };

    const logout = () => {
        setToken(null);
        setUser(null);
        window.location.href = authUrl('index.html');
    };

    /**
     * API Fetch Wrapper
     */
    const apiFetch = async (endpoint, method = 'GET', body = null) => {
        // Use CONFIG if available, otherwise fallback to default
        const baseUrl = (typeof CONFIG !== 'undefined') ? CONFIG.API_BASE_URL : 'http://localhost:5000';
        const url = `${baseUrl}/api${endpoint}`;

        const options = {
            method,
            headers: { 'Content-Type': 'application/json' }
        };

        const token = getToken();
        if (token) options.headers['Authorization'] = `Bearer ${token}`;
        if (body)  options.body = JSON.stringify(body);

        try {
            const response = await fetch(url, options);
            const data = await response.json().catch(() => ({}));
            
            if (!response.ok) {
                throw new Error(data.message || `Request failed (${response.status})`);
            }
            return data;
        } catch (error) {
            console.error(`API Error [${method} ${endpoint}]:`, error);
            throw error;
        }
    };

    /**
     * UI: Role-Based Access Control (RBAC)
     */
    const applyRBAC = () => {
        const u = getUser();
        const isAdmin = !!u && u.role === 'ADMIN';

        document.body.classList.toggle('role-admin', isAdmin);
        document.body.classList.toggle('role-member', !isAdmin);

        if (!isAdmin) {
            // Physically remove admin-only elements for security/cleanliness
            document.querySelectorAll('[data-admin-only]').forEach(el => el.remove());
            
            // Redirect if on an admin page
            const path = location.pathname.split('/').pop().toLowerCase();
            const adminPages = ['reports.html', 'users-groups.html'];
            if (adminPages.includes(path)) {
                window.location.replace(pageUrl('dashboard.html'));
            }
        }
    };

    /**
     * UI: Sidebar & Navigation
     */
    const setupSidebar = () => {
        const sidebar = document.querySelector('.sidebar');
        if (!sidebar) return;

        // 1. Inject Toggle Button
        if (!sidebar.querySelector('.sidebar-toggle')) {
            const btn = document.createElement('button');
            btn.className = 'sidebar-toggle';
            btn.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
            btn.onclick = () => {
                const isOpen = document.body.classList.toggle('sidebar-open');
                localStorage.setItem('sidebar_open', isOpen ? '1' : '0');
            };
            sidebar.appendChild(btn);
        }

        // 2. Restore State
        const wasOpen = localStorage.getItem('sidebar_open') === '1';
        document.body.classList.toggle('sidebar-open', wasOpen);

        // 3. User Card
        const u = getUser();
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
     * UI: Notifications
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
            const data = await apiFetch('/notifications');
            if (!data.current || data.current.length === 0) {
                body.innerHTML = '<div style="padding:20px;text-align:center;font-size:12px;color:#888;">No new notifications.</div>';
                return;
            }

            body.innerHTML = data.current.map(n => `
                <a href="${pageUrl('my-tasks.html')}" class="notif-item">
                    <i class="fa-solid fa-circle-exclamation"></i>
                    <div>
                        <div style="font-weight:600;">${n.message}</div>
                        <div style="font-size:10px;color:#888;margin-top:2px;">Due: ${fmtDate(n.dueDate)}</div>
                    </div>
                </a>
            `).join('');
        } catch (err) {
            body.innerHTML = '<div style="padding:20px;text-align:center;font-size:11px;color:#dc2626;">Failed to load.</div>';
        }
    };

    /**
     * Global "Chrome" Initialization
     */
    const setupChrome = () => {
        applyRBAC();
        setupSidebar();
        setupNotifications();
    };

    /**
     * Formatting Utilities
     */
    const fmtDate = (iso) => {
        if (!iso) return '—';
        return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const fmtHeaderDate = () => {
        return new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    };

    return {
        apiFetch, getToken, setToken, getUser, setUser,
        requireAuth, logout, setupChrome,
        authUrl, pageUrl, fmtDate, fmtHeaderDate
    };
})();

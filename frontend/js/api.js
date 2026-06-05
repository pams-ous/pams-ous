/**
 * api.js
 * Purpose: Shared API utilities, session management, and Auth Guards.
 * Strictly logic and data-fetching. No DOM manipulation for Layout/UI Chrome.
 */

window.PAMS = (function () {

    /**
     * Session Management
     */
    const getToken = () => sessionStorage.getItem('authToken');
    const setToken = (t) => t ? sessionStorage.setItem('authToken', t) : sessionStorage.removeItem('authToken');
    const getUser = () => {
        try { return JSON.parse(sessionStorage.getItem('user') || 'null'); } catch { return null; }
    };
    const setUser = (u) => u ? sessionStorage.setItem('user', JSON.stringify(u)) : sessionStorage.removeItem('user');

    /**
     * Navigation Helpers
     * Handles path resolution between /auth/ and /pages/ directories.
     */
    const _inAuth = () => /\/auth\//.test(location.pathname);
    const _inPages = () => /\/pages\//.test(location.pathname);

    const authUrl = (page) => {
        if (page === 'index.html') return (_inPages() || _inAuth()) ? `../${page}` : page;
        return _inPages() ? `../auth/${page}` : page;
    };
    const pageUrl = (page) => {
        if (_inAuth()) return `../pages/${page}`;
        if (_inPages()) return page;
        return `pages/${page}`;
    };

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

    const logout = async () => {
        const user = getUser();
        const email = user?.email || localStorage.getItem('PAMS_userEmail');

        // 1. Try Socket Logout (for instant UI updates)
        if (PAMS.socket) {
            PAMS.socket.emit('logout');
        }

        // 2. Try REST Logout (Guaranteed for ngrok/proxies)
        if (email) {
            try {
                await apiFetch('/auth/logout', 'POST', { email });
            } catch (e) {
                console.error('REST logout failed:', e);
            }
        }

        setToken(null);
        setUser(null);
        sessionStorage.removeItem('PAMS_userEmail');
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
        if (body) options.body = JSON.stringify(body);

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
     * Formatting Utilities
     */
    const fmtDate = (iso) => {
        if (!iso) return '—';
        return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const fmtHeaderDate = () => {
        return new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    };

    /**
     * System-wide Data Lookups (Shared Services)
     */
    const getUsers = async () => {
        const data = await apiFetch('/users');
        return Array.isArray(data) ? data : (data.users || []);
    };

    const getGroups = async () => {
        const data = await apiFetch('/groups');
        return Array.isArray(data) ? data : (data.groups || []);
    };

    const getDesignations = async () => {
        const data = await apiFetch('/designations');
        return Array.isArray(data) ? data : (data.designations || []);
    };


    return {
        apiFetch, getToken, setToken, getUser, setUser,
        requireAuth, logout,
        authUrl, pageUrl, fmtDate, fmtHeaderDate,
        getUsers, getGroups, getDesignations,
        socket: null
    };
})();

document.addEventListener('DOMContentLoaded', () => {
    // Check if the Socket.io library is loaded on the current HTML page
    if (typeof io !== 'undefined') {
        const token = PAMS.getToken();
        const socket = io(typeof CONFIG !== 'undefined' ? CONFIG.BACKEND_SOCKET_URL : "http://localhost:3000", {
            auth: { token },
            transports: ['websocket'] // Force WebSocket to ensure instant disconnect events
        }); 
        PAMS.socket = socket; // Store socket in PAMS object
        const savedEmail = sessionStorage.getItem('PAMS_userEmail');
        
        if (savedEmail) {
            socket.emit('register_session', savedEmail);
        }

        // Ensure user is marked offline when tab/window is closed
        window.addEventListener('beforeunload', () => {
            socket.emit('logout');
        });
    }
});

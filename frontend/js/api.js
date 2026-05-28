/**
 * api.js
 * Purpose: Shared API utilities, session management, and Auth Guards.
 * Strictly logic and data-fetching. No DOM manipulation for Layout/UI Chrome.
 */

window.PAMS = (function () {

    /**
     * Session Management
     */
    const getToken = () => localStorage.getItem('authToken');
    const setToken = (t) => t ? localStorage.setItem('authToken', t) : localStorage.removeItem('authToken');
    const getUser = () => {
        try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; }
    };
    const setUser = (u) => u ? localStorage.setItem('user', JSON.stringify(u)) : localStorage.removeItem('user');

    /**
     * Navigation Helpers
     * Handles path resolution between /auth/ and /pages/ directories.
     */
    const _inAuth = () => /\/auth\//.test(location.pathname);
    const _inPages = () => /\/pages\//.test(location.pathname);

    const authUrl = (page) => _inPages() ? `../auth/${page}` : page;
    const pageUrl = (page) => _inAuth() ? `../pages/${page}` : page;

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

    return {
        apiFetch, getToken, setToken, getUser, setUser,
        requireAuth, logout,
        authUrl, pageUrl, fmtDate, fmtHeaderDate
    };
})();

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
            window.location.replace(authUrl('index.html'));
            return false;
        }
        return true;
    };

    const performLogout = async () => {
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
        localStorage.removeItem('PAMS_userEmail');
        window.location.replace(authUrl('index.html'));
    };

    const logout = () => {
        // Check if the modal already exists in the DOM
        let modal = document.getElementById('logoutConfirmationModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.className = 'modal-backdrop';
            modal.id = 'logoutConfirmationModal';
            modal.innerHTML = `
                <div class="modal modal-sm">
                    <div class="modal-header">
                        <span class="modal-title">Sign Out</span>
                        <button type="button" class="modal-close" id="logoutModalClose"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                    <div class="confirm-body">
                        <i class="fa-solid fa-triangle-exclamation"></i>
                        <p>Are you sure you want to sign out?</p>
                        <p class="text-xs color-gray mt-2">You will need to sign in again to access the portal.</p>
                    </div>
                    <div class="modal-footer is-centered">
                        <button type="button" class="btn-cancel" id="logoutModalCancel">Cancel</button>
                        <button type="button" class="btn btn-danger" id="logoutModalConfirm">Sign Out</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            // Bind close/cancel actions
            const closeModal = () => modal.classList.remove('open');
            document.getElementById('logoutModalClose').addEventListener('click', closeModal);
            document.getElementById('logoutModalCancel').addEventListener('click', closeModal);
            document.getElementById('logoutModalConfirm').addEventListener('click', () => {
                closeModal();
                performLogout();
            });

            // Close when clicking directly on the backdrop overlay
            modal.addEventListener('click', (e) => {
                if (e.target === modal) closeModal();
            });
        }
        
        // Open/display the modal
        modal.classList.add('open');
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

            if (response.status === 401 || (response.status === 403 && data.message === 'Invalid or expired token')) {
                // Avoid recursion if we are already in the process of logging out
                if (!endpoint.includes('/auth/logout')) {
                    setToken(null);
                    setUser(null);
                    localStorage.removeItem('PAMS_userEmail');
                    window.location.replace(authUrl('index.html'));
                }
                throw new Error(data.message || 'Session expired');
            }

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
     * Password Policy (kept in sync with backend passwordUtil.js PASSWORD_POLICY)
     * Minimum 8 chars, with an uppercase letter, a lowercase letter, a number, and a symbol.
     */
    const PASSWORD_POLICY = {
        minLength: 8,
        hint: 'At least 8 characters, with an uppercase letter, a lowercase letter, a number, and a symbol.',
        message: 'Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a symbol.'
    };

    const validatePassword = (pw) => {
        const value = typeof pw === 'string' ? pw : '';
        const valid =
            value.length >= PASSWORD_POLICY.minLength &&
            /[A-Z]/.test(value) &&
            /[a-z]/.test(value) &&
            /[0-9]/.test(value) &&
            /[^A-Za-z0-9]/.test(value);
        return { valid, message: valid ? null : PASSWORD_POLICY.message };
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


    const verifySessionIntegrity = async () => {
        const token = getToken();
        if (!token) return;

        try {
            await apiFetch('/auth/verify-session', 'GET');
        } catch (error) {
            console.warn('Session integrity check failed:', error);
            logout();
        }
    };


    return {
        apiFetch, getToken, setToken, getUser, setUser,
        requireAuth, logout, verifySessionIntegrity,
        authUrl, pageUrl, fmtDate, fmtHeaderDate,
        getUsers, getGroups, getDesignations,
        validatePassword, PASSWORD_POLICY,
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
        
        if (token) {
            socket.emit('register_session', { token });
        }


    }

    // Automatically check session validity on pages inside the protected OUS portal
    if (PAMS.getToken() && PAMS.verifySessionIntegrity && /\/pages\//.test(location.pathname)) {
        PAMS.verifySessionIntegrity();
    }
});

// Synchronize authentication logouts/changes across multiple open tabs
window.addEventListener('storage', (event) => {
    if (event.key === 'authToken') {
        if (!event.newValue) {
            // Token was cleared (user logged out in another tab)
            window.location.replace(PAMS.authUrl('index.html'));
        } else {
            // Token was updated or refreshed
            window.location.reload();
        }
    }
});

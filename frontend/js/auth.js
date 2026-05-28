/**
 * auth.js
 * Purpose: Handles authentication logic for both Admin and Personnel portals.
 */

/**
 * Global Helpers
 */
const togglePasswordVisibility = (inputId, btn) => {
    const input = document.getElementById(inputId);
    const icon = btn.querySelector('i');
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    }
};

document.addEventListener('DOMContentLoaded', () => {

    // 1. UI Toggle Logic
    const showLoginBtn = document.getElementById('showLogin');
    const showSignupBtn = document.getElementById('showSignup');
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');

    if (showLoginBtn && showSignupBtn) {
        showLoginBtn.addEventListener('click', () => {
            showLoginBtn.classList.add('active');
            showSignupBtn.classList.remove('active');
            loginForm.classList.remove('hidden');
            signupForm.classList.add('hidden');
        });

        showSignupBtn.addEventListener('click', () => {
            showSignupBtn.classList.add('active');
            showLoginBtn.classList.remove('active');
            signupForm.classList.remove('hidden');
            loginForm.classList.add('hidden');
            loadDesignations(); // Load options when switching to signup
        });
    }

    /**
     * Session Helpers
     */
    const setSession = (token, user) => {
        localStorage.setItem('authToken', token);
        localStorage.setItem('user', JSON.stringify(user));
    };

    /**
     * Data Fetching
     */
    const loadDesignations = async () => {
        const sel = document.getElementById('signup-designation');
        if (!sel || sel.options.length > 1) return; // Already loaded or not on page

        const fallback = [
            { id: 4, name: 'Encoder / Administrative Staff' },
            { id: 3, name: 'Chief - Student Records' },
            { id: 2, name: 'Chief - Admission & Registration' },
            { id: 1, name: 'Head' }
        ];

        if (CONFIG.USE_MOCK_API) {
            sel.innerHTML = fallback.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
            return;
        }

        try {
            // Public endpoint for registration designations
            const response = await fetch(`${CONFIG.API_BASE_URL}/api/designations/public`);
            const data = await response.json();
            if (response.ok && data.length > 0) {
                sel.innerHTML = data.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
            } else {
                throw new Error('No designations found');
            }
        } catch (error) {
            console.warn('Could not fetch designations, using fallback list.');
            sel.innerHTML = fallback.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
        }
    };

    /**
     * API Interaction Handler
     * @param {string} endpoint - The target API route
     * @param {object} data - The payload
     */
    const performAuthRequest = async (endpoint, data) => {
        const url = `${CONFIG.API_BASE_URL}/api/${endpoint}`;

        if (CONFIG.USE_MOCK_API) {
            console.info(`[MOCK] Request to: ${url}`, data);
            return new Promise((resolve) => {
                setTimeout(() => resolve({
                    success: true,
                    message: 'Success (Mock Mode)',
                    token: endpoint === 'auth/login' ? 'mock-jwt-token' : null,
                    user: endpoint === 'auth/login' ? {
                        id: 1,
                        email: data.email,
                        role: data.email.includes('admin') ? 'ADMIN' : 'MEMBER',
                        firstName: 'User',
                        lastName: 'Test'
                    } : null
                }), 800);
            });
        }

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.message || `Request failed (${response.status})`);
            }
            return result;
        } catch (error) {
            console.error('API Request failed:', error);
            throw error;
        }
    };

    /**
     * Standardized Form Handler
     */
    const setupFormHandler = (formId, endpoint, type) => {
        const form = document.getElementById(formId);
        if (!form) return;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const formData = new FormData(form);
            const data = Object.fromEntries(formData.entries());
            const submitBtn = form.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerHTML;

            // Password matching check for signup
            if (formId === 'signupForm') {
                if (data.password !== data.confirmPassword) {
                    alert('Error: Passwords do not match.');
                    return;
                }
                if (data.password.length < 8) {
                    alert('Error: Password must be at least 8 characters long.');
                    return;
                }
                // Convert designationId to array as expected by the backend
                if (data.designationIds) {
                    data.designationIds = [Number(data.designationIds)];
                }
                // Clean up confirmPassword before sending
                delete data.confirmPassword;
            }

            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

            try {
                const result = await performAuthRequest(endpoint, data);

                if (type === 'Personnel Sign-In' && result.user?.role === 'ADMIN') {
                    alert('Administrator detected. Redirecting to the Admin Portal...');
                    window.location.href = 'admin-login.html';
                    return;
                }

                if (type === 'Admin Access' && result.user?.role !== 'ADMIN') {
                    alert('Access Denied: This portal is for administrators only.');
                    return;
                }

                if (result.token) {
                    setSession(result.token, result.user);
                    alert(`${type} successful! Redirecting to dashboard...`);
                    window.location.href = '../pages/dashboard.html';
                } else if (result.success || endpoint === 'auth/register') {
                    alert(`${type} successful! You can now sign in.`);
                    if (formId === 'signupForm') {
                        showLoginBtn.click(); // Switch to login tab
                    }
                } else {
                    alert(`Error: ${result.message}`);
                }
            } catch (error) {
                alert(`Error: ${error.message}`);
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
            }
        });
    };

    // Initialize handlers
    setupFormHandler('adminLoginForm', 'auth/login', 'Admin Access');
    setupFormHandler('loginForm', 'auth/login', 'Personnel Sign-In');
    setupFormHandler('signupForm', 'auth/register', 'Personnel Registration');
});

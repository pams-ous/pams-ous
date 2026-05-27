/**
 * auth.js
 * Purpose: Handles authentication logic for both Admin and Personnel portals.
 */

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
        });
    }

    /**
     * API Interaction Handler
     * @param {string} endpoint - The target API route
     * @param {object} data - The payload
     */
    const performAuthRequest = async (endpoint, data) => {
        const url = `${CONFIG.API_BASE_URL}/${endpoint}`;
        
        if (CONFIG.USE_MOCK_API) {
            console.info(`[MOCK] Request to: ${url}`, data);
            return new Promise((resolve) => {
                setTimeout(() => resolve({ success: true, message: 'Success (Mock Mode)' }), 800);
            });
        }

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            return await response.json();
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

            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

            try {
                const result = await performAuthRequest(endpoint, data);
                
                if (result.success) {
                    alert(`${type} successful!\nNote: In production, you will be redirected to the dashboard.`);
                    // window.location.href = 'dashboard.html';
                } else {
                    alert(`Error: ${result.message}`);
                }
            } catch (error) {
                alert('A system error occurred. Please verify your connection and try again.');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
            }
        });
    };

    // Initialize handlers
    setupFormHandler('adminLoginForm', 'admin/login', 'Admin Access');
    setupFormHandler('loginForm', 'personnel/login', 'Personnel Sign-In');
    setupFormHandler('signupForm', 'personnel/register', 'Personnel Registration');
});

/**
 * auth.js
 * Purpose: Handles authentication logic for both Admin and Personnel portals.
 * Integration Note: Search for "API_ENDPOINT" to locate areas requiring backend connection.
 */

document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Toggle Login/Signup (Personnel Portal UI)
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
     * 2. API Interaction Placeholder
     * @param {string} endpoint - The target API route
     * @param {object} data - The payload (credentials/user info)
     */
    const performAuthRequest = async (endpoint, data) => {
        console.log(`%c[API CALL] Initiating request to: ${endpoint}`, 'color: #3498db; font-weight: bold;');
        console.log('Payload:', data);

        // TODO: Replace this timeout with a real fetch() call
        // const response = await fetch(`API_BASE_URL/${endpoint}`, {
        //     method: 'POST',
        //     headers: { 'Content-Type': 'application/json' },
        //     body: JSON.stringify(data)
        // });
        // return await response.json();

        return new Promise((resolve) => {
            setTimeout(() => {
                resolve({ success: true, message: 'Prototype success response' });
            }, 1000);
        });
    };

    // 3. Form Submission Handlers
    const setupFormHandler = (formId, endpoint, type) => {
        const form = document.getElementById(formId);
        if (!form) return;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            // Gather form data
            const formData = new FormData(form);
            const data = Object.fromEntries(formData.entries());

            // UI Feedback: Disable button to prevent double-submit
            const submitBtn = form.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

            try {
                const result = await performAuthRequest(endpoint, data);
                
                if (result.success) {
                    alert(`${type} successful!\nIn production, this would redirect to the dashboard.`);
                    // window.location.href = 'dashboard.html';
                } else {
                    alert(`Error: ${result.message}`);
                }
            } catch (error) {
                console.error(`${type} failed:`, error);
                alert('A system error occurred. Please try again later.');
            } finally {
                // Re-enable UI
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
            }
        });
    };

    // Initialize specific handlers
    setupFormHandler('adminLoginForm', 'admin/login', 'Admin Authentication');
    setupFormHandler('loginForm', 'personnel/login', 'Personnel Sign-In');
    setupFormHandler('signupForm', 'personnel/register', 'Personnel Registration');
});

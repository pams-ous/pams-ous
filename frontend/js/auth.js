/**
 * auth.js
 * Purpose: Handles authentication logic for both Admin and Personnel portals.
 *
 * NOTE on transport: the original mock layer below uses fetch() to a REST API that
 * doesn't actually exist on the backend (the backend speaks Socket.IO). It still
 * works only because CONFIG.USE_MOCK_API = true. The OTP layer (otpClient.js) talks
 * to the real backend over Socket.IO, so OTP works end-to-end regardless of mock
 * mode — but the surrounding login/signup mocks remain mocks until the two halves
 * are unified.
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
    // If the user is already authenticated, and we are on an auth/login page, auto-redirect to the dashboard
    const isAuthPage = /\/auth\//.test(location.pathname) || location.pathname.endsWith('index.html');
    if (isAuthPage && typeof PAMS !== 'undefined' && PAMS.getToken()) {
        const depth = location.pathname.split('/').length - 2;
        const prefix = depth > 0 ? '../'.repeat(depth) : '';
        window.location.replace(prefix + 'pages/dashboard.html');
        return;
    }

    // 1. UI Toggle Logic — wires a Sign In / Sign Up pair of tabs to the matching forms.
    const wireSignInSignupTabs = ({ loginBtnId, signupBtnId, loginFormId, signupFormId, onSignup }) => {
        const loginBtn = document.getElementById(loginBtnId);
        const signupBtn = document.getElementById(signupBtnId);
        const loginForm = document.getElementById(loginFormId);
        const signupForm = document.getElementById(signupFormId);
        if (!loginBtn || !signupBtn || !loginForm || !signupForm) return null;

        loginBtn.addEventListener('click', () => {
            loginBtn.classList.add('active');
            signupBtn.classList.remove('active');
            loginBtn.setAttribute('aria-selected', 'true');
            signupBtn.setAttribute('aria-selected', 'false');
            loginForm.classList.remove('hidden');
            signupForm.classList.add('hidden');
        });
        signupBtn.addEventListener('click', () => {
            signupBtn.classList.add('active');
            loginBtn.classList.remove('active');
            signupBtn.setAttribute('aria-selected', 'true');
            loginBtn.setAttribute('aria-selected', 'false');
            signupForm.classList.remove('hidden');
            loginForm.classList.add('hidden');
            if (typeof onSignup === 'function') onSignup();
        });
        return loginBtn;
    };

    const showLoginBtn = wireSignInSignupTabs({
        loginBtnId: 'showLogin',
        signupBtnId: 'showSignup',
        loginFormId: 'loginForm',
        signupFormId: 'signupForm',
        onSignup: () => loadDesignations()
    });

    const showAdminLoginBtn = wireSignInSignupTabs({
        loginBtnId: 'showAdminLogin',
        signupBtnId: 'showAdminSignup',
        loginFormId: 'adminLoginForm',
        signupFormId: 'adminSignupForm',
        onSignup: () => loadDesignations()
    });

const setSession = (token, user) => {
        PAMS.setToken(token);
        PAMS.setUser(user);
        
        if (user && user.email) {
            localStorage.setItem('PAMS_userEmail', user.email);
        }
    };

    const loadDesignations = async () => {
        const selects = document.querySelectorAll('select[name="designationIds"]');
        if (selects.length === 0) return;

        const needsLoading = Array.from(selects).some(sel => sel.options.length <= 1);
        if (!needsLoading) return;

        const fallback = [
            { id: 4, name: 'Encoder / Administrative Staff' },
            { id: 3, name: 'Chief - Student Records' },
            { id: 2, name: 'Chief - Admission & Registration' },
            { id: 1, name: 'Head' }
        ];

        let designations = fallback;

        if (!CONFIG.USE_MOCK_API) {
            try {
                const response = await fetch(`${CONFIG.API_BASE_URL}/api/designations/public`);
                const data = await response.json();
                if (response.ok && data.length > 0) {
                    designations = data;
                } else {
                    throw new Error('No designations found');
                }
            } catch (error) {
                console.warn('Could not fetch designations, using fallback list.');
            }
        }

        const optionsHtml = designations
            .filter(d => {
                // If we are on the Admin portal, exclude the base staff role
                if (location.pathname.includes('admin-login.html')) {
                    return d.name !== 'Encoder / Administrative Staff';
                }
                return true;
            })
            .map(d => `<option value="${d.id}">${d.name}</option>`).join('');
        selects.forEach(sel => {
            sel.innerHTML = optionsHtml;
        });
    };

    /**
     * Performs the existing (mock) auth request. The OTP gate sits on top of this
     * so the mock and the OTP layer can coexist while the backend transport unifies.
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

    // Wire the Password / Email-OTP segmented toggle on a login form.
    const setupMethodToggle = (form) => {
        const toggle = form.querySelector('.method-toggle');
        if (!toggle) return;

        const buttons = Array.from(toggle.querySelectorAll('button[data-method]'));
        const submitLabel = form.querySelector('[data-submit-label]');
        const submitLabelDefault = submitLabel ? submitLabel.innerHTML : null;

        const applyMode = (mode) => {
            form.dataset.authMode = mode;
            buttons.forEach((b) => {
                const active = b.dataset.method === mode;
                b.classList.toggle('active', active);
                b.setAttribute('aria-selected', active ? 'true' : 'false');
            });

            // Show/hide per-method sections — and also flip `required` so hidden
            // fields don't block submit.
            form.querySelectorAll('[data-method-only]').forEach((el) => {
                const visible = el.dataset.methodOnly === mode;
                el.classList.toggle('hidden', !visible);
                el.querySelectorAll('input,select,textarea').forEach((inp) => {
                    if (visible) {
                        if (inp.dataset.wasRequired === 'true') inp.required = true;
                    } else {
                        if (inp.required) {
                            inp.dataset.wasRequired = 'true';
                            inp.required = false;
                        }
                    }
                });
            });

            if (submitLabel) {
                submitLabel.innerHTML = mode === 'otp'
                    ? '<i class="fa-solid fa-paper-plane" aria-hidden="true"></i> Send Code'
                    : submitLabelDefault;
            }
        };

        buttons.forEach((b) => {
            b.addEventListener('click', () => applyMode(b.dataset.method));
        });

        applyMode(form.dataset.authMode || 'password');
    };

    // Build a mock session for the OTP path so the existing redirect logic still works.
    // DEPRECATED: Now using real server-side role and token.
    /*
    const mockUserFromOtp = (email, empName, type) => {
        const [firstName, ...rest] = (empName || '').split(' ').filter(Boolean);
        const lastName = rest.length ? rest[rest.length - 1] : '';
        const role = type === 'Admin Access' || email.includes('admin') ? 'ADMIN' : 'MEMBER';
        return {
            id: 1,
            email,
            role,
            firstName: firstName || 'User',
            lastName
        };
    };
    */

    const SIGNUP_FORM_IDS = new Set(['signupForm', 'adminSignupForm']);

    const setupFormHandler = (formId, endpoint, type) => {
        const form = document.getElementById(formId);
        if (!form) return;

        const isSignup = SIGNUP_FORM_IDS.has(formId);
        if (!isSignup) setupMethodToggle(form);

        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const formData = new FormData(form);
            const data = Object.fromEntries(formData.entries());
            const submitBtn = form.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerHTML;
            const authMode = form.dataset.authMode || 'password';

            // Signup-side validation
            if (isSignup) {
                if (data.password !== data.confirmPassword) {
                    PAMS.toast('Passwords do not match.', 'warning');
                    return;
                }
                const pwCheck = PAMS.validatePassword(data.password);
                if (!pwCheck.valid) {
                    PAMS.toast(pwCheck.message, 'warning');
                    return;
                }
                if (data.designationIds) {
                    data.designationIds = [Number(data.designationIds)];
                }
            }

            // Login-side: OTP mode needs only email; nothing else can be missing.
            if (!isSignup && authMode === 'otp') {
                if (!data.email) {
                    PAMS.toast('Please enter your email to receive a code.', 'warning');
                    return;
                }
            }

            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

            try {
                // ─── REGISTRATION (OTP REQUIRED) ──────────────────────────────
                if (isSignup) {
                    const regPayload = {
                        tempEmpCode: data.employeeCode,
                        firstName: data.firstName,
                        middleName: data.middleName,
                        lastName: data.lastName,
                        suffix: data.suffix,
                        email: data.email,
                        tempPassword: data.password,
                        tempConfPassword: data.confirmPassword,
                        designationId: data.designationIds ? data.designationIds[0] : null
                    };

                    // If signing up via Admin portal, assign ADMIN role for designations 1, 2, 3
                    if (formId === 'adminSignupForm') {
                        if ([1, 2, 3].includes(regPayload.designationId)) {
                            regPayload.role = 'ADMIN';
                        } else {
                            regPayload.role = 'MEMBER';
                        }
                    }

                    await window.PAMSOtp.runRegistrationOtp({
                        formData: regPayload
                    });
                    PAMS.toast(`${type} successful! You can now sign in.`, 'success');
                    const backToLogin = formId === 'adminSignupForm' ? showAdminLoginBtn : showLoginBtn;
                    backToLogin && backToLogin.click();
                    return;
                }

                // ─── LOGIN: Email OTP mode (passwordless) ─────────────────────
                if (authMode === 'otp') {
                    const otpResult = await window.PAMSOtp.runLoginOtp({ email: data.email });
                    const user = {
                        id: 1, // We don't have the ID from the OTP flow yet, but we have role and token.
                        email: otpResult.email,
                        role: otpResult.role,
                        firstName: (otpResult.empName || '').split(' ')[0] || 'User',
                        lastName: (otpResult.empName || '').split(' ').slice(1).join(' ') || ''
                    };

                    if (type === 'Personnel Sign-In' && user.role === 'ADMIN') {
                        PAMS.showLoader('Administrator Detected', 'Redirecting to the Admin Portal...');
                        setTimeout(() => {
                            window.location.replace('admin-login.html');
                        }, 1200);
                        return;
                    }
                    if (type === 'Admin Access' && user.role !== 'ADMIN') {
                        PAMS.toast('Access Denied: This portal is for administrators only.', 'error');
                        return;
                    }

                    setSession(otpResult.token, user);
                    PAMS.showLoader('Sign-In Successful', 'Preparing your dashboard...');
                    setTimeout(() => {
                        window.location.replace('../pages/dashboard.html');
                    }, 1200);
                    return;
                }

                // ─── LOGIN: Password mode (existing mock path) ────────────────
                const result = await performAuthRequest(endpoint, data);

                if (type === 'Personnel Sign-In' && result.user?.role === 'ADMIN') {
                    PAMS.showLoader('Administrator Detected', 'Redirecting to the Admin Portal...');
                    setTimeout(() => {
                        window.location.replace('admin-login.html');
                    }, 1200);
                    return;
                }
                if (type === 'Admin Access' && result.user?.role !== 'ADMIN') {
                    PAMS.toast('Access Denied: This portal is for administrators only.', 'error');
                    return;
                }

                if (result.token) {
                    setSession(result.token, result.user);
                    PAMS.showLoader('Sign-In Successful', 'Preparing your dashboard...');
                    setTimeout(() => {
                        window.location.replace('../pages/dashboard.html');
                    }, 1200);
                } else if (result.success) {
                    PAMS.toast(`${type} successful!`, 'success');
                } else {
                    PAMS.toast(`Error: ${result.message}`, 'error');
                }
            } catch (error) {
                if (error && error.message === 'cancelled') {
                    // User closed the OTP modal — silently abort.
                } else {
                    PAMS.toast(`Error: ${error.message || error}`, 'error');
                }
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
            }
        });
    };

    setupFormHandler('adminLoginForm', 'auth/login', 'Admin Access');
    setupFormHandler('adminSignupForm', 'auth/register', 'Admin Registration');
    setupFormHandler('loginForm', 'auth/login', 'Personnel Sign-In');
    setupFormHandler('signupForm', 'auth/register', 'Personnel Registration');
});

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
    const isAuthPage = /\/auth\//.test(location.pathname) || location.pathname.endsWith('index.html');
    if (isAuthPage && typeof PAMS !== 'undefined' && PAMS.getToken()) {
        const depth = location.pathname.split('/').length - 2;
        const prefix = depth > 0 ? '../'.repeat(depth) : '';
        const user = PAMS.getUser();
        window.location.replace(prefix + 'pages/dashboard.html');
        return;
    }

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

    wireSignInSignupTabs({
        loginBtnId: 'showLogin',
        signupBtnId: 'showSignup',
        loginFormId: 'loginForm',
        signupFormId: 'signupForm',
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

        const optionsHtml = designations.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
        selects.forEach(sel => {
            sel.innerHTML = optionsHtml;
        });
    };

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

    const setupFormHandler = (formId, endpoint, type) => {
        const form = document.getElementById(formId);
        if (!form) return;

        const isSignup = formId === 'signupForm';
        if (!isSignup) setupMethodToggle(form);

        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const formData = new FormData(form);
            const data = Object.fromEntries(formData.entries());
            const submitBtn = form.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerHTML;
            const authMode = form.dataset.authMode || 'password';

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

            if (!isSignup && authMode === 'otp') {
                if (!data.email) {
                    PAMS.toast('Please enter your email to receive a code.', 'warning');
                    return;
                }
            }

            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

            try {
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

                    if ([1, 2, 3].includes(regPayload.designationId)) {
                        regPayload.role = 'ADMIN';
                    } else {
                        regPayload.role = 'MEMBER';
                    }

                    await window.PAMSOtp.runRegistrationOtp({
                        formData: regPayload
                    });
                    PAMS.toast('Registration successful! You can now sign in.', 'success');
                    document.getElementById('showLogin').click();
                    return;
                }

                if (authMode === 'otp') {
                    const otpResult = await window.PAMSOtp.runLoginOtp({ email: data.email });
                    const user = {
                        id: 1,
                        email: otpResult.email,
                        role: otpResult.role,
                        firstName: (otpResult.empName || '').split(' ')[0] || 'User',
                        lastName: (otpResult.empName || '').split(' ').slice(1).join(' ') || ''
                    };

                    setSession(otpResult.token, user);
                    PAMS.showLoader('Sign-In Successful', 'Preparing your dashboard...');
                    setTimeout(() => {
                        redirectAfterLogin(user);
                    }, 1200);
                    return;
                }

                const result = await performAuthRequest(endpoint, data);

                if (result.token) {
                    setSession(result.token, result.user);
                    PAMS.showLoader('Sign-In Successful', 'Preparing your dashboard...');
                    setTimeout(() => {
                        redirectAfterLogin(result.user);
                    }, 1200);
                } else if (result.success) {
                    PAMS.toast(`${type} successful!`, 'success');
                } else {
                    PAMS.toast(`Error: ${result.message}`, 'error');
                }
            } catch (error) {
                if (error && error.message === 'cancelled') {
                } else {
                    PAMS.toast(`Error: ${error.message || error}`, 'error');
                }
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
            }
        });
    };

    const redirectAfterLogin = (user) => {
        window.location.replace('../pages/dashboard.html');
    };

    setupFormHandler('loginForm', 'auth/login', 'Sign In');
    setupFormHandler('signupForm', 'auth/register', 'Registration');
});

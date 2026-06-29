/**
 * otpClient.js
 * Purpose: Shared OTP UI + Socket.IO client for sign-in, registration, and password reset.
 *
 * Public API:
 *   PAMSOtp.runLoginOtp({ email })
 *     - Used by login.html when "Sign in with email OTP"
 *       is ticked. The login form has already verified the password server-side and
 *       the backend has emitted awaitingOtp:true. This shows the modal, lets the user
 *       enter the code, and resolves with { email, empName } on success.
 *
 *   PAMSOtp.runRegistrationOtp({ formData })
 *     - Sends `requestRegistration` (which triggers the email), shows the modal, then
 *       sends `confirmRegistration` with the entered code. Resolves with { email } on
 *       successful account creation.
 *
 *   PAMSOtp.runPasswordResetRequest({ email })
 *     - Sends `requestPasswordReset` and resolves once the server has accepted the
 *       request. Used by the forgot-password page step 1 -> 2 transition.
 *
 *   PAMSOtp.runPasswordResetConfirm({ email, code, newPassword, confirmPassword })
 *     - Sends `confirmPasswordReset`. Resolves on success.
 *
 * Notes:
 * - Requires socket.io-client (loaded via CDN in the auth pages).
 * - Mock mode (CONFIG.USE_MOCK_API = true) short-circuits with a "any 6 digits" check
 *   so the UI can be exercised without a running backend. Real email delivery still
 *   needs the backend running.
 */

(function (window) {
    'use strict';

    const OTP_LEN = (window.CONFIG && window.CONFIG.OTP && window.CONFIG.OTP.CODE_LENGTH) || 6;
    const RESEND_COOLDOWN = (window.CONFIG && window.CONFIG.OTP && window.CONFIG.OTP.RESEND_COOLDOWN_SECONDS) || 30;
    const BACKEND_URL = (window.CONFIG && window.CONFIG.BACKEND_SOCKET_URL) || '';
    const USE_MOCK = !!(window.CONFIG && window.CONFIG.USE_MOCK_API);

    let sharedSocket = null;

    function getSocket() {
        if (USE_MOCK) return null;
        if (window.PAMS && window.PAMS.socket) return window.PAMS.socket;
        if (typeof window.io !== 'function') {
            console.error('socket.io-client not loaded. Add the CDN script to the page.');
            return null;
        }
        const socket = window.io(BACKEND_URL, { transports: ['websocket', 'polling'] });
        if (window.PAMS) window.PAMS.socket = socket;
        return socket;
    }

    function purposeCopy(purpose) {
        switch (purpose) {
            case 'registration':
                return {
                    title: 'Confirm your registration',
                    sub: 'We sent a verification code to <strong>{EMAIL}</strong>. Enter it below to finish creating your account.',
                    submitLabel: 'Verify & Create Account',
                    icon: 'fa-user-plus'
                };
            case 'password_reset':
                return {
                    title: 'Reset your password',
                    sub: 'We sent a reset code to <strong>{EMAIL}</strong>. Enter it below to continue.',
                    submitLabel: 'Verify Code',
                    icon: 'fa-key'
                };
            case 'login':
            default:
                return {
                    title: 'Verify your sign-in',
                    sub: 'We sent a sign-in code to <strong>{EMAIL}</strong>. Enter the 6-digit code below.',
                    submitLabel: 'Sign In',
                    icon: 'fa-shield-halved'
                };
        }
    }

    function buildModal({ email, purpose }) {
        const copy = purposeCopy(purpose);

        const backdrop = document.createElement('div');
        backdrop.className = 'otp-backdrop';
        backdrop.setAttribute('role', 'dialog');
        backdrop.setAttribute('aria-modal', 'true');
        backdrop.setAttribute('aria-labelledby', 'otp-modal-title');

        const inputs = Array.from({ length: OTP_LEN }, (_, i) =>
            `<input type="text" inputmode="numeric" maxlength="1" autocomplete="one-time-code"
                    aria-label="Digit ${i + 1} of ${OTP_LEN}" data-otp-index="${i}">`).join('');

        backdrop.innerHTML = `
            <div class="otp-modal">
                <button type="button" class="otp-modal-close" aria-label="Close verification dialog">
                    <i class="fas fa-times" aria-hidden="true"></i>
                </button>
                <div class="otp-modal-icon" aria-hidden="true">
                    <i class="fas ${copy.icon}"></i>
                </div>
                <h2 id="otp-modal-title">${copy.title}</h2>
                <p class="otp-modal-sub">${copy.sub.replace('{EMAIL}', escapeHtml(email))}</p>
                <div class="otp-input-row" role="group" aria-label="Verification code">${inputs}</div>
                <div class="otp-feedback is-info" role="status" aria-live="polite">
                    Code expires in <strong data-otp-countdown>${(window.CONFIG?.OTP?.TTL_MINUTES) || 5}:00</strong>.
                </div>
                <div class="otp-modal-actions">
                    <button type="button" class="btn btn-primary w-full" data-otp-submit>${copy.submitLabel}</button>
                </div>
                <div class="otp-resend">
                    Didn't receive it?
                    <button type="button" data-otp-resend disabled>Resend in <span data-otp-resend-cd>${RESEND_COOLDOWN}</span>s</button>
                </div>
            </div>`;

        return backdrop;
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, (c) =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function wireInputs(root) {
        const inputs = Array.from(root.querySelectorAll('.otp-input-row input'));
        inputs.forEach((input, i) => {
            input.addEventListener('input', (e) => {
                const v = e.target.value.replace(/\D/g, '');
                e.target.value = v.slice(0, 1);
                if (v && i < inputs.length - 1) inputs[i + 1].focus();
            });
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace' && !input.value && i > 0) inputs[i - 1].focus();
                if (e.key === 'ArrowLeft' && i > 0) inputs[i - 1].focus();
                if (e.key === 'ArrowRight' && i < inputs.length - 1) inputs[i + 1].focus();
            });
            input.addEventListener('paste', (e) => {
                e.preventDefault();
                const text = (e.clipboardData || window.clipboardData).getData('text') || '';
                const digits = text.replace(/\D/g, '').slice(0, inputs.length).split('');
                digits.forEach((d, idx) => { inputs[idx].value = d; });
                inputs[Math.min(digits.length, inputs.length - 1)].focus();
            });
        });
        return inputs;
    }

    function readCode(inputs) {
        return inputs.map(i => i.value).join('');
    }

    function setFeedback(root, text, kind /* 'error' | 'success' | 'info' */) {
        const el = root.querySelector('.otp-feedback');
        el.classList.remove('is-error', 'is-success', 'is-info');
        el.classList.add(kind === 'error' ? 'is-error' : kind === 'success' ? 'is-success' : 'is-info');
        el.innerHTML = text;
        root.querySelector('.otp-input-row').classList.toggle('is-error', kind === 'error');
    }

    function startExpiryCountdown(root) {
        const ttlSec = ((window.CONFIG?.OTP?.TTL_MINUTES) || 5) * 60;
        let remaining = ttlSec;
        const target = root.querySelector('[data-otp-countdown]');
        const tick = () => {
            const mm = String(Math.floor(remaining / 60)).padStart(1, '0');
            const ss = String(remaining % 60).padStart(2, '0');
            if (target) target.textContent = `${mm}:${ss}`;
            if (remaining <= 0) {
                clearInterval(id);
                setFeedback(root, 'Code has expired. Please request a new one.', 'error');
            }
            remaining--;
        };
        const id = setInterval(tick, 1000);
        tick();
        return () => clearInterval(id);
    }

    function startResendCountdown(root, onReady) {
        const btn = root.querySelector('[data-otp-resend]');
        const cd = root.querySelector('[data-otp-resend-cd]');
        let remaining = RESEND_COOLDOWN;
        btn.disabled = true;
        const id = setInterval(() => {
            remaining--;
            if (remaining <= 0) {
                clearInterval(id);
                btn.disabled = false;
                btn.textContent = 'Resend code';
                onReady && onReady();
                return;
            }
            if (cd) cd.textContent = remaining;
        }, 1000);
        return () => clearInterval(id);
    }

    function showModal({ email, purpose, onSubmit, onResend }) {
        const root = buildModal({ email, purpose });
        document.body.appendChild(root);
        document.body.style.overflow = 'hidden';

        const inputs = wireInputs(root);
        inputs[0].focus();

        const stopExpiry = startExpiryCountdown(root);
        let stopResend = startResendCountdown(root);

        const closeBtn = root.querySelector('.otp-modal-close');
        const submitBtn = root.querySelector('[data-otp-submit]');
        const resendBtn = root.querySelector('[data-otp-resend]');

        return new Promise((resolve, reject) => {
            const cleanup = () => {
                stopExpiry();
                stopResend && stopResend();
                root.remove();
                document.body.style.overflow = '';
            };

            closeBtn.addEventListener('click', () => {
                cleanup();
                reject(new Error('cancelled'));
            });

            submitBtn.addEventListener('click', async () => {
                const code = readCode(inputs);
                if (code.length !== OTP_LEN) {
                    setFeedback(root, `Please enter all ${OTP_LEN} digits.`, 'error');
                    return;
                }
                submitBtn.disabled = true;
                const originalLabel = submitBtn.innerHTML;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying…';
                try {
                    const result = await onSubmit(code);
                    setFeedback(root, 'Verified.', 'success');
                    setTimeout(() => {
                        cleanup();
                        resolve(result);
                    }, 350);
                } catch (err) {
                    setFeedback(root, escapeHtml(err.message || 'Verification failed.'), 'error');
                    inputs.forEach(i => { i.value = ''; });
                    inputs[0].focus();
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalLabel;
                }
            });

            resendBtn.addEventListener('click', async () => {
                if (resendBtn.disabled) return;
                resendBtn.disabled = true;
                resendBtn.textContent = 'Sending…';
                try {
                    await onResend();
                    setFeedback(root, 'A new code has been sent.', 'info');
                    resendBtn.textContent = `Resend in ${RESEND_COOLDOWN}s`;
                    const cdSpan = document.createElement('span');
                    cdSpan.setAttribute('data-otp-resend-cd', '');
                    stopResend && stopResend();
                    stopResend = startResendCountdown(root);
                } catch (err) {
                    setFeedback(root, escapeHtml(err.message || 'Could not resend code.'), 'error');
                    resendBtn.disabled = false;
                    resendBtn.textContent = 'Resend code';
                }
            });
        });
    }

    // ─── Socket helpers (one-shot request+response with timeout) ──────────────

    function emitAndWait(socket, emitEvent, payload, responseEvent, timeoutMs = 15000) {
        return new Promise((resolve, reject) => {
            if (!socket) return reject(new Error('Backend socket unavailable.'));
            const handler = (data) => {
                socket.off(responseEvent, handler);
                clearTimeout(timer);
                resolve(data);
            };
            const timer = setTimeout(() => {
                socket.off(responseEvent, handler);
                reject(new Error('Request timed out. Is the backend running?'));
            }, timeoutMs);
            socket.on(responseEvent, handler);
            socket.emit(emitEvent, payload);
        });
    }

    // ─── Flow: LOGIN OTP (passwordless) ───────────────────────────────────────
    // Email OTP is an ALTERNATIVE to password, not an extra step. The user picks
    // "Email OTP" on the sign-in form, enters their email, and this runs the
    // full request + verify flow.

    async function runLoginOtp({ email }) {
        if (USE_MOCK) {
            return mockShowModal({ email, purpose: 'login' });
        }
        const socket = getSocket();

        // 1. Trigger the initial email.
        const requested = await emitAndWait(socket, 'requestLoginOtp', { email }, 'otpRequestLog');
        if (!requested.success) {
            throw new Error(requested.rawData || 'Could not send sign-in code.');
        }

        // 2. Show modal; verify on submit.
        return showModal({
            email,
            purpose: 'login',
            onSubmit: async (code) => {
                const res = await emitAndWait(socket, 'verifyLoginOtp', { email, code }, 'otpVerifyLog');
                if (!res.success) throw new Error(res.rawData || 'Incorrect code.');
                return { email: res.email || email, empName: res.empName || '', role: res.role, token: res.token };
            },
            onResend: async () => {
                const res = await emitAndWait(socket, 'requestLoginOtp', { email }, 'otpRequestLog');
                if (!res.success) throw new Error(res.rawData || 'Could not resend code.');
            }
        });
    }

    // ─── Flow: REGISTRATION OTP ───────────────────────────────────────────────

    async function runRegistrationOtp({ formData }) {
        if (USE_MOCK) {
            return mockShowModal({ email: formData.email, purpose: 'registration' });
        }
        const socket = getSocket();

        // 1. Ask backend to validate, stash payload, and send the code.
        const requested = await emitAndWait(socket, 'requestRegistration', formData, 'registrationLog');
        if (!requested.success) {
            throw new Error(requested.rawData || 'Could not start registration.');
        }
        const email = requested.email || formData.email;

        // 2. Show modal; on submit, confirm.
        return showModal({
            email,
            purpose: 'registration',
            onSubmit: async (code) => {
                const res = await emitAndWait(socket, 'confirmRegistration', { email, code }, 'registrationLog');
                if (!res.success) throw new Error(res.rawData || 'Verification failed.');
                return { email };
            },
            onResend: async () => {
                const res = await emitAndWait(socket, 'requestRegistration', formData, 'registrationLog');
                if (!res.success) throw new Error(res.rawData || 'Could not resend code.');
            }
        });
    }

    // ─── Flow: PASSWORD RESET ─────────────────────────────────────────────────

    async function runPasswordResetRequest({ email }) {
        if (USE_MOCK) {
            return new Promise((resolve) => setTimeout(() => resolve({ email }), 600));
        }
        const socket = getSocket();
        const res = await emitAndWait(socket, 'requestPasswordReset', { email }, 'passwordResetLog');
        if (!res.success) throw new Error(res.rawData || 'Could not start password reset.');
        return { email: res.email || email };
    }

    async function runPasswordResetConfirm({ email, code, newPassword, confirmPassword }) {
        if (USE_MOCK) {
            return new Promise((resolve, reject) => setTimeout(() => {
                if (!/^\d{6}$/.test(code)) return reject(new Error('Incorrect code.'));
                resolve({ email });
            }, 600));
        }
        const socket = getSocket();
        const res = await emitAndWait(socket, 'confirmPasswordReset',
            { email, code, newPassword, confirmPassword }, 'passwordResetLog');
        if (!res.success) throw new Error(res.rawData || 'Password reset failed.');
        return { email };
    }

    // ─── Mock helpers (when CONFIG.USE_MOCK_API = true) ───────────────────────

    function mockShowModal({ email, purpose }) {
        return showModal({
            email,
            purpose,
            onSubmit: async (code) => {
                await new Promise(r => setTimeout(r, 400));
                if (!/^\d{6}$/.test(code)) throw new Error('Mock: enter any 6 digits.');
                return { email };
            },
            onResend: async () => {
                await new Promise(r => setTimeout(r, 300));
            }
        });
    }

    window.PAMSOtp = {
        runLoginOtp,
        runRegistrationOtp,
        runPasswordResetRequest,
        runPasswordResetConfirm,
        // Lower-level: shows a modal you control end-to-end. Exposed so other code can
        // build custom flows without copy-pasting the modal markup.
        showModal
    };

})(window);

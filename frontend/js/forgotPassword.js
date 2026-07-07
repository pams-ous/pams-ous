/**
 * forgotPassword.js
 * 3-step password reset: request code -> confirm code + new password -> done.
 *
 * Talks to the backend via Socket.IO through PAMSOtp (otpClient.js). In mock mode
 * (CONFIG.USE_MOCK_API = true), it accepts any 6-digit code so the UI is testable
 * without the backend running.
 */

document.addEventListener('DOMContentLoaded', () => {
    const container = document.querySelector('.forgot-password-content');
    container.classList.add('step-1');

    const requestForm = document.getElementById('requestForm');
    const confirmForm = document.getElementById('confirmForm');
    const doneStep = document.getElementById('doneStep');
    const stepHint = document.getElementById('stepHint');
    const resendBtn = document.getElementById('resendCodeBtn');

    let resetEmail = null;
    let resendCooldownId = null;

    const show = (el) => el.classList.remove('hidden');
    const hide = (el) => el.classList.add('hidden');

    const setHint = (text) => { if (stepHint) stepHint.textContent = text; };

    const lockButton = (btn, busyHtml) => {
        btn.dataset.originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = busyHtml;
    };
    const unlockButton = (btn) => {
        btn.disabled = false;
        btn.innerHTML = btn.dataset.originalText || btn.innerHTML;
    };

    const cooldownResend = (seconds) => {
        if (!resendBtn) return;
        let remaining = seconds;
        resendBtn.disabled = true;
        const originalLabel = "Didn't get the code? Resend.";
        const tick = () => {
            if (remaining <= 0) {
                clearInterval(resendCooldownId);
                resendBtn.disabled = false;
                resendBtn.textContent = originalLabel;
                return;
            }
            resendBtn.textContent = `Resend available in ${remaining}s`;
            remaining--;
        };
        tick();
        resendCooldownId = setInterval(tick, 1000);
    };

    // ─── Step 1: request code ─────────────────────────────────────────────────
    requestForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('reset-email').value.trim();
        if (!email) return;

        const submitBtn = requestForm.querySelector('button[type="submit"]');
        lockButton(submitBtn, '<i class="fas fa-spinner fa-spin"></i> Sending...');

        try {
            await window.PAMSOtp.runPasswordResetRequest({ email });
            resetEmail = email;
            container.classList.remove('step-1');
            hide(requestForm);
            show(confirmForm);
            setHint(`We sent a 6-digit code to ${email}. Enter it below along with your new password.`);
            cooldownResend(CONFIG.OTP.RESEND_COOLDOWN_SECONDS || 30);
            document.getElementById('reset-code').focus();
        } catch (err) {
            PAMS.toast(`Error: ${err.message || err}`, 'error');
        } finally {
            unlockButton(submitBtn);
        }
    });

    // ─── Step 2: confirm code + set new password ──────────────────────────────
    confirmForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const code = document.getElementById('reset-code').value.trim();
        const newPassword = document.getElementById('reset-new-password').value;
        const confirmPassword = document.getElementById('reset-confirm-password').value;

        if (newPassword !== confirmPassword) {
            PAMS.toast('Passwords do not match.', 'warning');
            return;
        }
        const pwCheck = PAMS.validatePassword(newPassword);
        if (!pwCheck.valid) {
            PAMS.toast(pwCheck.message, 'warning');
            return;
        }

        const submitBtn = confirmForm.querySelector('button[type="submit"]');
        lockButton(submitBtn, '<i class="fas fa-spinner fa-spin"></i> Resetting...');

        try {
            await window.PAMSOtp.runPasswordResetConfirm({
                email: resetEmail,
                code,
                newPassword,
                confirmPassword
            });
            hide(confirmForm);
            show(doneStep);
            setHint('Password reset complete.');
        } catch (err) {
            PAMS.toast(`Error: ${err.message || err}`, 'error');
        } finally {
            if (resendCooldownId) clearInterval(resendCooldownId);
            unlockButton(submitBtn);
        }
    });

    // ─── Resend code in step 2 ────────────────────────────────────────────────
    if (resendBtn) {
        resendBtn.addEventListener('click', async () => {
            if (resendBtn.disabled || !resetEmail) return;
            resendBtn.disabled = true;
            const original = resendBtn.textContent;
            resendBtn.textContent = 'Sending...';
            try {
                await window.PAMSOtp.runPasswordResetRequest({ email: resetEmail });
                cooldownResend(CONFIG.OTP.RESEND_COOLDOWN_SECONDS || 30);
            } catch (err) {
                PAMS.toast(`Error: ${err.message || err}`, 'error');
                resendBtn.disabled = false;
                resendBtn.textContent = original;
            }
        });
    }
});

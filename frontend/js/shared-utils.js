/**
 * shared-utils.js
 * Purpose: DOM utility helpers shared across auth pages and the app.
 * Loaded on every page (auth + protected) via <script> tag.
 */

// ── Password visibility toggle ──────────────────────────────────────
window.togglePasswordVisibility = function (inputId, button) {
    const input = document.getElementById(inputId);
    if (!input) return;

    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';

    const icon = button.querySelector('i');
    if (icon) {
        icon.classList.toggle('fa-eye');
        icon.classList.toggle('fa-eye-slash');
    }
};

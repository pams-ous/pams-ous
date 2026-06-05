/**
 * landing.js
 * Purpose: Handles interactions on the main entry page.
 */
document.addEventListener('DOMContentLoaded', () => {
    console.log('Main Landing Page Initialized');

    // Check for existing session and redirect automatically
    if (typeof PAMS !== 'undefined' && PAMS.getToken()) {
        window.location.replace('pages/dashboard.html');
    }
});

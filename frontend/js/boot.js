/**
 * boot.js
 * Purpose: Critical pre-render logic. 
 * Executed in the <head> to prevent UI flicker (FOUC) and perform early auth checks.
 */

(function () {
    // 1. Restore Sidebar State
    // We apply a "pre-open" class to the <html> element immediately.
    // This allows the CSS to render the sidebar correctly on the first paint.
    const sidebarWasOpen = localStorage.getItem('sidebar_open') === '1';
    if (sidebarWasOpen) {
        document.documentElement.classList.add('sidebar-pre-open');
    }

    // 2. Early Auth Guard
    // If we're not on a login/landing page and have no token, 
    // we can trigger a fast redirect before the body even starts loading.
    const isAuthPage = /\/auth\//.test(location.pathname) || location.pathname.endsWith('index.html');
    const hasToken = !!localStorage.getItem('authToken');

    if (!isAuthPage && !hasToken) {
        // Redirect to root index (landing)
        const depth = location.pathname.split('/').length - 2;
        const prefix = depth > 0 ? '../'.repeat(depth) : '';
        window.location.replace(prefix + 'index.html');
    }
})();

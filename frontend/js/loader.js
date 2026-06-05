/**
 * loader.js
 * Purpose: Shared UI Loader Component for custom authentication / redirection screens.
 * Extends the global PAMS namespace. Must be loaded AFTER api.js.
 */

(function () {
    if (!window.PAMS) {
        window.PAMS = {};
    }

    window.PAMS.showLoader = (title = 'Authenticating', message = 'Please wait...') => {
        // 1. Resolve relative path to OUS logo based on location
        const inAuth = /\/auth\//.test(window.location.pathname);
        const logoPath = inAuth ? '../assets/pup_ous_seal.webp' : 'assets/pup_ous_seal.webp';

        // 2. Find or create loader overlay element
        let loaderOverlay = document.querySelector('.pams-loader-overlay');
        if (!loaderOverlay) {
            loaderOverlay = document.createElement('div');
            loaderOverlay.className = 'pams-loader-overlay';
            loaderOverlay.innerHTML = `
                <div class="pams-loader-card">
                    <div class="pams-loader-spinner-container">
                        <div class="pams-loader-spinner"></div>
                        <img src="${logoPath}" alt="PUP OUS Seal" class="pams-loader-logo">
                    </div>
                    <h2 class="pams-loader-title"></h2>
                    <p class="pams-loader-message"></p>
                </div>
            `;
            document.body.appendChild(loaderOverlay);
        } else {
            // Update the logo image path if the overlay already exists
            const imgEl = loaderOverlay.querySelector('.pams-loader-logo');
            if (imgEl) {
                imgEl.src = logoPath;
            }
        }

        // 3. Set dynamic text content
        const titleEl = loaderOverlay.querySelector('.pams-loader-title');
        const messageEl = loaderOverlay.querySelector('.pams-loader-message');
        
        if (titleEl) titleEl.textContent = title;
        if (messageEl) messageEl.textContent = message;

        // 4. Trigger transition with a reflow
        void loaderOverlay.offsetWidth;
        loaderOverlay.classList.add('active');
    };

    window.PAMS.hideLoader = () => {
        const overlay = document.querySelector('.pams-loader-overlay');
        if (overlay) {
            overlay.classList.remove('active');
            // Remove from DOM after transition completes to save resources
            setTimeout(() => {
                if (overlay.parentNode && !overlay.classList.contains('active')) {
                    overlay.parentNode.removeChild(overlay);
                }
            }, 300); // Matches the transition duration in loader.css
        }
    };
})();

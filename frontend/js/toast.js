/**
 * toast.js
 * Purpose: Shared UI Toast Notifications Component.
 * Extends the global PAMS namespace. Must be loaded AFTER api.js.
 */

(function () {
    if (!window.PAMS) {
        console.error("PAMS global namespace not found. Please ensure api.js is loaded before toast.js.");
        return;
    }

    window.PAMS.toast = (message, type = 'info', duration = 4000) => {
        let container = document.querySelector('.pams-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'pams-toast-container';
            document.body.appendChild(container);
        }

        const toastEl = document.createElement('div');
        toastEl.className = `pams-toast pams-toast-${type}`;

        let icon = '<i class="fa-solid fa-circle-info"></i>';
        if (type === 'success') icon = '<i class="fa-solid fa-circle-check"></i>';
        else if (type === 'error') icon = '<i class="fa-solid fa-circle-xmark"></i>';
        else if (type === 'warning') icon = '<i class="fa-solid fa-circle-exclamation"></i>';

        toastEl.innerHTML = `
            <div class="pams-toast-icon">${icon}</div>
            <div class="pams-toast-content">${message}</div>
            <button class="pams-toast-close">&times;</button>
            <div class="pams-toast-progress" style="animation-duration: ${duration}ms"></div>
        `;

        const closeBtn = toastEl.querySelector('.pams-toast-close');
        closeBtn.onclick = () => {
            toastEl.classList.add('hide');
            setTimeout(() => toastEl.remove(), 400);
        };

        container.appendChild(toastEl);

        // Force reflow and apply class to animate in
        void toastEl.offsetWidth;
        toastEl.classList.add('show');

        // Automatically hide and remove after duration
        const timeout = setTimeout(() => {
            toastEl.classList.add('hide');
            setTimeout(() => toastEl.remove(), 400);
        }, duration);

        // Pause progress animation on hover (standard premium feel)
        toastEl.addEventListener('mouseenter', () => {
            clearTimeout(timeout);
            const progress = toastEl.querySelector('.pams-toast-progress');
            if (progress) progress.style.animationPlayState = 'paused';
        });
    };
})();

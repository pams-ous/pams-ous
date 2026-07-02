/**
 * layout.js
 * Purpose: Handles the global UI "Chrome" (Sidebar, Notifications, RBAC UI).
 */

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

// ── Custom Select Enhancer ───────────────────────────────────────────
// Turns any native <select> into a custom div-based dropdown.
// The original <select> stays in the DOM (hidden) so `.value` reads still work.
window.initCustomSelect = function (selectEl) {
    if (!selectEl || selectEl._customSelect || selectEl.closest('.custom-dropdown')) return;
    selectEl._customSelect = true;

    var buildMenu = function () {
        var menu = wrapper.querySelector('.custom-dropdown-menu');
        menu.innerHTML = Array.from(selectEl.options).map(function (opt) {
            return '<div class="custom-dropdown-option' + (opt.selected ? ' is-selected' : '') + '" data-value="' + opt.value.replace(/"/g, '&quot;') + '">' + opt.label + '</div>';
        }).join('');
        var selected = wrapper.querySelector('.custom-dropdown-selected');
        selected.textContent = selectEl.options[selectEl.selectedIndex] ? selectEl.options[selectEl.selectedIndex].label : '';
    };

    var selectedText = selectEl.options[selectEl.selectedIndex] ? selectEl.options[selectEl.selectedIndex].label : '';
    var wrapper = document.createElement('div');
    wrapper.className = 'custom-dropdown' + (selectEl.disabled ? ' is-disabled' : '');
    wrapper.innerHTML = '<div class="custom-dropdown-trigger" tabindex="0">' +
        '<span class="custom-dropdown-selected">' + selectedText + '</span>' +
        '<i class="fa-solid fa-chevron-down arrow"></i></div>' +
        '<div class="custom-dropdown-menu"></div>';

    var initiallyHidden = selectEl.style.display === 'none';
    selectEl.style.display = 'none';
    if (initiallyHidden) wrapper.style.display = 'none';
    selectEl.parentNode.insertBefore(wrapper, selectEl);
    buildMenu();
    selectEl.addEventListener('change', function () { buildMenu(); });

    var trigger = wrapper.querySelector('.custom-dropdown-trigger');
    trigger.addEventListener('click', function (e) {
        e.stopPropagation();
        if (selectEl.disabled) return;
        var isOpen = wrapper.classList.contains('is-open');
        document.querySelectorAll('.custom-dropdown.is-open').forEach(function (d) {
            if (d !== wrapper) d.classList.remove('is-open');
        });
        wrapper.classList.toggle('is-open', !isOpen);
    });

    wrapper.querySelector('.custom-dropdown-menu').addEventListener('click', function (e) {
        var opt = e.target.closest('.custom-dropdown-option');
        if (!opt) return;
        if (selectEl.disabled) return;

        selectEl.value = opt.dataset.value;
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));

        wrapper.querySelectorAll('.custom-dropdown-option').forEach(function (o) { o.classList.remove('is-selected'); });
        opt.classList.add('is-selected');
        wrapper.querySelector('.custom-dropdown-selected').textContent = opt.textContent;
        wrapper.classList.remove('is-open');
        e.stopPropagation();
    });

    document.addEventListener('click', function (e) {
        if (e.target !== trigger && !wrapper.contains(e.target)) {
            wrapper.classList.remove('is-open');
        }
    });

    var observer = new MutationObserver(function () { buildMenu(); });
    observer.observe(selectEl, { childList: true, subtree: true });

    // Sync wrapper visibility when select is shown/hidden (e.g., gen-year toggles)
    var styleObserver = new MutationObserver(function () {
        wrapper.style.display = selectEl.style.display === 'none' ? 'none' : '';
    });
    styleObserver.observe(selectEl, { attributes: true, attributeFilter: ['style'] });

    return wrapper;
};

// Auto-enhance eligible selects after all scripts have run
(function autoEnhance() {
    var enhanceTimer = null;
    var enhanceAll = function () {
        if (enhanceTimer) return;
        enhanceTimer = setTimeout(function () {
            enhanceTimer = null;
            document.querySelectorAll('select.form-control, select.ribbon-input, select.history-sort').forEach(window.initCustomSelect);
        }, 100);
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', enhanceAll);
    } else {
        enhanceAll();
    }
    var ro = new MutationObserver(function () { enhanceAll(); });
    if (document.body) ro.observe(document.body, { childList: true, subtree: true });
    else document.addEventListener('DOMContentLoaded', function () { ro.observe(document.body, { childList: true, subtree: true }); });
})();

window.PAMS_UI = (function () {

    /**
     * Role-Based Access Control (RBAC) UI Logic
     */
    const applyRBAC = () => {
        const u = PAMS.getUser();
        const isAdmin = !!u && u.role === 'ADMIN';

        document.body.classList.toggle('role-admin', isAdmin);
        document.body.classList.toggle('role-member', !isAdmin);

        if (!isAdmin) {
            // Physically remove admin-only elements
            document.querySelectorAll('[data-admin-only]').forEach(el => el.remove());

            // Redirect if on an admin-only page
            const path = location.pathname.split('/').pop().toLowerCase();
            const adminPages = ['reports.html', 'users-groups.html'];
            if (adminPages.includes(path)) {
                window.location.replace(PAMS.pageUrl('dashboard.html'));
            }
        }
    };

    /**
     * Sidebar Management
     */
    const setupSidebar = () => {
        const sidebar = document.querySelector('.sidebar');
        if (!sidebar) return;

        // 1. Hand-off from boot.js:
        // boot.js adds 'sidebar-pre-open' to <html> to prevent flicker.
        // We now move that to the standard 'sidebar-open' class on the body.
        const isPreOpened = document.documentElement.classList.contains('sidebar-pre-open');
        if (isPreOpened) {
            document.body.classList.add('no-transition', 'sidebar-open');
            document.documentElement.classList.remove('sidebar-pre-open');
            // Force reflow
            void sidebar.offsetWidth;
            document.body.classList.remove('no-transition');
        }

        const toggleSidebar = () => {
            const isOpen = document.body.classList.toggle('sidebar-open');
            localStorage.setItem('sidebar_open', isOpen ? '1' : '0');
        };

        // 2. Click-to-Toggle for empty space (convenient for mobile/fast navigation)
        sidebar.onclick = (e) => {
            const interactive = e.target.closest('a, button, input, select');
            if (interactive && !interactive.classList.contains('sidebar-toggle')) {
                return;
            }
            toggleSidebar();
        };

        // 3. Update User Card info
        const u = PAMS.getUser();
        if (u) {
            const initials = ((u.firstName?.[0] || '') + (u.lastName?.[0] || '')).toUpperCase() || '?';
            document.querySelectorAll('.user-avatar').forEach(el => el.textContent = initials);
            document.querySelectorAll('.user-name').forEach(el => el.textContent = `${u.firstName || ''} ${u.lastName || u.name || ''}`.trim());
            document.querySelectorAll('.user-role').forEach(el => {
                el.textContent = u.role === 'ADMIN' ? 'Administrator' : 'Personnel';
            });
        }
    };

    /**
     * Custom Confirmation Modal
     * Creates a modal using existing project CSS (.modal-backdrop, .modal, etc.)
     */
    const showConfirmModal = (message, onConfirm) => {
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';
        backdrop.style.display = 'flex';
        backdrop.style.zIndex = '9999';

        backdrop.innerHTML = `
            <div class="modal modal-sm">
                <div class="modal-header" style="background: #6B0A1A; color: #fff;">
                    <span class="modal-title">Confirm Action</span>
                    <button class="modal-close" id="confirm-modal-close">&times;</button>
                </div>
                <div class="modal-body" style="text-align: center; padding: 2rem 1.5rem;">
                    <p style="font-size: 14px; color: #444; line-height: 1.5;">${message}</p>
                </div>
                <div class="modal-footer is-centered" style="gap: 12px;">
                    <button class="btn btn-ghost" id="confirm-modal-cancel">Cancel</button>
                    <button class="btn btn-primary" id="confirm-modal-ok" style="background: #dc2626; border-color: #dc2626;">Clear All</button>
                </div>
            </div>
        `;

        document.body.appendChild(backdrop);

        const close = () => document.body.removeChild(backdrop);
        backdrop.querySelector('#confirm-modal-close').onclick = close;
        backdrop.querySelector('#confirm-modal-cancel').onclick = close;
        backdrop.querySelector('#confirm-modal-ok').onclick = () => {
            close();
            onConfirm();
        };
    };

    /**
     * Notifications
     */
    let notifHistory = [];
    let notifTotalCount = 0;
    let notifOffset = 0;

    const setupNotifications = () => {
        const bell = document.querySelector('.bell-btn');
        const popover = document.querySelector('.notif-popover');
        if (!bell || !popover) return;

        // Create the red bubble badge
        const badge = document.createElement('span');
        badge.className = 'notif-badge';
        badge.style.position = 'absolute';
        badge.style.top = '5px';
        badge.style.right = '5px';
        badge.style.backgroundColor = '#dc2626';
        badge.style.color = '#fff';
        badge.style.fontSize = '10px';
        badge.style.fontWeight = 'bold';
        badge.style.borderRadius = '50%';
        badge.style.width = '16px';
        badge.style.height = '16px';
        badge.style.display = 'none';
        badge.style.justifyContent = 'center';
        badge.style.alignItems = 'center';
        badge.style.zIndex = '10';
        bell.style.position = 'relative';
        bell.appendChild(badge);

        // Remove the old absolute-positioned "Clear All" button logic
        // It is now integrated into the "HISTORY" section in loadNotifications()


        bell.onclick = async (e) => {
            e.stopPropagation();
            const wasOpen = popover.classList.contains('open');
            popover.classList.toggle('open');
            if (!wasOpen) {
                notifHistory = [];
                notifOffset = 0;
                notifTotalCount = 0;
                await loadNotifications();
                updateBadgeCount(0);
            } else {
                PAMS.apiFetch('/notifications/mark-all-read', 'PATCH').catch(err => {
                    console.error('Failed to mark read:', err);
                });
            }
        };

        popover.onclick = async (e) => {
            const clearBtn = e.target.closest('.notif-clear-btn');
            if (clearBtn) {
                e.preventDefault();
                e.stopPropagation();
                showConfirmModal('Are you sure you want to clear all your notifications? This action cannot be undone.', async () => {
                    try {
                        await PAMS.apiFetch('/notifications/clear', 'POST');
                        loadNotifications();
                        updateBadgeCount(0);
                        PAMS.toast('All notifications cleared.', 'success');
                    } catch (err) {
                        PAMS.toast('Failed to clear notifications: ' + err.message, 'error');
                    }
                });
                return;
            }

            const showMoreBtn = e.target.closest('.notif-show-more-btn');
            if (showMoreBtn) {
                e.preventDefault();
                e.stopPropagation();
                await loadNotifications(true);
                return;
            }

            const btn = e.target.closest('.notif-action');
            if (!btn) return;

            e.preventDefault();
            e.stopPropagation();

            const notifId = btn.dataset.id;
            const action = btn.dataset.action; // 'approve' or 'reject'

            try {
                await PAMS.apiFetch(`/notifications/${notifId}/${action}`, 'POST');
                loadNotifications();
                PAMS.toast(`Request ${action === 'approve' ? 'approved' : 'rejected'} successfully.`, 'success');
            } catch (err) {
                PAMS.toast('Action failed: ' + err.message, 'error');
            }
        };

        document.addEventListener('click', (e) => {
            if (!popover.contains(e.target) && e.target !== bell) {
                if (popover.classList.contains('open')) {
                    PAMS.apiFetch('/notifications/mark-all-read', 'PATCH').catch(err => {
                        console.error('Failed to mark read:', err);
                    });
                }
                popover.classList.remove('open');
            }
        });

        updateBadgeCount();
        
        if (typeof io !== 'undefined') {
            const socket = PAMS.socket;
            if (socket) {
                socket.on('new_notification', (data) => {
                    console.log('[NOTIF-CLIENT] Received new_notification:', data?.kind, data?.title);
                    updateBadgeCount();
                    if (popover.classList.contains('open')) {
                        notifHistory = [];
                        notifOffset = 0;
                        notifTotalCount = 0;
                        loadNotifications();
                    }
                });
            } else {
                console.warn('[NOTIF-CLIENT] PAMS.socket is null — cannot listen for new_notification');
            }
        } else {
            console.warn('[NOTIF-CLIENT] io is undefined — socket.io library not loaded');
        }
    };

    const updateBadgeCount = async (count = null) => {
        const bell = document.querySelector('.bell-btn');
        if (!bell) return;
        const badge = bell.querySelector('.notif-badge');
        if (!badge) return;

        let finalCount = count;
        if (finalCount === null) {
            try {
                const data = await PAMS.apiFetch('/notifications/unread-count');
                finalCount = data.unreadCount;
            } catch (e) {
                finalCount = 0;
            }
        }

        if (finalCount > 0) {
            badge.textContent = finalCount > 99 ? '99+' : finalCount;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    };

    const loadNotifications = async (loadMore = false) => {
        const body = document.querySelector('.notif-body');
        if (!body) return;

        if (!loadMore) {
            body.innerHTML = '<div style="padding:20px;text-align:center;font-size:12px;color:#888;">Loading...</div>';
        }

        try {
            const limit = notifOffset === 0 ? 10 : 25;
            const data = await PAMS.apiFetch(`/notifications?limit=${limit}&offset=${notifOffset}`);
            console.log('[NOTIF-UI-DEBUG] Received data from server:', data);

            if (!loadMore) {
                notifHistory = data.history || [];
            } else {
                notifHistory = [...notifHistory, ...(data.history || [])];
            }
            notifTotalCount = data.totalCount || 0;
            notifOffset += (data.history || []).length;

            let html = '';

            if (data.current && data.current.length > 0) {
                html += '<div style="padding:10px; font-size:11px; font-weight:bold; color:#666; background:#f9f9f9; border-bottom:1px solid #eee;">DUE NOW / OVERDUE</div>';
                html += data.current.map(n => `
                    <a href="${PAMS.pageUrl('my-tasks.html')}" class="notif-item">
                        <i class="fa-solid fa-circle-exclamation" style="color:#e11d48;"></i>
                        <div>
                            <div style="font-weight:600;">${n.message}</div>
                            <div style="font-size:10px;color:#888;margin-top:2px;">Due: ${PAMS.fmtDate(n.dueDate)}</div>
                        </div>
                    </a>
                `).join('');
            }

            if (notifHistory.length > 0) {
                console.log('[NOTIF-UI-DEBUG] Processing history notifications:', notifHistory.length);

                const unread = notifHistory.filter(n => !n.isRead);
                const read = notifHistory.filter(n => n.isRead);
                console.log(`[NOTIF-UI-DEBUG] Split: Unread=${unread.length}, Read=${read.length}`);

                if (html) {
                    html += `<div style="padding:10px; font-size:11px; font-weight:bold; color:#666; background:#f9f9f9; border-top:1px solid #eee; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center;">
                                <span>HISTORY</span>
                                <button class="notif-clear-btn" style="background:none; border:none; color:#888; cursor:pointer; font-size:10px; font-weight:normal;">Clear All</button>
                            </div>`;
                }
                
                if (unread.length > 0) {
                    html += '<div style="padding:10px; font-size:11px; font-weight:bold; color:#3b82f6; background:#eff6ff; border-bottom:1px solid #dbeafe;">NEW NOTIFICATIONS</div>';
                    html += unread.map(n => {
                        let actionButtons = '';
                        if (n.kind === 'user_approval') {
                            actionButtons = `
                                <div style="display:flex; gap:8px; margin-top:8px; justify-content:flex-end;">
                                    <button data-id="${n.id}" data-action="approve" class="notif-action" style="color:#16a34a; background:none; border:none; cursor:pointer; font-size:16px;" title="Approve">
                                        <i class="fa-solid fa-circle-check"></i>
                                    </button>
                                    <button data-id="${n.id}" data-action="reject" class="notif-action" style="color:#dc2626; background:none; border:none; cursor:pointer; font-size:16px;" title="Reject">
                                        <i class="fa-solid fa-circle-xmark"></i>
                                    </button>
                                </div>
                            `;
                        }

                        return `
                            <div class="notif-item" style="cursor:default; background-color: #f0f7ff; border-left: 3px solid #3b82f6;">
                                <i class="fa-solid fa-bell" style="color:#3b82f6;"></i>
                                <div style="flex:1;">
                                    <div style="display:flex; justify-content:space-between; align-items:baseline;">
                                        <div style="font-weight:600;">${n.title}</div>
                                        <div style="font-size:9px; color:#aaa; margin-left:8px;">${n.createdAt ? new Date(n.createdAt).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</div>
                                    </div>
                                    <div style="font-size:11px;color:#666;">${n.body || ''}</div>
                                    ${actionButtons}
                                </div>
                            </div>
                        `;
                    }).join('');
                }

                if (read.length > 0) {
                    if (unread.length > 0) {
                        html += '<div style="padding:10px; font-size:11px; font-weight:bold; color:#999; background:#fafafa; border-top:1px solid #eee; border-bottom:1px solid #eee;">OLDER</div>';
                    } else if (!html) {
                        html += `<div style="padding:10px; font-size:11px; font-weight:bold; color:#666; background:#f9f9f9; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center;">
                                    <span>HISTORY</span>
                                    <button class="notif-clear-btn" style="background:none; border:none; color:#888; cursor:pointer; font-size:10px; font-weight:normal;">Clear All</button>
                                 </div>`;
                    }

                    html += read.map(n => {
                        let actionButtons = '';
                        if (n.kind === 'user_approval') {
                            actionButtons = `
                                <div style="display:flex; gap:8px; margin-top:8px; justify-content:flex-end;">
                                    <button data-id="${n.id}" data-action="approve" class="notif-action" style="color:#16a34a; background:none; border:none; cursor:pointer; font-size:16px;" title="Approve">
                                        <i class="fa-solid fa-circle-check"></i>
                                    </button>
                                    <button data-id="${n.id}" data-action="reject" class="notif-action" style="color:#dc2626; background:none; border:none; cursor:pointer; font-size:16px;" title="Reject">
                                        <i class="fa-solid fa-circle-xmark"></i>
                                    </button>
                                </div>
                            `;
                        }

                        return `
                            <div class="notif-item" style="cursor:default;">
                                <i class="fa-solid fa-bell" style="color:#666;"></i>
                                <div style="flex:1;">
                                    <div style="display:flex; justify-content:space-between; align-items:baseline;">
                                        <div style="font-weight:600;">${n.title}</div>
                                        <div style="font-size:9px; color:#aaa; margin-left:8px;">${n.createdAt ? new Date(n.createdAt).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</div>
                                    </div>
                                    <div style="font-size:11px;color:#666, font-style: italic;">${n.body || ''}</div>
                                    ${actionButtons}
                                </div>
                            </div>
                        `;
                    }).join('');
                }

                if (notifOffset < notifTotalCount) {
                    html += `<div style="padding: 10px; text-align: center; border-top: 1px solid #eee;">
                                <button class="notif-show-more-btn" style="background:none; border:none; color:#3b82f6; cursor:pointer; font-size:11px; font-weight:bold; padding: 5px 10px;">Show More</button>
                            </div>`;
                }
            }

            console.log('[NOTIF-UI-DEBUG] Final HTML length:', html.length);
            if (!html || html.trim() === '') {
                body.innerHTML = '<div style="padding:20px;text-align:center;font-size:12px;color:#888;">No notifications.</div>';
                return;
            }

            body.innerHTML = html;
        } catch (err) {
            console.error('[NOTIF-UI-DEBUG] loadNotifications error:', err);
            body.innerHTML = '<div style="padding:20px;text-align:center;font-size:11px;color:#dc2626;">Failed to load.</div>';
        }
    };

    /**
     * Global keyboard handler for modals:
     *   Escape  — closes the topmost visible modal backdrop
     *   Enter   — clicks the confirm/primary action button on the topmost modal
     * Covers both class-toggle (.open) and inline-display patterns.
     */
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const backdrops = document.querySelectorAll('.modal-backdrop');
            for (let i = backdrops.length - 1; i >= 0; i--) {
                const bd = backdrops[i];
                if (bd.classList.contains('open') || bd.style.display === 'flex') {
                    const closeBtn = bd.querySelector('.modal-close');
                    if (closeBtn) {
                        e.preventDefault();
                        closeBtn.click();
                        return;
                    }
                }
            }
            return;
        }

        if (e.key === 'Enter') {
            const tag = e.target.tagName;
            if (tag === 'TEXTAREA' || tag === 'SELECT') return;
            if (e.shiftKey) return;

            const backdrops = document.querySelectorAll('.modal-backdrop');
            for (let i = backdrops.length - 1; i >= 0; i--) {
                const bd = backdrops[i];
                if (bd.classList.contains('open') || bd.style.display === 'flex') {
                    const btn = findConfirmButton(bd);
                    if (btn) {
                        e.preventDefault();
                        btn.click();
                        return;
                    }
                }
            }

            const otpBackdrop = document.querySelector('.otp-backdrop');
            if (otpBackdrop) {
                const submitBtn = otpBackdrop.querySelector('[data-otp-submit]');
                if (submitBtn) {
                    e.preventDefault();
                    submitBtn.click();
                }
            }
        }
    });

    /**
     * Find the primary confirm/action button inside a modal backdrop.
     * Priority: known dynamic IDs → last non-cancel button in .modal-footer.
     */
    function findConfirmButton(backdrop) {
        const idBtn = backdrop.querySelector('#logoutModalConfirm')
                   || backdrop.querySelector('#confirm-modal-ok');
        if (idBtn) return idBtn;

        const footer = backdrop.querySelector('.modal-footer');
        if (footer) {
            const btns = footer.querySelectorAll('button:not(.btn-cancel):not(.modal-close)');
            return btns[btns.length - 1] || null;
        }

        return null;
    }

    /**
     * Initialization
     */
    const init = () => {
        applyRBAC();
        setupSidebar();
        setupNotifications();
    };

    return { init };
})();

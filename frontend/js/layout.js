/**
 * layout.js
 * Purpose: Handles the global UI "Chrome" (Sidebar, Notifications, RBAC UI).
 */

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
    const setupNotifications = () => {
        const bell = document.querySelector('.bell-btn');
        const popover = document.querySelector('.notif-popover');
        if (!bell || !popover) return;

        // Add "Clear All" button for Admins
        const user = PAMS.getUser();
        if (user && user.role === 'ADMIN') {
            const clearBtn = document.createElement('button');
            clearBtn.innerHTML = 'Clear All';
            clearBtn.className = 'notif-clear-btn';
            
            // Styling for top-right, no background, no borders, gray text
            clearBtn.style.position = 'absolute';
            clearBtn.style.top = '10px';
            clearBtn.style.right = '10px';
            clearBtn.style.background = 'transparent';
            clearBtn.style.border = 'none';
            clearBtn.style.color = '#888';
            clearBtn.style.cursor = 'pointer';
            clearBtn.style.fontSize = '10px';
            clearBtn.style.fontWeight = 'normal';
            clearBtn.style.zIndex = '10';

            clearBtn.onmouseover = () => clearBtn.style.color = '#333';
            clearBtn.onmouseout = () => clearBtn.style.color = '#888';
            
            clearBtn.onclick = async (e) => {
                e.stopPropagation();
                showConfirmModal('Are you sure you want to clear all system notifications? This action cannot be undone.', async () => {
                    try {
                        await PAMS.apiFetch('/notifications/clear', 'POST');
                        loadNotifications();
                    } catch (err) {
                        alert('Failed to clear notifications: ' + err.message);
                    }
                });
            };
            popover.appendChild(clearBtn);
        }

        bell.onclick = (e) => {
            e.stopPropagation();
            popover.classList.toggle('open');
            if (popover.classList.contains('open')) {
                loadNotifications();
            }
        };

        // Handle approval/rejection clicks via delegation
        popover.onclick = async (e) => {
            const btn = e.target.closest('.notif-action');
            if (!btn) return;

            e.preventDefault();
            e.stopPropagation();

            const notifId = btn.dataset.id;
            const action = btn.dataset.action; // 'approve' or 'reject'

            try {
                await PAMS.apiFetch(`/notifications/${notifId}/${action}`, 'POST');
                loadNotifications(); // Refresh list
            } catch (err) {
                alert('Action failed: ' + err.message);
            }
        };

        document.addEventListener('click', (e) => {
            if (!popover.contains(e.target) && e.target !== bell) {
                popover.classList.remove('open');
            }
        });
    };

    const loadNotifications = async () => {
        const body = document.querySelector('.notif-body');
        if (!body) return;

        body.innerHTML = '<div style="padding:20px;text-align:center;font-size:12px;color:#888;">Loading...</div>';

        try {
            const data = await PAMS.apiFetch('/notifications');
            let html = '';

            // 1. Render "Current" (Live Tasks)
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

            // 2. Render "History" (Persistent Notifications)
            if (data.history && data.history.length > 0) {
                if (html) html += '<div style="padding:10px; font-size:11px; font-weight:bold; color:#666; background:#f9f9f9; border-top:1px solid #eee; border-bottom:1px solid #eee;">HISTORY</div>';
                
                html += data.history.map(n => {
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
                                <div style="font-size:11px;color:#666;">${n.body || ''}</div>
                                ${actionButtons}
                            </div>
                        </div>
                    `;
                }).join('');
            }

            if (!html) {
                body.innerHTML = '<div style="padding:20px;text-align:center;font-size:12px;color:#888;">No notifications.</div>';
                return;
            }

            body.innerHTML = html;
        } catch (err) {
            body.innerHTML = '<div style="padding:20px;text-align:center;font-size:11px;color:#dc2626;">Failed to load.</div>';
        }
    };

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

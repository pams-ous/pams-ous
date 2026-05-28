// Shared API + auth helpers used by every page.
// Loaded with <script src="api.js"></script> before each page's inline script.

window.PAMS = (function () {
    const API_BASE = "http://localhost:5000/api";

    function getToken() { return localStorage.getItem("authToken"); }
    function setToken(t) { t ? localStorage.setItem("authToken", t) : localStorage.removeItem("authToken"); }
    function getUser()  { try { return JSON.parse(localStorage.getItem("user") || "null"); } catch { return null; } }
    function setUser(u) { u ? localStorage.setItem("user", JSON.stringify(u)) : localStorage.removeItem("user"); }

    // Cached effective permissions for the logged-in user. Populated on
    // setupChrome and used by hasPerm() — avoids hitting the API on every
    // permission check.
    let _myPerms = null;

    // ──────────────────────────────────────────────────────────────────
    // Path helpers — after the Nov-2026 reorg, pages live under either
    // /frontend/auth/ or /frontend/pages/. Inter-section navigation must
    // hop the parent. These helpers resolve the right relative URL from
    // whichever section is currently rendered, so every page can keep
    // calling pageUrl('dashboard.html') / authUrl('index.html')
    // without caring about its own location.
    // ──────────────────────────────────────────────────────────────────
    function _inAuth()  { return /\/auth\//.test(location.pathname); }
    function _inPages() { return /\/pages\//.test(location.pathname); }

    function authUrl(page) { return _inPages() ? `../auth/${page}` : page; }
    function pageUrl(page) { return _inAuth()  ? `../pages/${page}` : page; }

    // Pages that require a logged-in session call this in their init.
    // Bounces back to the portal picker (index.html) when no token is present.
    function requireAuth() {
        if (!getToken()) { window.location.href = authUrl("index.html"); return false; }
        return true;
    }

    async function logout() {
        try { await apiFetch("/auth/logout", "POST"); } catch {}
        setToken(null); setUser(null);
        _myPerms = null;
        window.location.href = authUrl("index.html");
    }

    // Central fetch wrapper.
    // - Sends JSON
    // - Adds Bearer token when present
    // - Throws Error(message) on non-2xx so callers can `try { ... } catch (err) {}`
    async function apiFetch(endpoint, method = "GET", body = null) {
        const opts = {
            method,
            headers: { "Content-Type": "application/json" }
        };
        const token = getToken();
        if (token) opts.headers.Authorization = `Bearer ${token}`;
        if (body)  opts.body = JSON.stringify(body);

        const res  = await fetch(`${API_BASE}${endpoint}`, opts);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            const err = new Error(data.message || `Request failed (${res.status})`);
            err.status = res.status;
            err.data   = data;
            throw err;
        }
        return data;
    }

    // ────────────────────────────────────────────────────────────────
    // CHROME — shared page furniture (sidebar, header bell, RBAC).
    // Every authenticated page calls setupChrome() in DOMContentLoaded,
    // so the wiring lives in exactly one place.
    // ────────────────────────────────────────────────────────────────
    function setupChrome() {
        // RBAC must run BEFORE any other chrome wiring so admin-only nodes
        // are stripped from the DOM (or kept hidden by the default CSS rule)
        // before anything else queries them. Combined with the CSS default
        // [data-admin-only]→display:none for non-admins, this eliminates the
        // flash-of-unauthorized-content on page load.
        applyRBAC();
        injectSidebarToggle();
        renderSidebarUser();
        wireSidebarToggle();
        wireBellPopover();
        // Permissions cache — fetched in the background; no need to block render.
        loadPermissions().catch(() => {});
        // Eagerly hydrate the bell red dot on page load so the user sees
        // unread / overdue alerts BEFORE opening the popover. Failures are
        // silent — the dot just stays hidden.
        refreshBellBadge().catch(() => {});
    }

    // ── Acknowledged-overdue tracking ────────────────────────────────────
    // "Current" alerts (overdue / due-today tasks) are derived live from the
    // Tasks table — they don't have a row in Notifications, so there is no
    // server-side `is_read` flag to flip. We track acknowledgement client-side
    // in localStorage so Read All and per-item clicks can clear the badge
    // until a new overdue task appears.
    function _ackKey() {
        const u = getUser();
        return u ? `pams.acknowledgedOverdue.${u.id || u.email}` : null;
    }
    function getAcknowledgedOverdue() {
        try { return new Set(JSON.parse(localStorage.getItem(_ackKey()) || "[]")); }
        catch { return new Set(); }
    }
    function setAcknowledgedOverdue(set) {
        const k = _ackKey();
        if (k) localStorage.setItem(k, JSON.stringify([...set]));
    }
    function acknowledgeOverdueTasks(taskIds) {
        const set = getAcknowledgedOverdue();
        for (const id of taskIds) set.add(String(id));
        setAcknowledgedOverdue(set);
    }

    // Pulls the lightweight {unreadCount, overdueCount} payload and toggles
    // the .has-alerts class on every bell button so its red dot reflects
    // current state. Safe to call repeatedly.
    //
    // Live overdue items are filtered through the localStorage acknowledged
    // set so the badge respects Read-All clicks.
    async function refreshBellBadge() {
        try {
            const badge = await apiFetch("/notifications/badge");
            // To know which overdue task IDs to subtract we still need the
            // current items list. /notifications/current would be cheaper but
            // /notifications already returns everything in one round trip.
            let effectiveOverdue = badge.overdueCount || 0;
            if (effectiveOverdue > 0) {
                const ack = getAcknowledgedOverdue();
                if (ack.size > 0) {
                    const full = await apiFetch("/notifications");
                    effectiveOverdue = (full.current || [])
                        .filter(c => c.kind === "overdue" && !ack.has(String(c.taskId)))
                        .length;
                }
            }
            const hasAlerts = effectiveOverdue > 0 || (badge.unreadCount || 0) > 0;
            document.querySelectorAll(".notif-wrap .bell-btn, .notif-wrap .icon-btn").forEach(btn => {
                btn.classList.toggle("has-alerts", hasAlerts);
            });
        } catch { /* not logged in / network — leave dot as-is */ }
    }

    // Inject the inner expand/collapse toggle button as a direct child of the
    // sidebar. Done in JS so we don't have to add the button to every page's
    // HTML — setupChrome() runs on every authenticated page and picks it up
    // uniformly. The toggle is appended at sidebar level (not inside the brand
    // row) so it can be absolutely-pinned to the sidebar's right edge cleanly,
    // independent of the brand row's flex layout / padding.
    function injectSidebarToggle() {
        const sidebar = document.querySelector(".sidebar");
        if (!sidebar || sidebar.querySelector(".sidebar-toggle")) return;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "sidebar-toggle";
        btn.title = "Toggle sidebar";
        btn.setAttribute("aria-label", "Toggle sidebar");
        // Single chevron — CSS rotates it 180° when the sidebar is expanded.
        btn.innerHTML = `<i class="fa-solid fa-chevron-right"></i>`;
        sidebar.appendChild(btn);
    }

    // Map the backend role to the UI's two-tier model and apply gating.
    //  - ADMIN  → "Administrator", sees everything
    //  - MEMBER → "Encoder/Administrative Staff", Main section only
    //
    // For non-admins we go beyond CSS hiding and physically REMOVE every
    // [data-admin-only] node from the DOM. The CSS default rule
    // body:not(.role-admin) [data-admin-only] { display: none } already
    // suppresses them before JS runs (no FOUC), but removing them outright
    // means the markup can't be revealed via DevTools either.
    function applyRBAC() {
        const u = getUser();
        const isAdmin = !!u && u.role === "ADMIN";

        // Tagging on <body> lets CSS reveal [data-admin-only] elements for
        // admins — for everyone else the default rule keeps them hidden.
        document.body.classList.toggle("role-admin",    isAdmin);
        document.body.classList.toggle("role-employee", !isAdmin);

        if (!isAdmin) {
            // Strip admin-only nodes entirely so they can't be flashed in
            // the future and can't be reached by inspecting the DOM.
            document.querySelectorAll("[data-admin-only]").forEach(el => el.remove());
        }

        // Belt-and-braces: if a non-admin lands on an admin-only page directly
        // (typed URL, bookmark, etc.), bounce them to the dashboard.
        const path = (location.pathname.split("/").pop() || "").toLowerCase();
        const adminPages = new Set(["reports.html", "users-groups.html"]);
        if (!isAdmin && adminPages.has(path)) {
            window.location.replace(pageUrl("dashboard.html"));
        }
    }

    // Fill the sidebar user card. The role subtitle is shown ONLY for admins
    // (per the May-26 spec); encoders/staff see just their name and the
    // .user-role row collapses so there's no empty space.
    function renderSidebarUser() {
        const u = getUser();
        if (!u) return;
        const isAdmin = u.role === "ADMIN";
        const initials = (u.firstName?.[0] || "") + (u.lastName?.[0] || "");

        document.querySelectorAll(".user-avatar").forEach(el => {
            el.textContent = initials.toUpperCase() || (u.name?.[0] || "?").toUpperCase();
        });
        document.querySelectorAll(".user-name").forEach(el => {
            el.textContent = u.name || u.email;
        });
        document.querySelectorAll(".user-role").forEach(el => {
            if (isAdmin) {
                el.textContent = "Administrator";
                el.style.display = "";
            } else {
                el.textContent = "";    // encoders: no subtitle (spec)
                el.style.display = "none";
            }
        });
    }

    // Permanent collapsible sidebar (per the PUP-OUS Figma design).
    // Default state on first load: COLLAPSED (icon-only, 72px). User preference
    // is persisted to localStorage so the chosen state survives navigation
    // between pages. Both the inner sidebar-toggle and the legacy header
    // hamburger trigger the same flip.
    function wireSidebarToggle() {
        // Restore last-known state. Missing key → collapsed (the default).
        const SB_KEY = "sidebar.expanded";
        const wasOpen = localStorage.getItem(SB_KEY) === "1";
        document.body.classList.toggle("sidebar-open", wasOpen);
        // Legacy class from the older modal-overlay model — cleared so it
        // can't interfere with the new width-based collapse logic.
        document.body.classList.remove("sidebar-collapsed");

        const toggle = (e) => {
            if (e) e.stopPropagation();
            // Close any open notification popover before toggling.
            document.querySelectorAll(".notif-popover.open").forEach(p => p.classList.remove("open"));
            const open = document.body.classList.toggle("sidebar-open");
            localStorage.setItem(SB_KEY, open ? "1" : "0");
        };

        document.querySelectorAll(".hamburger-btn, .sidebar-toggle").forEach(btn => {
            btn.addEventListener("click", toggle);
        });

        // Esc collapses the sidebar — preserves the keyboard shortcut from
        // the previous modal model so muscle memory still works.
        document.addEventListener("keydown", e => {
            if (e.key === "Escape") closeSidebar();
        });
    }

    function closeSidebar() {
        document.body.classList.remove("sidebar-open");
        localStorage.setItem("sidebar.expanded", "0");
    }

    // Bell button — opens the popover, fetches /api/notifications.
    function wireBellPopover() {
        document.querySelectorAll(".notif-wrap .bell-btn, .notif-wrap .icon-btn").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                e.stopPropagation();
                const wrap    = btn.closest(".notif-wrap");
                const popover = wrap.querySelector(".notif-popover");
                if (!popover) return;
                const isOpen = popover.classList.toggle("open");
                if (isOpen) await loadNotifications(popover, btn);
            });
        });
        // Click-away closes any open popover
        document.addEventListener("click", e => {
            document.querySelectorAll(".notif-popover.open").forEach(pop => {
                if (!pop.contains(e.target)) pop.classList.remove("open");
            });
        });
    }

    // Pull notifications from the new dedicated endpoint, which returns both
    // the live "current" items (overdue / due today) and the persisted history.
    async function loadNotifications(popover, btn) {
        const body = popover.querySelector(".notif-body");
        body.innerHTML = `<div class="notif-empty">Loading…</div>`;
        try {
            const data = await apiFetch("/notifications");
            renderNotifications(body, data);
            // Bell dot must respect the localStorage acknowledgement set —
            // re-opening the popover should NEVER restore a dot the user
            // already cleared. Read state is strictly one-way.
            const ack = getAcknowledgedOverdue();
            const effectiveOverdue = (data.current || [])
                .filter(c => c.kind === "overdue" && !ack.has(String(c.taskId)))
                .length;
            const hasAlerts = effectiveOverdue > 0 || (data.unreadCount || 0) > 0;
            btn.classList.toggle("has-alerts", hasAlerts);
        } catch (err) {
            // The bell must never blow up — show a graceful error and let the
            // user retry. Including err.status helps when debugging auth issues.
            body.innerHTML = `
                <div class="notif-empty">
                    Couldn't load notifications.<br>
                    <span style="font-size:11px;color:#888">${escapeHtml(err.message)}</span>
                </div>`;
        }
    }

    function renderNotifications(body, data) {
        const parts = [];

        // Acknowledged overdue tasks are still shown in the list (the task
        // is still overdue!) but render WITHOUT the unread accent and don't
        // count toward "any unread" for the Read All enable check.
        const ack = getAcknowledgedOverdue();
        const current = (data.current || []).map(c => ({
            ...c,
            isAcknowledged: c.kind === "overdue" && ack.has(String(c.taskId))
        }));
        const liveUnread = current.filter(c => !c.isAcknowledged).length;
        const hasAnyUnread = (data.history || []).some(h => !h.isRead) || liveUnread > 0;

        // Read All lives in the popover HEADER (level with the
        // "Notifications" title) — pushing it into the body stole space
        // from the notification list. Header markup is rewritten in place
        // every render so the disabled state stays in sync.
        const popover = body.closest(".notif-popover");
        const header  = popover && popover.querySelector(".notif-header");
        if (header) {
            header.innerHTML = `
                <span class="notif-header-title">Notifications</span>
                <button type="button"
                        class="notif-read-all-link"
                        data-action="read-all"
                        ${hasAnyUnread ? "" : "disabled"}>
                    Read All
                </button>
            `;
        }

        // ── Current section ──────────────────────────────────────────────
        parts.push(`<div class="notif-section-label">Current</div>`);
        if (current.length === 0) {
            parts.push(`
                <div class="notif-empty">
                    <i class="icon fa-solid fa-circle-check"></i>
                    You're all caught up — no overdue tasks.
                </div>`);
        } else {
            for (const n of current) {
                const icon = n.kind === "overdue"
                    ? "fa-triangle-exclamation"
                    : "fa-clock";
                const unreadCls = n.isAcknowledged ? "" : "is-unread";
                parts.push(`
                    <a class="notif-item ${unreadCls}" href="${pageUrl('my-tasks.html')}"
                       data-task-id="${n.taskId}"
                       style="text-decoration:none;color:inherit;">
                        <i class="fa-solid ${icon}"></i>
                        <div>
                            <div>${escapeHtml(n.message)}</div>
                            <div class="meta">Due ${fmtDate(n.dueDate)} · ${escapeHtml(n.priority || "")}</div>
                        </div>
                    </a>`);
            }
        }

        // ── History section ──────────────────────────────────────────────
        parts.push(`<div class="notif-section-label">Notification History</div>`);
        if (!data.history || data.history.length === 0) {
            parts.push(`
                <div class="notif-empty" style="padding:20px 16px;">
                    No past notifications yet.
                </div>`);
        } else {
            for (const h of data.history) {
                parts.push(`
                    <div class="notif-history-item ${h.isRead ? "" : "is-unread"}"
                         data-notif-id="${h.id}">
                        <i class="fa-solid ${iconForKind(h.kind)}"></i>
                        <div>
                            <div><strong>${escapeHtml(h.title)}</strong></div>
                            ${h.body ? `<div>${escapeHtml(h.body)}</div>` : ""}
                            <div class="meta">${fmtRelative(h.createdAt)}</div>
                        </div>
                    </div>`);
            }
        }

        body.innerHTML = parts.join("");

        // ── Wire "Read All" — clears every unread row in one POST, AND
        // acknowledges every current overdue task client-side so the live
        // alerts also stop driving the red dot. The button now lives in
        // the popover header, so look it up via the popover wrapper.
        const readAllBtn = (popover || body).querySelector('[data-action="read-all"]');
        if (readAllBtn) {
            readAllBtn.addEventListener("click", async (e) => {
                e.stopPropagation();
                if (readAllBtn.disabled) return;
                try {
                    await apiFetch("/notifications/mark-read", "POST");
                    // Acknowledge every overdue task currently in the popover.
                    const currentIds = (data.current || [])
                        .filter(c => c.kind === "overdue")
                        .map(c => c.taskId);
                    if (currentIds.length) acknowledgeOverdueTasks(currentIds);

                    const fresh = await apiFetch("/notifications");
                    renderNotifications(body, fresh);
                    refreshBellBadge();
                } catch { /* swallow */ }
            });
        }

        // ── Per-item click on a HISTORY row marks that single notif read.
        body.querySelectorAll(".notif-history-item.is-unread").forEach(row => {
            row.addEventListener("click", async (e) => {
                e.stopPropagation();
                const id = row.getAttribute("data-notif-id");
                if (!id) return;
                row.classList.remove("is-unread");      // optimistic
                try {
                    await apiFetch(`/notifications/${encodeURIComponent(id)}/mark-read`, "POST");
                    refreshBellBadge();
                    syncReadAllState(body, readAllBtn);
                } catch {
                    row.classList.add("is-unread");
                }
            });
        });

        // ── Per-item click on a Current (overdue/due-today) row navigates
        // to My Tasks AND acknowledges the live alert so the dot clears
        // until a new overdue task appears.
        body.querySelectorAll(".notif-item.is-unread").forEach(row => {
            row.addEventListener("click", () => {
                const taskId = row.getAttribute("data-task-id");
                if (taskId) acknowledgeOverdueTasks([taskId]);
                row.classList.remove("is-unread");
                // The <a href> default handles navigation — but call the
                // badge refresh on next tick so the dot updates before the
                // popover repaints.
                setTimeout(refreshBellBadge, 0);
                syncReadAllState(body, readAllBtn);
            });
        });
    }

    // Helper: toggle the Read All button's enabled state based on whether
    // any .is-unread rows remain in the popover.
    function syncReadAllState(body, readAllBtn) {
        if (!readAllBtn) return;
        const stillUnread = body.querySelectorAll(
            ".notif-history-item.is-unread, .notif-item.is-unread"
        ).length > 0;
        readAllBtn.disabled = !stillUnread;
    }

    function iconForKind(kind) {
        switch (kind) {
            case "task_assigned":  return "fa-clipboard-list";
            case "task_completed": return "fa-circle-check";
            case "password_reset": return "fa-key";
            case "report_generated": return "fa-file-lines";
            default: return "fa-bell";
        }
    }

    // ── permissions API ──────────────────────────────────────────────────
    async function loadPermissions() {
        try {
            const data = await apiFetch("/designations/me");
            _myPerms = new Set(data.permissions || []);
        } catch {
            _myPerms = new Set();
        }
    }
    // Synchronous check — call after setupChrome has had a chance to populate.
    function hasPerm(key) {
        if (!_myPerms) return false;
        return _myPerms.has(key);
    }

    function escapeHtml(s) {
        return String(s ?? "").replace(/[&<>"']/g, c => (
            { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]
        ));
    }

    // Format an ISO date (YYYY-MM-DD or full ISO) as "Mon DD, YYYY"
    function fmtDate(iso) {
        if (!iso) return "—";
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return String(iso);
        const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        return `${m[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
    }

    // Relative time for history list ("2 hours ago", "yesterday", "Mar 4")
    function fmtRelative(iso) {
        if (!iso) return "";
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return String(iso);
        const secs = Math.round((Date.now() - d.getTime()) / 1000);
        if (secs < 60)     return "just now";
        if (secs < 3600)   return `${Math.round(secs / 60)}m ago`;
        if (secs < 86400)  return `${Math.round(secs / 3600)}h ago`;
        if (secs < 172800) return "yesterday";
        if (secs < 604800) return `${Math.round(secs / 86400)}d ago`;
        return fmtDate(iso);
    }

    // Header date pill ("Mon, May 25, 2026")
    function fmtHeaderDate(date = new Date()) {
        const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
        const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
        return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
    }

    return {
        API_BASE, apiFetch,
        getToken, setToken, getUser, setUser,
        requireAuth, logout,
        setupChrome, closeSidebar,
        renderSidebarUser,   // kept exported for backwards compatibility
        loadPermissions, hasPerm,
        fmtDate, fmtRelative, fmtHeaderDate,
        authUrl, pageUrl,      // post-reorg navigation helpers
        refreshBellBadge       // pages that mutate task state can call this
    };
})();

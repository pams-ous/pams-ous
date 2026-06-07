/**
 * users-groups.js
 * Purpose: Logic for system administration, managing users, groups, and access.
 */

(function () {
    const { apiFetch, requireAuth, fmtHeaderDate } = PAMS;

    let users = [];
    let groups = [];
    let designations = [];

    // ── Sort state for the Users table ───────────────────────────────────────
    // col: one of 'name' | 'email' | 'role' | 'jobtitle' | 'groups' | 'status' | 'actions'
    // dir: 'asc' | 'desc'
    // Primary key is always online-first; col/dir apply within each status group.
    let sortState = { col: 'name', dir: 'asc' };

    // ── Sort state for the Groups table ──────────────────────────────────────
    // col: one of 'name' | 'desc' | 'leader' | 'members' | 'actions'
    // dir: 'asc' | 'desc'
    // No online-first concept for groups; single-key sort only.
    // Leader: blank / "Unassigned" always sorts to the end regardless of direction.
    let groupSortState = { col: 'name', dir: 'asc' };

    let currentManageGroupId = null;
    let currentGroupLeaderEmail = null;
    const currentUserId = 1;

    document.addEventListener('DOMContentLoaded', async () => {
        if (!requireAuth()) return;
        PAMS_UI.init();

        const dateEl = document.getElementById('headerDate');
        if (dateEl) dateEl.textContent = fmtHeaderDate();

        try {
            designations = await apiFetch('/designations');
        } catch (e) {
            console.error("Failed to load designations:", e);
        }

        if (typeof io !== 'undefined') {
            const token = PAMS.getToken();
            const socket = io(CONFIG.BACKEND_SOCKET_URL, { auth: { token } });

            const userSession = PAMS.getUser();
            if (userSession && userSession.email) {
                socket.emit('register_session', userSession.email);
            }

            socket.on('status_change', (data) => {
                const { email, status } = data;
                const matchIndex = users.findIndex(u => u.email === email);
                if (matchIndex !== -1) users[matchIndex].activeStatus = status;

                const targetTd = document.querySelector(`td[data-user-email="${email}"]`);
                if (targetTd) {
                    const isOnline = status.toLowerCase() === 'online';
                    const badgeClass = isOnline ? 'status-online' : 'status-offline';
                    const statusColor = isOnline ? '#28a745' : '#6c757d';
                    targetTd.style.color = statusColor;
                    targetTd.innerHTML = `
                        <span class="status-badge ${badgeClass}">
                            <i class="fas fa-circle" style="font-size: 0.6rem; margin-right: 5px; color: ${statusColor};"></i>
                            ${status || 'Offline'}
                        </span>
                    `;
                }
            });
        }

        await loadAll();
        initSortHeaders();
        initGroupSortHeaders();
        initTabs();
    });

    async function loadAll() {
        try {
            // EXPLICITLY USE THE NEW SYNC ROUTES
            try {
                const uData = await apiFetch('/admin/sync/users');
                users = (uData && Array.isArray(uData.users)) ? uData.users : (Array.isArray(uData) ? uData : []);
            } catch (err) { console.error("User fetch failed:", err); users = []; }

            try {
                const gData = await apiFetch('/admin/sync/groups');
                groups = (gData && Array.isArray(gData.groups)) ? gData.groups : (Array.isArray(gData) ? gData : []);
            } catch (err) { console.error("Group fetch failed:", err); groups = []; }

            renderUsers(); 
            renderGroups();
        } catch (error) {
            console.error("Fatal loadAll error:", error);
        }
    }

    // ── Sort value extractor ──────────────────────────────────────────────────
    // Returns a comparable primitive for a user row given the active column.
    // 'actions' column: users who are NOT the current user have a delete button,
    // so they rank as "more actionable" (value 1) vs. current-user rows (value 0).
    // This gives a deterministic, meaningful sort rather than leaving Actions unsorted.
    function getSortValue(u, col) {
        switch (col) {
            case 'name':
                return (u.name || '').toLowerCase();
            case 'email':
                return (u.email || '').toLowerCase();
            case 'role':
                // Normalise: ADMIN sorts before MEMBER alphabetically ascending
                return (u.role || '').toLowerCase();
            case 'jobtitle': {
                // Resolve the designation id stored on the user to its display name,
                // so the column sorts alphabetically by the title the admin actually sees.
                const d = designations.find(x => String(x.id) === String(u.jobTitleId));
                return (d ? d.name : '').toLowerCase();
            }
            case 'groups':
                // Sort by group count (numeric), then alphabetical on first group name as tiebreak
                return (u.groups && Array.isArray(u.groups)) ? u.groups.length : 0;
            case 'status':
                // Online < Offline so ascending puts online first within each bucket
                // (the primary online-first key already handles cross-bucket ordering)
                return (u.activeStatus || 'Offline').toLowerCase();
            case 'actions':
                // Users that are not the current user have a delete action available;
                // treat them as having more actionable weight (1 vs 0).
                return u.id === currentUserId ? 0 : 1;
            default:
                return '';
        }
    }

    // ── Primary+secondary comparator ─────────────────────────────────────────
    // Primary: online users always before offline (independent of col/dir).
    // Secondary: user-chosen column, user-chosen direction.
    function applyUserSort(arr) {
        const { col, dir } = sortState;
        const mul = dir === 'asc' ? 1 : -1;

        return [...arr].sort((a, b) => {
            // Primary — online-first (online = 1, offline = 0, higher first)
            const aOnline = (a.activeStatus || 'Offline').toLowerCase() === 'online' ? 1 : 0;
            const bOnline = (b.activeStatus || 'Offline').toLowerCase() === 'online' ? 1 : 0;
            if (bOnline !== aOnline) return bOnline - aOnline; // descending: online first

            // Secondary — active column sort
            const aVal = getSortValue(a, col);
            const bVal = getSortValue(b, col);
            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return (aVal - bVal) * mul;
            }
            const cmp = String(aVal).localeCompare(String(bVal), undefined, { sensitivity: 'base' });
            return cmp * mul;
        });
    }

    // ── Header wiring — Users table ──────────────────────────────────────────
    // Scoped to #usersTable to prevent accidentally wiring Groups headers here.
    function initSortHeaders() {
        const headers = document.querySelectorAll('#usersTable .th-sort');

        headers.forEach(th => {
            function activate() {
                const col = th.dataset.col;

                if (sortState.col === col) {
                    // Same column: flip direction
                    sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
                } else {
                    // New column: default to ascending
                    sortState.col = col;
                    sortState.dir = 'asc';
                }

                // Update aria-sort on all headers in this table
                headers.forEach(h => {
                    if (h.dataset.col === sortState.col) {
                        h.setAttribute('aria-sort', sortState.dir === 'asc' ? 'ascending' : 'descending');
                        const icon = h.querySelector('.th-sort-icon');
                        if (icon) {
                            icon.className = sortState.dir === 'asc'
                                ? 'fa-solid fa-sort-up th-sort-icon'
                                : 'fa-solid fa-sort-down th-sort-icon';
                        }
                    } else {
                        h.setAttribute('aria-sort', 'none');
                        const icon = h.querySelector('.th-sort-icon');
                        if (icon) icon.className = 'fa-solid fa-sort th-sort-icon';
                    }
                });

                renderUsers();
            }

            th.addEventListener('click', activate);

            // Keyboard: Enter or Space activates sort
            th.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    activate();
                }
            });
        });
    }

    // ── Groups sort value extractor ───────────────────────────────────────────
    // Returns a comparable primitive for a group row given the active column.
    // Leader: empty / "Unassigned" always pushed to the end (returns a value
    // that sorts last regardless of direction via a sentinel in applyGroupSort).
    function getGroupSortValue(g, col) {
        switch (col) {
            case 'name':
                return (g.name || '').toLowerCase();
            case 'desc':
                return (g.desc || '').toLowerCase();
            case 'leader':
                // Blank leaders are handled as a sentinel in applyGroupSort;
                // return the name string here for non-blank rows.
                return (g.leader || '').toLowerCase();
            case 'members':
                return typeof g.members === 'number' ? g.members : 0;
            case 'actions':
                // All rows have the same set of actions; treat as equal (value 0).
                return 0;
            default:
                return '';
        }
    }

    // ── Groups comparator ─────────────────────────────────────────────────────
    // Single-key sort (no online-first concept for groups).
    // Blank/Unassigned leaders are always pushed to the end, independent of dir.
    function applyGroupSort(arr) {
        const { col, dir } = groupSortState;
        const mul = dir === 'asc' ? 1 : -1;

        return [...arr].sort((a, b) => {
            // Push blank leaders to end regardless of direction when sorting by leader
            if (col === 'leader') {
                const aBlank = !a.leader;
                const bBlank = !b.leader;
                if (aBlank && !bBlank) return 1;
                if (!aBlank && bBlank) return -1;
            }

            const aVal = getGroupSortValue(a, col);
            const bVal = getGroupSortValue(b, col);

            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return (aVal - bVal) * mul;
            }
            const cmp = String(aVal).localeCompare(String(bVal), undefined, { sensitivity: 'base' });
            return cmp * mul;
        });
    }

    // ── Header wiring — Groups table ─────────────────────────────────────────
    // Scoped to #groupsTable; uses groupSortState and renderGroups().
    function initGroupSortHeaders() {
        const headers = document.querySelectorAll('#groupsTable .th-sort');

        headers.forEach(th => {
            function activate() {
                const col = th.dataset.col;

                if (groupSortState.col === col) {
                    groupSortState.dir = groupSortState.dir === 'asc' ? 'desc' : 'asc';
                } else {
                    groupSortState.col = col;
                    groupSortState.dir = 'asc';
                }

                // Update aria-sort on all headers in this table
                headers.forEach(h => {
                    if (h.dataset.col === groupSortState.col) {
                        h.setAttribute('aria-sort', groupSortState.dir === 'asc' ? 'ascending' : 'descending');
                        const icon = h.querySelector('.th-sort-icon');
                        if (icon) {
                            icon.className = groupSortState.dir === 'asc'
                                ? 'fa-solid fa-sort-up th-sort-icon'
                                : 'fa-solid fa-sort-down th-sort-icon';
                        }
                    } else {
                        h.setAttribute('aria-sort', 'none');
                        const icon = h.querySelector('.th-sort-icon');
                        if (icon) icon.className = 'fa-solid fa-sort th-sort-icon';
                    }
                });

                renderGroups();
            }

            th.addEventListener('click', activate);

            // Keyboard: Enter or Space activates sort
            th.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    activate();
                }
            });
        });
    }

    // ── Tab switching ────────────────────────────────────────────────────────
    // Implements the ARIA tabs pattern with roving tabindex and keyboard support.
    // Both tabpanels remain in the DOM at all times so the sort engines wired
    // to #usersTable and #groupsTable in initSortHeaders / initGroupSortHeaders
    // are never destroyed.
    function initTabs() {
        const tabs = Array.from(document.querySelectorAll('.ug-tab[role="tab"]'));
        const panels = tabs.map(t => document.getElementById(t.getAttribute('aria-controls')));

        function activateTab(targetTab) {
            tabs.forEach((tab, i) => {
                const isTarget = tab === targetTab;
                tab.setAttribute('aria-selected', isTarget ? 'true' : 'false');
                tab.setAttribute('tabindex', isTarget ? '0' : '-1');
                tab.classList.toggle('active', isTarget);

                if (isTarget) {
                    panels[i].removeAttribute('hidden');
                } else {
                    panels[i].setAttribute('hidden', '');
                }
            });
        }

        tabs.forEach((tab, i) => {
            tab.addEventListener('click', () => activateTab(tab));

            tab.addEventListener('keydown', (e) => {
                let next = null;

                if (e.key === 'ArrowRight') {
                    next = tabs[(i + 1) % tabs.length];
                } else if (e.key === 'ArrowLeft') {
                    next = tabs[(i - 1 + tabs.length) % tabs.length];
                } else if (e.key === 'Home') {
                    next = tabs[0];
                } else if (e.key === 'End') {
                    next = tabs[tabs.length - 1];
                } else if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    activateTab(tab);
                    return;
                }

                if (next) {
                    e.preventDefault();
                    activateTab(next);
                    next.focus();
                }
            });
        });
    }

    function renderUsers() {
        if (!window.Admin) window.Admin = {};
        window.Admin.refreshData = loadAll;
          
        document.getElementById('usersBody').innerHTML = applyUserSort(users).map(u => {
            const isOnline = (u.activeStatus || 'Offline').toLowerCase() === 'online';
            const badgeClass = isOnline ? 'status-online' : 'status-offline';

            const groupTags = (u.groups && Array.isArray(u.groups) && u.groups.length > 0) 
                ? u.groups.map(gName => `<span style="background: #e0e7ff; color: #3730a3; padding: 3px 8px; border-radius: 4px; font-size: 0.7rem; display: inline-block; margin: 2px;">${gName}</span>`).join('') 
                : '<span style="color:#9ca3af; font-style:italic; font-size: 0.8rem;">Unassigned</span>';

            const jobTitleOptions = designations.map(d => 
                `<option value="${d.id}" ${u.jobTitleId == d.id ? 'selected' : ''}>${d.name}</option>`
            ).join('');

            return `
            <tr>
              <td class="td-name">${u.name || '—'}</td>
              <td class="td-email">${u.email}</td>
              <td>
                <select 
                    class="form-control role-select-dropdown" 
                    onchange="window.Admin.changeRole('${u.email}', this.value)"
                    data-user-email="${u.email}" 
                    data-current-role="${u.role}"
                    style="font-size: 0.75rem; padding: 0.2rem 0.5rem; width: auto; display: inline-block; cursor: pointer;">
                    <option value="MEMBER" ${u.role === 'MEMBER' ? 'selected' : ''}>Encoder / Admin. Staff</option>
                    <option value="ADMIN" ${u.role === 'ADMIN' ? 'selected' : ''}>Administrator</option>
                </select>
              </td>
              <td>
                <select 
                    class="form-control" 
                    onchange="window.Admin.changeJobTitle('${u.email}', this.value)"
                    data-user-email="${u.email}" 
                    style="font-size: 0.75rem; padding: 0.2rem 0.5rem; width: auto; display: inline-block; cursor: pointer;">
                    <option value="">— Select Title —</option>
                    ${jobTitleOptions}
                </select>
              </td>
              
              <td class="td-groups" style="max-width: 250px; white-space: normal;">
                  ${groupTags}
              </td>

              <td data-user-email="${u.email}" style="color: ${isOnline ? '#28a745' : '#6c757d'}; font-weight: 600;">
                <span class="status-badge ${badgeClass}">
                    <i class="fas fa-circle" style="font-size: 0.6rem; margin-right: 5px; color: ${isOnline ? '#28a745' : '#6c757d'};"></i> ${u.activeStatus || 'Offline'}
                </span>
              </td>
              
              <td class="td-actions">
                ${u.approvalStatus === 'PENDING' ? `
                <button class="action-btn approve" onclick="window.Admin.approveUser('${u.id}')" title="Approve User" style="color: #16a34a;">
                  <i class="fas fa-check"></i>
                </button>` : ''}
                <button class="action-btn edit" onclick="window.Admin.openEditUser('${u.email}')" title="Edit user">
                  <i class="fas fa-pen"></i>
                </button>
                ${u.id === currentUserId ? '' : `
                <button class="action-btn deactivate" onclick="window.Admin.deleteUser('${u.email}', '${(u.name || '').replace(/'/g, "\\'")}')" title="Delete user">
                  <i class="fas fa-trash"></i>
                </button>
                `}
              </td>
            </tr>`;
        }).join('');
    }

    function renderGroups() {
        const tbody = document.getElementById('groupsBody');
        if (!tbody) return;

        if (groups.length === 0) {
            // colspan=5: Group Name | Description | Leader | Members | Actions
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #6c757d; padding: 20px;">No groups have been created yet.</td></tr>';
            return;
        }

        // Columns rendered in order: name | desc | leader | members | actions
        tbody.innerHTML = applyGroupSort(groups).map(g => `
            <tr>
                <td class="td-name">${g.name || '—'}</td>
                <td class="td-email" style="max-width: 250px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${g.desc || ''}">${g.desc || '—'}</td>
                <td>${g.leader ? `<i class="fa-regular fa-user" style="color: #888; margin-right: 4px;"></i> ${g.leader}` : '<span style="color:#9ca3af; font-style:italic;">Unassigned</span>'}</td>
                <td style="text-align: center;"><span class="status-badge" style="background: #f3f4f6; color: #374151; border: 1px solid #e5e7eb;"><i class="fas fa-users" style="margin-right: 4px; color: #6b7280;"></i> ${g.members || 0}</span></td>
                <td class="td-actions">
                    <button class="action-btn view" onclick="window.Admin.openManageMembers(${g.id})" title="Manage Members" aria-label="Manage members of ${(g.name || '').replace(/'/g, "\\'")}"><i class="fas fa-users-cog"></i></button>
                    <button class="action-btn edit" onclick="window.Admin.openEditGroup(${g.id})" title="Edit group" aria-label="Edit group ${(g.name || '').replace(/'/g, "\\'")}"><i class="fas fa-pen"></i></button>
                    <button class="action-btn deactivate" onclick="window.Admin.deleteGroup(${g.id}, '${(g.name || '').replace(/'/g, "\\'")}')" title="Delete group" aria-label="Delete group ${(g.name || '').replace(/'/g, "\\'")}"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join('');
    }

    function populateDesignationSelect(id, selectedId) {
        const sel = document.getElementById(id);
        if (!sel) return;
        const sorted = [...designations].sort((a, b) => (a.hierarchy_position || 100) - (b.hierarchy_position || 100));
        sel.innerHTML = sorted.map(d => `<option value="${d.id}" ${selectedId == d.id ? 'selected' : ''}>${d.name}</option>`).join('');
        if (!selectedId) {
            const def = sorted.find(d => d.is_default);
            if (def) sel.value = String(def.id);
        }
    }

    function populateLeaderSelect(id, selectedEmail) {
        const sel = document.getElementById(id);
        if (!sel) return;
        sel.innerHTML = '<option value="">— Select Leader —</option>' + users.map(u => `<option value="${u.email}" ${u.email === selectedEmail ? 'selected' : ''}>${u.name || u.email}</option>`).join('');
    }

    const openModal = (id) => document.getElementById(id)?.classList.add('open');
    const closeModal = (id) => document.getElementById(id)?.classList.remove('open');

    window.Admin = {
        openModal: (id) => {
            if (id === 'addGroupModal') populateLeaderSelect('newGroupLeader');
            if (id === 'addUserModal') populateDesignationSelect('newUserDesignation');
            openModal(id);
        },
        closeModal: (id) => closeModal(id),
        
        addUser: async () => {
            const code = document.getElementById('newUserCode').value.trim();
            const firstName = document.getElementById('newUserFirstName').value.trim();
            const lastName = document.getElementById('newUserLastName').value.trim();
            const middleName = document.getElementById('newUserMiddleName').value.trim();
            const suffix = document.getElementById('newUserSuffix').value.trim();
            const email = document.getElementById('newUserEmail').value.trim();
            const role = document.getElementById('newUserRole').value;
            const password = document.getElementById('newUserPassword').value;
            const confirmPass = document.getElementById('confirmNewUserPassword').value;
            const designationId = document.getElementById('newUserDesignation').value;

            if (!firstName || !lastName || !email || !password) { PAMS.toast('First Name, Last Name, Email, and Password are required.', 'warning'); return; }
            if (password !== confirmPass) { PAMS.toast('Passwords do not match.', 'warning'); return; }
            { const c = PAMS.validatePassword(password); if (!c.valid) { PAMS.toast(c.message, 'warning'); return; } }

            try {
                await apiFetch('/users', 'POST', { code, firstName, lastName, middleName, suffix, email, role, password, designationId });
                window.Admin.closeModal('addUserModal');
                await loadAll(); 
            } catch (error) { PAMS.toast(`Failed to add user: ${error.message}`, 'error'); }
        },
        openEditUser: (email) => {
            const user = users.find(u => u.email === email);
            if (!user) {
                PAMS.toast('User data not found.', 'error');
                return;
            }

            document.getElementById('editUserEmail').value = user.email;
            document.getElementById('editUserCode').value = user.employeeCode || '';
            document.getElementById('editUserFirstName').value = user.firstName || '';
            document.getElementById('editUserLastName').value = user.lastName || '';
            document.getElementById('editUserMiddleName').value = user.middleName || '';
            document.getElementById('editUserSuffix').value = user.suffix || '';
            
            // Passwords should always be empty on open
            document.getElementById('editUserPassword').value = '';
            document.getElementById('confirmEditUserPassword').value = '';
            
            openModal('editUserModal');
        },
        saveUserEdit: async () => {
            const email = document.getElementById('editUserEmail').value;
            const empCode = document.getElementById('editUserCode').value.trim();
            const firstName = document.getElementById('editUserFirstName').value.trim();
            const lastName = document.getElementById('editUserLastName').value.trim();
            const middleName = document.getElementById('editUserMiddleName').value.trim();
            const suffix = document.getElementById('editUserSuffix').value.trim();
            const pass = document.getElementById('editUserPassword').value;
            const confirmPass = document.getElementById('confirmEditUserPassword').value;

            if (!firstName || !lastName || !email) { 
                PAMS.toast('First Name, Last Name, and Email are required.', 'warning'); 
                return; 
            }

            try {
                // 1. Update Profile Details
                await apiFetch('/users/update-profile', 'PUT', { empCode, firstName, lastName, middleName, suffix, email });

                // 2. Handle Optional Password Update
                if (pass) {
                    if (pass !== confirmPass) { 
                        throw new Error('Passwords do not match.'); 
                    }
                    { const c = PAMS.validatePassword(pass); if (!c.valid) { throw new Error(c.message); } }
                    await apiFetch('/users/update-password', 'POST', { email, newPassword: pass });
                }

                closeModal('editUserModal'); 
                PAMS.toast('User profile updated successfully!', 'success');
                await loadAll(); 
            } catch (err) { 
                PAMS.toast(`Error: ${err.message}`, 'error'); 
            }
        },
        toggleUser: async (id) => {
            try { await apiFetch(`/users/${id}/toggle-status`, 'PATCH'); await loadAll(); } catch (err) { PAMS.toast(err.message, 'error'); }
        },
        openResetPassword: (id, name) => {
            document.getElementById('resetPassUserId').value = id;
            document.getElementById('resetPassUserName').textContent = name;
            document.getElementById('resetPassValue').value = '';
            openModal('resetPassModal');
        },
        confirmResetPassword: async () => {
            const id = document.getElementById('resetPassUserId').value;
            const pass = document.getElementById('resetPassValue').value;
            { const c = PAMS.validatePassword(pass); if (!c.valid) { PAMS.toast(c.message, 'warning'); return; } }
            try { await apiFetch(`/users/${id}/admin-reset-password`, 'POST', { newPassword: pass }); closeModal('resetPassModal'); PAMS.toast('Password reset successfully!', 'success'); } catch (err) { PAMS.toast(err.message, 'error'); }
        },
        deleteUser: async (email, name) => {
            if (!confirm(`Delete user "${name}"?`)) return;
            try { await apiFetch(`/users/${email}`, 'DELETE'); await loadAll(); } catch (err) { PAMS.toast(err.message, 'error'); }
        },
        approveUser: async (userId) => {
            try { 
                await apiFetch(`/admin/sync/users/${userId}/approve`, 'POST'); 
                PAMS.toast('User approved successfully!', 'success');
                await loadAll(); 
            } catch (err) { PAMS.toast(`Failed to approve user: ${err.message}`, 'error'); }
        },
        changeRole: async (email, newRole) => {
            try { await apiFetch(`/users/${email}`, 'PUT', { role: newRole }); await loadAll(); } catch (err) { PAMS.toast(`Failed to change role: ${err.message}. Reverting...`, 'error'); await loadAll(); }
        },
        changeJobTitle: async (email, jobId) => {
            try { await apiFetch('/users/job-title', 'PUT', { email, jobTitleId: jobId }); await loadAll(); } catch (err) { PAMS.toast(`Failed to change job title: ${err.message}. Reverting...`, 'error'); await loadAll(); }
        },

        addGroup: async () => {
            const name = document.getElementById('newGroupName').value.trim();
            const desc = document.getElementById('newGroupDesc').value.trim();
            const leader = document.getElementById('newGroupLeader').value;
            if (!name) { PAMS.toast('Group name required.', 'warning'); return; }
            try { await apiFetch('/admin/sync/groups', 'POST', { name, desc, leaderEmail: leader }); window.Admin.closeModal('addGroupModal'); await loadAll(); } catch (err) { PAMS.toast(`Error: ${err.message}`, 'error'); }
        },
        openEditGroup: (id) => {
            const g = groups.find(x => x.id === id);
            if (!g) return;
            document.getElementById('editGroupId').value = id;
            document.getElementById('editGroupName').value = g.name;
            document.getElementById('editGroupDesc').value = g.desc || '';
            populateLeaderSelect('editGroupLeader', users.find(u => u.name === g.leader)?.email);
            openModal('editGroupModal');
        },
        saveGroupEdit: async () => {
            const id = document.getElementById('editGroupId').value;
            const name = document.getElementById('editGroupName').value.trim();
            const desc = document.getElementById('editGroupDesc').value.trim();
            const leader = document.getElementById('editGroupLeader').value;
            try { await apiFetch(`/admin/sync/groups/${id}`, 'PUT', { name, desc, leaderEmail: leader }); window.Admin.closeModal('editGroupModal'); await loadAll(); } catch (err) { PAMS.toast(`Error: ${err.message}`, 'error'); }
        },
        deleteGroup: async (id, name) => {
            if (!confirm(`Delete group "${name}"?`)) return;
            try { await apiFetch(`/admin/sync/groups/${id}`, 'DELETE'); await loadAll(); } catch (err) { PAMS.toast(`Error: ${err.message}`, 'error'); }
        },

        openManageMembers: async (id) => {
            currentManageGroupId = id;
            const g = groups.find(x => x.id === id);
            if (!g) return;

            const leaderUser = users.find(u => u.name === g.leader);
            currentGroupLeaderEmail = leaderUser ? leaderUser.email : null;

            document.getElementById('manageMembersGroupName').textContent = g.name;
            document.getElementById('memberSearch').value = '';

            try {
                const res = await apiFetch(`/admin/sync/groups/${id}/members`);
                const currentMemberEmails = res.members || []; 
                window.Admin.renderMemberCheckboxes(currentMemberEmails);
                openModal('manageMembersModal');
            } catch (err) { PAMS.toast(`Could not load members: ${err.message}`, 'error'); }
        },
        renderMemberCheckboxes: (currentMemberEmails) => {
            const container = document.getElementById('memberCheckboxList');
            if (!container) return;
            const sortedUsers = [...users].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            container.innerHTML = sortedUsers.map(u => {
                const isLeader = u.email === currentGroupLeaderEmail;
                const isChecked = isLeader || currentMemberEmails.includes(u.email);
                return `
                <label class="member-checkbox-item" data-name="${u.name || ''}" data-email="${u.email}" style="display: flex; align-items: center; padding: 8px; border-bottom: 1px solid #eee; cursor: pointer;">
                    <input type="checkbox" class="member-checkbox" value="${u.email}" ${isChecked ? 'checked' : ''} ${isLeader ? 'disabled title="Leader is automatically a member"' : ''} style="margin-right: 10px;">
                    <div style="flex-grow: 1;">
                        <div style="font-weight: 500; color: ${isLeader ? '#ffd700' : '#333'}">${u.name || u.email} ${isLeader ? '(Leader)' : ''}</div>
                        <div style="font-size: 0.75rem; color: #888;">${u.email}</div>
                    </div>
                </label>`;
            }).join('');
        },
        filterMembers: () => {
            const query = document.getElementById('memberSearch').value.toLowerCase();
            document.querySelectorAll('.member-checkbox-item').forEach(el => {
                const name = el.dataset.name.toLowerCase();
                const email = el.dataset.email.toLowerCase();
                el.style.display = (name.includes(query) || email.includes(query)) ? 'flex' : 'none';
            });
        },
        saveGroupMembers: async () => {
            const checkedEmails = Array.from(document.querySelectorAll('.member-checkbox'))
                .filter(cb => cb.checked || cb.disabled).map(cb => cb.value);
            try {
                await apiFetch(`/admin/sync/groups/${currentManageGroupId}/members`, 'PUT', { members: checkedEmails });
                window.Admin.closeModal('manageMembersModal');
                await loadAll(); 
            } catch (err) { PAMS.toast(`Failed to save members: ${err.message}`, 'error'); }
        }
    };
})();

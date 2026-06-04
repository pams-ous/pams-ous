/**
 * users-groups.js
 * Purpose: Logic for system administration, managing users, groups, and access.
 */

(function () {
    const { apiFetch, requireAuth, fmtHeaderDate } = PAMS;

    let users = [];
    let groups = [];
    let designations = [];

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

    function renderUsers() {
        if (!window.Admin) window.Admin = {};
        window.Admin.refreshData = loadAll;
          
        document.getElementById('usersBody').innerHTML = users.map(u => {
            const isOnline = (u.activeStatus || 'Offline').toLowerCase() === 'online';
            const badgeClass = isOnline ? 'status-online' : 'status-offline';

            const groupTags = (u.groups && Array.isArray(u.groups) && u.groups.length > 0) 
                ? u.groups.map(gName => `<span style="background: #e0e7ff; color: #3730a3; padding: 3px 8px; border-radius: 4px; font-size: 0.7rem; display: inline-block; margin: 2px;">${gName}</span>`).join('') 
                : '<span style="color:#9ca3af; font-style:italic; font-size: 0.8rem;">Unassigned</span>';

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
              
              <td class="td-groups" style="max-width: 250px; white-space: normal;">
                  ${groupTags}
              </td>

              <td data-user-email="${u.email}" style="color: ${isOnline ? '#28a745' : '#6c757d'}; font-weight: 600;">
                <span class="status-badge ${badgeClass}">
                    <i class="fas fa-circle" style="font-size: 0.6rem; margin-right: 5px; color: ${isOnline ? '#28a745' : '#6c757d'};"></i> ${u.activeStatus || 'Offline'}
                </span>
              </td>
              
              <td class="td-actions">
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
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #6c757d; padding: 20px;">No groups have been created yet.</td></tr>';
            return;
        }

        tbody.innerHTML = groups.map(g => `
            <tr>
                <td style="font-weight: 600; color: #2d2d2d;">${g.name || '—'}</td>
                <td style="color: #6c757d; font-size: 0.85rem; max-width: 250px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${g.desc || ''}">${g.desc || '—'}</td>
                <td>${g.leader ? `<i class="fa-regular fa-user" style="color: #888; margin-right: 4px;"></i> ${g.leader}` : '<span style="color:#9ca3af; font-style:italic;">Unassigned</span>'}</td>
                <td style="text-align: center;"><span class="status-badge" style="background: #f3f4f6; color: #374151; border: 1px solid #e5e7eb;"><i class="fas fa-users" style="margin-right: 4px; color: #6b7280;"></i> ${g.members || 0}</span></td>
                <td class="td-actions">
                    <button class="action-btn view" onclick="window.Admin.openManageMembers(${g.id})" title="Manage Members"><i class="fas fa-users-cog"></i></button>
                    <button class="action-btn edit" onclick="window.Admin.openEditGroup(${g.id})" title="Edit group"><i class="fas fa-pen"></i></button>
                    <button class="action-btn deactivate" onclick="window.Admin.deleteGroup(${g.id}, '${(g.name || '').replace(/'/g, "\\'")}')" title="Delete group"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join('');
    }

    function populateDesignationSelect(id, selectedId) {
        const sel = document.getElementById(id);
        if (!sel) return;
        const sorted = [...designations].sort((a, b) => (a.hierarchy_position || 100) - (b.hierarchy_position || 100));
        sel.innerHTML = sorted.map(d => `<option value="${d.name}" ${selectedId == d.name ? 'selected' : ''}>${d.name}</option>`).join('');
        if (!selectedId) {
            const def = sorted.find(d => d.is_default);
            if (def) sel.value = String(def.name);
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
            const designationName = document.getElementById('newUserDesignation').value;

            if (!firstName || !lastName || !email || !password) { alert('First Name, Last Name, Email, and Password are required.'); return; }
            if (password !== confirmPass) { alert('Passwords do not match.'); return; }

            try {
                await apiFetch('/users', 'POST', { code, firstName, lastName, middleName, suffix, email, role, password, designationName });
                window.Admin.closeModal('addUserModal');
                await loadAll(); 
            } catch (error) { alert(`Failed to add user: ${error.message}`); }
        },
        openEditUser: (email) => {
            document.getElementById('editUserEmail').value = email;
            document.getElementById('editUserEmailDisplay').textContent = email;
            document.getElementById('editUserPassword').value = '';
            document.getElementById('confirmEditUserPassword').value = '';
            openModal('editUserModal');
        },
        saveUserPassword: async () => {
            const email = document.getElementById('editUserEmail').value;
            const pass = document.getElementById('editUserPassword').value;
            const confirmPass = document.getElementById('confirmEditUserPassword').value;
            if (pass.length < 6) { alert('Password must be at least 6 characters.'); return; }
            if (pass !== confirmPass) { alert('Passwords do not match.'); return; }

            try {
                await apiFetch('/users/update-password', 'POST', { email, newPassword: pass });
                closeModal('editUserModal'); alert('Password updated successfully!');
            } catch (err) { alert(`Error: ${err.message}`); }
        },
        toggleUser: async (id) => {
            try { await apiFetch(`/users/${id}/toggle-status`, 'PATCH'); await loadAll(); } catch (err) { alert(err.message); }
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
            if (pass.length < 6) { alert('Password must be at least 6 characters.'); return; }
            try { await apiFetch(`/users/${id}/admin-reset-password`, 'POST', { newPassword: pass }); closeModal('resetPassModal'); alert('Success!'); } catch (err) { alert(err.message); }
        },
        deleteUser: async (email, name) => {
            if (!confirm(`Delete user "${name}"?`)) return;
            try { await apiFetch(`/users/${email}`, 'DELETE'); await loadAll(); } catch (err) { alert(err.message); }
        },
        changeRole: async (email, newRole) => {
            try { await apiFetch(`/users/${email}`, 'PUT', { role: newRole }); await loadAll(); } catch (err) { alert(`Failed to change role: ${err.message}. Reverting...`); await loadAll(); }
        },

        addGroup: async () => {
            const name = document.getElementById('newGroupName').value.trim();
            const desc = document.getElementById('newGroupDesc').value.trim();
            const leader = document.getElementById('newGroupLeader').value;
            if (!name) { alert('Group name required.'); return; }
            try { await apiFetch('/admin/sync/groups', 'POST', { name, desc, leaderEmail: leader }); window.Admin.closeModal('addGroupModal'); await loadAll(); } catch (err) { alert(`Error: ${err.message}`); }
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
            try { await apiFetch(`/admin/sync/groups/${id}`, 'PUT', { name, desc, leaderEmail: leader }); window.Admin.closeModal('editGroupModal'); await loadAll(); } catch (err) { alert(`Error: ${err.message}`); }
        },
        deleteGroup: async (id, name) => {
            if (!confirm(`Delete group "${name}"?`)) return;
            try { await apiFetch(`/admin/sync/groups/${id}`, 'DELETE'); await loadAll(); } catch (err) { alert(`Error: ${err.message}`); }
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
            } catch (err) { alert(`Could not load members: ${err.message}`); }
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
                        <div style="font-weight: 500; color: ${isLeader ? '#3b82f6' : '#333'}">${u.name || u.email} ${isLeader ? '(Leader)' : ''}</div>
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
            } catch (err) { alert(`Failed to save members: ${err.message}`); }
        }
    };
})();
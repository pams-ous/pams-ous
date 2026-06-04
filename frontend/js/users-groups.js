/**
 * users-groups.js
 * Purpose: Logic for system administration, managing users, groups, and access.
 */

(function () {
    const { apiFetch, requireAuth, fmtHeaderDate } = PAMS;

    let users = [];
    let groups = [];
    let designations = [];

    // Mock user ID for self-deletion prevention
    const currentUserId = 1;

    document.addEventListener('DOMContentLoaded', async () => {
        if (!requireAuth()) return;
        PAMS_UI.init();

        const dateEl = document.getElementById('headerDate');
        if (dateEl) dateEl.textContent = fmtHeaderDate();

        // Fetch Designations for the dropdown
        try {
            designations = await apiFetch('/designations');
        } catch (e) {
            console.error("Failed to load designations:", e);
        }

        // --- SAFE WEBSOCKET PLUG-IN SETUP ---
        if (typeof io !== 'undefined') {

            const token = PAMS.getToken();
            const socket = io(CONFIG.BACKEND_SOCKET_URL, {
                auth: { token }
            });

            const userSession = PAMS.getUser();
            if (userSession && userSession.email) {
                socket.emit('register_session', userSession.email);
            }

            // Locate the socket.on('status_change') block inside DOMContentLoaded and change it to this:

            socket.on('status_change', (data) => {
                const { email, status } = data;
                
                // 1. Update the local data array state
                const matchIndex = users.findIndex(u => u.email === email);
                if (matchIndex !== -1) {
                    users[matchIndex].activeStatus = status;
                }

                // 2. Find the cell wrapper and update the badge, circle icon, and styles live
                const targetTd = document.querySelector(`td[data-user-email="${email}"]`);
                if (targetTd) {
                    const isOnline = status.toLowerCase() === 'online';
                    const badgeClass = isOnline ? 'status-online' : 'status-offline';
                    const statusColor = isOnline ? '#28a745' : '#6c757d';
                    const displayStatus = status || 'Offline';

                    // Update the outer cell color style
                    targetTd.style.color = statusColor;

                    // Rewrite the internal badge and circle icon cleanly
                    targetTd.innerHTML = `
                        <span class="status-badge ${badgeClass}">
                            <i class="fas fa-circle" style="font-size: 0.6rem; margin-right: 5px; color: ${statusColor};"></i>
                            ${displayStatus}
                        </span>
                    `;
                }
            });
        }

        await loadAll();
    });


	async function loadAll() {
		try {
            // Fetch live Users
			users = await apiFetch('/users');
            
            // Fetch live Groups
            groups = await apiFetch('/groups');
			
			renderUsers(); 
            renderGroups(); // Redraw the Groups table with SQL data
		} catch (error) {
			console.error("Failed to load from DB:", error);
		}
	}

	// Ensure loadAll runs when the page starts
	document.addEventListener('DOMContentLoaded', async () => {
        if (!requireAuth()) return;
        PAMS_UI.init();

        const dateEl = document.getElementById('headerDate');
        if (dateEl) dateEl.textContent = fmtHeaderDate();

        await loadAll();
    });

	function renderUsers() {
    // Export loadAll to Admin so the dropdown script can trigger table refreshes
    if (!window.Admin) window.Admin = {};
    window.Admin.refreshData = loadAll;
      
    document.getElementById('usersBody').innerHTML = users.map(u => {
        // --- FIXED: Calculated inside the map loop where 'u' is actively defined ---
        const isOnline = (u.activeStatus || 'Offline').toLowerCase() === 'online';
        const badgeClass = isOnline ? 'status-online' : 'status-offline';

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

          <td data-user-email="${u.email}" style="color: ${u.activeStatus === 'Online' ? '#28a745' : '#6c757d'}; font-weight: 600;">
            <span class="status-badge ${badgeClass}">
                <i class="fas fa-circle" style="font-size: 0.6rem; margin-right: 5px; color: ${u.activeStatus === 'Online' ? '#28a745' : '#6c757d'};"></i> ${u.activeStatus || 'Offline'}
            </span>
          </td>
          
          <td class="td-actions">
            <button class="action-btn edit" onclick="window.Admin.openEditUser('${u.email}')" title="Edit user">
              <i class="fas fa-pen"></i>
            </button>
            ${u.id === currentUserId ? '' : `
            <button class="action-btn deactivate" onclick="window.Admin.deleteUser('${u.email}', '${u.name}')" title="Delete user">
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
                <td style="color: #6c757d; font-size: 0.85rem; max-width: 250px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${g.desc || ''}">
                    ${g.desc || '—'}
                </td>
                <td>
                    ${g.leader ? `<i class="fa-regular fa-user" style="color: #888; margin-right: 4px;"></i> ${g.leader}` : '<span style="color:#9ca3af; font-style:italic;">Unassigned</span>'}
                </td>
                <td style="text-align: center;">
                    <span class="status-badge" style="background: #f3f4f6; color: #374151; border: 1px solid #e5e7eb;">
                        <i class="fas fa-users" style="margin-right: 4px; color: #6b7280;"></i> ${g.members || 0}
                    </span>
                </td>
                <td class="td-actions">
                    <button class="action-btn edit" onclick="window.Admin.openEditGroup(${g.id})" title="Edit group">
                        <i class="fas fa-pen"></i>
                    </button>
                    <button class="action-btn deactivate" onclick="window.Admin.deleteGroup(${g.id}, '${(g.name || '').replace(/'/g, "\\'")}')" title="Delete group">
                        <i class="fas fa-trash"></i>
                    </button>
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

        sel.innerHTML = '<option value="">— Select Leader —</option>' +
            users.map(u => `<option value="${u.email}" ${u.email === selectedEmail ? 'selected' : ''}>${u.name || u.email}</option>`).join('');
    }

    /**
     * Modal Management
     */
    const openModal = (id) => document.getElementById(id)?.classList.add('open');
    const closeModal = (id) => document.getElementById(id)?.classList.remove('open');

    // Export public methods
    window.Admin = {
        openModal: (id) => {
            if (id === 'addGroupModal') populateLeaderSelect('newGroupLeader');
            if (id === 'addUserModal') populateDesignationSelect('newUserDesignation');
            openModal(id);
        },
        closeModal: (id) => closeModal(id),
        addUser: async () => {
            // Grab ALL values from your modal, including the Employee Code
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

            // Make sure the required fields aren't blank
            if (!firstName || !lastName || !email || !password) { 
                alert('First Name, Last Name, Email, and Password are required.'); 
                return; 
            }
            if (password !== confirmPass) {
                alert('Passwords do not match.');
                return;
            }

            try {
                await apiFetch('/users', 'POST', { code, firstName, lastName, middleName, suffix, email, role, password, designationName });

                window.Admin.closeModal('addUserModal');
                await loadAll(); 
                
            } catch (error) {
                console.error('Error adding user:', error);
                alert(`Failed to add user: ${error.message}`);
            }
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
                closeModal('editUserModal');
                alert('Password updated successfully!');
            } catch (err) {
                alert(`Error: ${err.message}`);
            }
        },
        toggleUser: async (id) => {
            if (CONFIG.USE_MOCK_API) {
                const u = users.find(x => x.id === id);
                if (u) u.activeStatus = u.activeStatus === 'Online' ? 'Offline' : 'Online';
                renderUsers(); return;
            }
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

            if (CONFIG.USE_MOCK_API) { alert('Password reset successful (Mock)'); closeModal('resetPassModal'); return; }
            try { await apiFetch(`/users/${id}/admin-reset-password`, 'POST', { newPassword: pass }); closeModal('resetPassModal'); alert('Success!'); } catch (err) { alert(err.message); }
        },
        deleteUser: async (email, name) => {
            if (!confirm(`Delete user "${name}"?`)) return;
            if (CONFIG.USE_MOCK_API) { users = users.filter(x => x.email !== email); renderUsers(); return; }
            try { await apiFetch(`/users/${email}`, 'DELETE'); await loadAll(); } catch (err) { alert(err.message); }
        },
		changeRole: async (email, newRole) => {
            try {
                await apiFetch(`/users/${email}`, 'PUT', { role: newRole });

                // If successful, reload the table to lock in the new SQL data
                await loadAll(); 
                
            } catch (err) {
                console.error("Error changing role:", err);
                alert(`Failed to change role: ${err.message}. Reverting...`);
                await loadAll(); // Reload to revert the dropdown if it failed
            }
        },
		addGroup: async () => {
            const name = document.getElementById('newGroupName').value.trim();
            const desc = document.getElementById('newGroupDesc').value.trim();
            const leader = document.getElementById('newGroupLeader').value;
            if (!name) { alert('Group name required.'); return; }

            try { 
                await apiFetch('/groups', 'POST', { name, desc, leaderEmail: leader });
                
                window.Admin.closeModal('addGroupModal'); 
                await loadAll(); 
            } catch (err) { alert(`Error: ${err.message}`); }
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

            try { 
                await apiFetch(`/groups/${id}`, 'PUT', { name, desc, leaderEmail: leader });
                
                window.Admin.closeModal('editGroupModal'); 
                await loadAll(); 
            } catch (err) { alert(`Error: ${err.message}`); }
        },
		deleteGroup: async (id, name) => {
            if (!confirm(`Delete group "${name}"?`)) return;
            try { 
                await apiFetch(`/groups/${id}`, 'DELETE');
                await loadAll(); 
            } catch (err) { alert(`Error: ${err.message}`); }
        }
    };
})();

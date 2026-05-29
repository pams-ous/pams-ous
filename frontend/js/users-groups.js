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

        await loadAll();
    });


	async function loadAll() {
		try {
            // Fetch live Users
			const userRes = await fetch('http://localhost:3000/api/users');
			if (userRes.ok) users = await userRes.json();
            
            // Fetch live Groups
            const groupRes = await fetch('http://localhost:3000/api/groups');
            if (groupRes.ok) groups = await groupRes.json();
			
			renderUsers(); 
            renderGroups(); // Redraw the Groups table with SQL data
		} catch (error) {
			console.error("Failed to load from DB:", error);
		}
	}

	// Ensure loadAll runs when the page starts
	document.addEventListener('DOMContentLoaded', () => {
		loadAll();
	});

    function roleLabel(r) { return r === 'ADMIN' ? 'ADMINISTRATOR' : 'ENCODER / ADMIN. STAFF'; }
    function roleClass(r) { return r === 'ADMIN' ? 'badge-admin' : 'badge-pending'; }
    function statusClass(s) { return s === 'Online' ? 'b-active' : 'b-inactive'; }
    function statusLabel(s) { return s === 'Online' ? 'ACTIVE' : 'INACTIVE'; }

    function renderUsers() {
        const body = document.getElementById('usersBody');
        if (!body) return;

        body.innerHTML = users.map(u => `
            <tr>
                <td>
                    <div class="td-name">${u.name || '—'}</div>
                    <div class="td-email">${u.email}</div>
                </td>
                <td>${u.email}</td>
                <td><span class="badge ${roleClass(u.role)}">${roleLabel(u.role)}</span></td>
                <td><span class="badge ${statusClass(u.activeStatus)}">${statusLabel(u.activeStatus)}</span></td>
                <td>
                    <div class="flex gap-2">
                        <button class="action-btn deactivate" title="${u.activeStatus === 'Online' ? 'Deactivate' : 'Activate'}" onclick="window.Admin.toggleUser(${u.id})">
                            <i class="fa-solid ${u.activeStatus === 'Online' ? 'fa-user-slash' : 'fa-user-check'}"></i>
                        </button>
                        <button class="action-btn edit" title="Reset Password" onclick="window.Admin.openResetPassword(${u.id}, '${u.name || u.email}')">
                            <i class="fa-solid fa-key"></i>
                        </button>
                        ${u.id === currentUserId ? '' : `
                        <button class="action-btn delete" title="Delete User" onclick="window.Admin.deleteUser(${u.id}, '${u.name || u.email}')">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>`}
                    </div>
                </td>
            </tr>
        `).join('');
    }

	 function renderUsers() {
	  // Export loadAll to Admin so the dropdown script can trigger table refreshes
	  if (!window.Admin) window.Admin = {};
	  window.Admin.refreshData = loadAll;

	  document.getElementById('usersBody').innerHTML = users.map(u => `
		<tr>
		  <td class="td-name">${u.name || '—'}</td>
		  <td class="td-email">${u.email}</td>
		  <td>
			<select 
				class="form-control role-select-dropdown" 
				onchange="window.Admin.changeRole('${u.id}', this.value)"
				data-user-id="${u.id}" 
				data-current-role="${u.role}"
				style="font-size: 0.75rem; padding: 0.2rem 0.5rem; width: auto; display: inline-block; cursor: pointer;">
				<option value="MEMBER" ${u.role === 'MEMBER' ? 'selected' : ''}>Encoder / Admin. Staff</option>
				<option value="ADMIN" ${u.role === 'ADMIN' ? 'selected' : ''}>Administrator</option>
			</select>
		  </td>
		  <td><span class="badge ${statusClass(u.activeStatus)}">${statusLabel(u.activeStatus)}</span></td>
		  <td class="td-actions">
			<button class="action-btn edit" onclick="window.Admin.openEditUser('${u.id}')" title="Edit user">
			  <i class="fas fa-pen"></i>
			</button>
			${u.id === currentUserId ? '' : `
			<button class="action-btn deactivate" onclick="window.Admin.deleteUser('${u.id}', '${u.name}')" title="Delete user">
			  <i class="fas fa-trash"></i>
			</button>
			`}
		  </td>
		</tr>`).join('');
	}

    function populateDesignationSelect(id, selectedId) {
        const sel = document.getElementById(id);
        if (!sel) return;

        const sorted = [...designations].sort((a, b) => a.hierarchyPosition - b.hierarchyPosition);
        sel.innerHTML = sorted.map(d => `<option value="${d.id}" ${selectedId == d.id ? 'selected' : ''}>${d.name}</option>`).join('');

        if (!selectedId) {
            const def = sorted.find(d => d.isDefault);
            if (def) sel.value = String(def.id);
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
            openModal(id);
        },
        closeModal: (id) => closeModal(id),
		addUser: async () => {
            // Grab ALL values from your modal, including the Employee Code
            const code = document.getElementById('newUserCode').value.trim();
            const name = document.getElementById('newUserName').value.trim();
            const email = document.getElementById('newUserEmail').value.trim();
            const role = document.getElementById('newUserRole').value;

            // Make sure the code isn't blank
            if (!code || !name || !email) { 
                alert('Employee Code, Name, and Email are required.'); 
                return; 
            }

            try {
                const response = await fetch('http://localhost:3000/api/users', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    // Add 'code' to the data being sent to the backend
                    body: JSON.stringify({ code, name, email, role })
                });

                if (!response.ok) {
                    throw new Error("Failed to save to database");
                }

                window.Admin.closeModal('addUserModal');
                await loadAll(); 
                
            } catch (error) {
                console.error('Error adding user:', error);
                alert('Failed to add user! Check the console for details.');
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
        deleteUser: async (id, name) => {
            if (!confirm(`Delete user "${name}"?`)) return;
            if (CONFIG.USE_MOCK_API) { users = users.filter(x => x.id !== id); renderUsers(); return; }
            try { await apiFetch(`/users/${id}`, 'DELETE'); await loadAll(); } catch (err) { alert(err.message); }
        },
		changeRole: async (id, newRole) => {
            try {
                // Send the PUT request to your Node.js backend
                const response = await fetch(`http://localhost:3000/api/users/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ role: newRole })
                });

                if (!response.ok) {
                    throw new Error("Failed to update role in database");
                }

                // If successful, reload the table to lock in the new SQL data
                await loadAll(); 
                
            } catch (err) {
                console.error("Error changing role:", err);
                alert("Failed to change role! Reverting...");
                await loadAll(); // Reload to revert the dropdown if it failed
            }
        },
		addGroup: async () => {
            const name = document.getElementById('newGroupName').value.trim();
            const desc = document.getElementById('newGroupDesc').value.trim();
            const leader = document.getElementById('newGroupLeader').value;
            if (!name) { alert('Group name required.'); return; }

            try { 
                const response = await fetch('http://localhost:3000/api/groups', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, desc, leaderEmail: leader })
                });
                if (!response.ok) throw new Error("Failed to add group");
                
                window.Admin.closeModal('addGroupModal'); 
                await loadAll(); 
            } catch (err) { alert(err.message); }
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
                const response = await fetch(`http://localhost:3000/api/groups/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, desc, leaderEmail: leader })
                });
                if (!response.ok) throw new Error("Failed to update group");
                
                window.Admin.closeModal('editGroupModal'); 
                await loadAll(); 
            } catch (err) { alert(err.message); }
        },
		deleteGroup: async (id, name) => {
            if (!confirm(`Delete group "${name}"?`)) return;
            try { 
                const response = await fetch(`http://localhost:3000/api/groups/${id}`, { method: 'DELETE' });
                if (!response.ok) throw new Error("Failed to delete group");
                await loadAll(); 
            } catch (err) { alert(err.message); }
        }
    };
})();

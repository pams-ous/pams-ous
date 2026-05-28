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
            if (CONFIG.USE_MOCK_API) {
                users = [
                    { id: 1, name: 'Admin User', email: 'admin@pup.edu.ph', role: 'ADMIN', activeStatus: 'Online' },
                    { id: 2, name: 'Juan Dela Cruz', email: 'juan@pup.edu.ph', role: 'MEMBER', activeStatus: 'Online' },
                    { id: 3, name: 'Maria Santos', email: 'maria@pup.edu.ph', role: 'MEMBER', activeStatus: 'Offline' }
                ];
                groups = [
                    { id: 1, name: 'Student Records', desc: 'Management of academic transcripts.', members: 5, leader: 'Maria Santos' },
                    { id: 2, name: 'ICT Infrastructure', desc: 'Network and server maintenance.', members: 3, leader: 'Admin User' }
                ];
                designations = [
                    { id: 1, name: 'Head', hierarchyPosition: 1, isDefault: false },
                    { id: 2, name: 'Chief - Student Records', hierarchyPosition: 2, isDefault: false },
                    { id: 4, name: 'Encoder / Administrative Staff', hierarchyPosition: 4, isDefault: true }
                ];
            } else {
                const [u, g, d] = await Promise.all([
                    apiFetch('/users'),
                    apiFetch('/groups'),
                    apiFetch('/designations').catch(() => ({ designations: [] }))
                ]);
                users = u.users || [];
                groups = g.groups || [];
                designations = d.designations || [];
            }
            
            renderUsers();
            renderGroups();
            populateDesignationSelect('newUserDesignation');
        } catch (err) {
            console.error('Load failed:', err);
        }
    }

    function roleLabel(r)   { return r === 'ADMIN' ? 'ADMINISTRATOR' : 'ENCODER / ADMIN. STAFF'; }
    function roleClass(r)   { return r === 'ADMIN' ? 'badge-admin' : 'badge-pending'; }
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

    function renderGroups() {
        const body = document.getElementById('groupsBody');
        if (!body) return;

        body.innerHTML = groups.map(g => `
            <tr>
                <td>
                    <div class="group-name">${g.name}</div>
                    <div class="group-sub">${g.desc || ''}</div>
                </td>
                <td class="text-center fw-600">${g.members}</td>
                <td>${g.leader || '—'}</td>
                <td>
                    <div class="flex gap-2 justify-center">
                        <button class="action-btn edit" title="Edit Group" onclick="window.Admin.openEditGroup(${g.id})">
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button class="action-btn delete" title="Delete Group" onclick="window.Admin.deleteGroup(${g.id}, '${g.name}')">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
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
    const openModal  = (id) => document.getElementById(id)?.classList.add('open');
    const closeModal = (id) => document.getElementById(id)?.classList.remove('open');

    // Export public methods
    window.Admin = {
        openModal: (id) => {
            if (id === 'addGroupModal') populateLeaderSelect('newGroupLeader');
            openModal(id);
        },
        closeModal: (id) => closeModal(id),
        addUser: async () => {
            const code = document.getElementById('newUserCode').value.trim();
            const name = document.getElementById('newUserName').value.trim();
            const email = document.getElementById('newUserEmail').value.trim();
            const role = document.getElementById('newUserRole').value;
            const designation = document.getElementById('newUserDesignation').value;

            if (!name || !email) { alert('Name and Email are required.'); return; }

            if (CONFIG.USE_MOCK_API) {
                users.push({ id: users.length + 1, name, email, role, activeStatus: 'Online' });
                closeModal('addUserModal'); renderUsers(); return;
            }

            try {
                await apiFetch('/users', 'POST', { name, email, role, employeeCode: code, designationIds: designation ? [Number(designation)] : undefined });
                closeModal('addUserModal'); await loadAll();
            } catch (err) { alert(err.message); }
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
        addGroup: async () => {
            const name = document.getElementById('newGroupName').value.trim();
            const desc = document.getElementById('newGroupDesc').value.trim();
            const leader = document.getElementById('newGroupLeader').value;
            if (!name) { alert('Group name required.'); return; }

            if (CONFIG.USE_MOCK_API) {
                groups.push({ id: groups.length + 1, name, desc, members: 0, leader });
                closeModal('addGroupModal'); renderGroups(); return;
            }
            try { await apiFetch('/groups', 'POST', { name, desc, leaderEmail: leader }); closeModal('addGroupModal'); await loadAll(); } catch (err) { alert(err.message); }
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

            if (CONFIG.USE_MOCK_API) {
                const g = groups.find(x => x.id == id);
                if (g) { g.name = name; g.desc = desc; g.leader = users.find(u => u.email === leader)?.name || leader; }
                closeModal('editGroupModal'); renderGroups(); return;
            }
            try { await apiFetch(`/groups/${id}`, 'PUT', { name, desc, leaderEmail: leader }); closeModal('editGroupModal'); await loadAll(); } catch (err) { alert(err.message); }
        },
        deleteGroup: async (id, name) => {
            if (!confirm(`Delete group "${name}"?`)) return;
            if (CONFIG.USE_MOCK_API) { groups = groups.filter(x => x.id !== id); renderGroups(); return; }
            try { await apiFetch(`/groups/${id}`, 'DELETE'); await loadAll(); } catch (err) { alert(err.message); }
        }
    };
})();

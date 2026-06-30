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
    let pendingDelete = null;
    let pendingDemote = null;
    let pendingPromote = null;
    let _loadGen = 0;
    const currentUserId = (() => { try { return JSON.parse(localStorage.getItem('pams.user') || '{}').id || null; } catch { return null; } })();


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

        if (PAMS.socket) {
            const socket = PAMS.socket;

            socket.on('status_change', (data) => {
                const { email, status } = data;
                const matchIndex = users.findIndex(u => u.email === email);
                if (matchIndex !== -1) users[matchIndex].activeStatus = status;

                renderUsers();
            });

            socket.on('userSearchEmailResult', (data) => {
                if (!data.success) {
                    console.error("User email search failed:", data.rawData);
                    return;
                }
                
                users = data.rawData.map(u => ({
                    ...u,
                    employeeCode: u.employee_code,
                    name: `${u.first_name || ''} ${u.last_name || ''} ${u.suffix || ''}`.trim() || u.email,
                    email: u.email,
                    role: u.designation === 'Admin' ? 'ADMIN' : 'MEMBER',
                    jobTitleId: u.job_title,
                    activeStatus: u.active_status,
                    approvalStatus: u.approval_status
                }));
                
                renderUsers();
            });

            socket.on('groupSearchResult', (data) => {
                if (!data.success) {
                    console.error("Group search failed:", data.rawData);
                    return;
                }
                
                groups = data.rawData.map(g => ({
                    id: g.group_id,
                    name: g.group_name,
                    desc: g.desc,
                    leader: g.leader,
                    members: g.members || 0
                }));
                
                renderGroups();
            });
        }

        await loadAll();
        initSortHeaders();
        initGroupSortHeaders();
        initTabs();
        initUserEmailSearch();
        initGroupSearch();
        initCustomDropdowns();
    });

    function initUserEmailSearch() {
        const searchInput = document.getElementById('userEmailSearch');
        if (!searchInput) return;

        let debounceTimer;
        searchInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(async () => {
                const query = searchInput.value.trim();
                
                if (!query) {
                    await loadAll();
                    return;
                }

                if (PAMS.socket) {
                    PAMS.socket.emit('searchUsersByEmail', { query });
                }
            }, 300);
        });
    }

    function initGroupSearch() {
        const searchInput = document.getElementById('groupSearch');
        if (!searchInput) return;

        let debounceTimer;
        searchInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(async () => {
                const query = searchInput.value.trim();
                
                if (!query) {
                    await loadAll();
                    return;
                }

                if (PAMS.socket) {
                    PAMS.socket.emit('searchGroupsByName', { query });
                }
            }, 300);
        });
    }

    async function loadAll() {
        const gen = ++_loadGen;
        try {
            try {
                const uData = await apiFetch('/admin/sync/users');
                if (gen !== _loadGen) return;
                users = (uData && Array.isArray(uData.users)) ? uData.users : (Array.isArray(uData) ? uData : []);
            } catch (err) { console.error("User fetch failed:", err); if (gen === _loadGen) users = []; }

            try {
                const gData = await apiFetch('/admin/sync/groups');
                if (gen !== _loadGen) return;
                groups = (gData && Array.isArray(gData.groups)) ? gData.groups : (Array.isArray(gData) ? gData : []);
            } catch (err) { console.error("Group fetch failed:", err); if (gen === _loadGen) groups = []; }

            if (gen === _loadGen) {
                renderUsers(); 
                renderGroups();
            }
        } catch (error) {
            if (gen === _loadGen) console.error("Fatal loadAll error:", error);
        }
    }

    // ── Sort value extractor ──────────────────────────────────────────────────
    // Returns a comparable primitive for a user row given the active column.
    // 'actions' column: users who are NOT the current user have a delete button,
    // so they rank as "more actionable" (value 1) vs. current-user rows (value 0).
    // This gives a deterministic, meaningful sort rather than leaving Actions unsorted.
    function getSortValue(u, col) {
        switch (col) {
            case 'code':
                return (u.employeeCode || '').toLowerCase();
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

    // ── Custom dropdown helper ─────────────────────────────────────────────
    function createCustomDropdownHtml(type, email, currentValue, isDisabled) {
      const disabledClass = isDisabled ? ' is-disabled' : '';
      let optionsHtml, displayText;

      if (type === 'role') {
        const items = [
          { value: 'MEMBER', label: 'Encoder' },
          { value: 'ADMIN', label: 'Administrator' }
        ];
        const sel = items.find(o => o.value === currentValue);
        displayText = sel ? sel.label : 'Select Role';
        optionsHtml = items.map(o =>
          `<div class="custom-dropdown-option${o.value === currentValue ? ' is-selected' : ''}" data-cd-opt-value="${o.value}">${o.label}</div>`
        ).join('');
      } else {
        const placeholder = { value: '', label: '— Select Title —' };
        const sel = designations.find(d => String(d.id) === String(currentValue));
        displayText = sel ? sel.name : placeholder.label;
        optionsHtml = `<div class="custom-dropdown-option${!currentValue ? ' is-selected' : ''}" data-cd-opt-value="">${placeholder.label}</div>` +
          designations.map(d =>
            `<div class="custom-dropdown-option${String(d.id) === String(currentValue) ? ' is-selected' : ''}" data-cd-opt-value="${d.id}">${d.name}</div>`
          ).join('');
      }

      return `<div class="custom-dropdown${disabledClass}" data-cd-type="${type}" data-cd-email="${email}" data-cd-value="${currentValue || ''}">
        <div class="custom-dropdown-trigger" tabindex="0">
          <span class="custom-dropdown-selected">${displayText}</span>
          <i class="fa-solid fa-chevron-down arrow"></i>
        </div>
        <div class="custom-dropdown-menu">${optionsHtml}</div>
      </div>`;
    }

    function initCustomDropdowns() {
      const body = document.getElementById('usersBody');
      if (!body) return;

      body.addEventListener('click', (e) => {
        const trigger = e.target.closest('.custom-dropdown-trigger');
        if (trigger) {
          const dd = trigger.closest('.custom-dropdown');
          if (!dd || dd.classList.contains('is-disabled')) return;
          body.querySelectorAll('.custom-dropdown.is-open').forEach(d => {
            if (d !== dd) d.classList.remove('is-open');
          });
          dd.classList.toggle('is-open');
          return;
        }

        const opt = e.target.closest('.custom-dropdown-option');
        if (!opt) return;
        const dd = opt.closest('.custom-dropdown');
        if (!dd || dd.classList.contains('is-disabled')) return;
        e.stopPropagation();
        dd.classList.remove('is-open');

        const email = dd.dataset.cdEmail;
        const type = dd.dataset.cdType;
        const value = opt.dataset.cdOptValue;
        const currentValue = dd.dataset.cdValue;

        if (type === 'role') {
          if (currentValue === 'ADMIN' && value === 'MEMBER') {
            const selectedSpan = dd.querySelector('.custom-dropdown-selected');
            if (selectedSpan) selectedSpan.textContent = 'Administrator';
            const user = users.find(u => u.email === email);
            window.Admin.openConfirmDemote(email, user?.name);
            return;
          }
          if (currentValue === 'MEMBER' && value === 'ADMIN') {
            const selectedSpan = dd.querySelector('.custom-dropdown-selected');
            if (selectedSpan) selectedSpan.textContent = 'Encoder';
            const user = users.find(u => u.email === email);
            window.Admin.openConfirmPromote(email, user?.name, 'ADMIN');
            return;
          }
          window.Admin.changeRole(email, value);
        } else if (type === 'jobtitle') {
          if (value) {
            const designation = designations.find(d => String(d.id) === String(value));
            if (designation) {
              const name = designation.name.toLowerCase();
              let mappedRole = null;
              if (name.includes('encoder')) {
                mappedRole = 'MEMBER';
              } else if (name.includes('head') || name.includes('chief')) {
                mappedRole = 'ADMIN';
              }
              if (mappedRole) {
                const user = users.find(u => u.email === email);
                if (user && user.role !== mappedRole) {
                  if (mappedRole === 'ADMIN' && user.role === 'MEMBER') {
                    window.Admin.openConfirmPromote(email, user?.name, 'ADMIN');
                  } else if (mappedRole === 'MEMBER' && user.role === 'ADMIN') {
                    window.Admin.openConfirmDemote(email, user?.name);
                  } else {
                    window.Admin.changeRole(email, mappedRole);
                  }
                }
              }
            }
          }
          window.Admin.changeJobTitle(email, value);
        }
      });

      document.addEventListener('click', (e) => {
        if (!e.target.closest('#usersBody .custom-dropdown')) {
          body.querySelectorAll('.custom-dropdown.is-open').forEach(d => d.classList.remove('is-open'));
        }
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

            // Prevent job‑title / role changes for the designated Super‑Admin (employee code SUPER-001)
            const isSuperAdmin = u.employeeCode === 'SUPER-001';

            return `
            <tr>
              <td class="td-code">${u.employeeCode || '—'}</td>
              <td class="td-name">${u.name || '—'}</td>
              <td class="td-email">${u.email}</td>
              <td>${createCustomDropdownHtml('role', u.email, u.role, isSuperAdmin || u.id === currentUserId)}</td>
               <td>${createCustomDropdownHtml('jobtitle', u.email, u.jobTitleId, isSuperAdmin || u.id === currentUserId)}</td>
              
              <td class="td-groups" style="max-width: 250px; white-space: normal; text-align: center;">
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

    function getLeaderEmail(prefix) {
        const checked = document.querySelector(`#${prefix}LeaderCheckboxList input[name="${prefix}Leader"]:checked`);
        return checked ? checked.value : '';
    }

    const openModal = (id) => document.getElementById(id)?.classList.add('open');
    const closeModal = (id) => document.getElementById(id)?.classList.remove('open');

    window.Admin = {
        openModal: (id) => {
            if (id === 'addGroupModal') {
                window.Admin.renderNewLeaderCheckboxes();
                window.Admin.renderNewMemberCheckboxes();
            }
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
                if (empCode) {
                    const exists = users.find(u => u.email !== email && u.employeeCode === empCode);
                    if (exists) {
                        PAMS.toast(`Employee Code ${empCode} is already assigned to another user.`, 'warning');
                        return;
                    }
                }

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
        deleteUser: (email, name) => {
            window.Admin.openConfirmDelete('user', email, name);
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
        
        handleRoleChange: async (email, newRole, currentRole) => {
            if (currentRole === 'ADMIN' && newRole === 'MEMBER') {
                // Revert the select value immediately so it doesn't look changed until confirmed
                const select = document.querySelector(`.role-select-dropdown[data-user-email="${email}"]`);
                if (select) select.value = currentRole;
                
                const user = users.find(u => u.email === email);
                window.Admin.openConfirmDemote(email, user?.name);
                return;
            }
            await window.Admin.changeRole(email, newRole);
        },

        openConfirmDemote: (email, name) => {
            pendingDemote = { email, name };
            document.getElementById('confirmDemoteText').textContent = `Are you sure you want to demote this administrator?`;
            openModal('confirmDemoteModal');
        },
        confirmDemote: async () => {
            if (!pendingDemote) return;
            const { email } = pendingDemote;
            try {
                await apiFetch(`/users/${email}`, 'PUT', { role: 'MEMBER' });
                PAMS.toast('User demoted successfully!', 'success');
                window.Admin.closeModal('confirmDemoteModal');
                await loadAll();
            } catch (err) {
                PAMS.toast(`Error: ${err.message}`, 'error');
            } finally {
                pendingDemote = null;
            }
        },

        openConfirmPromote: (email, name, newRole) => {
            pendingPromote = { email, name, newRole };
            document.getElementById('confirmPromoteText').textContent = `Are you sure you want to promote "${name || email}" to ${newRole === 'ADMIN' ? 'Administrator' : 'Encoder'}?`;
            window.Admin.openModal('confirmPromoteModal');
        },
        confirmPromote: async () => {
            if (!pendingPromote) return;
            const { email, newRole } = pendingPromote;
            try {
                await apiFetch(`/users/${email}`, 'PUT', { role: newRole });
                PAMS.toast('User promoted successfully!', 'success');
                window.Admin.closeModal('confirmPromoteModal');
                await loadAll();
            } catch (err) {
                PAMS.toast(`Error: ${err.message}`, 'error');
            } finally {
                pendingPromote = null;
            }
        },

        addGroup: async () => {
            const name = document.getElementById('newGroupName').value.trim();
            const desc = document.getElementById('newGroupDesc').value.trim();
            const leader = getLeaderEmail('new');
            if (!name) { PAMS.toast('Group name required.', 'warning'); return; }

            const checkedEmails = Array.from(document.querySelectorAll('#newMemberCheckboxList .member-checkbox'))
                .filter(cb => cb.checked || cb.disabled).map(cb => cb.value);

            try { 
                const res = await apiFetch('/admin/sync/groups', 'POST', { name, desc, leaderEmail: leader }); 

                const groupId = res?.id || res?.group_id;
                if (groupId && checkedEmails.length > 0) {
                    await apiFetch(`/admin/sync/groups/${groupId}/members`, 'PUT', { members: checkedEmails });
                }

                window.Admin.closeModal('addGroupModal'); 
                await loadAll();
                PAMS.toast(`Group "${name}" created successfully.`, 'success');
            } catch (err) { PAMS.toast(`Error: ${err.message}`, 'error'); }
        },
        openEditGroup: async (id) => {
            let g = groups.find(x => x.id === id);
            if (!g) {
                try {
                    const gData = await apiFetch('/admin/sync/groups');
                    const allGroups = (gData && Array.isArray(gData.groups)) ? gData.groups : [];
                    g = allGroups.find(x => x.id === id);
                    if (!g) { PAMS.toast('Group not found.', 'error'); return; }
                    groups = allGroups;
                    renderGroups();
                } catch (err) {
                    PAMS.toast(`Error: ${err.message}`, 'error');
                    return;
                }
            }
            document.getElementById('editGroupId').value = id;
            document.getElementById('editGroupName').value = g.name;
            document.getElementById('editGroupDesc').value = g.desc || '';

            const leaderEmail = users.find(u => u.name === g.leader)?.email || '';
            currentGroupLeaderEmail = leaderEmail;
            window.Admin.renderEditLeaderCheckboxes(leaderEmail);
            currentManageGroupId = id;

            document.getElementById('memberSearch').value = '';

            try {
                const res = await apiFetch(`/admin/sync/groups/${id}/members`);
                const currentMemberEmails = res.members || [];
                window.Admin.renderMemberCheckboxes(currentMemberEmails);
            } catch (err) {
                console.error('Could not load members:', err);
                window.Admin.renderMemberCheckboxes([]);
            }

            openModal('editGroupModal');
        },
        saveGroupEdit: async () => {
            const id = document.getElementById('editGroupId').value;
            const name = document.getElementById('editGroupName').value.trim();
            const desc = document.getElementById('editGroupDesc').value.trim();
            const leader = getLeaderEmail('edit');
            try {
                await apiFetch(`/admin/sync/groups/${id}`, 'PUT', { name, desc, leaderEmail: leader });

                const checkedEmails = Array.from(document.querySelectorAll('.member-checkbox'))
                    .filter(cb => cb.checked || cb.disabled).map(cb => cb.value);
                await apiFetch(`/admin/sync/groups/${id}/members`, 'PUT', { members: checkedEmails });

                window.Admin.closeModal('editGroupModal');
                await loadAll();
            } catch (err) { PAMS.toast(`Error: ${err.message}`, 'error'); }
        },
        deleteGroup: (id, name) => {
            window.Admin.openConfirmDelete('group', id, name);
        },
        openConfirmDelete: (type, id, name) => {
            pendingDelete = { type, id, name };
            document.getElementById('confirmDeleteText').textContent = `Are you sure you want to delete ${type === 'user' ? 'user' : 'group'} "${name}"?`;
            openModal('confirmDeleteModal');
        },
        confirmDelete: async () => {
            if (!pendingDelete) return;
            const { type, id } = pendingDelete;
            try {
                const endpoint = type === 'user' ? `/users/${id}` : `/admin/sync/groups/${id}`;
                await apiFetch(endpoint, 'DELETE');
                PAMS.toast(`${type === 'user' ? 'User' : 'Group'} deleted successfully!`, 'success');
                window.Admin.closeModal('confirmDeleteModal');
                await loadAll();
            } catch (err) {
                PAMS.toast(`Error: ${err.message}`, 'error');
            } finally {
                pendingDelete = null;
            }
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

        renderNewMemberCheckboxes: () => {
            const container = document.getElementById('newMemberCheckboxList');
            if (!container) return;
            const leaderEmail = getLeaderEmail('new');
            const sortedUsers = [...users].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            container.innerHTML = sortedUsers.map(u => {
                const isLeader = u.email === leaderEmail;
                return `
                <label class="member-checkbox-item" data-name="${u.name || ''}" data-email="${u.email}" style="display: flex; align-items: center; padding: 8px; border-bottom: 1px solid #eee; cursor: pointer;">
                    <input type="checkbox" class="member-checkbox" value="${u.email}" ${isLeader ? 'checked disabled title="Leader is automatically a member"' : ''} style="margin-right: 10px;">
                    <div style="flex-grow: 1;">
                        <div style="font-weight: 500; color: ${isLeader ? '#ffd700' : '#333'}">${u.name || u.email} ${isLeader ? '(Leader)' : ''}</div>
                        <div style="font-size: 0.75rem; color: #888;">${u.email}</div>
                    </div>
                </label>`;
            }).join('');
        },
        filterNewMembers: () => {
            const query = document.getElementById('newMemberSearch').value.toLowerCase();
            document.querySelectorAll('#newMemberCheckboxList .member-checkbox-item').forEach(el => {
                const name = el.dataset.name.toLowerCase();
                const email = el.dataset.email.toLowerCase();
                el.style.display = (name.includes(query) || email.includes(query)) ? 'flex' : 'none';
            });
        },

        renderNewLeaderCheckboxes: () => {
            const container = document.getElementById('newLeaderCheckboxList');
            if (!container) return;
            const sortedUsers = [...users].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            container.innerHTML = sortedUsers.map(u => `
                <label class="member-checkbox-item" data-name="${u.name || ''}" data-email="${u.email}" style="display: flex; align-items: center; padding: 8px; border-bottom: 1px solid #eee; cursor: pointer;">
                    <input type="radio" name="newLeader" value="${u.email}" style="margin-right: 10px; accent-color: var(--maroon, #800000);" onchange="window.Admin.renderNewMemberCheckboxes()">
                    <div style="flex-grow: 1;">
                        <div style="font-weight: 500; color: #333;">${u.name || u.email}</div>
                        <div style="font-size: 0.75rem; color: #888;">${u.email}</div>
                    </div>
                </label>`).join('');
        },
        filterNewLeaders: () => {
            const query = document.getElementById('newLeaderSearch').value.toLowerCase();
            document.querySelectorAll('#newLeaderCheckboxList .member-checkbox-item').forEach(el => {
                const name = el.dataset.name.toLowerCase();
                const email = el.dataset.email.toLowerCase();
                el.style.display = (name.includes(query) || email.includes(query)) ? 'flex' : 'none';
            });
        },

        renderEditLeaderCheckboxes: (selectedEmail) => {
            const container = document.getElementById('editLeaderCheckboxList');
            if (!container) return;
            const sortedUsers = [...users].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            container.innerHTML = sortedUsers.map(u => `
                <label class="member-checkbox-item" data-name="${u.name || ''}" data-email="${u.email}" style="display: flex; align-items: center; padding: 8px; border-bottom: 1px solid #eee; cursor: pointer;">
                    <input type="radio" name="editLeader" value="${u.email}" ${u.email === selectedEmail ? 'checked' : ''} style="margin-right: 10px; accent-color: var(--maroon, #800000);" onchange="window.Admin.onEditLeaderChange('${u.email}')">
                    <div style="flex-grow: 1;">
                        <div style="font-weight: 500; color: #333;">${u.name || u.email}</div>
                        <div style="font-size: 0.75rem; color: #888;">${u.email}</div>
                    </div>
                </label>`).join('');
        },
        filterEditLeaders: () => {
            const query = document.getElementById('editLeaderSearch').value.toLowerCase();
            document.querySelectorAll('#editLeaderCheckboxList .member-checkbox-item').forEach(el => {
                const name = el.dataset.name.toLowerCase();
                const email = el.dataset.email.toLowerCase();
                el.style.display = (name.includes(query) || email.includes(query)) ? 'flex' : 'none';
            });
        },
        onEditLeaderChange: (email) => {
            currentGroupLeaderEmail = email;
            const checkedEmails = Array.from(document.querySelectorAll('#memberCheckboxList .member-checkbox:checked'))
                .map(cb => cb.value);
            window.Admin.renderMemberCheckboxes(checkedEmails);
        },
    };
})();

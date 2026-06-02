/**
 * js/role-management.js
 * Handles role update functionality for the Users and Groups interface.
 */

document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('change', async (event) => {
        if (event.target.classList.contains('role-select-dropdown')) {
            const dropdown = event.target;
            const userId = dropdown.getAttribute('data-user-id');
            const previousRole = dropdown.getAttribute('data-current-role');
            const newRole = dropdown.value;

            if (!userId || newRole === previousRole) return;

            // --- FIXED SECTION: UNIVERSAL CONFIRMATION & UI RESET GUARD ---
            let message = `Are you sure you want to change this designation to ${newRole}?`;
            if (previousRole === 'ADMIN' && newRole !== 'ADMIN') {
                message = "Are you sure you want to demote this administrator?";
            }

            const confirmed = confirm(message);
            if (!confirmed) {
                dropdown.value = previousRole; // Visually forces dropdown to stay on its current setting
                return;                        // Halts execution completely
            }
            // ---------------------------------------------------------------

            dropdown.disabled = true;

            try {
                const response = await fetch(`http://localhost:3000/api/users/${userId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ role: newRole })
                });

                if (!response.ok) throw new Error("Failed to update in database");

                dropdown.setAttribute('data-current-role', newRole);
                
                if (window.Admin && typeof window.Admin.refreshData === 'function') {
                    window.Admin.refreshData();
                }
                
                console.log(`Successfully updated user ${userId} to ${newRole}`);
            } catch (error) {
                console.error('Error updating role:', error);
                alert(`Failed to update role: ${error.message}`);
                dropdown.value = previousRole; // Revert UI on database failure
            } finally {
                dropdown.disabled = false;
            }
        }
    });
});
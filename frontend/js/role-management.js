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

            // Safeguard: confirm before changing an Admin to a lower role
            if (previousRole === 'ADMIN' && newRole !== 'ADMIN') {
                const confirmed = confirm("Are you sure you want to demote this administrator?");
                if (!confirmed) {
                    dropdown.value = previousRole; // Revert UI
                    return;
                }
            }

            // Disable dropdown visually while processing
            dropdown.disabled = true;

			try {
                // Force the request to hit the Node.js backend on Port 3000
                const response = await fetch(`http://localhost:3000/api/users/${userId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ role: newRole })
                });

                if (!response.ok) throw new Error("Failed to update in database");

                // Update state on success
                dropdown.setAttribute('data-current-role', newRole);
                
                // Refresh table if the loadAll function was exported
                if (window.Admin && typeof window.Admin.refreshData === 'function') {
                    window.Admin.refreshData();
                }
                
                console.log(`Successfully updated user ${userId} to ${newRole}`);
            } catch (error) {
                console.error('Error updating role:', error);
                alert(`Failed to update role: ${error.message}`);
                dropdown.value = previousRole; // Revert UI on failure
            } finally {
                dropdown.disabled = false;
            }

    });
});
/**
 * Formats employee name as "First Last Suffix" (if suffix exists)
 */
function formatFullName(employee) {
    if (!employee) return 'Unknown User';
    const { first_name, last_name, suffix } = employee;
    const nameParts = [first_name, last_name, suffix].filter(Boolean);
    return nameParts.join(' ').trim();
}

module.exports = { formatFullName };

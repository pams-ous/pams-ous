async function ifEmployeeExists(db, email, empCode) {
    if (empCode) {
        const query = "SELECT email, employee_code FROM Employees WHERE email = ? OR employee_code = ? LIMIT 1;";
        const [exists] = await db.query(query, [email, empCode]);
        return exists && exists.length > 0;
    } else {
        const query = "SELECT email FROM Employees WHERE email = ? LIMIT 1;";
        const [exists] = await db.query(query, [email]);
        return exists && exists.length > 0;
    }
}

async function getEmployeeDetails(db, email) {
    const query = `SELECT * FROM Employees
WHERE email = ? LIMIT 1;`;

    const [results] = await db.query(query, [email]);
    return results[0];
}

module.exports = {ifEmployeeExists, getEmployeeDetails};
async function ifEmployeeExists(db, email, empCode) {
    const ifEmpExists = "SELECT email, employee_code FROM Employees WHERE email = ? OR employee_code = ? LIMIT 1;";
    const [exists] = await db.query(ifEmpExists, [email, empCode]);

    if (exists && exists.length > 0) {
        return true;
    } return false;
}

async function getEmployeeDetails(db, email) {
    const query = `SELECT * FROM Employees
WHERE email = ? LIMIT 1;`;

    const [results] = await db.query(query, [email]);
    return results[0];
}

module.exports = {ifEmployeeExists, getEmployeeDetails};
const { verifyToken } = require("./authUtil");

async function registerSearchHandlers(socket, db) {
    const verifyAuth = () => {
        const token = socket.handshake.auth?.token;
        return verifyToken(token) !== null;
    };

    // Listen for incoming search requests from the client UI
    socket.on('searchEmployees', async (data) => {
        if (!verifyAuth()) {
            socket.emit('searchResult', { success: false, rawData: `Unauthorized access.` });
            return;
        }
        const searchString = data.query;
        console.log(`Search transaction initiated for: "${searchString}"`);

        const wildcardQuery = `%${searchString}%`;

        // SQL Query string utilizing parameterized placeholders to avoid injection risks
        const sql = 
        `SELECT * FROM (
            SELECT CONCAT(first_name, " ", last_name, " ", suffix) 
            AS full_name FROM Employees
        )
        AS Employee_names 
        WHERE full_name LIKE ?;`;

        try {
            const [results] = await db.query(sql, [wildcardQuery]);
            // Emit the array rows containing all matched employee data back to the frontend
            socket.emit('searchResult', { success: true, rawData: results });
        } catch (err) {
            socket.emit('searchResult', { success: false, rawData: err });
        }
    });

    socket.on('searchUsersByEmail', async (data) => {
        if (!verifyAuth()) {
            socket.emit('userSearchEmailResult', { success: false, rawData: `Unauthorized access.` });
            return;
        }
        const query = data.query;
        const wildcardQuery = `%${query}%`;
        
        // Split query into individual words for "any order" name search
        const terms = query.trim().split(/\s+/).filter(t => t.length > 0);
        
        // Build name search components: each word must be present in one of the name columns
        let nameConditions = [];
        let nameParams = [];
        terms.forEach(term => {
            const wildcardTerm = `%${term}%`;
            nameConditions.push('(first_name LIKE ? OR last_name LIKE ? OR middle_name LIKE ? OR suffix LIKE ?)');
            nameParams.push(wildcardTerm, wildcardTerm, wildcardTerm, wildcardTerm);
        });

        const nameQuery = nameConditions.length > 0 ? nameConditions.join(' AND ') : '0=1';

        // Combine Email, Employee Code, and the multi-word Name search
        const sql = `SELECT * FROM Employees WHERE email LIKE ? OR employee_code LIKE ? OR (${nameQuery});`;
        const finalParams = [wildcardQuery, wildcardQuery, ...nameParams];

        try {
            const [results] = await db.query(sql, finalParams);
            socket.emit('userSearchEmailResult', { success: true, rawData: results });
        } catch (err) {
            socket.emit('userSearchEmailResult', { success: false, rawData: err });
        }
    });

    socket.on('searchGroupsByName', async (data) => {
        if (!verifyAuth()) {
            socket.emit('groupSearchResult', { success: false, rawData: `Unauthorized access.` });
            return;
        }
        const groupQuery = data.query;
        const wildcardGroup = `%${groupQuery}%`;

        const sql = `
            SELECT g.group_id, g.group_name, g.\`desc\`,
              (SELECT e.email FROM Employees e JOIN Employees_Groups eg ON e.employee_id = eg.employee_id WHERE eg.group_id = g.group_id AND eg.role = 'Leader' LIMIT 1) AS leader_email,
              (SELECT CONCAT(e.first_name, ' ', e.last_name) FROM Employees e JOIN Employees_Groups eg ON e.employee_id = eg.employee_id WHERE eg.group_id = g.group_id AND eg.role = 'Leader' LIMIT 1) AS leader,
              (SELECT COUNT(DISTINCT employee_id) FROM Employees_Groups WHERE group_id = g.group_id) AS members
            FROM Job_Groups g
            WHERE g.group_name LIKE ?;`;

        try {
            const [results] = await db.query(sql, [wildcardGroup]);
            socket.emit('groupSearchResult', { success: true, rawData: results });
        } catch (err) {
            socket.emit('groupSearchResult', { success: false, rawData: err });
        }
    });
}

module.exports = { registerSearchHandlers };
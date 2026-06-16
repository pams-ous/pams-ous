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
        const emailQuery = data.query;
        const wildcardEmail = `%${emailQuery}%`;

        const sql = `SELECT * FROM Employees WHERE email LIKE ?;`;

        try {
            const [results] = await db.query(sql, [wildcardEmail]);
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

        const sql = `SELECT * FROM Job_Groups WHERE group_name LIKE ?;`;

        try {
            const [results] = await db.query(sql, [wildcardGroup]);
            socket.emit('groupSearchResult', { success: true, rawData: results });
        } catch (err) {
            socket.emit('groupSearchResult', { success: false, rawData: err });
        }
    });
}

module.exports = { registerSearchHandlers };
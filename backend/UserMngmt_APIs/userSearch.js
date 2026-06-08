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
}

module.exports = { registerSearchHandlers };
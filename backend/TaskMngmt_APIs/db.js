//MySQL database connection pool, bridge node js to mysql
//

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: 'localhost',
    user: 'root', // Update with  MySQL user
    password: process.env.DB_PASSWORD, // Update with  MySQL password
    database: 'people',
    waitForConnections: true,
    connectionLimit: 10 //10 simultaneous connections
});

module.exports = pool;
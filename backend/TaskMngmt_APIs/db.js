//MySQL database connection pool, bridge node js to mysql
//

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER, // Update with  MySQL user
    password: process.env.DB_PASSWORD, // Update with  MySQL password from .env
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10 //10 simultaneous connections
});

module.exports = pool;
dfsdfsdf
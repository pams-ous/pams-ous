//MySQL database connection pool, bridge node js to mysql
//

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: '127.0.0.1',
    port: 3306,
    user: 'root', // Update with the actual MySQL user
    password: '!', // Update with the actual MySQL password
    database: 'people',
    waitForConnections: true,
    connectionLimit: 10 //10 simultaneous connections
});

module.exports = pool;
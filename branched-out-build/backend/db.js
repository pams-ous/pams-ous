// Shared MySQL connection pool — required by every route module.
// One pool is created at server startup and reused for every request.
//
// Override via environment variables if your MySQL credentials differ:
//   set DB_HOST=localhost
//   set DB_PORT=3306
//   set DB_USER=root
//   set DB_PASSWORD=your_password
//   set DB_NAME=people

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host:     process.env.DB_HOST     || 'localhost',
    port:     Number(process.env.DB_PORT) || 3306,
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || 'Sramos06!',
    database: process.env.DB_NAME     || 'people',
    waitForConnections: true,
    connectionLimit:    10,
    queueLimit:         0
});

module.exports = pool;

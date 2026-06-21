// MySQL database connection pool, bridge node js to mysql
// We import the pool from server.js instead of creating a duplicate pool.
const db = require('../server');

module.exports = db;
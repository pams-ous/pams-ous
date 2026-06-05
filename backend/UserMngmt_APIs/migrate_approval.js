const mysql = require('mysql2/promise');
require('dotenv').config({ path: require('path').resolve(__dirname, '.', '.env') });

async function migrate() {
    const db = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || 'people'
    });

    try {
        const [columns] = await db.query(`SHOW COLUMNS FROM Employees LIKE 'approval_status'`);
        if (columns.length === 0) {
            console.log("Adding approval_status column to Employees table...");
            await db.query(`ALTER TABLE Employees ADD COLUMN approval_status VARCHAR(20) DEFAULT 'APPROVED'`);
            console.log("Migration successful.");
        } else {
            console.log("Column approval_status already exists.");
        }
    } catch (e) {
        console.error("Migration failed:", e);
    } finally {
        await db.end();
    }
}

migrate();

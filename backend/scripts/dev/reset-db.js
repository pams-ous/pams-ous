/**
 * reset-db.js
 * Purpose: Wipes all Transactional and Master data to reset the local database.
 * Updated: Synchronized with latest schema (Designations/Groups/User_Notifications added).
 * Usage: node scripts/dev/reset-db.js
 */

const mysql = require('mysql2/promise');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

async function reset(existingDb = null, silent = false) {
    if (!silent) {
        console.log('--- Database Reset Tool ---');
        console.log('WARNING: This will wipe EVERYTHING (Tasks, Users, Groups, Designations, Notifications, OTPs)!');
    }
    
    const dbName = process.env.DB_NAME || 'people';
    const db = existingDb || await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD,
        database: dbName,
        multipleStatements: true
    });

    try {
        await db.query('SET FOREIGN_KEY_CHECKS = 0;');

        const tables = [
            'otp_codes',
            'User_Notifications',
            'Notifications',
            'Report_Entries',
            'Report',
            'Task_Updates',
            'Tasks',
            'Employees_Groups',
            'Employees',
            'Job_Groups',
            'Designations'
        ];

        // Fetch list of existing tables in the DB
        const [existingTablesRows] = await db.query(`
            SELECT TABLE_NAME 
            FROM information_schema.tables 
            WHERE TABLE_SCHEMA = ?
        `, [dbName]);
        const existingTables = existingTablesRows.map(row => row.TABLE_NAME.toLowerCase());

        for (const table of tables) {
            if (existingTables.includes(table.toLowerCase())) {
                if (!silent) console.log(`Wiping table in schema ${dbName}: ${table}...`);
                await db.query(`TRUNCATE TABLE \`${dbName}\`.\`${table}\`;`);
            } else {
                if (!silent) console.log(`Table ${table} does not exist in schema ${dbName}. Skipping...`);
            }
        }

        await db.query('SET FOREIGN_KEY_CHECKS = 1;');

        if (!silent) {
            console.log('\n=========================================');
            console.log('DATABASE RESET SUCCESSFUL');
            console.log('System is now in a "Fresh Install" state.');
            console.log('=========================================\n');
        }

    } catch (err) {
        if (!silent) console.error('Reset failed:', err.message);
        throw err;
    } finally {
        if (!existingDb) {
            await db.end();
        }
    }
}

if (require.main === module) {
    reset().catch(() => process.exit(1)).then(() => process.exit(0));
}

module.exports = { reset };

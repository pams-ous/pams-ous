/**
 * seed-admin.js
 * Purpose: Automatically seeds the database with essential roles, groups, and administrator accounts.
 * Usage: node scripts/dev/seed-admin.js [options]
 */

const mysql = require('mysql2/promise');
const argon2 = require('argon2');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { reset } = require('./reset-db');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const args = process.argv.slice(2);

function getArgValue(names) {
    for (const name of names) {
        const index = args.findIndex(arg => arg === name || arg.startsWith(name + '='));
        if (index !== -1) {
            if (args[index].includes('=')) {
                return args[index].split('=')[1];
            }
            return args[index + 1];
        }
    }
    return null;
}

function hasFlag(names) {
    return args.some(arg => names.includes(arg));
}

function showHelp() {
    console.log(`
========================================================================
                      PAMS-OUS Database Seeding Tool
========================================================================
Usage:
  node scripts/dev/seed-admin.js [options]

Options:
  -h, --help            Show this help message.
  -c, --clear           Wipe/Reset the database before seeding.
  --email <email>       Email for the custom admin account.
  --password <pass>     Password for the custom admin account.
  --code <code>         Employee code for the custom admin account.
  --first-name <name>   First name of the custom admin account.
  --last-name <name>    Last name of the custom admin account.
  --job-title <title>   Job designation title (Director, Deputy Director, etc.).
  --file <path>         Path to a JSON file containing a list of administrator
                        accounts to seed.

Examples:
  # Seed default administrators:
  node scripts/dev/seed-admin.js

  # Clear database first, then seed defaults:
  node scripts/dev/seed-admin.js --clear

  # Seed a single custom administrator:
  node scripts/dev/seed-admin.js --email admin2@local.test --password secPass123 --code ADM-002

  # Seed multiple administrators from a JSON config file:
  node scripts/dev/seed-admin.js --file scripts/dev/admins.json
========================================================================
`);
}

async function seed() {
    if (hasFlag(['-h', '--help'])) {
        showHelp();
        return;
    }

    console.log('--- Database Seeding Tool ---');

    // 1. Determine list of accounts to seed
    let accountsToSeed = [];
    const fileArg = getArgValue(['--file']);
    const emailArg = getArgValue(['--email']);

    if (fileArg) {
        try {
            const filePath = path.resolve(process.cwd(), fileArg);
            console.log(`Reading administrator accounts from file: ${filePath}`);
            const fileContentStr = fs.readFileSync(filePath, 'utf8');
            const fileContent = JSON.parse(fileContentStr);
            if (Array.isArray(fileContent)) {
                accountsToSeed = fileContent.map(acc => ({
                    email: acc.email || 'admin@local.test',
                    password: acc.password || 'password123',
                    employeeCode: acc.employeeCode || 'DEV-999',
                    firstName: acc.firstName || 'System',
                    lastName: acc.lastName || 'Admin',
                    jobTitle: acc.jobTitle || 'Director'
                }));
            } else {
                console.error('Error: JSON file must contain an array of accounts.');
                process.exit(1);
            }
        } catch (err) {
            console.error(`Failed to read config file: ${err.message}`);
            process.exit(1);
        }
    } else if (emailArg) {
        accountsToSeed.push({
            email: emailArg,
            password: getArgValue(['--password']) || 'password123',
            employeeCode: getArgValue(['--code']) || 'DEV-001',
            firstName: getArgValue(['--first-name']) || 'System',
            lastName: getArgValue(['--last-name']) || 'Admin',
            jobTitle: getArgValue(['--job-title']) || 'Director'
        });
    } else {
        accountsToSeed = [
            {
                email: 'admin@local.test',
                password: 'password123',
                employeeCode: 'ADM-001',
                firstName: 'System',
                lastName: 'Admin',
                jobTitle: 'Director'
            },
            {
                email: 'staffadmin@local.test',
                password: 'password123',
                employeeCode: 'ADM-002',
                firstName: 'Staff',
                lastName: 'Admin',
                jobTitle: 'Deputy Director'
            }
        ];
    }

    const dbName = process.env.DB_NAME || 'people';
    const db = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD,
        database: dbName,
        multipleStatements: true
    });

    try {
        // 2. Wiping / Resetting DB if requested
        if (hasFlag(['-c', '--clear'])) {
            console.log('Clearing database tables...');
            await reset(db, false);
            console.log('Database cleared successfully.');
        }

        // 3. Seed Base Designations
        console.log('Seeding standard designations...');
        const designations = [
            ['Director', 'Highest administrative/executive rank', 10, 0],
            ['Deputy Director', 'Deputy administrative/executive rank', 20, 0],
            ['Coordinator', 'Unit or group coordinator', 30, 0],
            ['Administrative Staff', 'Office administrative/support staff', 40, 1],
            ['Encoder', 'General staff/data encoder', 50, 0]
        ];
        for (const [name, desc, pos, def] of designations) {
            await db.execute(`
                INSERT INTO Designations (name, description, hierarchy_position, is_default) 
                VALUES (?, ?, ?, ?) 
                ON DUPLICATE KEY UPDATE 
                    description = VALUES(description), 
                    hierarchy_position = VALUES(hierarchy_position), 
                    is_default = VALUES(is_default)
            `, [name, desc, pos, def]);
        }

        // Get the designations mapping to IDs
        const [designationRows] = await db.execute('SELECT designation_id, name FROM Designations');
        const designationMap = {};
        for (const row of designationRows) {
            designationMap[row.name.toLowerCase()] = row.designation_id;
        }

        // 4. Seed a Sample Group
        console.log('Seeding initial Job Group...');
        await db.execute('INSERT IGNORE INTO Job_Groups (group_id, group_name, `desc`) VALUES (1, "ICT Infrastructure", "Management of servers and digital assets.")');

        // 5. Create/Update Admin Accounts
        console.log(`Seeding ${accountsToSeed.length} administrator account(s)...`);
        for (const account of accountsToSeed) {
            const hashedPassword = await argon2.hash(account.password);
            const jobTitleId = designationMap[account.jobTitle.toLowerCase()] || designationMap['director'] || null;

            const [existing] = await db.execute('SELECT employee_id FROM Employees WHERE email = ?', [account.email]);

            if (existing.length > 0) {
                console.log(`Admin account [${account.email}] found. Updating credentials...`);
                await db.execute(`
                    UPDATE Employees 
                    SET password = ?, designation = "Admin", job_title = ?, first_name = ?, last_name = ?, employee_code = ?, approval_status = "APPROVED" 
                    WHERE email = ?`, 
                    [hashedPassword, jobTitleId, account.firstName, account.lastName, account.employeeCode, account.email]
                );
            } else {
                console.log(`Creating fresh Admin account: [${account.email}]...`);
                const uuid = crypto.randomUUID();
                await db.execute(`
                    INSERT INTO Employees (employee_id, employee_code, first_name, last_name, designation, job_title, email, password, approval_status, active_status) 
                    VALUES (?, ?, ?, ?, "Admin", ?, ?, ?, "APPROVED", "Offline")`,
                    [uuid, account.employeeCode, account.firstName, account.lastName, jobTitleId, account.email, hashedPassword]
                );
            }
        }

        console.log('\n=========================================');
        console.log('SUCCESS: System Ready for Testing');
        accountsToSeed.forEach(acc => {
            console.log(`Email:    ${acc.email}`);
            console.log(`Password: ${acc.password}`);
            console.log(`Role:     Admin (${acc.jobTitle})`);
            console.log('-----------------------------------------');
        });
        console.log('=========================================\n');

    } catch (err) {
        console.error('Seeding failed:', err.message);
    } finally {
        await db.end();
        process.exit();
    }
}

seed();

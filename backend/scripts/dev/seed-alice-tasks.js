/**
 * seed-alice-tasks.js
 * Purpose: Seed tasks for demo purposes:
 *          - Alice Santos gets 5 each of 'in progress', 'pending', 'completed', and 'cancelled' tasks.
 *          - Each Job Group in the system gets 3 tasks (in progress, pending, completed).
 *          - Another person (Benedict Reyes) gets 3 tasks (in progress, pending, completed).
 * Usage:   node scripts/dev/seed-alice-tasks.js
 */

const mysql = require('mysql2/promise');
const argon2 = require('argon2');
const crypto = require('crypto');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const DUMMY_PASSWORD = 'password123';

async function seed() {
    console.log('--- Demo Data Seeding Tool (Alice & Group Tasks) ---');

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
        const hashedPassword = await argon2.hash(DUMMY_PASSWORD);

        // 1. Ensure at least one Admin exists to assign tasks.
        let [admins] = await db.execute(
            "SELECT employee_id, first_name, last_name FROM Employees WHERE designation = 'Admin' ORDER BY created_at ASC LIMIT 1"
        );
        let adminId;
        if (admins.length === 0) {
            console.log('No Admin found. Creating a system administrator...');
            adminId = crypto.randomUUID();
            await db.execute(
                `INSERT INTO Employees
                    (employee_id, employee_code, first_name, last_name, designation, email, password, approval_status, active_status)
                 VALUES (?, 'ADM-001', 'System', 'Admin', 'Admin', 'admin@local.test', ?, 'APPROVED', 'Offline')`,
                [adminId, hashedPassword]
            );
            console.log('Created admin: admin@local.test');
        } else {
            adminId = admins[0].employee_id;
            console.log(`Using existing Admin: ${admins[0].first_name} ${admins[0].last_name}`);
        }

        // 2. Ensure Alice Santos exists.
        let [aliceRows] = await db.execute(
            "SELECT employee_id FROM Employees WHERE email = 'alice.santos@local.test' LIMIT 1"
        );
        let aliceId;
        if (aliceRows.length === 0) {
            console.log('Creating Alice Santos...');
            aliceId = crypto.randomUUID();
            await db.execute(
                `INSERT INTO Employees
                    (employee_id, employee_code, first_name, last_name, designation, email, password, approval_status, active_status)
                 VALUES (?, 'DUMMY-001', 'Alice', 'Santos', 'Admin. Staff', 'alice.santos@local.test', ?, 'APPROVED', 'Offline')`,
                [aliceId, hashedPassword]
            );
            console.log('Created Alice Santos.');
        } else {
            aliceId = aliceRows[0].employee_id;
            console.log('Found Alice Santos in Employees table.');
        }

        // 3. Ensure Benedict Reyes (the "another person") exists.
        let [benRows] = await db.execute(
            "SELECT employee_id FROM Employees WHERE email = 'ben.reyes@local.test' LIMIT 1"
        );
        let benId;
        if (benRows.length === 0) {
            console.log('Creating Benedict Reyes (another person)...');
            benId = crypto.randomUUID();
            await db.execute(
                `INSERT INTO Employees
                    (employee_id, employee_code, first_name, last_name, designation, email, password, approval_status, active_status)
                 VALUES (?, 'DUMMY-002', 'Benedict', 'Reyes', 'Admin. Staff', 'ben.reyes@local.test', ?, 'APPROVED', 'Offline')`,
                [benId, hashedPassword]
            );
            console.log('Created Benedict Reyes.');
        } else {
            benId = benRows[0].employee_id;
            console.log('Found Benedict Reyes in Employees table.');
        }

        // 4. Ensure Groups exist. If none in Job_Groups, create default ones.
        let [groups] = await db.execute("SELECT group_id, group_name FROM Job_Groups");
        if (groups.length === 0) {
            console.log('No Job Groups found. Seeding default Job Groups...');
            const defaultGroups = [
                { name: 'Records Management', desc: 'Handles student record encoding and archival.' },
                { name: 'Admissions Team', desc: 'Processes applications and enrolment.' },
                { name: 'Registration Desk', desc: 'Front-line registration support.' }
            ];
            for (const g of defaultGroups) {
                const [res] = await db.execute(
                    'INSERT INTO Job_Groups (group_name, `desc`) VALUES (?, ?)',
                    [g.name, g.desc]
                );
                groups.push({ group_id: res.insertId, group_name: g.name });
                console.log(`Created group: ${g.name}`);
            }
        } else {
            console.log(`Found ${groups.length} existing group(s).`);
        }

        // 5. Clean up any existing demo tasks to allow repeating/idempotency.
        // We will identify them by title prefixes or match exact titles.
        // For simplicity, let's delete existing tasks assigned to Alice Santos, Benedict Reyes,
        // or any job group that match our specific list of titles.
        const aliceTaskData = [
            // in progress
            { title: '[Demo] Digitize student enrollment forms', status: 'in progress', desc: 'Scan and upload the physical forms from the new batch of students.' },
            { title: '[Demo] Verify registration docs (Transfer)', status: 'in progress', desc: 'Check transcripts and honorable dismissal records for transfer applicants.' },
            { title: '[Demo] Update department directory info', status: 'in progress', desc: 'Correct phone extensions and room assignments on the office portal.' },
            { title: '[Demo] Organize office supply inventory', status: 'in progress', desc: 'Count and log stationery, printer toner, and paper stock.' },
            { title: '[Demo] Follow up on pending database backups', status: 'in progress', desc: 'Coordinate with ICT to ensure last week\'s records are archived.' },
            // pending
            { title: '[Demo] Draft agenda for next staff meeting', status: 'pending', desc: 'Collect topics from team leads and prepare the agenda document.' },
            { title: '[Demo] Audit archived records structure', status: 'pending', desc: 'Ensure folders are labeled correctly according to the new guidelines.' },
            { title: '[Demo] Schedule quarterly performance reviews', status: 'pending', desc: 'Coordinate with Director for staff review slots.' },
            { title: '[Demo] Review guest access logs', status: 'pending', desc: 'Check logs for the past month to ensure security compliance.' },
            { title: '[Demo] Compile department feedback survey', status: 'pending', desc: 'Create a questionnaire to gather improvement suggestions.' },
            // completed
            { title: '[Demo] Publish registration guidelines', status: 'completed', desc: 'Post the final registration PDF on the official bulletin board.' },
            { title: '[Demo] Setup workstation for new assistant', status: 'completed', desc: 'Request PC, keyboard, and basic software access.' },
            { title: '[Demo] Reconcile June petty cash', status: 'completed', desc: 'Verify receipts against the log and submit report to finance.' },
            { title: '[Demo] Distribute office memos', status: 'completed', desc: 'Send out the updated holiday schedule to all departments.' },
            { title: '[Demo] Archive senior class transcripts', status: 'completed', desc: 'Batch upload transcripts for the class of 2025.' },
            // cancelled
            { title: '[Demo] Print physical copy of directory', status: 'cancelled', desc: 'Cancelled: decided to keep it purely digital to save paper.' },
            { title: '[Demo] Organize team building lunch', status: 'cancelled', desc: 'Cancelled due to scheduling conflicts with midterms.' },
            { title: '[Demo] Migrate legacy records to SQL', status: 'cancelled', desc: 'Cancelled: ICT is handling the migration directly instead.' },
            { title: '[Demo] Order custom office mousepads', status: 'cancelled', desc: 'Cancelled: Budget request was not approved.' },
            { title: '[Demo] Conduct physical archive inspection', status: 'cancelled', desc: 'Cancelled: Postponed until next fiscal year.' }
        ];

        const benTaskData = [
            { title: '[Demo] Design landing page layout mockup', status: 'in progress', desc: 'Create a modern interface design for the main landing page.' },
            { title: '[Demo] Review security guidelines', status: 'pending', desc: 'Read the updated data privacy compliance guidelines.' },
            { title: '[Demo] Fix sidebar navigation overflow', status: 'completed', desc: 'Ensure sidebar links do not overflow on tablet viewport width.' }
        ];

        console.log('Cleaning up existing demo tasks...');
        const allDemoTitles = [
            ...aliceTaskData.map(t => t.title),
            ...benTaskData.map(t => t.title)
        ];
        // Add group demo titles
        groups.forEach(g => {
            allDemoTitles.push(
                `[Demo] Group project kickoff - ${g.group_name}`,
                `[Demo] Weekly progress compilation - ${g.group_name}`,
                `[Demo] Review documentation guidelines - ${g.group_name}`
            );
        });

        if (allDemoTitles.length > 0) {
            // Delete existing tasks and cascade will delete Task_Updates
            const placeholders = allDemoTitles.map(() => '?').join(',');
            await db.execute(`DELETE FROM Tasks WHERE title IN (${placeholders})`, allDemoTitles);
        }

        // Helper function to insert a task and log status update
        async function insertTask({ title, description, status, assignedToUser, assignedToGroup }) {
            const [res] = await db.execute(
                `INSERT INTO Tasks (title, description, assigned_by, assigned_to_user, assigned_to_group, status)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [title, description, adminId, assignedToUser, assignedToGroup, status]
            );
            const taskId = res.insertId;

            // Log update history
            const statusChange = status.replace(' ', '_'); // e.g., 'in progress' -> 'in_progress'
            const updaterId = assignedToUser || adminId;
            let logMsg = `Task initialized with status: ${status}`;
            if (status === 'completed') {
                logMsg = 'Task marked as completed';
            } else if (status === 'cancelled') {
                logMsg = 'Task was cancelled';
            }
            await db.execute(
                `INSERT INTO Task_Updates (task_id, updated_by, updated_text, status_change)
                 VALUES (?, ?, ?, ?)`,
                [taskId, updaterId, logMsg, statusChange]
            );
        }

        // 6. Insert Alice's tasks (5 in progress, 5 pending, 5 completed, 5 cancelled)
        console.log(`Inserting ${aliceTaskData.length} tasks for Alice Santos...`);
        for (const t of aliceTaskData) {
            await insertTask({
                title: t.title,
                description: t.desc,
                status: t.status,
                assignedToUser: aliceId,
                assignedToGroup: null
            });
        }

        // 7. Insert Benedict's tasks (3 tasks)
        console.log(`Inserting ${benTaskData.length} tasks for Benedict Reyes (another person)...`);
        for (const t of benTaskData) {
            await insertTask({
                title: t.title,
                description: t.desc,
                status: t.status,
                assignedToUser: benId,
                assignedToGroup: null
            });
        }

        // 8. Insert group-assigned tasks (3 tasks per group)
        console.log('Inserting 3 tasks per Job Group...');
        for (const g of groups) {
            const groupTasks = [
                { title: `[Demo] Group project kickoff - ${g.group_name}`, status: 'in progress', desc: `Align on roles and responsibilities for the ${g.group_name} team.` },
                { title: `[Demo] Weekly progress compilation - ${g.group_name}`, status: 'pending', desc: `Compile the weekly activities log for ${g.group_name}.` },
                { title: `[Demo] Review documentation guidelines - ${g.group_name}`, status: 'completed', desc: `Ensure all ${g.group_name} members read and adopt the new system documentation protocols.` }
            ];

            for (const gt of groupTasks) {
                await insertTask({
                    title: gt.title,
                    description: gt.desc,
                    status: gt.status,
                    assignedToUser: null,
                    assignedToGroup: g.group_id
                });
            }
            console.log(`  + Added 3 tasks for group "${g.group_name}"`);
        }

        console.log('\n=========================================');
        console.log('SUCCESS: Demo tasks seeded successfully.');
        console.log('=========================================\n');

    } catch (err) {
        console.error('Demo task seeding failed:', err);
    } finally {
        await db.end();
        process.exit();
    }
}

seed();

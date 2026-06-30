/**
 * seed-dummy.js
 * Purpose: Populate the database with realistic dummy records for testing —
 *          member accounts, job groups, group memberships, tasks, task updates,
 *          and notifications. Safe to run repeatedly (idempotent on natural keys).
 * Usage:   node scripts/dev/seed-dummy.js
 *
 * Notes:
 *  - Requires at least one Admin/super-admin to exist (run `npm run db:seed` first)
 *    so tasks can be attributed to an `assigned_by` employee.
 *  - Every dummy member shares the password `password123`.
 */

const mysql = require('mysql2/promise');
const argon2 = require('argon2');
const crypto = require('crypto');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const DUMMY_PASSWORD = 'password123';

// Dummy member accounts. employee_code is the natural key used for idempotency.
const MEMBERS = [
    { code: 'DUMMY-001', firstName: 'Alice', lastName: 'Santos', middleName: 'M', email: 'alice.santos@local.test', designation: 'Encoder' },
    { code: 'DUMMY-002', firstName: 'Benedict', lastName: 'Reyes', middleName: 'C', email: 'ben.reyes@local.test', designation: 'Encoder' },
    { code: 'DUMMY-003', firstName: 'Carla', lastName: 'Dela Cruz', middleName: 'L', email: 'carla.delacruz@local.test', designation: 'Encoder' },
    { code: 'DUMMY-004', firstName: 'Daniel', lastName: 'Lim', middleName: 'P', email: 'daniel.lim@local.test', designation: 'Admin' },
    { code: 'DUMMY-005', firstName: 'Erika', lastName: 'Tan', middleName: 'V', email: 'erika.tan@local.test', designation: 'Encoder' },
    { code: 'DUMMY-006', firstName: 'Francis', lastName: 'Gomez', middleName: 'R', email: 'francis.gomez@local.test', designation: 'Encoder' }
];

// Dummy job groups, keyed by group_name.
const GROUPS = [
    { name: 'Records Management', desc: 'Handles student record encoding and archival.' },
    { name: 'Admissions Team', desc: 'Processes applications and enrolment.' },
    { name: 'Registration Desk', desc: 'Front-line registration support.' }
];

function daysFromNow(n) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

async function seed() {
    console.log('--- Dummy Data Seeding Tool ---');

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
        // 0. Find an admin to attribute tasks/reports to.
        const [admins] = await db.execute(
            "SELECT employee_id FROM Employees WHERE designation = 'Admin' ORDER BY created_at ASC LIMIT 1"
        );
        if (admins.length === 0) {
            console.error('No Admin account found. Run `npm run db:seed` first, then re-run this script.');
            process.exit(1);
        }
        const adminId = admins[0].employee_id;

        // Map designation name -> id (job_title FK). Tolerates an empty Designations table.
        const [designationRows] = await db.execute('SELECT designation_id, name FROM Designations');
        const firstDesignationId = designationRows.length ? designationRows[0].designation_id : null;

        // 1. Members
        console.log(`Seeding ${MEMBERS.length} dummy member(s)...`);
        const hashedPassword = await argon2.hash(DUMMY_PASSWORD);
        const memberIds = {};
        for (const m of MEMBERS) {
            const [existing] = await db.execute(
                'SELECT employee_id FROM Employees WHERE employee_code = ? OR email = ? LIMIT 1',
                [m.code, m.email]
            );
            if (existing.length > 0) {
                memberIds[m.code] = existing[0].employee_id;
                console.log(`  - ${m.email} already exists, skipping.`);
                continue;
            }
            const uuid = crypto.randomUUID();
            await db.execute(
                `INSERT INTO Employees
                    (employee_id, employee_code, first_name, last_name, middle_name, job_title, designation, email, password, approval_status, active_status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED', 'Offline')`,
                [uuid, m.code, m.firstName, m.lastName, m.middleName, firstDesignationId, m.designation, m.email, hashedPassword]
            );
            memberIds[m.code] = uuid;
            console.log(`  + Created ${m.email}`);
        }

        // 2. Groups
        console.log(`Seeding ${GROUPS.length} dummy group(s)...`);
        const groupIds = {};
        for (const g of GROUPS) {
            const [existing] = await db.execute(
                'SELECT group_id FROM Job_Groups WHERE group_name = ? LIMIT 1',
                [g.name]
            );
            if (existing.length > 0) {
                groupIds[g.name] = existing[0].group_id;
                console.log(`  - Group "${g.name}" already exists, skipping.`);
                continue;
            }
            const [res] = await db.execute(
                'INSERT INTO Job_Groups (group_name, `desc`) VALUES (?, ?)',
                [g.name, g.desc]
            );
            groupIds[g.name] = res.insertId;
            console.log(`  + Created group "${g.name}"`);
        }

        // 3. Group memberships (Leader / Member)
        console.log('Seeding group memberships...');
        const memberships = [
            { code: 'DUMMY-001', group: 'Records Management', role: 'Leader' },
            { code: 'DUMMY-002', group: 'Records Management', role: 'Member' },
            { code: 'DUMMY-003', group: 'Admissions Team', role: 'Leader' },
            { code: 'DUMMY-005', group: 'Admissions Team', role: 'Member' },
            { code: 'DUMMY-006', group: 'Registration Desk', role: 'Leader' },
            { code: 'DUMMY-002', group: 'Registration Desk', role: 'Member' }
        ];
        for (const ms of memberships) {
            const empId = memberIds[ms.code];
            const grpId = groupIds[ms.group];
            if (!empId || !grpId) continue;
            const [existing] = await db.execute(
                'SELECT 1 FROM Employees_Groups WHERE employee_id = ? AND group_id = ? LIMIT 1',
                [empId, grpId]
            );
            if (existing.length > 0) continue;
            await db.execute(
                'INSERT INTO Employees_Groups (employee_id, group_id, role) VALUES (?, ?, ?)',
                [empId, grpId, ms.role]
            );
        }

        // 4. Tasks (mix of user-assigned and group-assigned, varied status/priority)
        console.log('Seeding dummy tasks...');
        const tasks = [
            { title: 'Encode Q1 student records', description: 'Digitize the backlog of first-quarter paper records.', toUser: 'DUMMY-001', toGroup: null, priority: 'high', status: 'in progress', due: daysFromNow(3) },
            { title: 'Verify duplicate enrolments', description: 'Cross-check applicants flagged as possible duplicates.', toUser: 'DUMMY-002', toGroup: null, priority: 'medium', status: 'pending', due: daysFromNow(7) },
            { title: 'Prepare admissions summary', description: 'Compile this term admission statistics.', toUser: null, toGroup: 'Admissions Team', priority: 'urgent', status: 'pending', due: daysFromNow(1) },
            { title: 'Archive completed transcripts', description: 'Move processed transcripts to long-term storage.', toUser: 'DUMMY-003', toGroup: null, priority: 'low', status: 'completed', due: daysFromNow(-2) },
            { title: 'Front-desk schedule rotation', description: 'Draft next month registration desk rota.', toUser: null, toGroup: 'Registration Desk', priority: 'medium', status: 'in progress', due: daysFromNow(5) },
            { title: 'Audit incomplete profiles', description: 'List employee profiles missing required fields.', toUser: 'DUMMY-005', toGroup: null, priority: 'high', status: 'cancelled', due: daysFromNow(-5) }
        ];
        const taskIds = [];
        for (const t of tasks) {
            const [existing] = await db.execute(
                'SELECT task_id FROM Tasks WHERE title = ? LIMIT 1',
                [t.title]
            );
            if (existing.length > 0) {
                taskIds.push({ id: existing[0].task_id, task: t });
                console.log(`  - Task "${t.title}" already exists, skipping.`);
                continue;
            }
            const [res] = await db.execute(
                `INSERT INTO Tasks
                    (title, description, assigned_by, assigned_to_user, assigned_to_group, priority, status, due_date)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    t.title,
                    t.description,
                    adminId,
                    t.toUser ? memberIds[t.toUser] : null,
                    t.toGroup ? groupIds[t.toGroup] : null,
                    t.priority,
                    t.status,
                    t.due
                ]
            );
            taskIds.push({ id: res.insertId, task: t });
            console.log(`  + Created task "${t.title}"`);
        }

        // 5. Task updates (a couple of progress notes on the first few tasks)
        console.log('Seeding task updates...');
        const updates = [
            { taskIndex: 0, by: 'DUMMY-001', text: 'Started encoding — 40% done.', statusChange: 'in_progress' },
            { taskIndex: 3, by: 'DUMMY-003', text: 'All transcripts archived and verified.', statusChange: 'completed' },
            { taskIndex: 4, by: 'DUMMY-006', text: 'Draft rota shared for review.', statusChange: 'in_progress' }
        ];
        for (const u of updates) {
            const entry = taskIds[u.taskIndex];
            const byId = memberIds[u.by];
            if (!entry || !byId) continue;
            const [existing] = await db.execute(
                'SELECT 1 FROM Task_Updates WHERE task_id = ? AND updated_by = ? AND updated_text = ? LIMIT 1',
                [entry.id, byId, u.text]
            );
            if (existing.length > 0) continue;
            await db.execute(
                'INSERT INTO Task_Updates (task_id, updated_by, updated_text, status_change) VALUES (?, ?, ?, ?)',
                [entry.id, byId, u.text, u.statusChange]
            );
        }

        // 6. Notifications (one global, one per-user, one per-group)
        console.log('Seeding notifications...');
        const notifs = [
            { message: 'Welcome to PAMS — system seeded with dummy data for testing.', user: null, group: null },
            { message: 'You have a new high-priority task assigned.', user: 'DUMMY-001', group: null },
            { message: 'Admissions Team: please review the term summary.', user: null, group: 'Admissions Team' }
        ];
        for (const n of notifs) {
            const targetUser = n.user ? memberIds[n.user] : null;
            const targetGroup = n.group ? groupIds[n.group] : null;
            const [existing] = await db.execute(
                'SELECT notification_id FROM Notifications WHERE notif_message = ? LIMIT 1',
                [n.message]
            );
            let notifId;
            if (existing.length > 0) {
                notifId = existing[0].notification_id;
            } else {
                const [res] = await db.execute(
                    'INSERT INTO Notifications (notif_message, target_user_id, target_group_id) VALUES (?, ?, ?)',
                    [n.message, targetUser, targetGroup]
                );
                notifId = res.insertId;
            }
            // Fan out a per-user delivery row for the directly targeted user.
            if (targetUser) {
                await db.execute(
                    'INSERT IGNORE INTO User_Notifications (user_id, notification_id) VALUES (?, ?)',
                    [targetUser, notifId]
                );
            }
        }

        console.log('\n=========================================');
        console.log('SUCCESS: Dummy data seeded.');
        console.log(`Members:  ${MEMBERS.length} (password: ${DUMMY_PASSWORD})`);
        console.log(`Groups:   ${GROUPS.length}`);
        console.log(`Tasks:    ${tasks.length}`);
        console.log('=========================================\n');

    } catch (err) {
        console.error('Dummy seeding failed:', err.message);
        process.exitCode = 1;
    } finally {
        await db.end();
        process.exit();
    }
}

seed();

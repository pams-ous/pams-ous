/**
 * seed-alice-tasks.js
 * Purpose: Insert 5 test tasks assigned to Alice Santos (DUMMY-001) for
 *          testing the task board / my-tasks views and the completion toast.
 * Usage:   node scripts/dev/seed-alice-tasks.js
 *
 * Notes:
 *  - Requires Alice Santos (alice.santos@local.test) to exist — run
 *    `npm run db:seed:dummy` first if she isn't seeded yet.
 *  - Requires at least one Admin to attribute the tasks to (`assigned_by`).
 *  - Idempotent on task title: re-running skips tasks that already exist.
 */

const mysql = require('mysql2/promise');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const ALICE_EMAIL = 'alice.santos@local.test';

function daysFromNow(n) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

// 5 test tasks across varied priority/status/due dates.
const TASKS = [
    { title: 'Encode new student intake forms', description: 'Digitize the latest batch of intake forms.', priority: 'high', status: 'pending', due: daysFromNow(2) },
    { title: 'Update Alice contact directory', description: 'Verify and correct outdated contact details.', priority: 'medium', status: 'in progress', due: daysFromNow(5) },
    { title: 'Review flagged duplicate records', description: 'Resolve records flagged as possible duplicates.', priority: 'urgent', status: 'pending', due: daysFromNow(1) },
    { title: 'Scan archived enrolment slips', description: 'Scan and tag last term enrolment slips.', priority: 'low', status: 'pending', due: daysFromNow(10) },
    { title: 'Prepare weekly encoding report', description: 'Summarize this week encoding throughput.', priority: 'medium', status: 'in progress', due: daysFromNow(4) }
];

async function seed() {
    console.log('--- Alice Santos Test Tasks Seeding Tool ---');

    const db = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || 'people'
    });

    try {
        // Resolve Alice's employee_id.
        const [aliceRows] = await db.execute(
            'SELECT employee_id FROM Employees WHERE email = ? LIMIT 1',
            [ALICE_EMAIL]
        );
        if (aliceRows.length === 0) {
            console.error(`Alice Santos (${ALICE_EMAIL}) not found. Run \`npm run db:seed:dummy\` first.`);
            process.exit(1);
        }
        const aliceId = aliceRows[0].employee_id;

        // Resolve an Admin to attribute the tasks to.
        const [admins] = await db.execute(
            "SELECT employee_id FROM Employees WHERE designation = 'Admin' ORDER BY created_at ASC LIMIT 1"
        );
        if (admins.length === 0) {
            console.error('No Admin account found. Run `npm run db:seed` first, then re-run this script.');
            process.exit(1);
        }
        const adminId = admins[0].employee_id;

        console.log(`Seeding ${TASKS.length} task(s) for Alice Santos...`);
        for (const t of TASKS) {
            const [existing] = await db.execute(
                'SELECT task_id FROM Tasks WHERE title = ? LIMIT 1',
                [t.title]
            );
            if (existing.length > 0) {
                console.log(`  - Task "${t.title}" already exists, skipping.`);
                continue;
            }
            await db.execute(
                `INSERT INTO Tasks
                    (title, description, assigned_by, assigned_to_user, assigned_to_group, priority, status, due_date)
                 VALUES (?, ?, ?, ?, NULL, ?, ?, ?)`,
                [t.title, t.description, adminId, aliceId, t.priority, t.status, t.due]
            );
            console.log(`  + Created task "${t.title}"`);
        }

        console.log('\nSUCCESS: Alice Santos test tasks seeded.\n');
    } catch (err) {
        console.error('Seeding failed:', err.message);
        process.exitCode = 1;
    } finally {
        await db.end();
        process.exit();
    }
}

seed();

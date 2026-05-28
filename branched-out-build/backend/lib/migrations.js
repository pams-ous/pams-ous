// Idempotent schema migrations applied on server startup.
//
// We keep the original `database/PAMS_OUS.sql` intact (it's the authoritative
// MySQL dump). This module layers on top: any column or table the new feature
// set needs is added here, gated by an "already exists?" check so reruns are
// safe.
//
// Run order matters: tables before seed rows, columns before indexes.

async function applyMigrations(db) {
    console.log("→ Applying schema migrations…");

    // 1) OTP expiry — Employees.otp is an INT but there was no expiry column.
    //    We add it so /forgot-password can enforce a 10-minute window.
    await addColumnIfMissing(db, "Employees", "otp_expires_at", "DATETIME NULL");

    // 1b) EERD specialization side-tables — `Admin` and `Member` partition Employees
    //     into the two account types. The group's standalone PAMS_OUS.sql doesn't
    //     ship these (their model puts the role in Employees.designation), so we
    //     create them defensively here. Cascade on Employees delete keeps things tidy.
    await runIfMissing(db, "Admin", `
        CREATE TABLE Admin (
            employee_id VARCHAR(36) NOT NULL,
            PRIMARY KEY (employee_id),
            CONSTRAINT fk_admin_employee FOREIGN KEY (employee_id)
                REFERENCES Employees(employee_id) ON DELETE CASCADE ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);

    await runIfMissing(db, "Member", `
        CREATE TABLE Member (
            employee_id VARCHAR(36) NOT NULL,
            PRIMARY KEY (employee_id),
            CONSTRAINT fk_member_employee FOREIGN KEY (employee_id)
                REFERENCES Employees(employee_id) ON DELETE CASCADE ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);

    // Backfill specialization from the group's flat `Employees.designation` enum.
    // Any Employee whose row says 'Admin' becomes a row in Admin; everyone else
    // (Encoder, Chief) becomes a Member. Only runs for employees not yet placed.
    await db.query(`
        INSERT IGNORE INTO Admin (employee_id)
        SELECT employee_id FROM Employees
        WHERE designation = 'Admin'
          AND employee_id NOT IN (SELECT employee_id FROM Admin)
    `).catch(() => { /* designation column may not exist on newer schemas */ });
    await db.query(`
        INSERT IGNORE INTO Member (employee_id)
        SELECT employee_id FROM Employees
        WHERE employee_id NOT IN (SELECT employee_id FROM Admin)
          AND employee_id NOT IN (SELECT employee_id FROM Member)
    `);

    // 2) Designations system — Discord-style role + granular permission model.
    //    The user role from JWT (ADMIN / MEMBER) is still derived from the
    //    existing Admin side-table; designations layer permissions on top.
    await runIfMissing(db, "Designations", `
        CREATE TABLE Designations (
            designation_id      INT NOT NULL AUTO_INCREMENT,
            name                VARCHAR(80)  NOT NULL,
            description         VARCHAR(255) DEFAULT NULL,
            color               VARCHAR(9)   NOT NULL DEFAULT '#6B0A1A',
            hierarchy_position  INT          NOT NULL DEFAULT 100,
            is_default          TINYINT(1)   NOT NULL DEFAULT 0,
            is_system           TINYINT(1)   NOT NULL DEFAULT 0,
            created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (designation_id),
            UNIQUE KEY uq_designation_name (name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);

    await runIfMissing(db, "Permissions", `
        CREATE TABLE Permissions (
            perm_key     VARCHAR(64)  NOT NULL,
            label        VARCHAR(120) NOT NULL,
            category     VARCHAR(40)  NOT NULL DEFAULT 'General',
            PRIMARY KEY (perm_key)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);

    await runIfMissing(db, "Designation_Permissions", `
        CREATE TABLE Designation_Permissions (
            designation_id INT          NOT NULL,
            perm_key       VARCHAR(64)  NOT NULL,
            PRIMARY KEY (designation_id, perm_key),
            CONSTRAINT fk_dp_designation FOREIGN KEY (designation_id)
                REFERENCES Designations(designation_id) ON DELETE CASCADE ON UPDATE CASCADE,
            CONSTRAINT fk_dp_perm FOREIGN KEY (perm_key)
                REFERENCES Permissions(perm_key) ON DELETE CASCADE ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);

    await runIfMissing(db, "Employee_Designations", `
        CREATE TABLE Employee_Designations (
            employee_id    VARCHAR(36) NOT NULL,
            designation_id INT         NOT NULL,
            assigned_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (employee_id, designation_id),
            CONSTRAINT fk_ed_employee FOREIGN KEY (employee_id)
                REFERENCES Employees(employee_id) ON DELETE CASCADE ON UPDATE CASCADE,
            CONSTRAINT fk_ed_designation FOREIGN KEY (designation_id)
                REFERENCES Designations(designation_id) ON DELETE CASCADE ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);

    // 3) Notification history — completed tasks, password resets, admin actions.
    //    Stored permanently; the UI shows the per-user slice in the bell popover.
    await runIfMissing(db, "Notifications", `
        CREATE TABLE Notifications (
            notif_id     INT          NOT NULL AUTO_INCREMENT,
            employee_id  VARCHAR(36)  NOT NULL,
            kind         VARCHAR(40)  NOT NULL,
            title        VARCHAR(200) NOT NULL,
            body         VARCHAR(500) DEFAULT NULL,
            related_url  VARCHAR(255) DEFAULT NULL,
            is_read      TINYINT(1)   NOT NULL DEFAULT 0,
            created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (notif_id),
            KEY ix_notif_employee (employee_id, created_at),
            CONSTRAINT fk_notif_employee FOREIGN KEY (employee_id)
                REFERENCES Employees(employee_id) ON DELETE CASCADE ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);

    // 4) Seed the canonical permission catalogue + OUS designations.
    await seedPermissions(db);
    await seedDesignations(db);
    await backfillDefaultDesignations(db);

    console.log("✓ Migrations applied.");
}

// ── helpers ──────────────────────────────────────────────────────────────

async function tableExists(db, name) {
    const [rows] = await db.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1`,
        [name]
    );
    return rows.length > 0;
}

async function columnExists(db, table, column) {
    const [rows] = await db.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1`,
        [table, column]
    );
    return rows.length > 0;
}

async function runIfMissing(db, tableName, ddl) {
    if (await tableExists(db, tableName)) return;
    await db.query(ddl);
    console.log(`  ✓ created ${tableName}`);
}

async function addColumnIfMissing(db, table, column, typeClause) {
    if (await columnExists(db, table, column)) return;
    await db.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${typeClause}`);
    console.log(`  ✓ added ${table}.${column}`);
}

// Canonical permission catalogue — anything the UI cares about lives here.
const PERMISSIONS = [
    // Dashboard
    { key: "view_dashboard",        label: "View dashboard",                 category: "Dashboard" },
    // Tasks
    { key: "view_all_tasks",        label: "View all tasks (org-wide)",      category: "Tasks" },
    { key: "create_tasks",          label: "Create tasks",                   category: "Tasks" },
    { key: "assign_tasks",          label: "Assign tasks to others",         category: "Tasks" },
    { key: "edit_any_task",         label: "Edit any task",                  category: "Tasks" },
    { key: "delete_tasks",          label: "Delete tasks",                   category: "Tasks" },
    { key: "complete_own_tasks",    label: "Mark own tasks complete",        category: "Tasks" },
    { key: "view_completed_history",label: "View completed tasks since Day 1", category: "Tasks" },
    // Groups
    { key: "manage_groups",         label: "Create / edit job groups",       category: "Groups" },
    // Reports
    { key: "view_reports",          label: "View reports",                   category: "Reports" },
    { key: "generate_reports",      label: "Generate reports",               category: "Reports" },
    { key: "export_reports",        label: "Export reports (PDF/CSV)",       category: "Reports" },
    // Users
    { key: "view_users",            label: "View users directory",           category: "Users" },
    { key: "create_users",          label: "Create user accounts",           category: "Users" },
    { key: "edit_users",            label: "Edit user accounts",             category: "Users" },
    { key: "delete_users",          label: "Delete user accounts",           category: "Users" },
    { key: "reset_passwords",       label: "Reset other users' passwords",   category: "Users" },
    // Designations
    { key: "manage_designations",   label: "Manage designations & permissions", category: "Designations" }
];

async function seedPermissions(db) {
    for (const p of PERMISSIONS) {
        await db.query(
            `INSERT INTO Permissions (perm_key, label, category)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE label = VALUES(label), category = VALUES(category)`,
            [p.key, p.label, p.category]
        );
    }
}

// Designations are seeded once. We mark them is_system=1 so admins know not
// to delete the foundational ones, but is_system rows are still fully editable.
const DESIGNATIONS = [
    {
        name: "Head", color: "#6B0A1A", position: 10, is_default: 0, is_system: 1,
        description: "Section head — full access.",
        perms: PERMISSIONS.map(p => p.key) // all permissions
    },
    {
        name: "Chief - Admission & Registration", color: "#9C2733", position: 20, is_default: 0, is_system: 1,
        description: "Chief of the Admission & Registration Section.",
        perms: ["view_dashboard","view_all_tasks","create_tasks","assign_tasks","edit_any_task",
                "complete_own_tasks","view_completed_history","manage_groups",
                "view_reports","generate_reports","export_reports",
                "view_users","reset_passwords"]
    },
    {
        name: "Chief - Student Records", color: "#9C2733", position: 30, is_default: 0, is_system: 1,
        description: "Chief of the Student Records Section.",
        perms: ["view_dashboard","view_all_tasks","create_tasks","assign_tasks","edit_any_task",
                "complete_own_tasks","view_completed_history","manage_groups",
                "view_reports","generate_reports","export_reports",
                "view_users","reset_passwords"]
    },
    {
        name: "Encoder / Administrative Staff", color: "#7A7A7A", position: 100, is_default: 1, is_system: 1,
        description: "Default designation for regular staff. Limited to own tasks.",
        perms: ["view_dashboard","create_tasks","complete_own_tasks"]
    }
];

async function seedDesignations(db) {
    for (const d of DESIGNATIONS) {
        const [existing] = await db.query(
            "SELECT designation_id FROM Designations WHERE name = ? LIMIT 1",
            [d.name]
        );

        let designationId;
        if (existing.length === 0) {
            const [r] = await db.query(
                `INSERT INTO Designations (name, description, color, hierarchy_position, is_default, is_system)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [d.name, d.description, d.color, d.position, d.is_default, d.is_system]
            );
            designationId = r.insertId;
            console.log(`  ✓ seeded designation: ${d.name}`);
        } else {
            designationId = existing[0].designation_id;
        }

        // Always re-sync perms for system designations so updates to the catalogue
        // propagate without manual SQL.
        if (d.is_system) {
            await db.query("DELETE FROM Designation_Permissions WHERE designation_id = ?", [designationId]);
            for (const k of d.perms) {
                await db.query(
                    "INSERT IGNORE INTO Designation_Permissions (designation_id, perm_key) VALUES (?, ?)",
                    [designationId, k]
                );
            }
        }
    }
}

// One-time pass: any employee currently in Admin gets "Head" (or chief), and
// everyone else gets the default designation. This bootstraps the new model
// from the pre-existing Admin/Member specialization tables.
async function backfillDefaultDesignations(db) {
    const [defaultRow] = await db.query(
        "SELECT designation_id FROM Designations WHERE is_default = 1 LIMIT 1"
    );
    const [headRow] = await db.query(
        "SELECT designation_id FROM Designations WHERE name = 'Head' LIMIT 1"
    );
    if (defaultRow.length === 0 || headRow.length === 0) return;

    const defaultId = defaultRow[0].designation_id;
    const headId    = headRow[0].designation_id;

    // Give every employee with no designation rows at least the default.
    await db.query(`
        INSERT IGNORE INTO Employee_Designations (employee_id, designation_id)
        SELECT e.employee_id, ?
        FROM Employees e
        LEFT JOIN Employee_Designations ed ON ed.employee_id = e.employee_id
        WHERE ed.employee_id IS NULL
    `, [defaultId]);

    // Promote existing Admin rows to Head as well.
    await db.query(`
        INSERT IGNORE INTO Employee_Designations (employee_id, designation_id)
        SELECT a.employee_id, ?
        FROM Admin a
        WHERE a.employee_id IS NOT NULL
    `, [headId]);
}

module.exports = { applyMigrations };

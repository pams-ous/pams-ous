# Migration: Rename Encoder → Admin. Staff, add Student Assistant

## What changed

| Change | Old value | New value | Where |
|---|---|---|---|
| Access Role renamed | `Encoder` | `Admin. Staff` | `Employees.designation` ENUM |
| Job Title renamed | `Encoder / Administrative Staff` | `Administrative Staff` | `Designations.name` |
| New job title added | — | `Student Assistant` | `Designations` table |

---

## How to apply

Run the migration SQL against your local database (default name: `people`).

**Using the CLI:**
```bash
# from the repo root; replace 'people' if your DB_NAME differs
mysql -u root -p people < database/sql/migration_rename_encoder_to_admin_staff.sql
```

**Using MySQL Workbench / phpMyAdmin / DBeaver:**
1. Open your project database (default name: `people`).
2. Open `database/sql/migration_rename_encoder_to_admin_staff.sql`.
3. Execute the whole script.

The migration is **idempotent** — safe to run multiple times.

---

## Verify

1. **Designations** now lists: `Head`, `Chief - Student Records`, `Chief - Admission & Registration`, `Administrative Staff`, `Student Assistant`
2. **Employees.designation** no longer has the value `Encoder` — all former Encoder rows are now `Admin. Staff`
3. The **Users & Groups → System Users** tab renders correctly with the updated dropdowns

You can verify directly:
```sql
SELECT name FROM Designations ORDER BY hierarchy_position;
SELECT DISTINCT designation FROM Employees;
```

---

## If you seeded before the rename

If you previously ran the older `migration_add_job_title.sql` (which seeded `Encoder / Administrative Staff`), the UPDATE in step 2 will rename that row to `Administrative Staff`. The idempotent INSERT in step 3 will add `Student Assistant` only if it does not already exist.

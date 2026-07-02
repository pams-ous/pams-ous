# Fix: "System Users" tab shows no users (after pulling job-title changes)

## Symptom
- The **Users & Groups → System Users** tab is empty (no users render).
- The **Groups** tab still works normally.
- (If you check) `http://localhost:3000/api/admin/sync/users` returns
  **HTTP 500** with `{"error":"Unknown column 'e.job_title' in 'field list'"}`.

## Cause
The "Add job title support" change made the backend read a new
`Employees.job_title` column (and a `Designations` table). If your **local
database** was created from an older `schema.sql`, that column is missing, so
the users query crashes — the frontend gets nothing and shows an empty table.
This is a **database** problem, not a code problem. Pulling the code is not
enough; your DB schema has to be updated too.

---

## Fix — pick ONE option

### Option A — Run the migration (recommended, keeps your data)
This adds the missing column, ensures the `Designations` table, and seeds the
job-title dropdown. It is **safe to run more than once**.

**Using the CLI (PowerShell):**
```powershell
# from the repo root; replace 'people' if your DB name differs (see backend/.env DB_NAME)
Get-Content database/sql/migration_add_job_title.sql | mysql -u root -p people
```

**Using MySQL Workbench / phpMyAdmin / DBeaver:**
1. Open your project database (default name: `people`).
2. Open `database/sql/migration_add_job_title.sql`.
3. Execute the whole script.

You should see `job_title` listed and 5 designations at the end.

### Option B — Re-import the full schema (DESTROYS all local data)
Only if you don't care about your current local data.
```powershell
Get-Content database/sql/schema.sql | mysql -u root -p people
```
> ⚠️ `schema.sql` runs `DROP TABLE` — every user/group/report in your local DB
> is wiped. After this you must re-register an account. Also note `schema.sql`
> ships **no** designation rows, so run Option A's step 4 (or the whole
> migration) afterward to populate the Job Title dropdown.

---

## Verify the fix
1. Make sure the backend is running:
   ```powershell
   cd backend
   npm run dev
   ```
2. Open `http://localhost:3000/api/admin/sync/users` — should be **HTTP 200**
   with a `users` array (no `error`).
3. In the app, **hard-refresh** the Users & Groups page: `Ctrl + Shift + R`.
4. The System Users tab now lists users, and the **Job Title** dropdown offers
    Director / Deputy Director / Coordinator / Administrative Staff / Admin. Staff.

## Still empty?
- Confirm you're pointed at the right DB: check `DB_NAME` in `backend/.env`.
- Confirm the backend actually restarted after pulling.
- Re-run the migration and watch for SQL errors in the output.
- Open the browser console (F12) — a `User fetch failed` log there means the
  endpoint is still erroring; recheck step 2.

-- ============================================================================
-- seed_mock_data.sql
-- Mock-data seed for the IM-PAMS-OUS `people` database.
--
-- Populates:
--   • 5 new "Encoder/Administrative Staff" test accounts
--   • 30 distinct tasks spread across Pending, In Progress, Completed,
--     and Overdue, with start/due/completion dates fanned across the
--     last ~4 months (Feb–May 2026) so dashboard graphs show curves
--   • Group memberships for the new staff so group-scoped queries work
--   • Task_Updates rows so the "Recent Updates" feed has activity
--
-- All seeded staff share password:  Staff1234!
-- (Per-account argon2id hashes — distinct salts, same plaintext.)
--
-- Assigner for every seeded task is Francis Llego (existing Admin from
-- the baseline dump). Assignees mix the new staff with existing encoders.
--
-- Idempotency: re-running the file is safe for Employees / Employees_Groups
-- (INSERT IGNORE). Tasks and Task_Updates are tagged with a "[SEED]"
-- description prefix; the cleanup block at the top removes prior rows
-- with that tag before re-inserting so re-runs stay clean.
-- ============================================================================

USE `people`;

SET @ADMIN_FRANCIS   = '3764981a-f888-4a3f-9e50-1b1416141345';

-- ── Cleanup of any prior run of this seed ────────────────────────────────
DELETE FROM Task_Updates
 WHERE task_id IN (SELECT task_id FROM Tasks WHERE description LIKE '[SEED]%');
DELETE FROM Tasks WHERE description LIKE '[SEED]%';

-- ── 1. Encoder/Administrative Staff accounts ─────────────────────────────
-- UUIDs are stable so subsequent INSERTS can reference them by name.
INSERT IGNORE INTO Employees
    (employee_id, employee_code, first_name, last_name, middle_name, suffix,
     designation, email, password, active_status, created_at, updated_at)
VALUES
    ('a1111111-1111-4111-8111-111111111111', 'EMP-101', 'Andrea',  'Cruz',     'Beatriz',  NULL, 'Encoder', 'andrea.cruz@pams.ous',
     '$argon2id$v=19$m=65536,t=3,p=4$xaWAuBGll4mIv24gaLLJ3Q$XZVatPxl14HRbRS/jqkME0uGVxspCwAzrJip5ydD9vY',
     'Offline', '2026-02-04 09:12:00', '2026-02-04 09:12:00'),

    ('a2222222-2222-4222-8222-222222222222', 'EMP-102', 'Benjamin','Reyes',    'Carlo',    NULL, 'Encoder', 'benjamin.reyes@pams.ous',
     '$argon2id$v=19$m=65536,t=3,p=4$QuXRjdbs97mRZFBICt52cg$08k9Rn5eUDLEBOzLIIyK4ZFTbU/QAiH61tB/W6Q5VQE',
     'Online',  '2026-02-15 08:45:00', '2026-02-15 08:45:00'),

    ('a3333333-3333-4333-8333-333333333333', 'EMP-103', 'Camille', 'Dela Cruz','Marie',    NULL, 'Encoder', 'camille.delacruz@pams.ous',
     '$argon2id$v=19$m=65536,t=3,p=4$67JyjlAkf18GdT1D4es7ow$sg1qeCHpoJ77ALO594R/ewPqMZJ0KsZDrcxOAnCBkTA',
     'Online',  '2026-03-02 10:30:00', '2026-03-02 10:30:00'),

    ('a4444444-4444-4444-8444-444444444444', 'EMP-104', 'Diego',   'Mendoza',  'Antonio',  'Jr.','Encoder', 'diego.mendoza@pams.ous',
     '$argon2id$v=19$m=65536,t=3,p=4$AkiMXtXsAG1pqYagTBfDlQ$m2k35evGvP+Yz84ExfX4KB/p6OhDPxCtu5RS6zEHTaM',
     'Offline', '2026-03-18 14:05:00', '2026-03-18 14:05:00'),

    ('a5555555-5555-4555-8555-555555555555', 'EMP-105', 'Erika',   'Santos',   'Faye',     NULL, 'Encoder', 'erika.santos@pams.ous',
     '$argon2id$v=19$m=65536,t=3,p=4$X12+X/vA4Ce8qkqn6ETdng$f65S2ylBCfkmUpdpxCO+JRDz5dCGokj7oizvgWt/Ebw',
     'Online',  '2026-04-01 11:20:00', '2026-04-01 11:20:00');

-- Convenience aliases
SET @STAFF1 = 'a1111111-1111-4111-8111-111111111111'; -- Andrea Cruz
SET @STAFF2 = 'a2222222-2222-4222-8222-222222222222'; -- Benjamin Reyes
SET @STAFF3 = 'a3333333-3333-4333-8333-333333333333'; -- Camille Dela Cruz
SET @STAFF4 = 'a4444444-4444-4444-8444-444444444444'; -- Diego Mendoza
SET @STAFF5 = 'a5555555-5555-4555-8555-555555555555'; -- Erika Santos

-- Existing encoders from baseline dump
SET @MARIA   = '82cb796a-499b-11f1-b668-892006bb9ad1';
SET @ROBERT  = '82cb7bfe-499b-11f1-b668-892006bb9ad1';
SET @LINDA   = '82cb7e9c-499b-11f1-b668-892006bb9ad1';
SET @MICHAEL = '82cb8126-499b-11f1-b668-892006bb9ad1';

-- ── 2. Group memberships ────────────────────────────────────────────────
-- Spread new staff across the 10 groups so group-scoped filters return
-- non-trivial results.
INSERT IGNORE INTO Employees_Groups (employee_id, group_id, role, joined_at) VALUES
    (@STAFF1, 2, 'Member', '2026-02-05 09:00:00'),  -- E-Learning Support
    (@STAFF1, 6, 'Member', '2026-02-05 09:00:00'),  -- Research & Dev
    (@STAFF2, 3, 'Member', '2026-02-16 09:00:00'),  -- Student Services
    (@STAFF2, 7, 'Member', '2026-02-16 09:00:00'),  -- ICT Infrastructure
    (@STAFF3, 4, 'Member', '2026-03-03 09:00:00'),  -- Instructional Design
    (@STAFF3, 9, 'Member', '2026-03-03 09:00:00'),  -- Quality Assurance
    (@STAFF4, 5, 'Member', '2026-03-19 09:00:00'),  -- OUS Registrar
    (@STAFF4, 8, 'Member', '2026-03-19 09:00:00'),  -- Extension Services
    (@STAFF5, 1, 'Member', '2026-04-02 09:00:00'),  -- OUS Faculty Council
    (@STAFF5,10, 'Member', '2026-04-02 09:00:00');  -- OUS Media Production

-- ── 3. Tasks — 30 rows, spread across statuses + months ─────────────────
-- (today = 2026-05-27; "Overdue" = pending/in progress with due_date < today)
--
-- Description column is varchar(45) so the [SEED] tag fits with room.

INSERT INTO Tasks
    (title, description, assigned_by, assigned_to_user, assigned_to_group,
     priority, status, due_date, created_at, updated_at)
VALUES
    -- ─── COMPLETED (10) ─── completed dates spread Feb→May for curve
    ('Audit Q1 enrollment records',           '[SEED] Completed Feb',  @ADMIN_FRANCIS, @MARIA,   NULL, 'high',   'completed', '2026-02-20', '2026-02-08 09:00:00', '2026-02-18 16:42:00'),
    ('Update LMS course banners',             '[SEED] Completed Feb',  @ADMIN_FRANCIS, @STAFF1,  NULL, 'medium', 'completed', '2026-02-28', '2026-02-14 10:15:00', '2026-02-26 14:20:00'),
    ('Verify scholar grant disbursements',    '[SEED] Completed Mar',  @ADMIN_FRANCIS, NULL,        3, 'urgent', 'completed', '2026-03-08', '2026-02-22 11:30:00', '2026-03-03 15:00:00'),
    ('Compile faculty workload report',       '[SEED] Completed Mar',  @ADMIN_FRANCIS, @ROBERT,  NULL, 'high',   'completed', '2026-03-15', '2026-03-03 09:00:00', '2026-03-14 17:05:00'),
    ('Migrate legacy student records',        '[SEED] Completed Mar',  @ADMIN_FRANCIS, @STAFF2,  NULL, 'high',   'completed', '2026-03-24', '2026-03-10 13:20:00', '2026-03-22 11:45:00'),
    ('Encode March attendance batch',         '[SEED] Completed Apr',  @ADMIN_FRANCIS, NULL,        5, 'medium', 'completed', '2026-04-02', '2026-03-18 08:10:00', '2026-04-01 10:30:00'),
    ('Inventory printed module stock',        '[SEED] Completed Apr',  @ADMIN_FRANCIS, @LINDA,   NULL, 'low',    'completed', '2026-04-18', '2026-04-04 09:45:00', '2026-04-16 16:10:00'),
    ('Publish Q1 newsletter draft',           '[SEED] Completed Apr',  @ADMIN_FRANCIS, @STAFF3,  NULL, 'medium', 'completed', '2026-04-25', '2026-04-12 11:00:00', '2026-04-24 12:50:00'),
    ('Validate alumni contact database',      '[SEED] Completed May',  @ADMIN_FRANCIS, NULL,        8, 'medium', 'completed', '2026-05-06', '2026-04-22 14:25:00', '2026-05-05 09:20:00'),
    ('Reconcile OR receipts March',           '[SEED] Completed May',  @ADMIN_FRANCIS, @STAFF4,  NULL, 'urgent', 'completed', '2026-05-19', '2026-05-05 10:00:00', '2026-05-18 15:30:00'),

    -- ─── IN PROGRESS (8) ─── all due in future relative to 2026-05-27 (3 already late → counted as overdue below)
    ('Onboard new SY2026 cohort accounts',    '[SEED] In Progress',    @ADMIN_FRANCIS, @STAFF5,  NULL, 'high',   'in progress','2026-06-05', '2026-05-01 09:00:00', '2026-05-22 13:15:00'),
    ('Refactor exam scheduling spreadsheet',  '[SEED] In Progress',    @ADMIN_FRANCIS, @MICHAEL, NULL, 'medium', 'in progress','2026-06-10', '2026-05-06 10:30:00', '2026-05-20 11:00:00'),
    ('Coordinate Module 5 design review',     '[SEED] In Progress',    @ADMIN_FRANCIS, NULL,        4, 'high',   'in progress','2026-06-01', '2026-05-12 14:00:00', '2026-05-24 10:45:00'),
    ('Set up SY2026 enrollment portal',       '[SEED] In Progress',    @ADMIN_FRANCIS, @STAFF1,  NULL, 'urgent', 'in progress','2026-06-15', '2026-05-14 09:45:00', '2026-05-26 09:00:00'),
    ('Tag archived course videos',            '[SEED] In Progress',    @ADMIN_FRANCIS, NULL,       10, 'low',    'in progress','2026-05-30', '2026-05-19 10:15:00', '2026-05-23 14:00:00'),
    ('Draft revised academic calendar',       '[SEED] In Progress',    @ADMIN_FRANCIS, @STAFF2,  NULL, 'high',   'in progress','2026-06-20', '2026-05-22 11:00:00', '2026-05-26 15:30:00'),

    -- ─── PENDING (6) — created recently, all due in future ───
    ('Prepare onboarding kit Cohort B',       '[SEED] Pending',        @ADMIN_FRANCIS, @STAFF3,  NULL, 'medium', 'pending',    '2026-06-01', '2026-05-18 09:00:00', '2026-05-18 09:00:00'),
    ('Cross-check faculty load adjustments',  '[SEED] Pending',        @ADMIN_FRANCIS, @STAFF4,  NULL, 'high',   'pending',    '2026-06-08', '2026-05-20 13:20:00', '2026-05-20 13:20:00'),
    ('Draft procurement memo — laptops',      '[SEED] Pending',        @ADMIN_FRANCIS, NULL,        7, 'urgent', 'pending',    '2026-06-12', '2026-05-21 10:00:00', '2026-05-21 10:00:00'),
    ('Update faculty handbook section 4',     '[SEED] Pending',        @ADMIN_FRANCIS, @STAFF5,  NULL, 'low',    'pending',    '2026-06-15', '2026-05-23 11:30:00', '2026-05-23 11:30:00'),
    ('QA review LMS quiz bank',               '[SEED] Pending',        @ADMIN_FRANCIS, NULL,        9, 'medium', 'pending',    '2026-06-18', '2026-05-25 09:15:00', '2026-05-25 09:15:00'),
    ('Schedule mid-year strategy meeting',    '[SEED] Pending',        @ADMIN_FRANCIS, @STAFF1,  NULL, 'low',    'pending',    '2026-07-02', '2026-05-26 14:00:00', '2026-05-26 14:00:00'),

    -- ─── OVERDUE (6) — status pending/in progress, due_date < 2026-05-27 ───
    ('Submit Annex C compliance forms',       '[SEED] Overdue',        @ADMIN_FRANCIS, @MARIA,   NULL, 'urgent', 'pending',    '2026-04-10', '2026-03-25 09:00:00', '2026-04-11 09:00:00'),
    ('Reconcile April petty cash log',        '[SEED] Overdue',        @ADMIN_FRANCIS, @STAFF2,  NULL, 'high',   'pending',    '2026-04-22', '2026-04-02 11:00:00', '2026-04-23 11:00:00'),
    ('Update website faculty bios',           '[SEED] Overdue',        @ADMIN_FRANCIS, NULL,        6, 'medium', 'in progress','2026-05-05', '2026-04-14 10:30:00', '2026-05-06 10:30:00'),
    ('Re-tag Apr Module materials',           '[SEED] Overdue',        @ADMIN_FRANCIS, @STAFF3,  NULL, 'low',    'pending',    '2026-05-12', '2026-04-25 09:45:00', '2026-05-13 09:45:00'),
    ('Coordinate accreditation site visit',   '[SEED] Overdue',        @ADMIN_FRANCIS, NULL,        9, 'urgent', 'in progress','2026-05-20', '2026-05-05 14:00:00', '2026-05-21 14:00:00'),
    ('Encode May registrar update batch',     '[SEED] Overdue',        @ADMIN_FRANCIS, @STAFF4,  NULL, 'high',   'pending',    '2026-05-24', '2026-05-10 10:15:00', '2026-05-25 10:15:00');

-- ── 4. Task_Updates — activity log for completed/in-progress tasks ──────
-- These feed the dashboard "Recent Updates" panel and the per-task
-- history view. updated_text is varchar(45) — keep messages terse.

-- Helper: pull task IDs back by title so update inserts don't depend on
-- the auto_increment value at insert time.
INSERT INTO Task_Updates (task_id, updated_by, updated_text, status_change, logged_at)
SELECT t.task_id, @MARIA,   'Audit complete — handing off',  'completed',   '2026-02-18 16:42:00'
FROM Tasks t WHERE t.title = 'Audit Q1 enrollment records' AND t.description LIKE '[SEED]%' LIMIT 1;

INSERT INTO Task_Updates (task_id, updated_by, updated_text, status_change, logged_at)
SELECT t.task_id, @STAFF1,  'Banners pushed to LMS',         'completed',   '2026-02-26 14:20:00'
FROM Tasks t WHERE t.title = 'Update LMS course banners' AND t.description LIKE '[SEED]%' LIMIT 1;

INSERT INTO Task_Updates (task_id, updated_by, updated_text, status_change, logged_at)
SELECT t.task_id, @ROBERT,  'Disbursements verified',        'completed',   '2026-03-03 15:00:00'
FROM Tasks t WHERE t.title = 'Verify scholar grant disbursements' AND t.description LIKE '[SEED]%' LIMIT 1;

INSERT INTO Task_Updates (task_id, updated_by, updated_text, status_change, logged_at)
SELECT t.task_id, @ROBERT,  'Workload report filed',         'completed',   '2026-03-14 17:05:00'
FROM Tasks t WHERE t.title = 'Compile faculty workload report' AND t.description LIKE '[SEED]%' LIMIT 1;

INSERT INTO Task_Updates (task_id, updated_by, updated_text, status_change, logged_at)
SELECT t.task_id, @STAFF2,  'Records migrated to new DB',    'completed',   '2026-03-22 11:45:00'
FROM Tasks t WHERE t.title = 'Migrate legacy student records' AND t.description LIKE '[SEED]%' LIMIT 1;

INSERT INTO Task_Updates (task_id, updated_by, updated_text, status_change, logged_at)
SELECT t.task_id, @MICHAEL, 'Attendance encoded',            'completed',   '2026-04-01 10:30:00'
FROM Tasks t WHERE t.title = 'Encode March attendance batch' AND t.description LIKE '[SEED]%' LIMIT 1;

INSERT INTO Task_Updates (task_id, updated_by, updated_text, status_change, logged_at)
SELECT t.task_id, @LINDA,   'Inventory tallied',             'completed',   '2026-04-16 16:10:00'
FROM Tasks t WHERE t.title = 'Inventory printed module stock' AND t.description LIKE '[SEED]%' LIMIT 1;

INSERT INTO Task_Updates (task_id, updated_by, updated_text, status_change, logged_at)
SELECT t.task_id, @STAFF3,  'Newsletter draft published',    'completed',   '2026-04-24 12:50:00'
FROM Tasks t WHERE t.title = 'Publish Q1 newsletter draft' AND t.description LIKE '[SEED]%' LIMIT 1;

INSERT INTO Task_Updates (task_id, updated_by, updated_text, status_change, logged_at)
SELECT t.task_id, @STAFF4,  'Alumni contacts validated',     'completed',   '2026-05-05 09:20:00'
FROM Tasks t WHERE t.title = 'Validate alumni contact database' AND t.description LIKE '[SEED]%' LIMIT 1;

INSERT INTO Task_Updates (task_id, updated_by, updated_text, status_change, logged_at)
SELECT t.task_id, @STAFF4,  'OR receipts reconciled',        'completed',   '2026-05-18 15:30:00'
FROM Tasks t WHERE t.title = 'Reconcile OR receipts March' AND t.description LIKE '[SEED]%' LIMIT 1;

-- In-progress activity notes (no status_change) — for "Recent Updates" feed
INSERT INTO Task_Updates (task_id, updated_by, updated_text, status_change, logged_at)
SELECT t.task_id, @STAFF5,  'Started onboarding draft',      'in_progress', '2026-05-22 13:15:00'
FROM Tasks t WHERE t.title = 'Onboard new SY2026 cohort accounts' AND t.description LIKE '[SEED]%' LIMIT 1;

INSERT INTO Task_Updates (task_id, updated_by, updated_text, status_change, logged_at)
SELECT t.task_id, @STAFF1,  'Portal scaffolding done',       'in_progress', '2026-05-26 09:00:00'
FROM Tasks t WHERE t.title = 'Set up SY2026 enrollment portal' AND t.description LIKE '[SEED]%' LIMIT 1;

INSERT INTO Task_Updates (task_id, updated_by, updated_text, status_change, logged_at)
SELECT t.task_id, @STAFF2,  'Calendar draft v1 circulated',  'in_progress', '2026-05-26 15:30:00'
FROM Tasks t WHERE t.title = 'Draft revised academic calendar' AND t.description LIKE '[SEED]%' LIMIT 1;

INSERT INTO Task_Updates (task_id, updated_by, updated_text, status_change, logged_at)
SELECT t.task_id, @MICHAEL, 'Spreadsheet refactor 60% done', 'in_progress', '2026-05-20 11:00:00'
FROM Tasks t WHERE t.title = 'Refactor exam scheduling spreadsheet' AND t.description LIKE '[SEED]%' LIMIT 1;

-- ── 5. Quick verification (shown after script runs) ─────────────────────
SELECT 'Seeded employees:' AS label,
       COUNT(*) AS rows_inserted
  FROM Employees
 WHERE employee_code LIKE 'EMP-10_';

SELECT 'Seeded tasks by status:' AS label,
       status,
       COUNT(*) AS n
  FROM Tasks
 WHERE description LIKE '[SEED]%'
 GROUP BY status;

SELECT 'Overdue (pending/in progress with due<today):' AS label,
       COUNT(*) AS n
  FROM Tasks
 WHERE description LIKE '[SEED]%'
   AND status IN ('pending','in progress')
   AND due_date < CURDATE();

SELECT 'Recent updates:' AS label, COUNT(*) AS n
  FROM Task_Updates tu
  JOIN Tasks t ON t.task_id = tu.task_id
 WHERE t.description LIKE '[SEED]%';

-- =====================================================================
-- Migration: Preserve Tasks when an Employee is deleted
-- Fixes: deleting a user also deleted every task they created
--        (assigned_by) and every task assigned to them (assigned_to_user),
--        because both foreign keys used ON DELETE CASCADE.
--
-- Change: switch both FKs to ON DELETE SET NULL so the task rows survive
--         and only the reference to the deleted user is cleared. This
--         requires assigned_by to be nullable (it was NOT NULL).
--
-- Task list / detail queries already LEFT JOIN Employees on both columns,
-- so a NULL assigned_by / assigned_to_user renders safely (no creator /
-- assignee name) instead of dropping the task.
--
-- Also applies the same SET NULL treatment to Task_Updates.updated_by so a
-- deleted user's task-update history survives (the author becomes NULL
-- instead of the log entry being cascade-deleted).
--
-- SAFE TO RUN MULTIPLE TIMES (idempotent). Run it against your local
-- project database (default name: people).
-- =====================================================================

-- 1) Make assigned_by nullable so ON DELETE SET NULL can apply
SET @col_nullable := (
  SELECT IS_NULLABLE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Tasks'
    AND COLUMN_NAME = 'assigned_by'
);
SET @ddl := IF(@col_nullable = 'NO',
  'ALTER TABLE Tasks MODIFY COLUMN assigned_by varchar(36) NULL',
  'SELECT ''assigned_by already nullable'' AS note');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2) Drop and recreate the assigned_by FK with ON DELETE SET NULL
SET @fk_exists := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Tasks'
    AND CONSTRAINT_NAME = 'tasks-employees_admin'
);
SET @drop := IF(@fk_exists = 1,
  'ALTER TABLE Tasks DROP FOREIGN KEY `tasks-employees_admin`',
  'SELECT ''tasks-employees_admin not present'' AS note');
PREPARE stmt FROM @drop; EXECUTE stmt; DEALLOCATE PREPARE stmt;

ALTER TABLE Tasks
  ADD CONSTRAINT `tasks-employees_admin`
  FOREIGN KEY (`assigned_by`) REFERENCES `Employees` (`employee_id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 3) Drop and recreate the assigned_to_user FK with ON DELETE SET NULL
SET @fk_exists := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Tasks'
    AND CONSTRAINT_NAME = 'tasks-employees_employee'
);
SET @drop := IF(@fk_exists = 1,
  'ALTER TABLE Tasks DROP FOREIGN KEY `tasks-employees_employee`',
  'SELECT ''tasks-employees_employee not present'' AS note');
PREPARE stmt FROM @drop; EXECUTE stmt; DEALLOCATE PREPARE stmt;

ALTER TABLE Tasks
  ADD CONSTRAINT `tasks-employees_employee`
  FOREIGN KEY (`assigned_to_user`) REFERENCES `Employees` (`employee_id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 4) Preserve task update history authored by a deleted user:
--    make Task_Updates.updated_by nullable and switch its FK to SET NULL
SET @col_nullable := (
  SELECT IS_NULLABLE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Task_Updates'
    AND COLUMN_NAME = 'updated_by'
);
SET @ddl := IF(@col_nullable = 'NO',
  'ALTER TABLE Task_Updates MODIFY COLUMN updated_by varchar(36) NULL',
  'SELECT ''updated_by already nullable'' AS note');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Task_Updates'
    AND CONSTRAINT_NAME = 'task_updates-employees_link'
);
SET @drop := IF(@fk_exists = 1,
  'ALTER TABLE Task_Updates DROP FOREIGN KEY `task_updates-employees_link`',
  'SELECT ''task_updates-employees_link not present'' AS note');
PREPARE stmt FROM @drop; EXECUTE stmt; DEALLOCATE PREPARE stmt;

ALTER TABLE Task_Updates
  ADD CONSTRAINT `task_updates-employees_link`
  FOREIGN KEY (`updated_by`) REFERENCES `Employees` (`employee_id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 5) Verification: all three rules should now read SET NULL
SELECT CONSTRAINT_NAME, DELETE_RULE
FROM information_schema.REFERENTIAL_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA = DATABASE()
  AND CONSTRAINT_NAME IN (
    'tasks-employees_admin',
    'tasks-employees_employee',
    'task_updates-employees_link'
  );

-- =====================================================================
-- Migration: Add Employees.job_title + Designations (job-title support)
-- Fixes: 500 error "Unknown column 'e.job_title'" on /api/admin/sync/users,
--        which makes the System Users tab show no users.
--
-- Cause: local DB was built from an older schema.sql, before the
--        "Add job title support" commit. This brings the DB up to date.
--
-- SAFE TO RUN MULTIPLE TIMES (idempotent). Run it against your local
-- project database (default name: people).
-- =====================================================================

-- 1) Ensure the Designations table exists (matches schema.sql)
CREATE TABLE IF NOT EXISTS `Designations` (
  `designation_id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(80) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `color` varchar(9) NOT NULL DEFAULT '#6B0A1A',
  `hierarchy_position` int NOT NULL DEFAULT '100',
  `is_default` tinyint(1) NOT NULL DEFAULT '0',
  `is_system` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`designation_id`),
  UNIQUE KEY `uq_designation_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 2) Add Employees.job_title ONLY if it does not already exist
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Employees'
    AND COLUMN_NAME = 'job_title'
);
SET @ddl := IF(@col_exists = 0,
  'ALTER TABLE Employees ADD COLUMN job_title INT NULL AFTER designation',
  'SELECT ''job_title column already present'' AS note');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3) Add the foreign key ONLY if it is not already present
SET @fk_exists := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Employees'
    AND CONSTRAINT_NAME = 'fk_employee_job_title'
);
SET @fk := IF(@fk_exists = 0,
  'ALTER TABLE Employees ADD CONSTRAINT fk_employee_job_title FOREIGN KEY (job_title) REFERENCES Designations(designation_id) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT ''fk_employee_job_title already present'' AS note');
PREPARE stmt2 FROM @fk; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;

-- 4) Seed the dropdown's job titles (idempotent via the unique name key)
INSERT INTO Designations (name, hierarchy_position, is_default) VALUES
  ('Head', 10, 0),
  ('Chief - Student Records', 20, 0),
  ('Chief - Admission & Registration', 30, 0),
  ('Admin. Staff', 40, 0)
ON DUPLICATE KEY UPDATE
  hierarchy_position = VALUES(hierarchy_position),
  is_default = VALUES(is_default);

-- 5) Quick verification (should list the column and the seeded titles)
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Employees' AND COLUMN_NAME = 'job_title';

SELECT designation_id, name, hierarchy_position, is_default
FROM Designations ORDER BY hierarchy_position;

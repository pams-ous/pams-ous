-- =====================================================================
-- Migration: Rename access role "Encoder" to "Admin. Staff",
--            rename job title "Encoder / Administrative Staff" to
--            "Administrative Staff", and add "Student Assistant".
--
-- This migration is SAFE TO RUN MULTIPLE TIMES (idempotent).
-- =====================================================================

-- 1) Access Role: rename ENUM value in Employees.designation
ALTER TABLE Employees MODIFY COLUMN `designation` enum('Encoder', 'Admin', 'Admin. Staff') NOT NULL DEFAULT 'Admin. Staff';
UPDATE Employees SET designation = 'Admin. Staff' WHERE designation = 'Encoder';
ALTER TABLE Employees MODIFY COLUMN `designation` enum('Admin. Staff', 'Admin') NOT NULL DEFAULT 'Admin. Staff';

-- 2) Job Title: rename existing "Encoder / Administrative Staff" to "Administrative Staff"
UPDATE Designations SET name = 'Administrative Staff'
WHERE name = 'Encoder / Administrative Staff';

-- 3) Add new "Student Assistant" job title (safe to re-run)
INSERT INTO Designations (name, description, hierarchy_position, is_default, color)
SELECT 'Student Assistant', 'Student Assistant role', 50, 0, '#6B0A1A'
WHERE NOT EXISTS (SELECT 1 FROM Designations WHERE name = 'Student Assistant');

-- 4) Quick verification
SELECT 'Migration complete. Verify below:' AS note;
SELECT name FROM Designations ORDER BY hierarchy_position;
SELECT DISTINCT designation FROM Employees;

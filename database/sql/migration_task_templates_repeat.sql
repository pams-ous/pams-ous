-- Migration: Task Templates + Repeat-on-Completion
-- Adds Task_Templates table and repeat columns to Tasks table.
-- Idempotent: safe to run multiple times.

USE `people`;

-- 1. Task_Templates table
CREATE TABLE IF NOT EXISTS `Task_Templates` (
  `template_id` int NOT NULL AUTO_INCREMENT,
  `title_pattern` varchar(200) NOT NULL COMMENT 'Supports {#} token for auto-increment',
  `description` text DEFAULT NULL,
  `default_assignee_user` varchar(36) DEFAULT NULL,
  `default_assignee_group` int DEFAULT NULL,
  `is_repeating` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'Whether tasks created from this template auto-repeat',
  `use_count` int NOT NULL DEFAULT 0,
  `created_by` varchar(36) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`template_id`),
  KEY `fk_tpl_assignee_user` (`default_assignee_user`),
  KEY `fk_tpl_assignee_group` (`default_assignee_group`),
  KEY `fk_tpl_created_by` (`created_by`),
  CONSTRAINT `fk_tpl_assignee_user` FOREIGN KEY (`default_assignee_user`) REFERENCES `Employees` (`employee_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_tpl_assignee_group` FOREIGN KEY (`default_assignee_group`) REFERENCES `Job_Groups` (`group_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_tpl_created_by` FOREIGN KEY (`created_by`) REFERENCES `Employees` (`employee_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 2. Add repeat columns to Tasks table
--    is_repeating: marks the task as part of a repeat chain
--    repeat_counter: the current sequence number (e.g. 5 means this is instance #5)
--    template_id: links back to the template it was created from (nullable)

-- is_repeating column
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = 'people' AND TABLE_NAME = 'Tasks' AND COLUMN_NAME = 'is_repeating');
SET @sql = IF(@col_exists = 0, 
    'ALTER TABLE `Tasks` ADD COLUMN `is_repeating` tinyint(1) NOT NULL DEFAULT 0 AFTER `status`',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- repeat_counter column
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = 'people' AND TABLE_NAME = 'Tasks' AND COLUMN_NAME = 'repeat_counter');
SET @sql = IF(@col_exists = 0, 
    'ALTER TABLE `Tasks` ADD COLUMN `repeat_counter` int DEFAULT NULL AFTER `is_repeating`',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- template_id column (FK to Task_Templates)
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = 'people' AND TABLE_NAME = 'Tasks' AND COLUMN_NAME = 'template_id');
SET @sql = IF(@col_exists = 0, 
    'ALTER TABLE `Tasks` ADD COLUMN `template_id` int DEFAULT NULL AFTER `repeat_counter`',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- FK constraint for template_id (only add if not already present)
SET @fk_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
    WHERE TABLE_SCHEMA = 'people' AND TABLE_NAME = 'Tasks' AND CONSTRAINT_NAME = 'fk_task_template');
SET @sql = IF(@fk_exists = 0,
    'ALTER TABLE `Tasks` ADD CONSTRAINT `fk_task_template` FOREIGN KEY (`template_id`) REFERENCES `Task_Templates` (`template_id`) ON DELETE SET NULL ON UPDATE CASCADE',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

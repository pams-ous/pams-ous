-- Migration: Add repeat_limit column to Tasks and Task_Templates
-- Allows admin to set a maximum number of auto-increments before stopping.
-- NULL = unlimited (infinite repeat). A number = stop after that many instances.
-- Idempotent: safe to run multiple times.

USE `people`;

-- repeat_limit on Tasks
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = 'people' AND TABLE_NAME = 'Tasks' AND COLUMN_NAME = 'repeat_limit');
SET @sql = IF(@col_exists = 0, 
    'ALTER TABLE `Tasks` ADD COLUMN `repeat_limit` int DEFAULT NULL AFTER `repeat_counter`',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- repeat_limit on Task_Templates
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = 'people' AND TABLE_NAME = 'Task_Templates' AND COLUMN_NAME = 'repeat_limit');
SET @sql = IF(@col_exists = 0, 
    'ALTER TABLE `Task_Templates` ADD COLUMN `repeat_limit` int DEFAULT NULL AFTER `is_repeating`',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

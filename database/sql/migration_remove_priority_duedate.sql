-- Migration: Remove priority and due_date from Tasks table
-- Run this on any existing database instance to apply the schema change.
-- Date: 2026-07-07

USE `people`;

ALTER TABLE `Tasks`
    DROP COLUMN `priority`,
    DROP COLUMN `due_date`;

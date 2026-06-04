-- PAMS-OUS — clean base schema (Empty Startup)
-- Run once on a fresh local MySQL to create the `people` database and all tables.
-- Safe to re-run: DROP TABLE IF EXISTS guards each table.

CREATE DATABASE IF NOT EXISTS `people`
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_0900_ai_ci;

USE `people`;

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `Employees`
--

DROP TABLE IF EXISTS `Employees`;
CREATE TABLE `Employees` (
  `employee_id` varchar(36) NOT NULL,
  `employee_code` varchar(45) DEFAULT NULL,
  `first_name` varchar(45) NOT NULL,
  `last_name` varchar(45) NOT NULL,
  `middle_name` varchar(45) DEFAULT NULL,
  `suffix` varchar(45) DEFAULT NULL,
  `designation` varchar(80) NOT NULL DEFAULT 'Encoder',
  `email` varchar(45) NOT NULL,
  `password` varchar(97) NOT NULL,
  `active_status` enum('Online','Offline') NOT NULL DEFAULT 'Offline',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `otp` int DEFAULT NULL,
  PRIMARY KEY (`employee_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Table structure for table `Designations`
--

DROP TABLE IF EXISTS `Designations`;
CREATE TABLE `Designations` (
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

--
-- Table structure for table `Job_Groups`
--

DROP TABLE IF EXISTS `Job_Groups`;
CREATE TABLE `Job_Groups` (
  `group_id` int NOT NULL AUTO_INCREMENT,
  `group_name` varchar(45) DEFAULT NULL,
  `desc` varchar(128) DEFAULT NULL,
  `group_created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `group_updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`group_id`),
  UNIQUE KEY `group_id_UNIQUE` (`group_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Table structure for table `Employees_Groups`
--

DROP TABLE IF EXISTS `Employees_Groups`;
CREATE TABLE `Employees_Groups` (
  `employee_id` varchar(36) DEFAULT NULL,
  `group_id` int DEFAULT NULL,
  `role` enum('Leader','Member') NOT NULL DEFAULT 'Member',
  `joined_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `employee_id_idx` (`employee_id`),
  KEY `group_id_idx` (`group_id`),
  CONSTRAINT `join_employee` FOREIGN KEY (`employee_id`) REFERENCES `Employees` (`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `join_group` FOREIGN KEY (`group_id`) REFERENCES `Job_Groups` (`group_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Table structure for table `Tasks`
--

DROP TABLE IF EXISTS `Tasks`;
CREATE TABLE `Tasks` (
  `task_id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(200) NOT NULL,
  `description` varchar(45) DEFAULT NULL,
  `assigned_by` varchar(36) NOT NULL,
  `assigned_to_user` varchar(36) DEFAULT NULL,
  `assigned_to_group` int DEFAULT NULL,
  `priority` enum('low','medium','high','urgent') NOT NULL,
  `status` enum('pending','in progress','completed','cancelled') NOT NULL DEFAULT 'pending',
  `due_date` date NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`task_id`),
  KEY `tasks-employees_idx` (`assigned_by`),
  KEY `tasks-employees: employee_idx` (`assigned_to_user`),
  KEY `tasks-employees_groups_idx` (`assigned_to_group`),
  CONSTRAINT `tasks-employees: admin` FOREIGN KEY (`assigned_by`) REFERENCES `Employees` (`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `tasks-employees: employee` FOREIGN KEY (`assigned_to_user`) REFERENCES `Employees` (`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `tasks-employees_groups` FOREIGN KEY (`assigned_to_group`) REFERENCES `Job_Groups` (`group_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Table structure for table `Task_Updates`
--

DROP TABLE IF EXISTS `Task_Updates`;
CREATE TABLE `Task_Updates` (
  `update_id` int NOT NULL AUTO_INCREMENT,
  `task_id` int NOT NULL,
  `updated_by" varchar(36) NOT NULL,
  `updated_text` varchar(45) NOT NULL,
  `status_change` enum('pending','in_progress','completed','cancelled') DEFAULT NULL,
  `attachment_url` varchar(500) DEFAULT NULL,
  `logged_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`update_id`),
  KEY `task_updates-tasks_idx` (`task_id`),
  KEY `task_updates-employees_idx` (`updated_by`),
  CONSTRAINT `task_updates-employees` FOREIGN KEY (`updated_by`) REFERENCES `Employees` (`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `task_updates-tasks` FOREIGN KEY (`task_id`) REFERENCES `Tasks` (`task_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Table structure for table `Report`
--

DROP TABLE IF EXISTS `Report`;
CREATE TABLE `Report` (
  `report_id` int NOT NULL AUTO_INCREMENT,
  `report_type` enum('Daily','Weekly','Annual') DEFAULT NULL,
  `generated_by` varchar(36) DEFAULT NULL,
  `scope_type` enum('Individual','Group','All') DEFAULT NULL,
  `scope_user_id` varchar(36) DEFAULT NULL,
  `scope_group_id` int DEFAULT NULL,
  `period_start` datetime DEFAULT NULL,
  `period_end` datetime DEFAULT NULL,
  `generated_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`report_id`),
  KEY `report-employees_idx` (`generated_by`),
  KEY `report-employees: scope_idx` (`scope_user_id`),
  KEY `report-group: scope_idx` (`scope_group_id`),
  CONSTRAINT `report-employees` FOREIGN KEY (`generated_by`) REFERENCES `Employees` (`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `report-employees: scope` FOREIGN KEY (`scope_user_id`) REFERENCES `Employees` (`employee_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `report-group: scope` FOREIGN KEY (`scope_group_id`) REFERENCES `Job_Groups` (`group_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Table structure for table `Report_Entries`
--

DROP TABLE IF EXISTS `Report_Entries`;
CREATE TABLE `Report_Entries` (
  `id` int NOT NULL AUTO_INCREMENT,
  `task_update_id` int DEFAULT NULL,
  `task_id` int DEFAULT NULL,
  `report_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `report_entries-task_updates_idx` (`task_update_id`),
  KEY `report_entries-task_idx` (`task_id`),
  KEY `report_entries-report_idx` (`report_id`),
  CONSTRAINT `report_entries-report` FOREIGN KEY (`report_id`) REFERENCES `Report` (`report_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `report_entries-task` FOREIGN KEY (`task_id`) REFERENCES `Tasks` (`task_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `report_entries-task_updates` FOREIGN KEY (`task_update_id`) REFERENCES `Task_Updates` (`update_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;
/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

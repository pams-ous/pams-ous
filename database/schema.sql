-- MySQL dump 10.13  Distrib 8.0.43, for macos15 (arm64)
--
-- Host: localhost    Database: people
-- ------------------------------------------------------
-- Server version	9.4.0

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
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Employees` (
  `employee_id` varchar(36) NOT NULL,
  `employee_code` varchar(45) DEFAULT NULL,
  `first_name` varchar(45) NOT NULL,
  `last_name` varchar(45) NOT NULL,
  `middle_name` varchar(45) DEFAULT NULL,
  `suffix` varchar(45) DEFAULT NULL,
  `designation` enum('Chief','Admin','Encoder') NOT NULL DEFAULT 'Encoder',
  `email` varchar(45) NOT NULL,
  `password` varchar(97) NOT NULL,
  `active_status` enum('Online','Offline') NOT NULL DEFAULT 'Offline',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `otp` int DEFAULT NULL,
  PRIMARY KEY (`employee_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Employees`
--

LOCK TABLES `Employees` WRITE;
/*!40000 ALTER TABLE `Employees` DISABLE KEYS */;
INSERT INTO `Employees` VALUES ('3764981a-f888-4a3f-9e50-1b1416141345','FA-001','Francis','Llego','Loise M.','','Admin','francisllgaming@gmail.com','$argon2id$v=19$m=65536,t=3,p=4$5r4JElwTg9QlXYIjETNrrw$5ogJUfLWq2QLsvUidN1JgDuaIC2W5Cew4Yq9SM2AAtg','Offline','2026-05-20 19:09:00','2026-05-27 08:30:20',NULL),('82cb796a-499b-11f1-b668-892006bb9ad1','EMP-002','Maria','Garcia','Elena',NULL,'Encoder','m.garcia@company.com','$argon2id$v=19$m=65536,t=3,p=4$V2hhdElzVGhpcw$vT3M1Z3R1Z3R1Z3R','Offline','2026-05-21 12:46:56','2026-05-21 12:46:56',NULL),('82cb7bfe-499b-11f1-b668-892006bb9ad1','EMP-003','Robert','Johnson','Edward','Jr.','Encoder','r.johnson@company.com','$argon2id$v=19$m=65536,t=3,p=4$U2FsdHlTYWx0$dzR2dzR2dzR2dzR2','Online','2026-05-21 12:46:56','2026-05-21 13:50:52',NULL),('82cb7e9c-499b-11f1-b668-892006bb9ad1','EMP-004','Linda','Williams','Rose',NULL,'Encoder','l.williams@company.com','$argon2id$v=19$m=65536,t=3,p=4$TXVjaFNhbHQ$eDVleDVleDVleDVl','Offline','2026-05-21 12:46:56','2026-05-21 12:46:56',NULL),('82cb8126-499b-11f1-b668-892006bb9ad1','EMP-005','Michael','Brown','Thomas',NULL,'Encoder','m.brown@company.com','$argon2id$v=19$m=65536,t=3,p=4$0fmLEiD7WIrIGwir3yXdaw$OoCNzr7R4GQNyLEX36Zx55KFyLvdWyWKagJw6upCH3E','Online','2026-05-21 12:46:56','2026-05-24 20:48:28',NULL),('82cb83a6-499b-11f1-b668-892006bb9ad1','EMP-006','Elizabeth','Jones','Anne',NULL,'Encoder','e.jones@company.com','$argon2id$v=19$m=65536,t=3,p=4$U29tZVBhc3M$bTRubTRubTRubTRu','Online','2026-05-21 12:46:56','2026-05-21 12:46:56',NULL),('82cb861c-499b-11f1-b668-892006bb9ad1','EMP-007','Preston','Miller','Scott','Jr. II','Encoder','d.miller@company.com','$argon2id$v=19$m=65536,t=3,p=4$QW5vdGhlclNhbHQ$cDNycDNycDNycDNy','Online','2026-05-21 12:46:56','2026-05-21 14:28:24',NULL),('82cb89e6-499b-11f1-b668-892006bb9ad1','EMP-008','Jennifer','Davis','Lynn',NULL,'Encoder','j.davis@company.com','$argon2id$v=19$m=65536,t=3,p=4$U2FsdF9IZXJl$czF6czF6czF6czF6','Offline','2026-05-21 12:46:56','2026-05-21 12:46:56',NULL),('82cb8c66-499b-11f1-b668-892006bb9ad1','EMP-009','William','Rodriguez','Paul',NULL,'Encoder','w.rodriguez@company.com','$argon2id$v=19$m=65536,t=3,p=4$TGFzdFNhbHQ$bDh4bDh4bDh4bDh4','Online','2026-05-21 12:46:56','2026-05-21 12:46:56',NULL),('82cb8ee6-499b-11f1-b668-892006bb9ad1','EMP-010','Susan','Martinez','Hope',NULL,'Encoder','s.martinez@company.com','$argon2id$v=19$m=65536,t=3,p=4$RmluYWxTYWx0$ajl3ajl3ajl3ajl3','Online','2026-05-21 12:46:56','2026-05-21 12:46:56',NULL),('fc7fa646-b641-4b4e-8a94-f464d023aaa7','EMP-001','Quan','Millz','','II','Admin','millz.quan@company.com','$argon2id$v=19$m=65536,t=3,p=4$LzrVWqbEUti/FH4tRZ5gXw$hu+Yrp6dazhsj+y9ZVDyUujcaeDxFvsPFahBMNdnCQY','Offline','2026-05-22 22:18:08','2026-05-27 08:26:50',NULL);
/*!40000 ALTER TABLE `Employees` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Employees_Groups`
--

DROP TABLE IF EXISTS `Employees_Groups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Employees_Groups`
--

LOCK TABLES `Employees_Groups` WRITE;
/*!40000 ALTER TABLE `Employees_Groups` DISABLE KEYS */;
INSERT INTO `Employees_Groups` VALUES ('82cb796a-499b-11f1-b668-892006bb9ad1',2,'Leader','2026-05-08 11:43:55'),('82cb7bfe-499b-11f1-b668-892006bb9ad1',3,'Member','2026-05-08 11:43:55'),('82cb7e9c-499b-11f1-b668-892006bb9ad1',4,'Member','2026-05-08 11:43:55'),('82cb8126-499b-11f1-b668-892006bb9ad1',5,'Leader','2026-05-08 11:43:55'),('82cb83a6-499b-11f1-b668-892006bb9ad1',1,'Member','2026-05-08 11:43:55'),('82cb83a6-499b-11f1-b668-892006bb9ad1',6,'Leader','2026-05-08 11:43:55'),('82cb89e6-499b-11f1-b668-892006bb9ad1',3,'Member','2026-05-08 11:43:55'),('82cb89e6-499b-11f1-b668-892006bb9ad1',8,'Leader','2026-05-08 11:43:55'),('82cb8c66-499b-11f1-b668-892006bb9ad1',4,'Member','2026-05-08 11:43:55'),('82cb8c66-499b-11f1-b668-892006bb9ad1',9,'Leader','2026-05-08 11:43:55'),('82cb8ee6-499b-11f1-b668-892006bb9ad1',5,'Member','2026-05-08 11:43:55'),('82cb8ee6-499b-11f1-b668-892006bb9ad1',10,'Leader','2026-05-08 11:43:55');
/*!40000 ALTER TABLE `Employees_Groups` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Job_Groups`
--

DROP TABLE IF EXISTS `Job_Groups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Job_Groups` (
  `group_id` int NOT NULL AUTO_INCREMENT,
  `group_name` varchar(45) DEFAULT NULL,
  `desc` varchar(128) DEFAULT NULL,
  `group_created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `group_updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`group_id`),
  UNIQUE KEY `group_id_UNIQUE` (`group_id`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Job_Groups`
--

LOCK TABLES `Job_Groups` WRITE;
/*!40000 ALTER TABLE `Job_Groups` DISABLE KEYS */;
INSERT INTO `Job_Groups` VALUES (1,'OUS Faculty Council','Governance body responsible for academic policies and curriculum development within the PUP Open University System.','2026-05-06 22:50:38','2026-05-06 22:50:38'),(2,'E-Learning Support','Technical team providing assistance for the Learning Management System and digital educational resources.','2026-05-06 22:50:38','2026-05-06 22:50:38'),(3,'Student Services Unit','Handles admissions, registration, and student welfare concerns for distance learners and modular students.','2026-05-06 22:50:38','2026-05-06 22:50:38'),(4,'Instructional Design','Group dedicated to developing modular materials and interactive course content for asynchronous learning.','2026-05-06 22:50:38','2026-05-06 22:50:38'),(5,'OUS Registrar Office','Maintains academic records, grades, and certification requests for all Open University undergraduate and grad programs.','2026-05-06 22:50:38','2026-05-06 22:50:38'),(6,'Research & Dev Group','Focuses on institutional research and innovations in distance education methodologies and open learning systems.','2026-05-06 22:50:38','2026-05-06 22:50:38'),(7,'ICT Infrastructure','Manages the servers, networking, and digital security for the OUS online portal and administrative databases.','2026-05-06 22:50:38','2026-05-06 22:50:38'),(8,'Extension Services','Coordinates community outreach and non-degree programs offered by the PUP Open University for professional growth.','2026-05-06 22:50:38','2026-05-06 22:50:38'),(9,'Quality Assurance','Monitors compliance with academic standards and accreditation requirements for distance education programs.','2026-05-06 22:50:38','2026-05-06 22:50:38'),(10,'OUS Media Production','Produces video lectures, podcasts, and multimedia assets for the various online degree and diploma courses.','2026-05-06 22:50:38','2026-05-06 22:50:38');
/*!40000 ALTER TABLE `Job_Groups` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Report`
--

DROP TABLE IF EXISTS `Report`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Report`
--

LOCK TABLES `Report` WRITE;
/*!40000 ALTER TABLE `Report` DISABLE KEYS */;
/*!40000 ALTER TABLE `Report` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Report_Entries`
--

DROP TABLE IF EXISTS `Report_Entries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Report_Entries`
--

LOCK TABLES `Report_Entries` WRITE;
/*!40000 ALTER TABLE `Report_Entries` DISABLE KEYS */;
/*!40000 ALTER TABLE `Report_Entries` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Task_Updates`
--

DROP TABLE IF EXISTS `Task_Updates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Task_Updates` (
  `update_id` int NOT NULL AUTO_INCREMENT,
  `task_id` int NOT NULL,
  `updated_by` varchar(36) NOT NULL,
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Task_Updates`
--

LOCK TABLES `Task_Updates` WRITE;
/*!40000 ALTER TABLE `Task_Updates` DISABLE KEYS */;
/*!40000 ALTER TABLE `Task_Updates` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Tasks`
--

DROP TABLE IF EXISTS `Tasks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Tasks`
--

LOCK TABLES `Tasks` WRITE;
/*!40000 ALTER TABLE `Tasks` DISABLE KEYS */;
/*!40000 ALTER TABLE `Tasks` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-05-27  8:34:34

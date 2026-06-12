USE people;

-- 1. Modify Notifications table to support targeting
ALTER TABLE Notifications 
ADD COLUMN target_user_id VARCHAR(36) DEFAULT NULL,
ADD COLUMN target_designation_id INT DEFAULT NULL,
ADD COLUMN target_group_id INT DEFAULT NULL,
ADD CONSTRAINT fk_notif_user FOREIGN KEY (target_user_id) REFERENCES Employees(employee_id) ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT fk_notif_designation FOREIGN KEY (target_designation_id) REFERENCES Designations(designation_id) ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT fk_notif_group FOREIGN KEY (target_group_id) REFERENCES Job_Groups(group_id) ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Create User_Notifications table to track read status
CREATE TABLE IF NOT EXISTS User_Notifications (
    user_notification_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    notification_id INT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    read_at DATETIME DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_un_user FOREIGN KEY (user_id) REFERENCES Employees(employee_id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_un_notification FOREIGN KEY (notification_id) REFERENCES Notifications(notification_id) ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE KEY uq_user_notif (user_id, notification_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 3. Backfill: Create read-trackers for existing notifications (Global) (Optional, unless you want to keep existing notifications)
INSERT INTO User_Notifications (user_id, notification_id)
SELECT e.employee_id, n.notification_id
FROM Employees e, Notifications n;

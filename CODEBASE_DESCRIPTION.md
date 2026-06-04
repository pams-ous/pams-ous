# Project Documentation: Employee Task and Report Management System

## 📌 Overview
This project is a full-stack application designed for managing employees, their tasks, and generating accomplishment reports. It features a real-time communication system using Socket.io, robust authentication using JWT and Argon2, and a MySQL database for persistent storage.

The system is divided into three main components:
- **Backend**: A Node.js/Express server handling business logic, authentication, and database interactions.
- **Frontend**: A responsive web interface built with HTML, CSS, and Vanilla JavaScript.
- **Database**: A MySQL schema managing employees, groups, tasks, and report snapshots.

---

## 📂 Directory Structure

```text
.
├── backend/
│   ├── UserMngmt_APIs/         # Authentication, User, and Group Management
│   │   ├── authMiddleware.js   # Role and Token validation
│   │   ├── authUtil.js         # JWT generation and verification
│   │   ├── dbChecks.js         # Database utility functions for user data
│   │   ├── login.js            # Main login logic and REST/Socket endpoints
│   │   ├── mailer.js           # Email integration (Nodemailer)
│   │   ├── manage.js            # User and Group management APIs
│   │   ├── otp.js              # OTP generation and validation logic
│   │   ├── otpService.js       # Service layer for OTP handling
│   │   ├── passwordReset.js    # Password recovery flow
│   │   ├── passwordUtil.js     # Argon2 password hashing and verification
│   │   ├── registration.js      # User registration logic
│   │   ├── smsAdapter.js       # SMS integration placeholder
│   │   └── userSearch.js       # Search functionality for users
│   ├── TaskMngmt_APIs/         # Task Lifecycle Management
│   │   ├── db.js               # Database connection for tasks
│   │   ├── taskController.js   # Business logic for task operations
│   │   ├── taskModel.js        # Data access layer for tasks
│   │   └── taskRoutes.js       # Express routes for task API
│   ├── ReportMgmt_APIs/         # Report Generation and Snapshots
│   │   └── reportHandlers.js    # Logic for generating reports and audit snapshots
│   ├── server.js               # Entry point: Server setup, Socket.io, and Route integration
│   ├── env.example.txt         # Template for environment variables
│   └── package.json            # Backend dependencies
├── database/
│   └── sql/
│       ├── schema.sql          # Database schema for MySQL
│       ├── schema.txt           # Textual representation of the schema
│       └── otp_codes.sql       # Initial SQL setup for OTPs
├── frontend/
│   ├── auth/                   # Authentication pages
│   │   ├── admin-login.html
│   │   ├── forgot-password.html
│   │   └── personnel-auth.html
│   ├── assets/                 # Images and static assets
│   ├── css/                    # Global and responsive stylesheets
│   │   ├── style.css
│   │   └── responsive.css
│   ├── js/                     # Client-side logic
│   │   ├── api.js              # Centralized API fetch wrapper
│   │   ├── auth.js             # Authentication state and session management
│   │   ├── boot.js             # Application bootstrapping
│   │   ├── config.js            # Frontend configuration constants
│   │   ├── dashboard.js         # Dashboard stats and views
│   │   ├── forgotPassword.js   # Password recovery client logic
│   │   ├── landing.js           # Landing page behavior
│   │   ├── layout.js            # Layout, Navigation, and Sidebar management
│   │   ├── my-tasks.js         # Individual task view and updates
│   │   ├── otpClient.js        # OTP verification flow
│   │   ├── reports.js           # Report viewing and generation client
│   │   ├── role-management.js   # User/Group role management logic
│   │   ├── task-board.js       # Admin task board and assignment
│   │   └── users-groups.js     # User and Group management interface
│   ├── pages/                  # Main application pages
│   │   ├── dashboard.html
│   │   ├── my-tasks.html
│   │   ├── reports.html
│   │   ├── task-board.html
│   │   ├── terms-and-conditions.html
│   │   └── users-groups.html
│   └── index.html              # Main entry point for the frontend
└── package.json                # Root project dependencies
```

---

## ⚙️ Detailed System Analysis

### 1. Backend Architecture

#### Core Entry Point (`server.js`)
The server initializes an HTTP server with **Express** and **Socket.io**. It sets up CORS to allow requests from specified origins (including ngrok for development) and serves the `frontend/` folder as static files. It initializes several API modules by passing the `io` (Socket.io) and `db` (MySQL pool) instances.

#### User Management (`UserMngmt_APIs`)
- **Authentication**: Uses **JWT (JSON Web Tokens)** for session management. Tokens are generated upon successful login and verified via `authMiddleware.js`.
- **Password Security**: Uses **Argon2** for secure password hashing.
- **OTP System**: A multi-step verification process involving `otp.js` and `otpService.js` to ensure secure account recovery and registration.
- **RBAC (Role Based Access Control)**: Implements `ADMIN` and `MEMBER` roles. Admins have access to user management, group creation, and task assignment.
- **Communication**: Uses `nodemailer` for sending verification and password reset emails.

#### Task Management (`TaskMngmt_APIs`)
- **Lifecycle**: Tasks move through statuses (e.g., Pending, In Progress, Completed).
- **Audit Trail**: Task updates are recorded in `Task_Updates`, ensuring that every change to a task is tracked with a timestamp.
- **Routing**: Tasks are managed via a set of REST endpoints defined in `taskRoutes.js`.

#### Report Management (`ReportMgmt_APIs`)
- **Snapshot Logic**: Unlike standard reports, this system creates **data snapshots**. When a report is generated, the system records the exact state (status and notes) of the tasks at that moment in `Report_Entries`, linking them to the specific `Task_Update` ID. This ensures that reports remain "audit-proof" even if the task is modified later.
- **Real-time Notification**: When an admin generates a report, all other connected admins are notified via Socket.io.

### 2. Frontend Architecture

The frontend is a **Single Page Application (SPA)-like** structure using multiple HTML pages and a shared set of JavaScript modules.

- **State Management**: `auth.js` manages the JWT stored in local storage to maintain the user session.
- **API Layer**: `api.js` provides a unified `apiFetch` function to handle headers (Authorization tokens) and error handling for all REST calls.
- **Dynamic UI**:
    - **Dashboard**: Visualizes task progress and system status.
    - **Task Board**: Allows Admins to drag-and-drop or assign tasks to users and groups.
    - **Users & Groups**: A management console for modifying employee roles and grouping them into functional units.
- **Responsive Design**: Uses a combination of `style.css` and `responsive.css` to support multiple screen sizes.

### 3. Database Design

The system relies on a relational MySQL database with the following key entities:
- **Employees**: Stores identity, credentials (hashed), designatory roles, and online status.
- **Job_Groups**: Defines organizational units and their descriptions.
- **Employees_Groups**: A junction table linking employees to groups with specific roles (e.g., Leader).
- **Tasks**: The core entity tracking titles, priorities, assignees, and deadlines.
- **Task_Updates**: An audit log of all changes made to a task's status or description.
- **Report**: Stores metadata about generated reports (type, scope, period).
- **Report_Entries**: The snapshot table linking reports to the specific version of a task.

---

## 🛠 Tech Stack Summary

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Runtime** | Node.js | Backend Execution |
| **Web Framework** | Express.js | REST API and Static File Serving |
| **Real-time** | Socket.io | Online status, real-time notifications, and event-driven API |
| **Database** | MySQL | Relational Data Storage |
| **Security** | Argon2 & JWT | Password Hashing & Session Authentication |
| **Frontend** | HTML5, CSS3, JS | User Interface |
| **Communication**| Nodemailer | Automated Email Notifications |

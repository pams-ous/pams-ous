# PUP OUS – Personnel Accomplishment Management System (PAMS)

> [!WARNING]
> **Active Development & Deployment Notice (Use At Your Own Risk)**
> This system is currently in active development, specifically scoped and configured for the **PUP Open University System**.
>
> While you are welcome to fork, modify, and use this codebase under the terms of the Apache License 2.0, please note that **we do not currently recommend or support external deployments**. The codebase is premature, and you use/modify it entirely **at your own risk**.

## Project Overview
PAMS is a professional management system designed for the **Polytechnic University of the Philippines - Open University System**. It streamlines personnel task tracking, real-time accomplishment monitoring, and high-integrity report generation.

The system features a modular architecture with a centralized backend engine and a zero-flicker, desktop-optimized frontend experience.

### Key Features
- **Real-Time Dashboard**: Live statistics and activity feeds powered by WebSockets.
- **Task Management**: A "Momentum-First" task board for tracking assignments from creation to completion.
- **Professional Reports**: Audit-proof report snapshots that preserve historical task states.
- **Secure Authentication**: Multi-layered security using JWT (JSON Web Tokens) and Email OTP verification.
- **RBAC (Role-Based Access Control)**: Strict permission handling between Administrative and Personnel portals.

---

## Tech Stack
- **Frontend**: Vanilla JavaScript (Modular), CSS3, Socket.io Client.
- **Backend**: Node.js, Express.js, Socket.io (Server), MySQL.
- **Security**: Argon2 Password Hashing, JWT Session Management.

---

## Prerequisites
Before running the project, ensure you have the following installed:
1. [Node.js](https://nodejs.org/) (v16.x or higher)
2. [MySQL Server](https://dev.mysql.com/downloads/mysql/) (or XAMPP/WAMP)

---

## Getting Started

### 1. Backend Dependencies
Navigate to the `backend` directory and install the required libraries:
```bash
cd backend
npm install express socket.io mysql2 dotenv argon2 jsonwebtoken nodemailer cors
```

### 2. Environment Configuration
Create a `.env` file in the `backend` directory based on the `.env.example`:
```env
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD="your_password_here"
DB_NAME=people
OTP_DELIVERY=console
```

### 3. Database Setup
1. Open your MySQL client (e.g., MySQL Workbench).
2. Create a database named `people`.
3. Import the schema located at `database/sql/schema.sql`.

### 4. Running the System
Start the centralized server:
```bash
node server.js
```
The system will be live at: `http://localhost:3000`

---

## Project Structure
- `backend/`: Node.js server and API modules (User, Task, Report Mngmt).
- `frontend/`: All UI components, styles, and client-side logic.
- `database/sql/`: SQL schema and initialization scripts.
- `backend/scripts/dev/`: Local developer tools for seeding and resetting data (Git Ignored).

---
*© 2026 PUP Open University System. Licensed under the Apache License 2.0. See LICENSE for details.*

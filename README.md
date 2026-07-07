<div align="center">
  <br/>
  <img src="frontend/assets/pup_ous_seal.webp" alt="PUP OUS PAMS Logo" width="120"/>
  <h1 align="center">PAMS &mdash; PUP OUS</h1>
  <h3 align="center">Personnel Accomplishment Management System</h3>
  <p align="center">
    <strong>Polytechnic University of the Philippines — Open University System</strong>
  </p>
  <br/>

  [![Node.js](https://img.shields.io/badge/Node.js-18.x-339933?logo=node.js&logoColor=white)](https://nodejs.org)
  [![Express](https://img.shields.io/badge/Express-5.x-000000?logo=express&logoColor=white)](https://expressjs.com)
  [![MySQL](https://img.shields.io/badge/MySQL-8.0-4479A1?logo=mysql&logoColor=white)](https://mysql.com)
  [![Socket.IO](https://img.shields.io/badge/Socket.IO-4.x-010101?logo=socket.io&logoColor=white)](https://socket.io)
  [![JWT](https://img.shields.io/badge/JWT-auth-000000?logo=jsonwebtoken&logoColor=white)](https://jwt.io)
  [![Argon2](https://img.shields.io/badge/Argon2-password-FF6F00?logo=authentication&logoColor=white)](https://github.com/ranisalt/node-argon2)
  [![Vanilla JS](https://img.shields.io/badge/frontend-Vanilla_JS-F7DF1E?logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
  [![License](https://img.shields.io/badge/license-Apache_2.0-blue?logo=apache&logoColor=white)](LICENSE)
  [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?logo=github)](https://github.com/pup-ous/pams-ous/pulls)
</div>

<br/>

> **Active Development Notice**  
> This system is currently in active development, scoped and configured specifically for PUP Open University System.  
> While you are welcome to fork and modify this codebase under the Apache 2.0 License, **external deployments are not yet recommended**. You use this software entirely at your own risk.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
  - [1. Clone & Install](#1-clone--install)
  - [2. Environment Configuration](#2-environment-configuration)
  - [3. Database Setup](#3-database-setup)
  - [4. Run Migrations](#4-run-migrations)
  - [5. Seed the Database](#5-seed-the-database)
  - [6. Start the Server](#6-start-the-server)
- [NPM Scripts Reference](#npm-scripts-reference)
- [Authentication & Authorization](#authentication--authorization)
- [API Overview](#api-overview)
- [Project Structure](#project-structure)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

PAMS is a professional task- and accomplishment-tracking system purpose-built for the **Polytechnic University of the Philippines — Open University System**. It replaces manual reporting with a real-time, role-aware platform that streamlines personnel task tracking, accomplishment monitoring, and high-integrity report generation.

---

## Features

| Feature | Description |
|---|---|
| **Real-Time Dashboard** | Live statistics and activity feeds powered by WebSockets — no page refreshes needed. |
| **Momentum-First Task Board** | Kanban-style task board tracking assignments from creation to completion with drag-and-drop status updates. |
| **Audit-Proof Reports** | Professional report snapshots that preserve historical task states for compliance and review. |
| **Secure Authentication** | JWT-based sessions with Email OTP verification for sensitive operations. |
| **Role-Based Access Control** | Four-tier RBAC (SUPERADMIN, Admin, Chief, Member) with strict permission enforcement. |
| **Notifications Engine** | Real-time in-app notifications via Socket.IO with read/unread tracking. |
| **User & Group Management** | Administrative portal for managing personnel, designations, and group assignments. |
| **Ngrok-Ready** | Built-in launcher for exposing local dev server via ngrok with automatic CORS configuration. |

---

## Tech Stack

<div align="center">

### Backend

[![Node.js](https://img.shields.io/badge/Node.js-18.x-339933?logo=node.js&logoColor=white&style=for-the-badge)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-5.x-000000?logo=express&logoColor=white&style=for-the-badge)](https://expressjs.com)
[![MySQL](https://img.shields.io/badge/MySQL-8.0-4479A1?logo=mysql&logoColor=white&style=for-the-badge)](https://mysql.com)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.x-010101?logo=socket.io&logoColor=white&style=for-the-badge)](https://socket.io)
[![Argon2](https://img.shields.io/badge/Argon2-0.44-FF6F00?logo=auth0&logoColor=white&style=for-the-badge)](https://github.com/ranisalt/node-argon2)
[![JWT](https://img.shields.io/badge/JWT-9.x-000000?logo=jsonwebtoken&logoColor=white&style=for-the-badge)](https://jwt.io)
[![Nodemailer](https://img.shields.io/badge/Nodemailer-8.x-30B980?logo=mail.ru&logoColor=white&style=for-the-badge)](https://nodemailer.com)
[![dotenv](https://img.shields.io/badge/dotenv-16.x-ECD53F?logo=dotenv&logoColor=black&style=for-the-badge)](https://github.com/motdotla/dotenv)

### Frontend

[![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white&style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/HTML)
[![CSS3](https://img.shields.io/badge/CSS3-1572B6?logo=css3&logoColor=white&style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/CSS)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?logo=javascript&logoColor=black&style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Socket.IO](https://img.shields.io/badge/Socket.IO_Client-4.x-010101?logo=socket.io&logoColor=white&style=for-the-badge)](https://socket.io)

### Dev Tools

[![Nodemon](https://img.shields.io/badge/Nodemon-3.x-76D04B?logo=nodemon&logoColor=white&style=for-the-badge)](https://nodemon.io)
[![GitHub Actions](https://img.shields.io/badge/GitHub_Actions-CI/CD-2088FF?logo=githubactions&logoColor=white&style=for-the-badge)](https://github.com/features/actions)
[![ngrok](https://img.shields.io/badge/ngrok-tunneling-1F1E37?logo=ngrok&logoColor=white&style=for-the-badge)](https://ngrok.com)

</div>

---

**Key Architecture Decisions:**

- **Single-entry server** — `backend/server.js` is the sole entry point. It wires Express 5, Socket.IO, the MySQL pool, and all REST + WebSocket handlers.
- **Co-located Socket.IO listeners** — A single `io.on('connection')` in `server.js` registers all module listeners — no scattered socket wiring.
- **CommonJS** — The project uses `require()` / `module.exports` throughout (`"type": "commonjs"`).
- **Zero frontend framework** — Vanilla JavaScript with modular namespaced globals (`PAMS`, `PAMS_UI`, `PAMSOtp`, `CONFIG`). No React, Vue, or build step.

---

## Prerequisites

- [Node.js](https://nodejs.org/) v16.x or higher (v18+ recommended)
- [MySQL Server](https://dev.mysql.com/downloads/mysql/) 8.0+ (or XAMPP/WAMP with MySQL)
- [Git](https://git-scm.com/) (for cloning)
- [OpenSSL](https://www.openssl.org/) (for JWT secret generation — pre-installed on macOS/WSL; Git Bash on Windows)

---

## Getting Started

### 1. Clone & Install

```bash
git clone https://github.com/pup-ous/pams-ous.git
cd pams-ous/backend
npm install
```

### 2. Environment Configuration

Copy the environment template and configure your local settings:

```bash
cp .env.example .env
```

Edit `backend/.env` with your values:

```env
PORT=3000
FRONTEND_ORIGIN=http://127.0.0.1:5500
BACKEND_ORIGIN=http://127.0.0.1:3000

DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=people

# OTP delivery: "email" (default), "console" (dev only), or "both"
OTP_DELIVERY=console

# Super Admin credentials
SUPERADMIN_EMAIL=superadmin@local.test
SUPERADMIN_PASSWORD=supersecret

# Generate a secure JWT secret:
#   openssl rand -base64 32
JWT_SECRET=your_jwt_secret_here
```

> **Note:** Set `OTP_DELIVERY=console` for local development. This prints OTP codes to the server console instead of sending emails. Never use this in production.

### 3. Database Setup

```bash
# Create the MySQL database
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS people;"

# Import the base schema
mysql -u root -p people < database/sql/schema.sql
```

### 4. Run Migrations

Run the migration files in order. All migrations are idempotent (`IF NOT EXISTS`):

```bash
mysql -u root -p people < database/sql/migration_add_job_title.sql
mysql -u root -p people < database/sql/migration_notifications.sql
mysql -u root -p people < database/sql/migration_tasks_preserve_on_user_delete.sql
mysql -u root -p people < database/sql/migration_rename_encoder_to_admin_staff.sql
mysql -u root -p people < database/sql/otp_codes.sql
mysql -u root -p people < database/sql/migration_remove_priority_duedate.sql
```

Additionally, run the standalone approval migration:

```bash
node backend/UserMngmt_APIs/migrate_approval.js
```

### 5. Seed the Database

```bash
# Seed super admin, designations, and sample group
npm run db:seed

# Or reset then seed:
npm run db:seed:clear
```

The super admin credentials are read from your `.env` file (`SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD`).

### 6. Start the Server

```bash
# Production mode
npm start

# Development mode (auto-restart on changes)
npm run dev
```

The application will be available at **http://localhost:3000**.

---

## NPM Scripts Reference

All commands run inside `backend/`:

| Script | Command | Description |
|---|---|---|
| `npm start` | `node server.js` | Start production server on `0.0.0.0:3000` |
| `npm run dev` | `nodemon server.js` | Start dev server with auto-reload |
| `npm run db:reset` | — | Truncate all database tables (dev only) |
| `npm run db:seed` | — | Seed super admin, designations, and sample group |
| `npm run db:seed:clear` | — | Reset database then seed |
| `npm run db:seed:dummy` | — | Seed dummy task data for testing |
| `npm run db:seed:alice` | — | Seed Alice's demo tasks |

**Additional commands:**

```bash
# Batch seed admins from JSON file
node scripts/dev/seed-admin.js --file scripts/dev/admins.example.json

# Generate a JWT secret
openssl rand -base64 32

# Launch with ngrok tunnel (opens browser GUI)
node server_run_script/launcher-gui.js
```

---

## Authentication & Authorization

### Roles

| Role | Description |
|---|---|
| **SUPERADMIN** | Bypasses all permission checks. Full system access. |
| **Admin** (Admin. Staff) | Manages users, groups, designations, and reports. |
| **Chief** | Oversees tasks and accomplishments within their group. |
| **Member** | Standard personnel — creates and updates personal tasks. |

### Auth Flow

1. User logs in with email + password
2. Server validates credentials (Argon2 hashed) and returns a JWT
3. Client stores the token in `localStorage` and sends it via `Authorization: Bearer <token>`
4. Middleware (`authenticateToken`, `authorizeRole`) validates every protected request
5. Sensitive operations (password change, etc.) require Email OTP verification

### Session Storage (Frontend)

```js
localStorage: {
  authToken: "<jwt>",
  user: JSON.stringify({ id, email, role, name, ... }),
  PAMS_userEmail: "<email>"
}
```

---

## API Overview

| Endpoint | Method | Description | Auth |
|---|---|---|---|
| `/api/auth/login` | POST | User login | Public |
| `/api/registration/*` | POST | User registration | Admin+ |
| `/api/registration/manage` | GET/PUT/DELETE | User management | Admin+ |
| `/api/tasks` | GET/POST/PUT/DELETE | Task CRUD | Authenticated |
| `/api/dashboard` | GET | Dashboard stats | Authenticated |
| `/api/reports/*` | GET/POST | Report generation | Authenticated |
| `/api/notifications` | GET/PUT | User notifications | Authenticated |
| `/api/admin/sync/users` | POST | Sync users from external source | Superadmin |
| `/api/admin/sync/groups` | POST | Sync groups from external source | Superadmin |

All API responses from Socket.IO events follow the shape:

```json
{ "success": true/false, "rawData": {} }
```

---

## Project Structure

```
pams-ous/
├── backend/
│   ├── server.js                  # Entry point: Express 5 + Socket.IO + MySQL pool
│   ├── config/
│   │   └── superadmin.js          # Super admin env loader (gitignored)
│   ├── UserMngmt_APIs/            # Auth, registration, OTP, notifications, mailer
│   │   ├── login.js
│   │   ├── registerUsers.js
│   │   ├── userUtils.js
│   │   ├── passwordUtil.js
│   │   ├── otpService.js
│   │   ├── mailer.js
│   │   ├── migrate_approval.js
│   │   └── ...
│   ├── TaskMngmt_APIs/            # Task CRUD, dashboard, task model
│   │   ├── taskRoutes.js
│   │   ├── taskController.js
│   │   ├── taskModel.js
│   │   ├── dashboardHandlers.js
│   │   └── db.js
│   ├── ReportMngmt_APIs/
│   │   └── reportHandlers.js
│   ├── scripts/dev/               # Dev tooling (gitignored)
│   │   ├── seed-admin.js
│   │   ├── reset-db.js
│   │   ├── seed-dummy.js
│   │   └── seed-alice-tasks.js
│   ├── server_run_script/         # ngrok launcher
│   │   └── launcher-gui.js
│   └── package.json
│
├── frontend/
│   ├── index.html                 # SPA entry point
│   ├── auth/                      # Login, forgot-password pages
│   ├── pages/                     # Dashboard, my-tasks, task-board, reports, etc.
│   ├── js/                        # Modular frontend application
│   │   ├── api.js                 # window.PAMS — session, navigation, socket, API
│   │   ├── layout.js              # window.PAMS_UI — sidebar, notifications, RBAC
│   │   ├── otpClient.js           # window.PAMSOtp — OTP modal flows
│   │   ├── config.js              # window.CONFIG — frozen configuration
│   │   ├── boot.js                # Auth guard + sidebar restore (runs in <head>)
│   │   ├── auth.js
│   │   ├── dashboard.js
│   │   ├── my-tasks.js
│   │   ├── task-board.js
│   │   ├── reports.js
│   │   └── ...
│   ├── css/
│   └── assets/
│
├── database/
│   └── sql/                       # Schema + migrations
│       ├── schema.sql
│       ├── migration_add_job_title.sql
│       ├── migration_notifications.sql
│       ├── migration_remove_priority_duedate.sql
│       ├── migration_rename_encoder_to_admin_staff.sql
│       ├── migration_tasks_preserve_on_user_delete.sql
│       └── otp_codes.sql
│
├── security/                      # Audit reports (not served)
├── .github/workflows/
│   └── deploy.yml                 # GitHub Pages deploy on push to main
├── AGENTS.md                      # LLM agent guidance
└── LICENSE                        # Apache 2.0
```

---

## Deployment

### GitHub Pages (Frontend Only)

The repository includes a [GitHub Actions workflow](.github/workflows/deploy.yml) that automatically deploys the `frontend/` directory to GitHub Pages on every push to the `main` branch.

To enable:

1. Go to your repo **Settings > Pages**
2. Set **Source** to **GitHub Actions**
3. Push to `main` — the workflow deploys `frontend/` to Pages

### Production Server

For a full production deployment:

1. Set up a MySQL 8 database and run all schema + migrations
2. Configure `.env` with production values (use `OTP_DELIVERY=email` with valid Gmail SMTP credentials)
3. Generate a strong JWT secret with `openssl rand -base64 32`
4. Start with `npm start` or use a process manager like PM2:
   ```bash
   npm install -g pm2
   pm2 start server.js --name pams-ous
   ```

### ngrok Development

```bash
node server_run_script/launcher-gui.js
```

This spawns the server + ngrok tunnel and opens a management GUI at `http://localhost:3456`. CORS is pre-configured for `*.ngrok-free.dev` domains.

---

## License

```
Copyright 2026 PUP Open University System

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```



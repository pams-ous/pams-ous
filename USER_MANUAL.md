# PAMS-OUS — User Manual

**Personnel Accomplishment Management System (PAMS)**
**Polytechnic University of the Philippines – Open University System (PUP-OUS)**

---

## Table of Contents

1. [About the System](#1-about-the-system)
2. [System Requirements](#2-system-requirements)
3. [First-Time Setup](#3-first-time-setup)
   - 3.1 [Install Prerequisites](#31-install-prerequisites)
   - 3.2 [Install Backend Dependencies](#32-install-backend-dependencies)
   - 3.3 [Configure the Environment File (`.env`)](#33-configure-the-environment-file-env)
   - 3.4 [Set Up the Database](#34-set-up-the-database)
   - 3.5 [Configure Email / OTP Delivery](#35-configure-email--otp-delivery)
   - 3.6 [Seed Administrator Accounts](#36-seed-administrator-accounts)
4. [Running the System](#4-running-the-system)
   - 4.1 [Local Run (single machine)](#41-local-run-single-machine)
   - 4.2 [Public Run with ngrok](#42-public-run-with-ngrok)
5. [Using the System](#5-using-the-system)
   - 5.1 [Logging In](#51-logging-in)
   - 5.2 [Registering a New Personnel Account](#52-registering-a-new-personnel-account)
   - 5.3 [Admin Portal](#53-admin-portal)
   - 5.4 [Personnel Portal](#54-personnel-portal)
   - 5.5 [Reports](#55-reports)
6. [Stopping the System](#6-stopping-the-system)
7. [Maintenance & Developer Tools](#7-maintenance--developer-tools)
8. [Troubleshooting](#8-troubleshooting)
9. [Security Notes](#9-security-notes)
10. [Quick Reference](#10-quick-reference)

---

## 1. About the System

PAMS is a personnel/task management system that streamlines task tracking, real-time
accomplishment monitoring, and report generation for PUP-OUS.

**Key features**

- **Real-time dashboard** — live statistics and activity feeds powered by WebSockets (Socket.IO).
- **Task management** — a task board for tracking assignments from creation to completion.
- **Professional reports** — audit-proof report snapshots that preserve historical task states.
- **Secure authentication** — JWT session tokens + Email OTP (one-time passcode) verification.
- **Role-Based Access Control (RBAC)** — separate **Admin** and **Personnel (Encoder)** portals.

**Tech stack**

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla JavaScript (modular), CSS3, Socket.IO client |
| Backend | Node.js, Express.js, Socket.IO server |
| Database | MySQL (database name: `people`) |
| Security | Argon2 password hashing, JWT, Email OTP |
| Email | Nodemailer over Gmail SMTP |
| Public tunnel | ngrok |

> ⚠️ **Notice:** This system is in active development and scoped for PUP-OUS. Use it at your own risk.

---

## 2. System Requirements

Before installing, make sure the host machine has:

1. **Node.js** v16.x or higher — <https://nodejs.org/>
2. **MySQL Server** 8.x (standalone, or bundled with XAMPP/WAMP) — <https://dev.mysql.com/downloads/mysql/>
3. **ngrok** (only if you need to expose the system to the public internet) — <https://ngrok.com/download>
4. A modern browser (Chrome, Edge, or Firefox).
5. *(Optional, for live email OTP)* A Gmail account with 2-Step Verification and an App Password.

**Project location on this machine:**
```
C:\Users\Threndir\Documents\PAMS OUS\pams-ous
```

**Folder structure**

| Folder | Purpose |
|--------|---------|
| `backend/` | Node.js server, API modules (User / Task / Report management) |
| `frontend/` | All UI pages, styles, and client-side JavaScript |
| `database/sql/` | SQL schema and migration scripts |
| `server_run_script/` | Launcher scripts that start the server **and** ngrok together |
| `backend/scripts/dev/` | Developer tools for seeding/resetting data (git-ignored) |
| `security/` | Security audit records |

---

## 3. First-Time Setup

Perform these steps **once** when installing the system on a new machine.

### 3.1 Install Prerequisites

Install Node.js and MySQL from the links in [Section 2](#2-system-requirements). Verify:

```powershell
node -v      # should print v16.x or higher
mysql --version
```

### 3.2 Install Backend Dependencies

Open **PowerShell** and run:

```powershell
cd "C:\Users\Threndir\Documents\PAMS OUS\pams-ous\backend"
npm install
```

This installs all required libraries (`express`, `socket.io`, `mysql2`, `dotenv`,
`argon2`, `jsonwebtoken`, `nodemailer`, `cors`, etc.) defined in `package.json`.

### 3.3 Configure the Environment File (`.env`)

The backend reads its configuration from a file named `.env` inside the `backend` folder.
A template is provided at `backend/env.example.txt`.

1. Copy the template:
   ```powershell
   cd "C:\Users\Threndir\Documents\PAMS OUS\pams-ous\backend"
   Copy-Item env.example.txt .env
   notepad .env
   ```
2. Fill in the values:

   ```env
   # --- Server ---
   PORT=3000
   FRONTEND_ORIGIN=http://127.0.0.1:5500
   BACKEND_ORIGIN=http://127.0.0.1:3000

   # --- Database ---
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=your_mysql_root_password
   DB_NAME=people

   # --- Gmail SMTP (OTP delivery) ---
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=465
   SMTP_SECURE=true
   SMTP_USER=pupouspams@gmail.com
   SMTP_PASSWORD=your_16_char_app_password
   SMTP_FROM=PUP OUS PAMS <pupouspams@gmail.com>

   # --- OTP ---
   OTP_CODE_LENGTH=6
   OTP_TTL_MINUTES=5
   OTP_MAX_ATTEMPTS=5
   OTP_DELIVERY=email
   ```

> 🔒 The `.env` file is git-ignored. **Never commit it** or share its contents.

**Important fields:**

| Key | What to set it to |
|-----|-------------------|
| `DB_PASSWORD` | Your MySQL root password |
| `SMTP_USER` / `SMTP_FROM` | The system Gmail account (`pupouspams@gmail.com`) |
| `SMTP_PASSWORD` | A fresh 16-character Gmail **App Password** (see [3.5](#35-configure-email--otp-delivery)) |
| `OTP_DELIVERY` | `email` for real emails, or `console` for local testing |

### 3.4 Set Up the Database

The system uses a MySQL database named **`people`**.

**Step 1 — Create the schema (tables).** Run the main schema file once. It creates the
`people` database and all tables (Employees, Designations, Tasks, Reports, Notifications, etc.):

```powershell
cd "C:\Users\Threndir\Documents\PAMS OUS\pams-ous"
mysql -u root -p < database\sql\schema.sql
```

> Alternatively, open `database/sql/schema.sql` in **MySQL Workbench** or **phpMyAdmin** and run it.

**Step 2 — Create the OTP table.** This table stores hashed one-time passcodes:

```powershell
mysql -u root -p people < backend\sql\otp_codes.sql
```

> If `backend\sql\otp_codes.sql` is not present, use `database\sql\otp_codes.sql`.

**Step 3 — Apply migrations (only if upgrading an existing database).** If you already
have a `people` database from an earlier version, run any newer migration scripts found in
`database/sql/`, for example:

```powershell
mysql -u root -p people < database\sql\migration_add_job_title.sql
mysql -u root -p people < database\sql\migration_notifications.sql
mysql -u root -p people < database\sql\migration_tasks_preserve_on_user_delete.sql
```

> On a **fresh install** you can skip the migrations — `schema.sql` already includes the latest structure.

### 3.5 Configure Email / OTP Delivery

OTP codes are emailed via Gmail SMTP. To enable real emails you need a Gmail **App Password**
(not the normal account password):

1. Sign in to the system Gmail account (`pupouspams@gmail.com`).
2. Enable **2-Step Verification** on the account.
3. Go to <https://myaccount.google.com/apppasswords>.
4. Revoke any old "PAMS" entry, then generate a new App Password (label it e.g. `PAMS OUS Backend`).
5. Copy the 16-character string (no spaces) into `.env` under `SMTP_PASSWORD`.
6. Make sure `OTP_DELIVERY=email` in `.env`.

**Testing without Gmail (offline/dev mode):** set `OTP_DELIVERY=console` in `.env`.
In this mode no email is sent — the plaintext code is printed to the server terminal in a
banner and stored in `otp_codes.payload.__dev_code`. You can read the latest pending codes with:

```sql
SELECT email, purpose, channel,
       JSON_UNQUOTE(JSON_EXTRACT(payload, '$.__dev_code')) AS dev_code,
       expires_at, used_at, attempts
FROM   otp_codes
WHERE  used_at IS NULL AND expires_at > NOW()
ORDER  BY created_at DESC
LIMIT  5;
```

> ⚠️ Never use `console` (or `both`) delivery in production — it stores plaintext codes.

### 3.6 Seed Administrator Accounts

Personnel can self-register, but **admin accounts must be seeded**. A helper script creates
the standard designations, a sample group, and one or more admin accounts.

```powershell
cd "C:\Users\Threndir\Documents\PAMS OUS\pams-ous\backend"

# Seed the two default admins:
npm run db:seed
```

The default accounts created are:

| Email | Password | Role |
|-------|----------|------|
| `admin@local.test` | `password123` | Admin (Director) |
| `staffadmin@local.test` | `password123` | Admin (Deputy Director) |

> 🔒 **Change these passwords immediately** in any non-local deployment.

**Other seeding options:**

```powershell
# Wipe the database first, then seed defaults:
npm run db:seed:clear

# Seed a single custom admin:
node scripts/dev/seed-admin.js --email admin2@pup.edu.ph --password "StrongPass123" --code ADM-003 --first-name Jane --last-name Cruz --job-title Director

# Seed many admins from a JSON file (see scripts/dev/admins.example.json for the format):
node scripts/dev/seed-admin.js --file scripts/dev/admins.json

# Show all options:
node scripts/dev/seed-admin.js --help
```

---

## 4. Running the System

### 4.1 Local Run (single machine)

For local use, just start the backend server. It serves both the API **and** the frontend.

```powershell
cd "C:\Users\Threndir\Documents\PAMS OUS\pams-ous\backend"
npm start          # runs: node server.js
```

You should see:

```
===================================================
Server connected successfully at port 3000
===================================================
```

Then open a browser to:

```
http://localhost:3000
```

> For live-reload during development use `npm run dev` (nodemon) instead of `npm start`.

### 4.2 Public Run with ngrok

To let users outside your local network reach the system, run it behind an **ngrok** tunnel.
The provided launcher starts the Node server **and** ngrok together, then prints the public URL.

**One-time ngrok setup:**

1. Download and install ngrok: <https://ngrok.com/download>.
2. Create a free ngrok account and copy your authtoken.
3. Register the token once (so ngrok can open tunnels):
   ```powershell
   ngrok config add-authtoken YOUR_NGROK_AUTHTOKEN
   ```
4. Make sure `ngrok` is on your PATH (run `ngrok version` to confirm).

**Start the server + tunnel:**

- **Windows:** double-click **`server_run_script\run_windows.bat`**
  (or run it from a terminal).
- **macOS:** run **`server_run_script/run_macos.command`**
  (first time only: `chmod +x run_macos.command`).

Both scripts execute `launcher.js`, which:

1. Starts the backend server (`backend/server.js`) on port **3000**.
2. Starts an ngrok tunnel pointing to `http://localhost:3000`.
3. Polls the ngrok API (`http://localhost:4040`) and prints the public URL:

```
Ngrok Public URL: https://<random-id>.ngrok-free.dev
--------------------------------------------------
SERVER AND NGROK ARE RUNNING
Close this window or press Ctrl+C to stop everything.
--------------------------------------------------
```

**Share that `https://….ngrok-free.dev` link with your users** — that is the address they
open in their browser. The backend's CORS policy already allows `*.ngrok-free.dev` origins,
localhost, and `127.0.0.1`.

> 💡 The ngrok URL changes every time you restart (on the free plan). Re-share the new link
> after each restart, or use a reserved/static domain on a paid ngrok plan.

---

## 5. Using the System

Open the system URL (`http://localhost:3000` locally, or the ngrok link remotely). You land on
the entry page where you choose the **Personnel** or **Admin** portal.

### 5.1 Logging In

There are two login portals:

- **Personnel sign-in:** `/auth/personnel-auth.html`
- **Admin sign-in:** `/auth/admin-login.html`

Each sign-in form has a **Password / Email OTP** toggle:

- **Password mode (default):** enter email + password → signed in (single step).
- **Email OTP mode:** switch the toggle, enter just your email, click **Send Code**, then
  enter the 6-digit code emailed to you. No password required.

> The admin portal labels the toggle **Security Key / Email OTP**.

### 5.2 Registering a New Personnel Account

1. On the personnel sign-in page, click **Sign Up**.
2. Fill out the form and click **Create Account**.
3. The system emails a 6-digit OTP to the address you entered.
4. Enter the code in the modal. The account is created **only after** the code verifies.
5. New accounts start with **approval status = PENDING**. An admin must approve the account
   before it becomes fully active.

**Forgot password:** click **Forgot your password?** → enter your email → receive an OTP →
enter the code plus a new password → submit.

### 5.3 Admin Portal

After signing in as an admin you have access to:

- **Dashboard** (`pages/dashboard.html`) — live statistics and activity feed.
- **Users & Groups** (`pages/users-groups.html`) —
  - View all personnel; **approve** pending registrations.
  - Create / edit / delete **groups** (Job Groups) and assign a group **leader** and members.
  - Manage designations (Director, Deputy Director, Coordinator, Administrative Staff, Encoder).
- **Task Board** (`pages/task-board.html`) — create and assign tasks to individuals or groups,
  set priority (low / medium / high / urgent) and due dates, and track status
  (pending → in progress → completed / cancelled).
- **Reports** (`pages/reports.html`) — generate report snapshots (see [5.5](#55-reports)).
- **Notifications** — admins and users receive in-app notifications for group changes,
  assignments, and other events.

### 5.4 Personnel Portal

Personnel (Encoder role) can:

- **My Tasks** (`pages/my-tasks.html`) — view tasks assigned to them or their group, post
  task updates (progress notes, attachments) and change task status.
- **Dashboard** — see relevant stats and notifications.

### 5.5 Reports

Reports capture a **point-in-time snapshot** of task states so historical accomplishments are
preserved even if tasks change later.

- **Report types:** Daily, Weekly, Annual, Custom.
- **Scope:** Individual, Group, or All personnel.
- Choose a period (start/end), generate, and the system records the report plus its entries
  (linked task updates with their historical status).

---

## 6. Stopping the System

- If you started with **`npm start`** / `npm run dev`: press **Ctrl + C** in the terminal.
- If you started with the **launcher (ngrok)**: press **Ctrl + C** in the launcher window, or
  simply close it. The launcher stops both the Node server **and** the ngrok tunnel together.

---

## 7. Maintenance & Developer Tools

Run these from the `backend` folder.

| Command | What it does |
|---------|--------------|
| `npm start` | Start the server (production-style). |
| `npm run dev` | Start the server with nodemon (auto-restart on file changes). |
| `npm run db:seed` | Seed default designations, sample group, and default admins. |
| `npm run db:seed:clear` | Wipe the database, then seed defaults. |
| `npm run db:reset` | Reset/clear database tables (`scripts/dev/reset-db.js`). |

> The `scripts/dev/` tools are for local development only and are git-ignored. Use the
> `--clear` / reset commands with care — they delete data.

---

## 8. Troubleshooting

| Symptom | Likely cause / fix |
|---------|-------------------|
| Server won't start, DB connection error | Check `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, `DB_NAME` in `.env`. Confirm MySQL is running and the `people` database exists. |
| "No users showing" in admin portal | See `database/FIX_no_users_showing.md`. Usually a missing migration — run the migration scripts in [3.4](#34-set-up-the-database). |
| OTP email never arrives | Verify `SMTP_USER`/`SMTP_PASSWORD` (App Password, not the Gmail login). Check spam folder. For testing, switch to `OTP_DELIVERY=console` and read the code from the terminal/DB. |
| "Not allowed by CORS" in browser console | The browser origin isn't whitelisted. Allowed origins: localhost, `127.0.0.1`, `*.ngrok-free.dev`, and the `FRONTEND_ORIGIN`/`BACKEND_ORIGIN` from `.env`. |
| ngrok URL not printed | Ensure ngrok is installed, on PATH, and the authtoken is configured (`ngrok config add-authtoken …`). The launcher polls `http://localhost:4040`. |
| Port 3000 already in use | Another process is using the port. Stop it, or change `PORT` in `.env`. |
| Can't sign in as admin | Seed an admin account ([3.6](#36-seed-administrator-accounts)). Self-registered users are Encoders, not admins. |
| New user can't fully use the system | Their `approval_status` is `PENDING`. An admin must approve them in Users & Groups. |

---

## 9. Security Notes

- **Passwords** are hashed with **Argon2** — never stored in plaintext.
- **Sessions** use **JWT** tokens.
- **OTP codes** are stored only as Argon2 hashes (except in dev `console` mode). They expire
  after `OTP_TTL_MINUTES` (default 5) and lock out after `OTP_MAX_ATTEMPTS` (default 5).
- Keep `.env` secret and out of version control.
- Rotate the Gmail App Password if it is ever exposed.
- Do **not** run `OTP_DELIVERY=console`/`both` in production.
- Security audit history is kept in the `security/` folder.

---

## 10. Quick Reference

**Default URLs**

| Purpose | URL |
|---------|-----|
| Local app | `http://localhost:3000` |
| Public app (ngrok) | `https://<id>.ngrok-free.dev` (printed by the launcher) |
| Personnel sign-in | `/auth/personnel-auth.html` |
| Admin sign-in | `/auth/admin-login.html` |
| ngrok inspector | `http://localhost:4040` |

**Default admin logins (change these!)**

| Email | Password |
|-------|----------|
| `admin@local.test` | `password123` |
| `staffadmin@local.test` | `password123` |

**One-page setup checklist**

1. Install Node.js, MySQL (and ngrok if going public).
2. `cd backend` → `npm install`.
3. Copy `env.example.txt` → `.env` and fill in values.
4. Create DB & tables: `mysql -u root -p < database\sql\schema.sql`.
5. Create OTP table: `mysql -u root -p people < backend\sql\otp_codes.sql`.
6. Seed admins: `npm run db:seed`.
7. Configure Gmail App Password (or set `OTP_DELIVERY=console`).
8. Run locally (`npm start`) or publicly (`server_run_script\run_windows.bat`).
9. Open the URL and sign in.

---

*© 2026 PUP Open University System. Licensed under the Apache License 2.0. See `LICENSE` for details.*
</content>
</invoke>

# Agent Guidance for PAMS‑OUS

## Commands (run inside `backend/`)
- `npm install` — install deps (lockfile present, includes `sql-escaper`)
- `npm start` — `node server.js` on `0.0.0.0:3000`
- `npm run dev` — `nodemon server.js` (auto-restart on changes)
- `npm run db:reset` — truncates all tables
- `npm run db:seed` — seed super-admin + designations + sample group from `.env`
- `npm run db:seed:clear` — reset then seed
- `npm run db:seed:dummy` — seed with dummy task data
- `node scripts/dev/seed-admin.js --file scripts/dev/admins.example.json` — batch seed from JSON
- `JWT_SECRET` generate: `openssl rand -base64 32`
- No tests, lint, or typecheck — `npm test` just prints error

## Setup
- Copy `backend/.env.example` → `backend/.env` (`.env` gitignored at root and backend level).
- `server.js:13` sets `dns.setDefaultResultOrder('ipv4first')` — required for Gmail SMTP on macOS.
- `superadmin.js` (loaded by seed scripts and at runtime) requires these 6 env vars or **exits**: `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD`, `SUPERADMIN_EMPLOYEE_CODE`, `SUPERADMIN_FIRST_NAME`, `SUPERADMIN_LAST_NAME`, `SUPERADMIN_JOB_TITLE`.
- CORS allows `localhost`, `127.0.0.1`, `.ngrok-free.app`, `.ngrok.app`, `.ngrok-free.dev`, plus `FRONTEND_ORIGIN`/`BACKEND_ORIGIN` from env. Fallback origin: `BACKEND_ORIGIN || "http://127.0.0.1:5500"`.
- Port: `process.env.PORT || process.env.port || 3000`.
- ngrok dev (from repo root): `node server_run_script/run_macos_tui.command` opens a TUI dashboard in the terminal.
- Dotenv loaded via `server.js:10` with explicit path to `backend/.env`.

## Database
- MySQL 8, DB name `people`. Import `database/sql/schema.sql` (drops/recreates all tables).
- Migrations in `database/sql/`, all idempotent. Run in order. Standalone: `node backend/UserMngmt_APIs/migrate_approval.js`.
- **"System Users" tab shows no users** → run `migration_add_job_title.sql` (missing `Employees.job_title` column).
- `server.js:58` exports the MySQL pool — other modules `require('../server')` to get it.
- `reset-db.js` exports `{ reset }` for programmatic wipe.

## Architecture
- **Single entry: `backend/server.js`** — Express 5, Socket.IO, MySQL pool (mysql2/promise). Wires all REST routes and a single `io.on('connection')` that registers every module's Socket.IO listeners.
- REST init order: registration → manage → login → dashboard → report. Task/report routes registered after socket wiring. Notifications router (`/api/notifications`) mounted early as a factory: `notificationsRouter(db)`.
- `backend/package.json` `"main"` is stale (`UserMngmt_APIs/login.js`) — actual entry is `server.js`.
- `package.json` includes `sql-escaper` dependency — used for parameterized queries.
- Socket.IO emit shape: `{ success, rawData }`.
- Module boundaries:
  - `backend/UserMngmt_APIs/` — auth, registration, OTP, notifications, password reset, mailer, user search
  - `backend/TaskMngmt_APIs/` — task routes/controller/model, dashboard, db.js (re-exports server pool)
  - `backend/ReportMngmt_APIs/` — report handlers/routes/controller

## Frontend
- Vanilla JS, no framework. Served by `express.static('frontend/')` from server.js.
- `frontend/package-lock.json` is empty (no JS dependencies; FontAwesome via CDN).
- Socket.IO client loaded via CDN in auth HTML pages (not bundled).
- Socket transport: `PAMS.socket` uses `['websocket']` only; `PAMSOtp` uses `['websocket', 'polling']`.
- CSS variables: `--maroon` (primary), `--gold` (secondary), `--maroon-hover`, `--gold-hover`.
- `boot.js` loads in `<head>` — restores sidebar state via `sidebar-pre-open` class on `<html>`, redirects to login if unauthenticated. `config.js` loads at end of `<body>`.

### Global frontend namespaces
- `window.PAMS` — session mgmt, navigation helpers, socket, API calls (`api.js`)
- `window.PAMS_UI` — sidebar, notifications popover, RBAC chrome (`layout.js`)
- `window.PAMSOtp` — OTP modal flows (`otpClient.js`)
- `window.CONFIG` — frozen config object (`config.js`)
- `window.initCustomSelect` — custom dropdown enhancer (`layout.js`; duplicated in `auth.js`)
- `window.togglePasswordVisibility` — password show/hide (`shared-utils.js`)
- Pages: `frontend/auth/` (login, forgot-password) and `frontend/pages/` (dashboard, my-tasks, task-board, reports, users-groups, accomplishments, terms-and-conditions). Path helpers: `PAMS.authUrl()`, `PAMS.pageUrl()`.
- `CONFIG.API_BASE_URL` auto-detects backend origin; `CONFIG.USE_MOCK_API: false`.

## Auth
- JWT in `Authorization: Bearer <token>`. Middleware: `authenticateToken`, `authorizeRole(roles)`.
- Roles: `SUPERADMIN`, `Admin`, `Chief`, `MEMBER`. `SUPERADMIN` bypasses all role checks.
- Session in localStorage: `authToken`, `user` (JSON), `PAMS_userEmail`.

## OTP
- `OTP_DELIVERY=console` — prints code to stdout, stores plaintext in `otp_codes.payload.__dev_code`. `OTP_DELIVERY=both` for email + local store. Never use in production.
- `OTP_DELIVERY=email` (default) sends via Gmail SMTP — requires valid `SMTP_PASSWORD` in `.env` (Google App Password, 16 chars, no spaces).
- OTP config in `.env`: `OTP_CODE_LENGTH`, `OTP_TTL_MINUTES`, `OTP_MAX_ATTEMPTS`.

## CommonJS
- `"type": "commonjs"` in `backend/package.json`. No ESM imports.

## CI / Deploy
- `.github/workflows/deploy.yml` — pushes `frontend/` to GitHub Pages on push to `main`. Source in `frontend/`, `Deploy to GitHub Pages` action v4.

## Stale / ignore
- `.claude/agents/` — outdated socket patterns; current codebase uses single `io.on('connection')` in `server.js`.
- `npm run db:seed:alice` — script name in `package.json` but `seed-alice-tasks.js` missing; command will fail.
- `OTP_SETUP.md` — outdated; references wrong entry point (`login.js` instead of `server.js`).

## graphify
- Knowledge graph at `graphify-out/` with god nodes, community structure, cross-file relationships.
- For codebase questions, run `graphify query "<question>"` when `graphify-out/graph.json` exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts.
- Dirty graph files are expected after hooks or incremental updates — not a reason to skip.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

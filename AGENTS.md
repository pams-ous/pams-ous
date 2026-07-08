# Agent Guidance for PAMS‑OUS

## Commands (run inside `backend/`)
- `npm install` — install deps (lockfile present)
- `npm start` — `node server.js` on `0.0.0.0:3000`
- `npm run dev` — `nodemon server.js` (auto-restart on changes)
- `npm run db:reset` — truncates all tables (dev only)
- `npm run db:seed` — seeds super-admin + designations + sample group from `.env`
- `npm run db:seed:clear` — reset then seed
- `npm run db:seed:dummy` — seed with dummy task data
- `node scripts/dev/seed-admin.js --file scripts/dev/admins.example.json` — batch seed from JSON
- `JWT_SECRET` generate: `openssl rand -base64 32`
- No tests, lint, or typecheck — `npm test` exits with error

## Setup
- Copy `backend/.env.example` → `backend/.env` (`.env` is gitignored at root and backend level).
- `dns.setDefaultResultOrder('ipv4first')` in `server.js:13` — required for Gmail SMTP on macOS.
- CORS allows `localhost`, `127.0.0.1`, `.ngrok-free.app`, `.ngrok.app`, `.ngrok-free.dev`, plus `FRONTEND_ORIGIN`/`BACKEND_ORIGIN` from env. CORS middleware headers fall back to `BACKEND_ORIGIN || "http://127.0.0.1:5500"`.
- `backend/config/superadmin.js` reads `SUPERADMIN_EMAIL`/`SUPERADMIN_PASSWORD` from env and **exits the process** if missing.
- For ngrok dev (run from repo root): `node server_run_script/launcher-gui.js` spawns server + ngrok, opens browser GUI at localhost:3456.
- Port resolution: `process.env.PORT || process.env.port || 3000` (lowercase `port` fallback).

## Database
- Create MySQL DB named `people`, import `database/sql/schema.sql` (drops/recreates all tables).
- Run migration files in order from `database/sql/`. All idempotent (`IF NOT EXISTS`):
  - `migration_add_job_title.sql` — `Designations` table + `Employees.job_title` column
  - `migration_notifications.sql` — targeting columns on `Notifications`, creates `User_Notifications`
  - `migration_tasks_preserve_on_user_delete.sql` — task FKs `SET NULL` instead of `CASCADE`
  - `migration_rename_encoder_to_admin_staff.sql` — renames `Encoder` role to `Admin. Staff`, adds `Student Assistant` job title
  - `migration_remove_priority_duedate.sql` — removes priority/due-date columns
  - `otp_codes.sql` — OTP code storage table
- Standalone migration: `node backend/UserMngmt_APIs/migrate_approval.js` — adds `approval_status` column if missing.
- **If "System Users" tab shows no users**, DB is missing `Employees.job_title`. Run `migration_add_job_title.sql`. See `database/FIX_no_users_showing.md`.
- `server.js:58` exports the MySQL pool via `module.exports = db`. Other modules `require('../server')` to get it (e.g. `TaskMngmt_APIs/db.js`).
- `reset-db.js` exports `{ reset }` — importable for programmatic wipe.

## Architecture
- **Single entry: `backend/server.js`** — Express 5, Socket.IO, MySQL pool. Wires REST routes AND one `io.on('connection')` that registers every module's Socket.IO listeners.
- REST init order (server.js): registration → manage → login → dashboard → report. Inline REST routes for admin sync (`/api/admin/sync/users`, `/api/admin/sync/groups`) registered before init calls. Task routes at `/api/tasks`, report routes at `/api/reports`, notifications at `/api/notifications`.
- Socket.IO emit shape: `{ success, rawData }`.
- `backend/package.json` `"main"` is stale (`UserMngmt_APIs/login.js`) — actual entry is `server.js`.
- `notificationsRouter` at `/api/notifications` is a factory: `notificationsRouter(db)` returns a Router instance. Only router taking `db` as an arg at mount time.
- `backend/UserMngmt_APIs/` — auth, registration, search, OTP, notifications, password reset, dbChecks, userUtils, passwordUtil, login, migrate_approval, mailer, otpService, smsAdapter
- `backend/TaskMngmt_APIs/` — taskRoutes, taskController, dashboardHandlers, taskModel, db.js (re-exports server pool)
- `backend/ReportMngmt_APIs/` — reportHandlers, reportRoutes, reportController
- `frontend/js/` — `api.js` (global `PAMS`), `layout.js` (`PAMS_UI`), `otpClient.js` (`PAMSOtp`), `config.js` (`CONFIG`), `boot.js` (auth guard + sidebar restore in `<head>`). Page-specific scripts: `accomplishments.js`, `auth.js`, `dashboard.js`, `forgotPassword.js`, `landing.js`, `loader.js`, `my-tasks.js`, `reports.js`, `role-management.js`, `task-board.js`, `toast.js`, `users-groups.js`.
- `security/` — repo root directory, not served (contains audit markdown reports).

### Global frontend namespaces
- `window.PAMS` — session mgmt, navigation helpers, socket, API calls (api.js)
- `window.PAMS_UI` — sidebar, notifications popover, RBAC chrome (layout.js)
- `window.PAMSOtp` — OTP modal flows (otpClient.js)
- `window.CONFIG` — frozen config object (config.js)
- `window.togglePasswordVisibility` — global helper in layout.js
- `window.initCustomSelect` — custom dropdown enhancer in layout.js

## Frontend
- Vanilla JS, no framework. Served by `express.static` from `server.js`.
- `CONFIG.API_BASE_URL` auto-detects backend origin: same port → `window.location.origin`, other port → `protocol + hostname:3000`. Hardcode if using Live Server on `:5500`.
- `CONFIG.USE_MOCK_API: false` — all flows talk to real backend.
- Socket.IO client loaded via CDN in auth HTML pages (not bundled).
- Socket transport: `PAMS.socket` uses `['websocket']` only; `PAMSOtp` uses `['websocket', 'polling']` (fallback).
- Pages: `frontend/auth/` (login, forgot-password) and `frontend/pages/` (dashboard, my-tasks, task-board, reports, users-groups, terms-and-conditions). Path helpers: `PAMS.authUrl()`, `PAMS.pageUrl()`.
- CSS variables: `--maroon` (primary), `--gold` (secondary), `--maroon-hover`, `--gold-hover`.
- `frontend/package-lock.json` is empty (no JS dependencies).
- `boot.js` runs in `<head>` — restores sidebar state via `sidebar-pre-open` class on `<html>`, and redirects to login if unauthenticated.

## Auth
- JWT in `Authorization: Bearer <token>` header. Middleware: `authenticateToken`, `authorizeRole(roles)`.
- Roles: `SUPERADMIN`, `Admin`, `Chief`, `MEMBER`. `SUPERADMIN` bypasses all role checks.
- Session in localStorage: `authToken`, `user` (JSON), `PAMS_userEmail`.

## OTP
- `OTP_DELIVERY=console` — prints code to stdout, stores plaintext in `otp_codes.payload.__dev_code`. `OTP_DELIVERY=both` for email + local store. Never use `console`/`both` in production.
- `OTP_DELIVERY=email` (default) sends via Gmail SMTP — requires valid `SMTP_PASSWORD` in `.env`.

## CommonJS
- `"type": "commonjs"` in `backend/package.json`. No ESM imports.

## CI / Deploy
- `.github/workflows/deploy.yml` — pushes `frontend/` to GitHub Pages on push to `main`.

## Stale / ignore
- `.claude/agents/` — outdated per-module socket patterns; current codebase uses single `io.on('connection')` in `server.js`.
- `npm run db:seed:alice` — script reference exists in `package.json` but `seed-alice-tasks.js` is missing from disk; command will fail.

## graphify
- Knowledge graph at `graphify-out/` with god nodes, community structure, cross-file relationships.
- For codebase questions, first run `graphify query "<question>"` when `graphify-out/graph.json` exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip if the task is about stale graph output or the user says not to use it.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

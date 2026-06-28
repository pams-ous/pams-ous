# Agent Guidance for PAMS‑OUS

## Commands (run inside `backend/`)
- `npm install` — install deps
- `npm start` / `npm run dev` — runs `server.js` on `0.0.0.0:3000`
- `npm run db:reset` — truncates all tables (dev only)
- `npm run db:seed` — seeds super-admin from `.env`
- `npm run db:seed:clear` — reset then seed
- Generate `JWT_SECRET`: `openssl rand -base64 32`
- No tests, lint, or typecheck configured — `npm test` exits with error

## Setup
- Copy `backend/.env.example` → `backend/.env`. `.env` is gitignored.
- `dns.setDefaultResultOrder('ipv4first')` in `server.js` — required for Gmail SMTP on macOS.
- CORS allows `localhost`, `127.0.0.1`, `.ngrok-free.dev`, plus `FRONTEND_ORIGIN`/`BACKEND_ORIGIN` from env.
- `OTP_SETUP.md` has full OTP/Gmail App Password walkthrough.
- `backend/config/superadmin.js` is gitignored (seeds default super-admin props).

## Database
- Create MySQL DB named `people`, then import `database/sql/schema.sql` (drops/recreates all tables).
- Run migration files in `database/sql/` after schema. All idempotent (`IF NOT EXISTS`):
  - `migration_add_job_title.sql` — `Designations` table + `Employees.job_title` column
  - `migration_notifications.sql` — targeting columns on `Notifications`, creates `User_Notifications`
  - `migration_tasks_preserve_on_user_delete.sql` — task FKs `SET NULL` instead of `CASCADE`
- **If "System Users" tab shows no users**, the DB is missing `Employees.job_title`. Run `migration_add_job_title.sql`. See `database/FIX_no_users_showing.md`.
- `server.js` exports the MySQL pool via `module.exports = db`. Other modules (e.g. `TaskMngmt_APIs/db.js`) `require('../server')` to get it.

## Architecture
- **Single entry point: `backend/server.js`** — creates HTTP server, Express, Socket.IO, MySQL pool. Wires all REST routes AND one `io.on('connection')` that registers every module's Socket.IO listeners.
- REST route init order: registration → manage → login → dashboard → report → taskRoutes. Inline REST routes in server.js for admin sync (`/api/admin/sync/users`, `/api/admin/sync/groups`).
- `TaskMngmt_APIs/taskRoutes.js` uses Express Router (`authenticateToken` + `authorizeRole` on specific routes).
- All other modules communicate **over Socket.IO** with `{ success, rawData }` emit shape.

### Directory layout
- `backend/UserMngmt_APIs/` — auth, registration, search, OTP, notifications, password reset, dbChecks, userUtils, passwordUtil
- `backend/TaskMngmt_APIs/` — task routes, controller, dashboard handlers, models
- `backend/ReportMngmt_APIs/` — `reportHandlers.js`
- `frontend/js/` — `api.js` (global `PAMS`), `layout.js` (`PAMS_UI`), `otpClient.js` (`PAMSOtp`), `config.js` (`CONFIG`)
- `frontend/js/boot.js` runs in `<head>` — auth guard + sidebar state restore before page render

### Stale files
- `.claude/agents/pams-ous-backend.md` describes an older architecture where `login.js` was the entry point. The current entry point is `server.js`. Ignore the `.claude/` agents files.
- `frontend/docus/for_agents.txt` is the canonical frontend coding standards reference (CSS variables, ARIA, CONFIG mocking).

## Frontend
- Vanilla JS, no framework. Frontend is purely static files served by `express.static` from `server.js`.
- `CONFIG.API_BASE_URL` defaults to `window.location.origin` (works for `:3000` dev or ngrok). Hardcode if using Live Server on `:5500`.
- `CONFIG.USE_MOCK_API: false` — all login/OTP flows talk to real backend.
- Socket.IO initialized with `transports: ['websocket']` (no long-polling).
- Pages: `frontend/auth/` (login) and `frontend/pages/` (dashboard, tasks, reports, users-groups). Path helpers: `PAMS.authUrl()`, `PAMS.pageUrl()`.

## Auth
- JWT in `Authorization: Bearer <token>` header. Middleware: `authenticateToken`, `authorizeRole(roles)`.
- Roles: `SUPERADMIN`, `Admin`, `MEMBER`. `SUPERADMIN` bypasses all role checks.
- Session in localStorage: `authToken`, `user` (JSON), `PAMS_userEmail`.

## OTP
- `OTP_DELIVERY=console` — prints code to stdout, stores plaintext in `otp_codes.payload.__dev_code`. `OTP_DELIVERY=both` for email + local store. Never use `console`/`both` in production.
- `OTP_DELIVERY=email` (default) sends via Gmail SMTP — requires valid `SMTP_PASSWORD` in `.env`.

## CI / Deploy
- `.github/workflows/deploy.yml` — pushes `frontend/` to GitHub Pages on push to `main`.

## CommonJS
- `"type": "commonjs"` in `backend/package.json`. No ESM imports.

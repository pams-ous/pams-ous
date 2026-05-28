# IM-PAMS-OUS

Hi team — this folder is something I worked on on the side and wanted to share with the group in case any of it is helpful.

Feel free to take a look whenever you have time, use any of it if it fits, treat it as reference, or let me know if anything should be changed or removed. Totally open to any feedback.

Everyone's original work is kept exactly as it was, untouched — preserved under `_group_original/` and `group-reference/` subfolders.

## What's inside

- **`backend/`** — Express REST API (port 5000) with modules for Tasks, Reports, Groups, Notifications, and a Designations + Permissions layer on top of our user management
- **`frontend/`** — Vanilla JS pages matching our current style (no framework added). Auth pages, dashboard, task board, reports, users/groups
- **`database/`** — MySQL schema (`PAMS_OUS.sql`) and seed data
- **`docs/`** — notes on what was added and why

## Running it locally

```bash
cd backend
npm install
# create backend/.env (see existing repo for required keys)
npm start         # API on http://localhost:5000

# in another terminal, from the IM-PAMS-OUS folder root:
npx http-server frontend -p 5500 -c-1
# frontend on http://localhost:5500
```

Requires MySQL 8.0 running locally with a `people` schema.

# Ramos — Contributions to IM-PAMS-OUS

This file documents the work I (Ramos) contributed on top of the group's
`pams-ous-main` baseline. The group's original files are preserved verbatim and
clearly credited; everything below is what was added or changed by me.

---

## 1. Baseline (group authorship — preserved, not mine)

The group delivered an early skeleton: Socket.IO-based User Management
(login, registration, manage, search), a landing page with two portal entry
points, a CSS utility framework, and a static UI mockup. Their original files
are preserved verbatim and referenced by every file that evolved from them:

| Original | Preserved at |
|---|---|
| `backend/UserMngmt_APIs/*.js` (Socket.IO) | `backend/UserMngmt_APIs/_group_original/` |
| `backend/Notes and Documentation.txt` | `backend/UserMngmt_APIs/_group_original/` |
| `frontend/index.html` (landing) | `frontend/group-reference/index.html` |
| `frontend/admin-login.html` | `frontend/group-reference/admin-login.html` |
| `frontend/personnel-auth.html` | `frontend/group-reference/personnel-auth.html` |
| `frontend/js/{auth,landing,script}.js` | `frontend/group-reference/js/` |
| `frontend/css/style.css` | `frontend/group-reference/css/style.css` |
| `frontend/mockup/mockindex.html` | `frontend/group-reference/mockup/` |
| `frontend/assets/*.webp` (seal, building) | `frontend/group-reference/assets/` |

The group's standalone SQL (`Downloads/PAMS_OUS.sql`) is the authoritative
schema baseline; it's copied verbatim to `database/PAMS_OUS.sql` and used to
bootstrap the `people` database. No edits made to the SQL itself.

> Note for future maintainers: the group's `_group_original/login.js`
> contains a hardcoded DB password (`hillsazucena#17`). I left it untouched
> to preserve their original authorship, but this string is not used by the
> running system — our `db.js` reads `DB_PASSWORD` from the environment.

---

## 2. Prior session — eight production bugs I fixed

All of these were in the inherited codebase; the group's baseline does not
ship the affected modules (Tasks, Reports, Permissions, Notifications), so
these belong to my extensions on top of the baseline.

### Task & Report identity (architectural fix, not a patch)
1. **Task creation: "assignedByEmail not found"** —
   [tasks.js](../backend/TaskMgmt_APIs/tasks.js) was resolving the creator
   by an email field in the request body, which broke when `localStorage`
   was stale. Replaced with `req.user.sub` derived from the JWT; added
   `requireAuth` to `POST /api/tasks`. Closes a spoofing vector at the
   same time — a malicious body can no longer claim someone else's identity.
2. **Report generation: "Report generator not found"** — same root cause,
   same fix in [reports.js](../backend/ReportMgmt_APIs/reports.js).

### Permission gating
3. **Admin password reset: "Missing permission: reset_passwords"** —
   `requirePerm` called `resolveEffectivePermissions`, which for admins
   reads the entire `Permissions` table. If that table was empty at the
   moment of the call (cold start), even admins got `[]`. Fix in
   [designations.js](../backend/UserMngmt_APIs/designations.js): direct
   `Admin` table check that short-circuits before any Permissions query.

### Security
4. **Forgot Password leaked email enumeration** — the route returned a
   generic 200 for unregistered emails. Changed to a 404 with
   "Email address is not registered." per spec.

### UI polish
5. **Notification popover stayed open when hamburger was clicked** —
   `e.stopPropagation()` blocked the click-away listener.
   [api.js](../frontend/api.js) `wireSidebarToggle()` now explicitly closes
   any open notif popover before toggling the sidebar.
6. **Empty-state notification icon was green, not on-brand** — recolored
   to `var(--pup-gold)` in [styles.css](../frontend/styles.css).
7. **Login page PUP-OU logo blended into the maroon background** — added
   a white circular backdrop with a soft halo.
8. **"Add Task" on My Tasks opened a local modal while Dashboard
   redirected to Task Board** — made My Tasks redirect for consistency.

---

## 3. This session — Users & Groups UI + structural merge

### A. Users & Groups page ([users-groups.html](../frontend/users-groups.html))
- Removed the duplicate "Add User" button from the page header. The
  symmetric panel-header button (next to the Users table) is the survivor,
  matching the Groups panel's layout.
- Added a per-row **Delete User** action that POSTs to
  `DELETE /api/users/:id`. Hidden on the signed-in admin's own row so
  they can't self-lock-out from the UI.
- Added a per-group **Delete Group** action that POSTs to
  `DELETE /api/groups/:id`. Both actions confirm before executing and
  reload the page state after success.
- New `.action-btn.delete` CSS variant: red text in resting state, fully
  filled red on hover (clear visual weight for a destructive action).

### B. Backend gating for the two delete routes
Both routes were previously unauthenticated.
- `DELETE /api/users/:id` now requires `requireAuth` +
  `requirePerm("delete_users")`. Extra guards: refuses self-delete (400),
  refuses to delete the last remaining administrator (400).
- `DELETE /api/groups/:id` now requires `requireAuth` +
  `requirePerm("manage_groups")`. Needed adding the imports for
  `requireAuth` / `requirePerm` to
  [taskGroups.js](../backend/TaskMgmt_APIs/taskGroups.js), which wasn't
  previously aware of auth middleware.

### C. Codebase merge (Phase 3)
Per the agreed strategy ("honor in their modules only"):
- The group's original `UserMngmt_APIs/*.js` files were copied verbatim
  into `backend/UserMngmt_APIs/_group_original/`. Our live REST routes
  ([auth.js](../backend/UserMngmt_APIs/auth.js),
  [users.js](../backend/UserMngmt_APIs/users.js),
  [passwordUtil.js](../backend/UserMngmt_APIs/passwordUtil.js)) carry a
  header crediting the original and explaining the architectural delta
  (Socket.IO → REST, `argon2` → `@node-rs/argon2`).
- The group's frontend (landing, admin-login, personnel-auth, mockup,
  assets, css, js) was copied verbatim into `frontend/group-reference/`.
  Our live frontend was not modified to consume their flow — their CSS
  classes (`fw-700`, `color-maroon`, etc.) don't compose with ours, and
  forcing a merge would break the sidebar/dashboard.

### D. Database (Phase 4)
- The standalone `Downloads/PAMS_OUS.sql` was copied to
  `database/PAMS_OUS.sql` (replacing the older version we had).
- The `people` schema was dropped and reloaded from that SQL — the
  group's 11 sample employees are now the baseline data.
- Our backend's `applyMigrations()` runs on boot and idempotently adds
  the Discord-style Designations/Permissions/Notifications tables
  needed by the extended features.
- **New in this session:** added `Admin` and `Member` table creation to
  [migrations.js](../backend/lib/migrations.js). The group's SQL stores
  account type in `Employees.designation` (ENUM), so when we dropped
  and reloaded, our specialization side-tables disappeared. Migrations
  now create them defensively and backfill them from
  `Employees.designation` so the system bootstraps from the group's SQL
  alone without manual setup.

### E. Working test credentials (re-seeded after the DB wipe)

| Role | Email | Password |
|---|---|---|
| Administrator | `testadmin@pams.ous` | `Admin1234!` |
| Encoder / Administrative Staff | `teststaff@pams.ous` | `Staff1234!` |

The group's own sample employees (Francis Llego, Quan Millz, the EMP-002..010
set) are preserved in the database for realism but their passwords are
unknown to me — use the two test accounts above to log in.

---

## 4. Files touched in this session (live code only)

```
frontend/users-groups.html      remove duplicate Add User; add delete actions; current-user guard
frontend/styles.css             .action-btn.delete variant
backend/UserMngmt_APIs/users.js          gate DELETE; self-delete guard; last-admin guard; credit header
backend/UserMngmt_APIs/auth.js           credit header pointing to group's login.js
backend/UserMngmt_APIs/passwordUtil.js   credit header re: argon2 swap
backend/TaskMgmt_APIs/taskGroups.js      gate DELETE /:id; import requireAuth/requirePerm
backend/lib/migrations.js                idempotent Admin/Member creation + backfill
database/PAMS_OUS.sql                    replaced with standalone Downloads version
docs/ramos.md                            this file
```

Files preserved verbatim from the group (no edits):
```
backend/UserMngmt_APIs/_group_original/{login,registration,manage,userSearch,passwordUtil,dbChecks}.js
backend/UserMngmt_APIs/_group_original/Notes and Documentation.txt
frontend/group-reference/  (their full frontend tree)
```

---

## 5. Phase B — Lumiere frontend integration + RBAC hardening
*(2026-05-27)*

This phase integrated Lumiere's three-page auth flow into the live app,
fixed a staff login issue, and discovered + patched a wide RBAC gap on
the read/mutation endpoints. The group's reference frontend at
`frontend/group-reference/` remains untouched — what landed in the live
tree is a wired-up adaptation, not a replacement of their work.

### 5.1 Frontend integration

Lumiere shipped three pages under `frontend/group-reference/`:
`index.html` (portal picker), `admin-login.html` (admin-only sign-in),
and `personnel-auth.html` (Sign In / Sign Up tabs). The supporting
`js/auth.js` was a placeholder that only `console.log`'d payloads —
calling no real API.

I created live versions of each page at the frontend root, preserving
Lumiere's maroon/gold theme, sidebar landing layout, and the segmented
Sign In / Sign Up toggle:

- **`frontend/index.html`** — Lumiere's landing sidebar over the OUS
  building photo, with portal-picker links. If a session token already
  exists in `localStorage`, it skips the landing and goes straight to
  `dashboard.html`.
- **`frontend/admin-login.html`** — Lumiere's admin sign-in card with
  the full forgot-password OTP flow grafted on (email → 6-digit OTP →
  new password → success/fail). Rejects non-ADMIN roles at the portal
  boundary so encoders who land here are told to use the personnel
  portal.
- **`frontend/personnel-auth.html`** — Lumiere's tabbed Sign In / Sign
  Up card. The Sign Up form was retrofitted with every field our REST
  `/auth/register` accepts (employee code, last/first/middle name,
  suffix, email, designation dropdown, password + confirm), plus the
  forgot-password OTP flow. Admins signing in here are auto-redirected
  to `admin-login.html`.

Both auth pages share the same `apiFetch` pipeline as the legacy
`login.html`, so there's only one path to the backend — the visual
change is real but the auth contract is unchanged.

Supporting changes:
- `frontend/assets/pup_ous_seal.webp` and `ous_building.webp` copied in
  from Lumiere's assets so the new pages render without reaching into
  `group-reference/`.
- `frontend/styles.css` — appended a "Lumiere Portal" section with
  scoped selectors (`.main-landing`, `.login-container .login-box`,
  `.portal-btn-*`, `.auth-toggle`). Scoping under `.login-box` avoided
  any clash with the existing `.login-page` rules that still power the
  legacy `login.html`.
- `frontend/login.html` — rewritten as a redirect stub to `index.html`
  so bookmarks and stale links keep working.
- `frontend/api.js` — `requireAuth()` and `logout()` now bounce to
  `index.html` instead of `login.html`.

### 5.2 Staff login fix

Symptom: `teststaff@pams.ous / Staff1234!` returned 401 "Invalid email
or password." Root cause: last session's verification run reset that
account to `NewStaff5678!` and never restored it, even though
`MEMORY.md` still listed `Staff1234!` as canonical.

Fix: re-hashed `Staff1234!` with the production `hash_password()`
(argon2id) and `UPDATE`'d the row in place. No schema change, no code
change — the account just needed its documented password back.

### 5.3 RBAC gaps discovered during Phase 3 testing

The end-to-end matrix surfaced a wide and worrying gap: most read and
mutation routes had **no auth guard at all.** Anyone could `GET
/api/users` or `POST /api/groups` without a token. Only DELETE and
admin-reset-password were gated. Most likely a legacy of the original
Socket.IO design, where the socket connection itself was the auth
context — when the REST routes were carved out, the per-route guards
were never added.

Patched files:

| File | Change |
|---|---|
| `backend/UserMngmt_APIs/users.js` | `router.use(requireAuth)`; gated POST + PATCH toggle-status + DELETE; PUT requires `manage_users` *unless* editing your own profile |
| `backend/TaskMgmt_APIs/taskGroups.js` | `router.use(requireAuth)`; gated POST/PUT/DELETE on groups + member add/remove with `manage_groups` |
| `backend/TaskMgmt_APIs/tasks.js` | `router.use(requireAuth)`; gated POST + DELETE with `manage_tasks`. PUT left open to any authed user so staff can update status on their assigned tasks |
| `backend/TaskMgmt_APIs/taskUpdates.js` | `router.use(requireAuth)` |
| `backend/ReportMgmt_APIs/reports.js` | `router.use(requireAuth)`; gated POST + DELETE with `manage_reports` |
| `backend/ReportMgmt_APIs/reportEntries.js` | `router.use(requireAuth)` |

The `requirePerm` middleware already had an admin-bypass from the
prior session's fix, so admins continue to work everywhere
permissions weren't explicitly granted to them. Staff are blocked
on every admin action they shouldn't have access to.

### 5.4 Phase 4 final test matrix

A 36-cell comprehensive matrix exercised every role × endpoint
combination plus the auth flow:

| Group | Result |
|---|---|
| Auth (login good/bad, forgot-password known/unknown email) | 4/4 |
| Read routes (`users`, `groups`, `tasks`, `reports`, `designations`, `task-updates`, `report-entries`) × 3 audiences (no-auth=401, admin=200, staff=200) | 21/21 |
| Mutation routes (POST `groups`/`users`/`tasks`/`reports`) × (admin=201, staff=403) | 8/8 |
| Self-edit vs cross-edit (staff→self=200, staff→admin=403, admin self-delete=400) | 3/3 |

One probe (`staff DELETE /api/users/self`) returned 403 instead of
the 400 self-delete guard message — the permission gate trips first
now, which is stronger defense in depth, not a regression. The 400
guard still fires correctly for admin self-deletes.

### 5.5 Phase 5 files touched

```
frontend/index.html                              NEW — Lumiere landing
frontend/admin-login.html                        NEW — admin portal
frontend/personnel-auth.html                     NEW — staff portal
frontend/login.html                              rewritten as redirect stub
frontend/assets/pup_ous_seal.webp                NEW (from Lumiere)
frontend/assets/ous_building.webp                NEW (from Lumiere)
frontend/styles.css                              appended Lumiere portal block
frontend/api.js                                  redirect target → index.html
backend/UserMngmt_APIs/users.js                  router.use(requireAuth); POST/PATCH/PUT gated
backend/TaskMgmt_APIs/taskGroups.js              router.use(requireAuth); POST/PUT/members/DELETE gated
backend/TaskMgmt_APIs/tasks.js                   router.use(requireAuth); POST + DELETE gated
backend/TaskMgmt_APIs/taskUpdates.js             router.use(requireAuth)
backend/ReportMgmt_APIs/reports.js               router.use(requireAuth); POST + DELETE gated
backend/ReportMgmt_APIs/reportEntries.js         router.use(requireAuth)
.claude/launch.json                              added backend launch config
docs/ramos.md                                    appended this section
```

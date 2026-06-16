# PAMS-OUS Security Audit Report — 2026-06-12

| Field        | Value                                      |
|--------------|--------------------------------------------|
| **Date**     | 2026-06-12                                 |
| **Auditor**  | opencode                                   |
| **Scope**    | Full codebase — `backend/` and `frontend/` |
| **Branch**   | `main`                                     |

---

## Executive Summary

This is a follow-up audit of the PAMS-OUS system. It is concerning to note that **nearly all Critical and High severity vulnerabilities identified in the previous audit (2026-06-11) remain unpatched**. The system continues to be vulnerable to administrative impersonation via JWT fallback secrets, unauthorized access to personnel data (IDOR), and widespread XSS.

Additionally, new architectural and data integrity flaws have been discovered in the task management module, including a critical impersonation vector in the activity logging system and severe performance bottlenecks that could lead to Denial of Service (DoS) as the database grows.

### Finding Summary

| Severity        | Count | Findings                                                                                              |
|-----------------|:-----:|-------------------------------------------------------------------------------------------------------|
| 🔴 Critical     |   2   | Hardcoded JWT fallback secret, IDOR in `getMyTasks`                                                   |
| 🟠 High         |   3   | Impersonation in `logTaskUpdate`, unguarded admin sync route, unguarded report socket events          |
| 🟡 Medium       |   4   | XSS via innerHTML, memory-intensive filtering in `getMyTasks`, system jobs in GET handler, CORS match |
| 🔵 Low          |   3   | Internal error leaks, architectural coupling in `server.js`, JWT in sessionStorage                    |

---

## Section 1: Users

Findings related to authentication, authorization, user identity, and personnel data access.

---

### 🔴 [CRITICAL-1] Hardcoded JWT Fallback Secret

| Attribute  | Value                                  |
|------------|----------------------------------------|
| **File**   | `backend/UserMngmt_APIs/authUtil.js:3` |
| **Status** | 🔴 VULNERABLE (PERSISTENT)             |

**Vulnerable code:**

```js
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-this-in-env';
```

**Impact:** If `JWT_SECRET` is not set in the environment, the system uses a publicly known key. An attacker can forge an Admin token and gain complete control over the system.

---

### 🟠 [HIGH-2] Unprotected Administrative Endpoint

| Attribute  | Value                          |
|------------|--------------------------------|
| **File**   | `backend/server.js:264`        |
| **Status** | 🔴 VULNERABLE (PERSISTENT)     |

The endpoint `GET /api/admin/sync/groups/:id/members` is registered without `authenticateToken` or `authorizeRole` middleware.

**Impact:** The entire list of employee emails belonging to any group is exposed to the public internet without requiring any credentials.

---

### 🟡 [MEDIUM-4] CORS Substring Matching

| Attribute  | Value                                                            |
|------------|------------------------------------------------------------------|
| **File**   | `backend/UserMngmt_APIs/login.js`, `backend/server.js`           |
| **Status** | 🟡 NEEDS ATTENTION (PERSISTENT)                                  |

Use of `.includes('localhost')` allows origin spoofing — for example, `evil-localhost.com` passes the check.

---

### 🔵 [LOW-1] Internal Error Leaks

| Attribute  | Value                                                                      |
|------------|----------------------------------------------------------------------------|
| **File**   | Multiple catch blocks (e.g., `backend/server.js:121`)                      |
| **Status** | 🔵 NEEDS ATTENTION (PERSISTENT)                                            |

**Vulnerable pattern:**

```js
res.status(500).json({ error: e.message })
```

MySQL error messages sent to the client expose table names, column names, and constraint names, leaking internal database schema details.

---

### 🔵 [LOW-2] Architectural Coupling in Entry Point

| Attribute  | Value                          |
|------------|--------------------------------|
| **File**   | `backend/server.js:84-269`     |
| **Status** | 🔵 NEEDS ATTENTION (NEW)       |

Significant business logic for Group and User synchronization is implemented directly in `server.js` instead of a dedicated controller. This hinders maintainability, testability, and separation of concerns.

---

### ℹ️ [LOW-3] JWT in sessionStorage

| Attribute  | Value                      |
|------------|----------------------------|
| **File**   | `frontend/js/api.js`       |
| **Status** | ℹ️ INFO (PERSISTENT)       |

Acceptable for internal use if XSS is fixed, but `HttpOnly` cookies are recommended for production deployments.

---

### Users — Remediation Checklist

- [ ] **[CRITICAL]** Remove JWT fallback secret in `authUtil.js`; fail fast with `process.exit(1)` if `JWT_SECRET` is absent
- [ ] **[HIGH]** Protect `GET /api/admin/sync/groups/:id/members` with `authenticateToken` and `authorizeRole(['ADMIN'])`
- [ ] **[MEDIUM]** Replace `.includes()` CORS checks with an exact `Set.has()` allowlist
- [ ] **[LOW]** Replace `res.status(500).json({ error: e.message })` with a generic message; log the full error server-side
- [ ] **[LOW]** Move Group/User sync logic from `server.js` to a dedicated controller

---

## Section 2: Tasks

Findings related to task data access, ownership verification, back-end performance, and integrity of task update logs.

---

### 🔴 [CRITICAL-2] IDOR in Task Access (getMyTasks)

| Attribute  | Value                                                          |
|------------|----------------------------------------------------------------|
| **File**   | `backend/TaskMngmt_APIs/taskController.js:119`                 |
| **Status** | 🔴 VULNERABLE (PERSISTENT / ESCALATED)                         |

**Vulnerable code:**

```js
const userEmail = req.query.email;
```

**Impact:** Any authenticated user can view the private task list of any other employee — including Admins — by simply providing their email in the query string. This bypasses all ownership checks entirely.

**Fix:**

```js
const userEmail = req.user.email;  // read from verified JWT payload
```

---

### 🟠 [HIGH-1] Identity Theft in Task Updates (Impersonation)

| Attribute  | Value                                            |
|------------|--------------------------------------------------|
| **File**   | `backend/TaskMngmt_APIs/taskController.js:435`   |
| **Status** | 🔴 VULNERABLE (NEW)                              |

**Vulnerable code:**

```js
const { taskId, email, notes, statusChange } = req.body;
```

**Impact:** The `logTaskUpdate` endpoint accepts an `email` from the request body to identify the author of the update, with no validation that this email belongs to the authenticated user. An attacker can forge accomplishment logs and activity updates on behalf of any employee.

**Fix:** Replace `email` from the request body with the identity from the verified JWT:

```js
const authorEmail = req.user.email;  // never trust the client-supplied email
```

---

### 🔴 [MEDIUM-1] XSS via innerHTML with Unsanitized Server Data

| Attribute  | Value                      |
|------------|----------------------------|
| **Status** | 🔴 VULNERABLE (PERSISTENT) |

Found in `frontend/js/my-tasks.js`, `dashboard.js`, and `task-board.js`. Server-supplied data is injected directly into the DOM using `.innerHTML` without HTML-encoding.

**Impact:** Stored XSS. An attacker can execute arbitrary JavaScript in the context of other users' browsers to steal JWT tokens from `sessionStorage`.

**Fix — add an HTML escape helper and apply it to every server-supplied value:**

```js
function htmlEsc(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
```

---

### 🟡 [MEDIUM-2] Memory-Intensive Data Filtering (DoS Risk)

| Attribute  | Value                                               |
|------------|-----------------------------------------------------|
| **File**   | `backend/TaskMngmt_APIs/taskController.js:141`      |
| **Status** | 🟡 NEEDS ATTENTION (NEW)                            |

**Vulnerable pattern:**

```js
const rawTasks = await Task.findAll();
const myRawTasks = rawTasks.filter(...)
```

**Impact:** The system fetches every single task in the database into server memory before filtering for the specific user. As the dataset grows, this will cause massive memory spikes and eventual server crashes (Denial of Service).

**Fix:** Push filtering to the database layer:

```js
const myTasks = await Task.findAll({ where: { assignee_email: userEmail } });
```

---

### 🟡 [MEDIUM-3] System Jobs Triggered Inside a Read Handler

| Attribute  | Value                                               |
|------------|-----------------------------------------------------|
| **File**   | `backend/TaskMngmt_APIs/taskController.js:15-70`    |
| **Status** | 🟡 NEEDS ATTENTION (NEW)                            |

`getTasks()` triggers `autoResetStaleTasks()` and performs a database scan for overdue tasks to send notifications **every time any user fetches the task list**.

**Impact:** Significant latency is added to a simple GET request, creating race conditions and unnecessary database load. These operations should be handled by a scheduled background cron job, not inside a request handler.

---

### Tasks — Remediation Checklist

- [ ] **[CRITICAL]** Fix IDOR in `getMyTasks` — use `req.user.email` from the verified JWT payload, not `req.query.email`
- [ ] **[HIGH]** Fix impersonation in `logTaskUpdate` — use `req.user.email` instead of the client-supplied email in the request body
- [ ] **[MEDIUM]** Implement `htmlEsc()` and replace all `.innerHTML` assignments in `my-tasks.js`, `dashboard.js`, and `task-board.js`
- [ ] **[MEDIUM]** Refactor `getMyTasks` to filter tasks via a SQL `WHERE` clause instead of in-memory filtering
- [ ] **[MEDIUM]** Move stale task reset and overdue notification checks to a scheduled background worker (e.g., `node-cron`)

---

## Section 3: Reports

Findings related to the reporting module, including unauthorized access via WebSocket events.

---

### 🟠 [HIGH-3] No Authentication on Report Socket Events

| Attribute  | Value                                              |
|------------|----------------------------------------------------|
| **File**   | `backend/ReportMngmt_APIs/reportHandlers.js`       |
| **Status** | 🔴 VULNERABLE (PERSISTENT)                         |

The following socket events remain **completely unguarded**:

| Event               | Risk                                                             |
|---------------------|------------------------------------------------------------------|
| `getReports`        | Any client can read the full report history                      |
| `getReportDetails`  | Any client can read any report's task and update snapshot        |
| `generateReport`    | Any client can create fake reports attributed to any date range  |
| `deleteReport`      | Any client can permanently delete any report                     |

**Impact:** Full unauthorized control over the reporting system. No credentials are required.

**Fix — add a `verifyAdmin()` guard at the top of the connection handler:**

```js
const { verifyToken } = require('../UserMngmt_APIs/authUtil');

const verifyAdmin = () => {
    const token = socket.handshake.auth?.token;
    const user = verifyToken(token);
    return user && user.role === 'ADMIN';
};

socket.on('getReports', async () => {
    if (!verifyAdmin()) return socket.emit('reportLog', { success: false, rawData: 'Unauthorized.' });
    // ... existing logic
});
// Apply the same guard to getReportDetails, generateReport, and deleteReport
```

---

### 🔴 [MEDIUM-1] XSS via innerHTML with Unsanitized Server Data (Reports)

| Attribute  | Value                          |
|------------|--------------------------------|
| **File**   | `frontend/js/reports.js`       |
| **Status** | 🔴 VULNERABLE (PERSISTENT)     |

Server-supplied data is injected directly into the DOM via `.innerHTML` without HTML-encoding in `reports.js`.

**Impact:** Stored XSS allowing arbitrary JavaScript execution, enabling theft of JWT tokens or exfiltration of report data.

---

### Reports — Remediation Checklist

- [ ] **[HIGH]** Guard all four report socket events in `reportHandlers.js` with `verifyAdmin()` token verification; emit an auth error and return early if the JWT is invalid or missing
- [ ] **[MEDIUM]** Implement `htmlEsc()` and replace all `.innerHTML` assignments in `reports.js`

---

*This report was produced by opencode on 2026-06-12. It highlights a critical lack of remediation of previously discovered vulnerabilities.*

# PAMS-OUS Security Audit Report
**Date:** 2026-06-12  
**Auditor:** opencode  
**Scope:** Full codebase audit -- backend/ and frontend/  
**Branch:** main

---

## Executive Summary

This is a follow-up audit of the PAMS-OUS system. It is concerning to note that **nearly all Critical and High severity vulnerabilities identified in the previous audit (2026-06-11) remain unpatched**. The system continues to be vulnerable to administrative impersonation via JWT fallback secrets, unauthorized access to personnel data (IDOR), and widespread XSS.

Additionally, new architectural and data integrity flaws have been discovered in the task management module, including a critical impersonation vector in the activity logging system and severe performance bottlenecks that could lead to Denial of Service (DoS) as the database grows.

| Severity | Count | Issues |
|----------|-------|--------|
| Critical | 2 | Hardcoded JWT fallback secret, IDOR in getMyTasks |
| High | 3 | Impersonation in logTaskUpdate, Unguarded admin sync route, Unguarded socket events |
| Medium | 4 | XSS via innerHTML, Memory-intensive filtering in getMyTasks, System jobs in GET handler, CORS substring matching |
| Low | 3 | Internal error leaks, Architectural coupling in server.js, JWT in sessionStorage |

---

## Finding Detail

---

### [CRITICAL-1] Hardcoded JWT Fallback Secret
**File:** backend/UserMngmt_APIs/authUtil.js:3  
**Status:** 🔴 VULNERABLE (PERSISTENT)

Observed code:
    const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-this-in-env';

**Impact:** If `JWT_SECRET` is not set in the environment, the system uses a publicly known key. An attacker can forge an Admin token and gain complete control over the system.

---

### [CRITICAL-2] Insecure Direct Object Reference (IDOR) in Task Access
**File:** backend/TaskMngmt_APIs/taskController.js:119  
**Status:** 🔴 VULNERABLE (PERSISTENT/ESCALATED)

Observed code:
    const userEmail = req.query.email;

**Impact:** Any authenticated user can view the private task list of any other employee (including Admins) by providing their email in the query string. This bypasses all ownership checks.

---

### [HIGH-1] Identity Theft in Task Updates (Impersonation)
**File:** backend/TaskMngmt_APIs/taskController.js:435  
**Status:** 🔴 VULNERABLE (NEW)

Observed code:
    const { taskId, email, notes, statusChange } = req.body;

**Impact:** The `logTaskUpdate` endpoint accepts an `email` in the request body to identify the author of the update. There is no validation that this email belongs to the authenticated user. An attacker can forge accomplishment logs and activity updates on behalf of any employee.

---

### [HIGH-2] Unprotected Administrative Endpoint
**File:** backend/server.js:264  
**Status:** 🔴 VULNERABLE (PERSISTENT)

The endpoint `GET /api/admin/sync/groups/:id/members` is registered without `authenticateToken` or `authorizeRole` middleware.

**Impact:** The entire list of employee emails belonging to any group is exposed to the public internet.

---

### [HIGH-3] No Authentication on Report Socket Events
**File:** backend/ReportMngmt_APIs/reportHandlers.js  
**Status:** 🔴 VULNERABLE (PERSISTENT)

The `getReports`, `getReportDetails`, `generateReport`, and `deleteReport` socket events remain unguarded.

**Impact:** Full unauthorized control over the reporting system.

---

### [MEDIUM-1] XSS via innerHTML with Unsanitized Server Data
**Status:** 🔴 VULNERABLE (PERSISTENT)

Found in `frontend/js/my-tasks.js`, `dashboard.js`, `reports.js`, `users-groups.js`, and `task-board.js`. Server-supplied data is injected directly into the DOM using `.innerHTML`.

**Impact:** Stored XSS. An attacker can execute arbitrary JavaScript in the context of other users' browsers to steal JWT tokens.

---

### [MEDIUM-2] Memory-Intensive Data Filtering (DoS Risk)
**File:** backend/TaskMngmt_APIs/taskController.js:141  
**Status:** 🟡 NEEDS-ATTENTION (NEW)

Observed code:
    const rawTasks = await Task.findAll();
    const myRawTasks = rawTasks.filter(...)

**Impact:** The system fetches every single task in the database into server memory before filtering for the specific user. As the dataset grows, this will cause massive memory spikes and eventual server crashes (Denial of Service).

---

### [MEDIUM-3] Improper Triggering of System Jobs in Read Handler
**File:** backend/TaskMngmt_APIs/taskController.js:15-70  
**Status:** 🟡 NEEDS-ATTENTION (NEW)

`getTasks()` triggers `autoResetStaleTasks()` and performs a database scan for overdue tasks to send notifications every time any user fetches the task list.

**Impact:** Significant latency added to a simple GET request. This creates a race condition and unnecessary database load. These should be handled by a background cron job.

---

### [MEDIUM-4] CORS Substring Matching
**File:** backend/UserMngmt_APIs/login.js, backend/server.js  
**Status:** 🟡 NEEDS-ATTENTION (PERSISTENT)

Use of `.includes('localhost')` allows origin spoofing (e.g., `evil-localhost.com`).

---

### [LOW-1] Internal Error Leaks
**File:** Multiple catch blocks (e.g., backend/server.js:121)  
**Status:** 🟡 NEEDS-ATTENTION (PERSISTENT)

`res.status(500).json({ error: e.message })` leaks database schema details to the client.

---

### [LOW-2] Architectural Coupling in Entry Point
**File:** backend/server.js:84-269  
**Status:** 🟡 NEEDS-ATTENTION (NEW)

Significant business logic for Group and User synchronization is implemented directly in `server.js` instead of a dedicated controller. This hinders maintainability and testing.

---

### [LOW-3] JWT in sessionStorage
**File:** frontend/js/api.js  
**Status:** ℹ️ INFO (PERSISTENT)

Acceptable for internal use if XSS is fixed, but HttpOnly cookies are recommended for production.

---

## Remediation Checklist

- [ ] **[CRITICAL]** Remove JWT fallback secret in `authUtil.js`.
- [ ] **[CRITICAL]** Fix IDOR in `getMyTasks` by using `req.user.email`.
- [ ] **[HIGH]** Fix Impersonation in `logTaskUpdate` by using `req.user.id`.
- [ ] **[HIGH]** Protect `/api/admin/sync/groups/:id/members` with `authenticateToken` and `authorizeRole(['ADMIN'])`.
- [ ] **[HIGH]** Guard report socket events in `reportHandlers.js`.
- [ ] **[MEDIUM]** Implement `htmlEsc()` and replace `.innerHTML` across the frontend.
- [ ] **[MEDIUM]** Refactor `getMyTasks` to filter tasks via SQL `WHERE` clause.
- [ ] **[MEDIUM]** Move stale task reset and overdue checks to a background worker (node-cron).
- [ ] **[MEDIUM]** Use exact match allowlist for CORS.
- [ ] **[LOW]** Implement generic error messages for 500 responses.
- [ ] **[LOW]** Move sync routes from `server.js` to a dedicated controller.

---

*This report was produced by opencode on 2026-06-12. It highlights a critical lack of remediation of previously discovered vulnerabilities.*

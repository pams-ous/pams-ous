# SDLC Refactoring Technical Implementation Guide

This guide provides the technical specifications and code-level guidelines for developers executing the code cleanup, modularization, and vulnerability patching phases of the PAMS-OUS MVP.

---

## 1. Security Vulnerability Remediations (Phase 1)

### [CRITICAL-1] Remove JWT Fallback Secret
* **Location**: [backend/UserMngmt_APIs/authUtil.js]
* **Vulnerability**: Fallback key allows offline signing of valid Admin tokens.
* **Remediation**: Remove the string fallback. Throw a critical error if `JWT_SECRET` is missing in the environment on startup.
* **Refactored Pattern**:
  ```javascript
  if (!process.env.JWT_SECRET) {
      console.error("FATAL ERROR: JWT_SECRET environment variable is not defined!");
      process.exit(1);
  }
  const JWT_SECRET = process.env.JWT_SECRET;
  ```

### [CRITICAL-2] Fix IDOR in Task Lists
* **Location**: `getMyTasks` in [backend/TaskMngmt_APIs/taskController.js]
* **Vulnerability**: Users can read other employees' tasks by changing `req.query.email`.
* **Remediation**: Obtain the target user's email strictly from the authenticated token session (`req.user.email`), which is verified by `authenticateToken`.
* **Refactored Pattern**:
  ```javascript
  getMyTasks: async (req, res) => {
      try {
          // Force target email from token session context
          const userEmail = req.user.email; 
          ...
      }
  ```

### [HIGH-1] Prevent Impersonation in Task updates
* **Location**: `logTaskUpdate` in [backend/TaskMngmt_APIs/taskController.js]
* **Vulnerability**: Client supplies `email` in the body, enabling updating on behalf of other users.
* **Remediation**: Map the update author to the database entry by referencing the user ID (`req.user.id`) directly from the token payload. Do not trust `req.body.email`.

### [HIGH-2] Secure Group Members REST Route
* **Location**: [backend/server.js:264]
* **Vulnerability**: `GET /api/admin/sync/groups/:id/members` is completely unprotected.
* **Remediation**: Attach authentication and authorization middlewares to the route.
* **Refactored Pattern**:
  ```javascript
  app.get('/api/admin/sync/groups/:id/members', authenticateToken, authorizeRole(['ADMIN']), async (req, res) => { ... });
  ```

### [HIGH-3] Authenticate Report Socket Events
* **Location**: [backend/ReportMngmt_APIs/reportHandlers.js]
* **Vulnerability**: Socket events lack authentication.
* **Remediation**: Add a helper inside the handlers file to decode and authenticate the token passed during the socket handshake. Reject operations if token is invalid or user is not an Admin.

### [MEDIUM-1] Escape HTML Renderings in Frontend
* **Location**: [frontend/js/api.js] and other script modules.
* **Vulnerability**: Directly embedding user strings into `.innerHTML` leads to Stored XSS.
* **Remediation**:
  1. Add an escaping helper `PAMS.escapeHTML` inside [api.js]:
     ```javascript
     const escapeHTML = (str) => {
         if (!str) return '';
         return String(str)
             .replace(/&/g, '&amp;')
             .replace(/</g, '&lt;')
             .replace(/>/g, '&gt;')
             .replace(/"/g, '&quot;')
             .replace(/'/g, '&#39;');
     };
     ```
  2. For simple text inserts, replace `el.innerHTML = value` with `el.textContent = value`.
  3. When assembling layout strings, sanitize dynamic parameters:
     ```javascript
     // Safe render pattern
     tbody.innerHTML = data.map(t => `
         <tr>
             <td>${PAMS.escapeHTML(t.title)}</td>
         </tr>
     `).join('');
     ```

---

## 2. Modularity & Code Quality (Phase 2 & 3)

### Split CSS Monolith
* **Goal**: Break down [style.css] into modular files.
* **Structure**:
  * `/css/variables.css`: Design variables, color systems, and animation keyframes.
  * `/css/reset.css`: Global baseline element resets.
  * `/css/utilities.css`: Layout classes (`.flex`, `.gap-1`, `.mt-2`, etc.).
  * `/css/components/`: Modular styles for modals, tables, badges, and buttons.
  * `/css/pages/`: Page-specific styling sections (dashboard, task-board, reports, auth).
* **Consolidation**: Create a thin master `/css/style.css` importing the modular blocks using `@import` statements to avoid breaking existing link tags.

### Decouple Sync Routes from `server.js`
* **Goal**: Move user and group sync endpoints from [server.js] to a separate controller.
* **Action**: Create `backend/UserMngmt_APIs/syncController.js` and register routes through a router module.

### SQL-level Task Filtering
* **Goal**: Eradicate memory-heavy Javascript array filtering (`rawTasks.filter(...)`) in `getMyTasks`.
* **Action**: Write a dedicated database query in `taskModel.js` to fetch tasks matched to the user or the user's groups directly in SQL:
  ```sql
  SELECT t.* FROM Tasks t
  LEFT JOIN Employees_Groups eg ON t.assigned_to_group = eg.group_id
  WHERE t.assigned_to_user = ? OR eg.employee_id = ?
  ```

### Background Worker Configuration
* **Goal**: Prevent execution of resetting and overdue check procedures inside HTTP GET handlers.
* **Remediation**:
  1. Add `node-cron` to the backend dependencies.
  2. Extract the procedures into a worker helper `backend/scripts/cronJobs.js`.
  3. Initialize the job in `server.js` to run periodically:
     ```javascript
     const cron = require('node-cron');
     // Run task resets and overdue sweeps hourly
     cron.schedule('0 * * * *', async () => {
         await Task.autoResetStaleTasks();
         await checkOverdueTasksAndNotify();
     });
     ```

### Safe CORS Configurations
* **Goal**: Remove substring checks like `.includes('localhost')`.
* **Remediation**: Compare origins using an explicit array whitelist.
  ```javascript
  const allowedOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000', process.env.FRONTEND_ORIGIN];
  if (allowedOrigins.includes(origin)) {
      callback(null, true);
  }
  ```

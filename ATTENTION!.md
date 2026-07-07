# ATTENTION! — Issues to Address

Found during accomplishments page debugging (Jul 7, 2026). Restarting the backend resolved the immediate problem, but these structural issues remain.

---

## 1. Status enum space vs underscore mismatch

- `backend/TaskMngmt_APIs/taskController.js:247` — `createTask` passes `status: 'in progress'` (space)
- `backend/scripts/dev/seed-dummy.js:175` — same, `status: 'in progress'` (space)
- `database/sql/schema.sql` defines `enum('pending','in_progress','completed','cancelled')` (underscore)

In strict MySQL mode this errors silently. In non-strict mode it inserts an empty string. Fix: pick one convention (spaces everywhere, following the existing schema's underscore pattern) and use it consistently across code, seeds, and migrations.

---

## 2. `updateTask` status change comparison is order-dependent

`taskController.js:353`:
```js
if (status && status.toLowerCase() !== currentStatus) {
```

If DB stores `'in_progress'` (underscore) and the request body sends `'IN PROGRESS'`, then `'in progress'` (space) !== `'in_progress'` (underscore) evaluates to true even though nothing changed — spurious log entry. Normalize both sides to the same format before comparing.

---

## 3. `Task.update()` doesn't set `updated_at`

`backend/TaskMngmt_APIs/taskModel.js:100`:
```js
const query = `UPDATE Tasks SET ${fields.join(', ')} WHERE task_id = ?`;
```

No `updated_at = CURRENT_TIMESTAMP` is included, so title/description edits through the Task Board leave the timestamp stale. Only `Task.logUpdate()` (line 125) sets `updated_at` correctly. Fix: append `, updated_at = CURRENT_TIMESTAMP` to the SET clause.

---

## 4. No transaction wrapping in `updateTask`

`taskController.js:350-366`: `Task.update()` can succeed while `Task.logUpdate()` fails (e.g., ENUM validation from issue #1), leaving the task's status changed with no history logged. These two operations should be wrapped in a database transaction.

---

## 5. `Task.logUpdate` redundantly re-updates Tasks table

`backend/TaskMngmt_APIs/taskModel.js:122-126`:
```js
if (statusChange) {
    const taskStatus = statusChange.toLowerCase().replace('_', ' ');
    const updateTaskQuery = `UPDATE Tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE task_id = ?`;
    await db.query(updateTaskQuery, [taskStatus, taskId]);
}
```

When `logUpdate` is called from `updateTask` (controller line 355), the Tasks table's status was already updated by `Task.update()` (line 350). This second UPDATE is redundant and confusing. Only `logTaskUpdate` (controller line 445) needs this fallback since it may be called independently.

---

## 6. Hardcoded log text "Status forcefully updated via Admin panel"

`taskController.js:355`:
```js
await Task.logUpdate(id, req.user.id, 'Status forcefully updated via Admin panel', newStatus);
```

This text is used for **every** status change — even when a regular member clicks "Mark as Completed." The word "Admin panel" is misleading for non-admin completions. Should use contextual text like `"Task marked as completed"`, `"Task reopened"`, etc., depending on flow.

---

## 7. Accomplishments query uses INNER JOIN, losing data on soft-delete

`backend/TaskMngmt_APIs/dashboardHandlers.js:73-82`:
```sql
FROM Task_Updates tu
JOIN Employees e ON tu.updated_by = e.employee_id
JOIN Tasks t ON tu.task_id = t.task_id
```

- `updated_by` is nullable (SET NULL on employee delete) — INNER JOIN drops those rows from the page entirely
- `task_id` has CASCADE delete — removing a task wipes its update history from the accomplishments view

Consider `LEFT JOIN` for Employees (so deleted-user updates still appear as "Unknown") and/or documenting that task deletion removes their accomplishment history.

---

## 8. Minor: accomplishments endpoint has no auth middleware

`dashboardHandlers.js:70` registers `GET /api/accomplishments` directly on `app` without `authenticateToken`. The frontend guards the page via `requireAuth()` in JS, but the endpoint itself is publicly accessible.

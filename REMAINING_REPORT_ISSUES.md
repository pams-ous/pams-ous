# Remaining Report Generation & Viewing Issues

## ✅ Fixed (in current session)

- ~~No server-side authorization on Socket.IO report handlers~~
- ~~generateReport trusts client-supplied `generatedByEmail` (spoofing)~~

---

## Remaining Issues

### 3. [HIGH] No transaction wrapping in `generateReport`

**File:** `backend/ReportMngmt_APIs/reportHandlers.js:143-194`

The `Report` row is INSERTed first, then `Report_Entries` are inserted in a loop. If the process fails partway (e.g., a query times out, a constraint fails), orphan `Report` rows with no entries will remain in the database.

**Fix:** Wrap the entire multi-step insertion in a SQL transaction (`START TRANSACTION` / `COMMIT` / `ROLLBACK`).

---

### 4. [HIGH] No input validation on `scopeValue`

**File:** `backend/ReportMngmt_APIs/reportHandlers.js:136-141`

- **Individual scope** (`:137`): `scopeValue` is used directly as an email in a SQL query with no format or existence validation. A non-existent email produces a `null` `scopeUserId`, which gets inserted as `NULL` — the report will claim an "Individual" scope but point to no actual user.
- **Group scope** (`:140`): `parseInt(scopeValue)` returns `NaN` for non-numeric input, which MySQL coerces to `0`, potentially pointing to a non-existent group. No check that the group actually exists.

**Fix:** Validate that the resolved user/group exists before inserting; reject with a clear error if not.

---

### 5. [HIGH] No input validation on `periodStart` / `periodEnd`

**File:** `backend/ReportMngmt_APIs/reportHandlers.js:126-127`

The date normalization blindly concatenates `" 00:00:00"` or `" 23:59:59"` without verifying:
- The values are non-empty strings
- They are valid ISO date formats (`YYYY-MM-DD`)
- `periodEnd` is not before `periodStart`

An invalid/malformed date will still be inserted into the `Report` table, producing broken reports downstream.

**Fix:** Validate date format and ordering before proceeding.

---

### 6. [MEDIUM] `getReportDetails` does not validate `reportId`

**File:** `backend/ReportMngmt_APIs/reportHandlers.js:59`

If `reportId` is `null`, `undefined`, or `NaN`, the queries still execute and may return unintended data (e.g., `WHERE re.report_id = NULL` evaluates to false for all rows, returning an empty result silently).

**Fix:** Guard against falsy/non-numeric `reportId` and reject early.

---

### 7. [MEDIUM] No rate limiting on `generateReport` / `deleteReport`

**File:** `backend/ReportMngmt_APIs/reportHandlers.js:120, 224`

A client can spam these events to flood the database with reports, notifications, and broadcast events. No throttling or rate limiting is in place.

**Fix:** Implement in-memory rate limiting (e.g., max 1 generate per 10 seconds per socket).

---

### 8. [MEDIUM] `reportLog` emits inconsistent response shapes

**File:** `backend/ReportMngmt_APIs/reportHandlers.js` — multiple locations

| Stage | Shape |
|-------|-------|
| `getReports` success | `{ success, stage: "list", data }` |
| `getReportDetails` success | `{ success, stage: "details", data }` |
| `generateReport` success | `{ success, stage: "generate", rawData }` |
| `deleteReport` success | `{ success, stage: "delete", rawData }` |
| Any error | `{ success: false, rawData }` (no `stage` field) |

The frontend switch-case in `reports.js:83` depends on `result.stage`, but error responses omit `stage`, so errors fall through without matching any case. (The `if (!result.success)` guard at `:77` catches them first — so it works, but it's fragile.)

**Fix:** Standardise the shape to always include `stage` (even on error), or always include `data` / `rawData` consistently.

---

### 9. [MEDIUM] `getReports` returns all rows with no pagination

**File:** `backend/ReportMngmt_APIs/reportHandlers.js:33-43`

As the `Report` table grows, fetching and transmitting every single row in one response will become a performance bottleneck and overwhelm the client.

**Fix:** Add `LIMIT` / `OFFSET` with pagination parameters from the client.

---

### 10. [LOW] Front-end still sends `generatedByEmail` (dead code)

**File:** `frontend/js/reports.js:815`

The frontend still includes `generatedByEmail: me.email` in the request body, but the backend no longer reads this field. Not harmful, but confusing for future maintainers.

**Fix:** Remove the `generatedByEmail` property from the body object.

---

### 11. [LOW] `deleteReport` does not confirm the report exists

**File:** `backend/ReportMngmt_APIs/reportHandlers.js:233`

`DELETE FROM Report WHERE report_id = ?` silently succeeds even if no row was affected. The notification is still sent, claiming a report was deleted when nothing was removed.

**Fix:** Check `result.affectedRows` and only send notification/response if a row was actually deleted.

---

### 12. [LOW] `initReportModule` migration may race with socket events

**File:** `backend/ReportMngmt_APIs/reportHandlers.js:258-296`

The startup backfill `UPDATE` runs concurrently with `generateReport` / `deleteReport` events if a socket connects before the migration finishes. This could cause a momentary inconsistency in `historical_status`.

**Fix:** Run the migration before `registerReportHandlers` is called, or use a startup flag to defer socket registration until init is complete.

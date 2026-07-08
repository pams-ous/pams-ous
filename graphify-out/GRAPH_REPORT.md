# Graph Report - .  (2026-07-08)

## Corpus Check
- 77 files · ~63,364 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 380 nodes · 622 edges · 45 communities (28 shown, 17 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 41 edges (avg confidence: 0.57)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Authentication & Authorization|Authentication & Authorization]]
- [[_COMMUNITY_Report Controller|Report Controller]]
- [[_COMMUNITY_Backend Dependencies|Backend Dependencies]]
- [[_COMMUNITY_Email & OTP Service|Email & OTP Service]]
- [[_COMMUNITY_Server Launcher & ngrok|Server Launcher & ngrok]]
- [[_COMMUNITY_User & Group Management UI|User & Group Management UI]]
- [[_COMMUNITY_System Architecture|System Architecture]]
- [[_COMMUNITY_OTP Client Modal|OTP Client Modal]]
- [[_COMMUNITY_Database Seeding & Reset|Database Seeding & Reset]]
- [[_COMMUNITY_Task Model & Database|Task Model & Database]]
- [[_COMMUNITY_Reports UI|Reports UI]]
- [[_COMMUNITY_Task Board UI|Task Board UI]]
- [[_COMMUNITY_Dummy Data Seeding|Dummy Data Seeding]]
- [[_COMMUNITY_Security Architecture|Security Architecture]]
- [[_COMMUNITY_Dashboard UI|Dashboard UI]]
- [[_COMMUNITY_My Tasks UI|My Tasks UI]]
- [[_COMMUNITY_Documentation|Documentation]]
- [[_COMMUNITY_Approval Migration Script|Approval Migration Script]]
- [[_COMMUNITY_Public Pages|Public Pages]]
- [[_COMMUNITY_Accomplishments UI|Accomplishments UI]]
- [[_COMMUNITY_CORS & ngrok Config|CORS & ngrok Config]]
- [[_COMMUNITY_Frontend Config|Frontend Config]]
- [[_COMMUNITY_Backend Environment Template|Backend Environment Template]]
- [[_COMMUNITY_Backend Notes|Backend Notes]]
- [[_COMMUNITY_OTP Setup Docs|OTP Setup Docs]]
- [[_COMMUNITY_System Users Fix Docs|System Users Fix Docs]]
- [[_COMMUNITY_Encoder Migration Docs|Encoder Migration Docs]]
- [[_COMMUNITY_OUS Building Image|OUS Building Image]]
- [[_COMMUNITY_PUP OUS Seal Image|PUP OUS Seal Image]]
- [[_COMMUNITY_Accomplishments Page|Accomplishments Page]]
- [[_COMMUNITY_Dashboard Page|Dashboard Page]]
- [[_COMMUNITY_My Tasks Page|My Tasks Page]]
- [[_COMMUNITY_Users & Groups Page|Users & Groups Page]]
- [[_COMMUNITY_CICD Deploy|CI/CD Deploy]]
- [[_COMMUNITY_Server Launch Instructions|Server Launch Instructions]]

## God Nodes (most connected - your core abstractions)
1. `generateAndSendOtp()` - 16 edges
2. `authenticateToken()` - 15 edges
3. `recordNotification()` - 15 edges
4. `getEmployeeDetails()` - 12 edges
5. `formatFullName()` - 12 edges
6. `PAMS OUS System` - 12 edges
7. `showModal()` - 11 edges
8. `verifyToken()` - 10 edges
9. `authorizeRole()` - 9 edges
10. `verifyOtp()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `Audit-Proof Report Snapshots` --conceptually_related_to--> `PAMS OUS System`  [EXTRACTED]
  README.md → AGENTS.md
- `Key Architecture Decisions Summary` --references--> `CommonJS Backend Module System`  [EXTRACTED]
  README.md → AGENTS.md
- `Momentum-First Kanban Task Board` --conceptually_related_to--> `Task Status Lifecycle`  [INFERRED]
  README.md → AGENTS.md
- `Momentum-First Kanban Task Board` --references--> `Task Board Page`  [INFERRED]
  README.md → frontend/pages/task-board.html
- `Audit-Proof Report Snapshots` --references--> `Reports Page`  [INFERRED]
  README.md → frontend/pages/reports.html

## Import Cycles
- 3-file cycle: `backend/ReportMngmt_APIs/reportController.js -> backend/server.js -> backend/ReportMngmt_APIs/reportRoutes.js -> backend/ReportMngmt_APIs/reportController.js`
- 4-file cycle: `backend/TaskMngmt_APIs/db.js -> backend/server.js -> backend/TaskMngmt_APIs/taskRoutes.js -> backend/TaskMngmt_APIs/taskController.js -> backend/TaskMngmt_APIs/db.js`
- 5-file cycle: `backend/TaskMngmt_APIs/db.js -> backend/server.js -> backend/TaskMngmt_APIs/taskRoutes.js -> backend/TaskMngmt_APIs/taskController.js -> backend/TaskMngmt_APIs/taskModel.js -> backend/TaskMngmt_APIs/db.js`

## Hyperedges (group relationships)
- **Authenticated Pages with Shared Sidebar** — frontend_pages_dashboard_dashboard_page, frontend_pages_my_tasks_my_tasks_page, frontend_pages_task_board_task_board_page, frontend_pages_reports_reports_page, frontend_pages_users_groups_users_groups_page, frontend_pages_accomplishments_accomplishments_page [EXTRACTED 1.00]
- **Authentication System Components** — agents_jwt_auth, agents_otp_verification, agents_argon2_hashing, agents_rbac, agents_session_storage [EXTRACTED 1.00]
- **Key Architecture Decisions** — agents_single_entry_architecture, agents_co_located_socket_io, agents_vanilla_js_frontend, agents_commonjs_backend, agents_namespaced_globals, agents_boot_js_auth_guard [EXTRACTED 1.00]

## Communities (45 total, 17 thin omitted)

### Community 0 - "Authentication & Authorization"
Cohesion: 0.07
Nodes (56): authenticateToken(), authorizeRole(), { verifyToken }, generateToken(), jwt, verifyToken(), getEmployeeDetails(), ifEmployeeExists() (+48 more)

### Community 1 - "Report Controller"
Cohesion: 0.05
Nodes (41): db, { formatFullName }, { recordNotification }, checkRateLimit(), { formatFullName }, initReportModule(), rateLimitMap, { recordNotification } (+33 more)

### Community 2 - "Backend Dependencies"
Cohesion: 0.07
Nodes (29): author, dependencies, argon2, cors, dotenv, express, jsonwebtoken, mysql2 (+21 more)

### Community 3 - "Email & OTP Service"
Cohesion: 0.11
Nodes (26): buildHtml(), getTransporter(), nodemailer, purposeCopy(), sendOtpEmail(), { generateAndSendOtp, verifyOtp }, { generateToken }, { getEmployeeDetails } (+18 more)

### Community 4 - "Server Launcher & ngrok"
Cohesion: 0.15
Nodes (27): BACKEND_DIR, broadcast(), cleanup(), clearLog(), envPath, fetchNgrokUrl(), fs, handleAPI() (+19 more)

### Community 5 - "User & Group Management UI"
Cohesion: 0.17
Nodes (15): applyGroupSort(), applyUserSort(), createCustomDropdownHtml(), getGroupSortValue(), getSortValue(), hideSearching(), initGroupSearch(), initUserEmailSearch() (+7 more)

### Community 6 - "System Architecture"
Cohesion: 0.13
Nodes (20): Backend Module Organization (UserMngmt/TaskMngmt/ReportMngmt), boot.js Auth Guard Pattern, Co-located Socket.IO Listeners, CommonJS Backend Module System, GitHub Actions CI/CD, Global Frontend Script Organization, MySQL Connection Pool (people database), Namespaced Global Frontend Objects (PAMS/PAMS_UI/PAMSOtp/CONFIG) (+12 more)

### Community 7 - "OTP Client Modal"
Cohesion: 0.29
Nodes (16): buildModal(), emitAndWait(), escapeHtml(), getSocket(), mockShowModal(), purposeCopy(), readCode(), runLoginOtp() (+8 more)

### Community 8 - "Database Seeding & Reset"
Cohesion: 0.17
Nodes (14): mysql, reset(), argon2, args, crypto, fs, getArgValue(), hasFlag() (+6 more)

### Community 9 - "Task Model & Database"
Cohesion: 0.14
Nodes (10): db, db, { formatFullName }, { recordNotification }, Task, db, { authenticateToken, authorizeRole }, express (+2 more)

### Community 10 - "Reports UI"
Cohesion: 0.25
Nodes (12): getDisplayedReports(), loadReports(), renderChart(), renderHistory(), renderPagination(), renderPrintReport(), renderReportPreview(), renderTimeline() (+4 more)

### Community 11 - "Task Board UI"
Cohesion: 0.38
Nodes (8): applyAllFilters(), buildFilterOptions(), buildRow(), loadAll(), populateAssigneeSelects(), renderList(), updateOverdueBanner(), wireRibbon()

### Community 12 - "Dummy Data Seeding"
Cohesion: 0.29
Nodes (7): argon2, crypto, daysFromNow(), GROUPS, MEMBERS, mysql, seed()

### Community 13 - "Security Architecture"
Cohesion: 0.33
Nodes (6): Argon2 Password Hashing, JWT Bearer Token Authentication, OTP Delivery Modes (console/email/both), Email OTP Verification, Four-Tier Role-Based Access Control, localStorage Session Storage Pattern

### Community 14 - "Dashboard UI"
Cohesion: 0.60
Nodes (3): refreshStats(), renderStats(), startPolling()

### Community 15 - "My Tasks UI"
Cohesion: 0.60
Nodes (3): applySearch(), loadTasks(), renderTasks()

### Community 16 - "Documentation"
Cohesion: 0.50
Nodes (4): PAMS-OUS User Manual, ngrok Public Tunnel, Report Snapshot System, Task Management Board

### Community 18 - "Public Pages"
Cohesion: 1.00
Nodes (3): Login / Registration Page, Landing Page, Terms and Conditions Page

## Knowledge Gaps
- **162 isolated node(s):** `db`, `{ recordNotification }`, `{ formatFullName }`, `{ recordNotification }`, `{ formatFullName }` (+157 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **17 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `generateAndSendOtp()` connect `Email & OTP Service` to `Authentication & Authorization`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **Why does `recordNotification()` connect `Authentication & Authorization` to `Report Controller`, `Task Model & Database`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **Why does `formatFullName()` connect `Authentication & Authorization` to `Report Controller`, `Task Model & Database`?**
  _High betweenness centrality (0.005) - this node is a cross-community bridge._
- **Are the 6 inferred relationships involving `authenticateToken()` (e.g. with `dashboardAPI()` and `authMiddleware.js`) actually correct?**
  _`authenticateToken()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **What connects `db`, `{ recordNotification }`, `{ formatFullName }` to the rest of the system?**
  _166 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Authentication & Authorization` be split into smaller, more focused modules?**
  _Cohesion score 0.07307692307692308 - nodes in this community are weakly interconnected._
- **Should `Report Controller` be split into smaller, more focused modules?**
  _Cohesion score 0.04964539007092199 - nodes in this community are weakly interconnected._
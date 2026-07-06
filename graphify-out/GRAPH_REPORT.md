# Graph Report - D:\Development Environment\Web\production\pams-ous  (2026-07-06)

## Corpus Check
- 85 files · ~88,077 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 71 nodes · 114 edges · 10 communities (8 shown, 2 thin omitted)
- Extraction: 89% EXTRACTED · 8% INFERRED · 3% AMBIGUOUS · INFERRED: 9 edges (avg confidence: 0.89)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_System Architecture & Database|System Architecture & Database]]
- [[_COMMUNITY_User Interface & OTP Auth|User Interface & OTP Auth]]
- [[_COMMUNITY_Security Audit Findings I|Security Audit Findings I]]
- [[_COMMUNITY_Security Audit Findings II|Security Audit Findings II]]
- [[_COMMUNITY_Legal & Institutional Context|Legal & Institutional Context]]
- [[_COMMUNITY_Frontend Pages & Navigation|Frontend Pages & Navigation]]
- [[_COMMUNITY_Technical Strategy & Refactoring|Technical Strategy & Refactoring]]
- [[_COMMUNITY_Critical Security Issues|Critical Security Issues]]
- [[_COMMUNITY_Backend Documentation|Backend Documentation]]
- [[_COMMUNITY_Deployment Instructions|Deployment Instructions]]

## God Nodes (most connected - your core abstractions)
1. `PAMS-OUS Project` - 15 edges
2. `Personnel Accomplishment Management System` - 14 edges
3. `Security Audit 2026-06-05` - 13 edges
4. `Security Audit 2026-06-11` - 12 edges
5. `Security Audit 2026-06-12` - 12 edges
6. `PAMS-OUS User Manual` - 6 edges
7. `Dashboard Page` - 6 edges
8. `Reports Page` - 6 edges
9. `Frontend Sidebar Navigation System` - 6 edges
10. `Email OTP Verification System` - 5 edges

## Surprising Connections (you probably didn't know these)
- `Reference Image` --conceptually_related_to--> `Frontend Sidebar Navigation System`  [AMBIGUOUS]
  frontend/references/image.png → frontend/pages/dashboard.html
- `Deploy Frontend to GitHub Pages` --conceptually_related_to--> `PAMS-OUS Project`  [EXTRACTED]
  .github/workflows/deploy.yml → AGENTS.md
- `SDLC Refactoring Technical Implementation Guide` --conceptually_related_to--> `PAMS-OUS Project`  [EXTRACTED]
  SDLC_Refactoring_Implementation.md → AGENTS.md
- `SDLC Refactoring & Security Remediation Plan` --conceptually_related_to--> `PAMS-OUS Project`  [EXTRACTED]
  SDLC_Refactoring_Plan.md → AGENTS.md
- `Email OTP Verification System` --conceptually_related_to--> `Backend Environment Template`  [INFERRED]
  AGENTS.md → backend/env.example.txt

## Hyperedges (group relationships)
- **Authentication and Security Stack** — agents_md_jwt_auth, agents_md_otp_system, agents_md_argon2, agents_md_rbac [EXTRACTED 1.00]
- **Backend Server Architecture** — agents_md_serverjs_architecture, agents_md_mysql_people, agents_md_socketio, agents_md_database_migrations, agents_md_designations [EXTRACTED 1.00]
- **SDLC Refactoring Program** — sdlc_plan_implementation_security_patches, sdlc_plan_implementation_modularization, sdlc_plan_implementation_performance [EXTRACTED 1.00]
- **Frontend Architecture** — agents_md_frontend_vanilla_js, frontend_docus_css_design, frontend_docus_frontend_namespaces, frontend_docus_notification_system [INFERRED 0.95]
- **PAMS Security Audit Series** — security_security_audit_2026_06_05_audit_paper, security_security_audit_2026_06_11_audit_paper, security_security_audit_2026_06_12_audit_paper [EXTRACTED 1.00]
- **Frontend Main Navigation** — frontend_pages_dashboard_dashboard_page, frontend_pages_task_board_task_board_page, frontend_pages_my_tasks_my_tasks_page [EXTRACTED 1.00]
- **Frontend Admin Management Pages** — frontend_pages_reports_reports_page, frontend_pages_users_groups_users_groups_page [EXTRACTED 1.00]
- **Missing Authentication Security Findings** — rationale_hardcoded_jwt_fallback_secret, rationale_unauthorized_report_socket_events, rationale_unprotected_admin_sync_routes [INFERRED 0.95]
- **XSS and CORS Security Findings** — rationale_xss_via_innerhtml, rationale_cors_substring_matching [INFERRED 0.85]

## Communities (10 total, 2 thin omitted)

### Community 0 - "System Architecture & Database"
Cohesion: 0.15
Nodes (17): Argon2 Password Hashing, Database Migration Framework, Employee Designations and Job Titles, Vanilla JS No-Framework Frontend, MySQL people Database, Personnel Accomplishment Management System, Role-Based Access Control, server.js Single Entry Architecture (+9 more)

### Community 1 - "User Interface & OTP Auth"
Cohesion: 0.21
Nodes (12): Agent Guidance for PAMS-OUS, Email OTP Verification System, PAMS-OUS Project, PUP Open University System, Backend Environment Template, PAMS-OUS OTP Setup, Sign In – PUP OUS - PAMS, CSS Design System Maroon Gold (+4 more)

### Community 2 - "Security Audit Findings I"
Cohesion: 0.25
Nodes (8): Argon2 Password Hashing, Parameterized Query SQL Injection Protection, IDOR in getMyTasks, Login Info Disclosure, No Rate Limiting on Auth Endpoints, Centralized Password Policy Remediation, Plaintext OTP in Database, Security Audit 2026-06-05

### Community 3 - "Security Audit Findings II"
Cohesion: 0.25
Nodes (8): Architectural Coupling in server.js Entry Point, CORS Substring Matching, Error Responses Leak Internal Details, Impersonation in logTaskUpdate, Memory-Intensive Data Filtering (DoS Risk), System Jobs Triggered Inside GET Handler, XSS via innerHTML, Security Audit 2026-06-12

### Community 4 - "Legal & Institutional Context"
Cohesion: 0.38
Nodes (7): Data Privacy Act of 2012 (RA 10173), PAMS Personnel Accomplishment Monitoring System, PUP Office of the University Secretary, OUS Building Image, PUP OUS Seal Image, PAMS Landing Page, Terms and Conditions Page

### Community 5 - "Frontend Pages & Navigation"
Cohesion: 0.76
Nodes (7): Frontend Sidebar Navigation System, Dashboard Page, My Tasks Page, Reports Page, Task Board Page, Users & Groups Page, Reference Image

### Community 6 - "Technical Strategy & Refactoring"
Cohesion: 0.33
Nodes (6): JWT Bearer Token Authentication, Code Modularization Strategy, Performance Optimization Strategy, Security Vulnerability Patches, SDLC Refactoring Technical Implementation Guide, SDLC Refactoring & Security Remediation Plan

### Community 7 - "Critical Security Issues"
Cohesion: 0.83
Nodes (4): Hardcoded JWT Fallback Secret, Unauthorized Report Socket Events, Unprotected Admin Sync Routes, Security Audit 2026-06-11

## Ambiguous Edges - Review These
- `OUS Building Image` → `PUP Office of the University Secretary`  [AMBIGUOUS]
  frontend/assets/ous_building.webp · relation: conceptually_related_to
- `PUP OUS Seal Image` → `PUP Office of the University Secretary`  [AMBIGUOUS]
  frontend/assets/pup_ous_seal.webp · relation: conceptually_related_to
- `Reference Image` → `Frontend Sidebar Navigation System`  [AMBIGUOUS]
  frontend/references/image.png · relation: conceptually_related_to

## Knowledge Gaps
- **14 isolated node(s):** `Agent Guidance for PAMS-OUS`, `PUP OUS – Personnel Accomplishment Management System (PAMS)`, `Backend Notes and Documentation`, `PUP Open University System`, `Role-Based Access Control` (+9 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `OUS Building Image` and `PUP Office of the University Secretary`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `PUP OUS Seal Image` and `PUP Office of the University Secretary`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Reference Image` and `Frontend Sidebar Navigation System`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `PAMS-OUS Project` connect `User Interface & OTP Auth` to `System Architecture & Database`, `Technical Strategy & Refactoring`?**
  _High betweenness centrality (0.134) - this node is a cross-community bridge._
- **Why does `Personnel Accomplishment Management System` connect `System Architecture & Database` to `User Interface & OTP Auth`, `Technical Strategy & Refactoring`?**
  _High betweenness centrality (0.110) - this node is a cross-community bridge._
- **Why does `Security Audit 2026-06-12` connect `Security Audit Findings II` to `Security Audit Findings I`, `Critical Security Issues`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `Personnel Accomplishment Management System` (e.g. with `Report Snapshot System` and `Task Management Board`) actually correct?**
  _`Personnel Accomplishment Management System` has 2 INFERRED edges - model-reasoned connections that need verification._
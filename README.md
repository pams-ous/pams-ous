# PAMS: Personnel Accomplishment Management System
### Polytechnic University of the Philippines - Open University System (PUP OUS)

An alpha-stage production system designed to streamline task tracking, personnel management, and accomplishment reporting within the PUP OUS.

---

## Developer Roadmap

This roadmap outlines the core phases for taking PAMS from alpha to production.

### Phase 1: Backend Core & User Management (Current)
- [x] Initial Database Schema (`schema.sql`)
- [x] Password Hashing with Argon2
- [ ] Centralize Express App (`app.js`)
- [ ] Complete User Login/Registration flow
- [ ] Implement Session/JWT Authentication

### Phase 2: Task Management System
- [ ] Build Task CRUD APIs (Create, Read, Update, Delete)
- [ ] Implement Task Assignment (Individual & Group-based)
- [ ] Create Task Update Logging (Status changes & attachments)
- [ ] Frontend Dashboard for Task Overview

### Phase 3: Reports & Analytics
- [ ] Build Report Generation Logic (Daily, Weekly, Annual)
- [ ] Implement Automated Data Aggregation for `Report_Entries`
- [ ] Export features (PDF/Print-friendly views)

### Phase 4: Real-time & UI Polish
- [ ] Integrate Socket.io for live notifications on task assignments
- [ ] Finalize Frontend styling using the PAMS Design System
- [ ] Form validation and error handling across all views

### Phase 5: Deployment & Production
- [ ] Environment Variable configuration (`.env`)
- [ ] Production Database Migration
- [ ] PM2 Process Management setup
- [ ] Security hardening and final testing

---
*Last Updated: May 27, 2026*

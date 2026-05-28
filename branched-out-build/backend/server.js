// IM-PAMS-OUS backend entry point.
// Single Express app on port 5000 exposing /api/* routes consumed by the frontend.
//
// To run:
//   npm install
//   npm run dev        (or)   node server.js
//
// The frontend (any of the *.html pages under /frontend) calls into this API.
// Make sure your MySQL server is running and PAMS_OUS.sql has been imported.
//
// Env vars (loaded from backend/.env via dotenv):
//   SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM
//   JWT_SECRET, RESET_SECRET (optional — dev defaults in auth.js)
//
// dotenv must be the very first require so every downstream module
// (mailer, auth) sees the populated process.env.
require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const express = require("express");
const cors    = require("cors");

const db = require("./db");

const { authRouter }          = require("./UserMngmt_APIs/auth");
const { usersRouter }         = require("./UserMngmt_APIs/users");
const { designationsRouter }  = require("./UserMngmt_APIs/designations");
const { tasksRouter }         = require("./TaskMgmt_APIs/tasks");
const { taskUpdatesRouter }   = require("./TaskMgmt_APIs/taskUpdates");
const { taskGroupsRouter }    = require("./TaskMgmt_APIs/taskGroups");
const { reportsRouter }       = require("./ReportMgmt_APIs/reports");
const { reportEntriesRouter } = require("./ReportMgmt_APIs/reportEntries");
const { dashboardRouter }     = require("./routes/DashboardMgmt_APIs/dashboard");
const { notificationsRouter } = require("./UserMngmt_APIs/notifications");
const { applyMigrations }     = require("./lib/migrations");
const { verifySmtpAtBoot }    = require("./lib/mailer");

const app = express();

// CORS — frontend may be served via Live Server (127.0.0.1:5500),
// VSCode preview, or opened as file://. Allow all in dev.
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));

// Health check
app.get("/api/health", async (_req, res) => {
    try {
        await db.query("SELECT 1");
        res.json({ ok: true, db: "connected" });
    } catch (err) {
        res.status(500).json({ ok: false, db: "disconnected", error: err.message });
    }
});

// Mount routers
app.use("/api/auth",           authRouter(db));
app.use("/api/users",          usersRouter(db));
app.use("/api/designations",   designationsRouter(db));
app.use("/api/tasks",          tasksRouter(db));
app.use("/api/task-updates",   taskUpdatesRouter(db));
app.use("/api/groups",         taskGroupsRouter(db));
app.use("/api/reports",        reportsRouter(db));
app.use("/api/report-entries", reportEntriesRouter(db));
app.use("/api/dashboard",      dashboardRouter(db));
app.use("/api/notifications",  notificationsRouter(db));

// 404 fallback
app.use((req, res) => {
    res.status(404).json({ message: `No route for ${req.method} ${req.path}` });
});

// Centralized error handler (catches anything routes forget to handle)
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
    console.error("Unhandled error:", err);
    res.status(500).json({ message: "Internal server error." });
});

const PORT = process.env.PORT || 5000;

// Run schema migrations once on boot, then start listening. If migrations fail
// we still start the server (so health-check is reachable) but log loudly —
// most routes will then 500 on first query, which is the correct signal.
applyMigrations(db).catch(err => {
    console.error("⚠ Migration failure:", err.message);
}).finally(async () => {
    // Verify the SMTP transport once at boot. Surfaces bad App Passwords
    // immediately rather than at the moment a user tries to reset.
    await verifySmtpAtBoot();

    app.listen(PORT, () => {
        console.log(`╔════════════════════════════════════════════════════╗`);
        console.log(`║  IM-PAMS-OUS API listening on port ${PORT}              ║`);
        console.log(`║  Health: http://localhost:${PORT}/api/health           ║`);
        console.log(`╚════════════════════════════════════════════════════╝`);
    });
});

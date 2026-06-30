/**
 * config.js
 * Purpose: Centralized configuration for the PUP OUS - PAMS Frontend.
 */

// Resolve the backend origin.
// - If the page is already served by the backend (same origin), use it as-is.
// - If served by a separate frontend dev server (e.g. Live Server on :5500),
//   fall back to the backend on port 3000 on the same hostname.
const BACKEND_PORT = '3000';
const BACKEND_ORIGIN = (window.location.port && window.location.port !== BACKEND_PORT)
    ? `${window.location.protocol}//${window.location.hostname}:${BACKEND_PORT}`
    : window.location.origin;

const CONFIG = {
    // Backend API Configuration
    API_BASE_URL: BACKEND_ORIGIN,

    // Backend Socket.IO server
    BACKEND_SOCKET_URL: BACKEND_ORIGIN,

    // System Metadata
    SYSTEM_NAME: 'PUP OUS - PAMS',
    VERSION: '0.1.0-alpha',

    // UI Settings
    DEFAULT_DATE_LOCALE: 'en-PH',

    // Feature Flags (for transition from prototype to production)
    USE_MOCK_API: false,

    // OTP Settings — kept in sync with backend/.env (OTP_CODE_LENGTH, OTP_TTL_MINUTES)
    OTP: {
        CODE_LENGTH: 6,
        TTL_MINUTES: 5,
        RESEND_COOLDOWN_SECONDS: 30
    }
};

// Freeze the config object to prevent accidental runtime modifications
if (Object.freeze) {
    Object.freeze(CONFIG);
    Object.freeze(CONFIG.OTP);
}

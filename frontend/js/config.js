/**
 * config.js
 * Purpose: Centralized configuration for the PUP OUS - PAMS Frontend.
 */

const CONFIG = {
    // Backend API Configuration
    // Dynamically use the current origin (works for 127.0.0.1:3000, ngrok, or production)
    // If using a separate frontend dev server (e.g. Live Server on 5500), 
    // you can hardcode the backend URL here.
    API_BASE_URL: window.location.origin,

    // Backend Socket.IO server
    BACKEND_SOCKET_URL: window.location.origin,

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

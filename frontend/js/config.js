/**
 * config.js
 * Purpose: Centralized configuration for the PUP OUS - PAMS Frontend.
 */

const CONFIG = {
    // Backend API Configuration
    // API_BASE_URL: 'http://localhost:3000', // Production/Local Backend
    API_BASE_URL: 'http://127.0.0.1:5500', // Typical local development (e.g., Live Server)

    // Backend Socket.IO server (real PAMS backend — see backend/UserMngmt_APIs/login.js)
    BACKEND_SOCKET_URL: 'http://127.0.0.1:3000',

    // System Metadata
    SYSTEM_NAME: 'PUP OUS - PAMS',
    VERSION: '0.1.0-alpha',

    // UI Settings
    DEFAULT_DATE_LOCALE: 'en-PH',

    // Feature Flags (for transition from prototype to production)
    USE_MOCK_API: true,

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

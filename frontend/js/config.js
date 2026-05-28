/**
 * config.js
 * Purpose: Centralized configuration for the PUP OUS - PAMS Frontend.
 */

const CONFIG = {
    // Backend API Configuration
    // API_BASE_URL: 'http://localhost:3000', // Production/Local Backend
    API_BASE_URL: 'http://127.0.0.1:5500', // Typical local development (e.g., Live Server)
    
    // System Metadata
    SYSTEM_NAME: 'PUP OUS - PAMS',
    VERSION: '0.1.0-alpha',
    
    // UI Settings
    DEFAULT_DATE_LOCALE: 'en-PH',
    
    // Feature Flags (for transition from prototype to production)
    USE_MOCK_API: true, 
};

// Freeze the config object to prevent accidental runtime modifications
if (Object.freeze) {
    Object.freeze(CONFIG);
}

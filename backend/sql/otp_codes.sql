-- PAMS-OUS — OTP code storage
-- Run once against the `people` database.

CREATE TABLE IF NOT EXISTS otp_codes (
    otp_id         CHAR(36)      NOT NULL,
    email          VARCHAR(255)  NOT NULL,
    code_hash      VARCHAR(255)  NOT NULL,             -- argon2 hash of the OTP
    channel        VARCHAR(16)   NOT NULL DEFAULT 'email',
    purpose        VARCHAR(32)   NOT NULL,              -- 'login', 'registration', 'password_reset'
    payload        JSON          NULL,                  -- pending registration data, etc.
    expires_at     DATETIME      NOT NULL,
    used_at        DATETIME      NULL,
    attempts       INT           NOT NULL DEFAULT 0,
    created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (otp_id),
    INDEX idx_email_purpose (email, purpose),
    INDEX idx_expires (expires_at)
);

const crypto = require("crypto");
const argon2 = require("argon2");
const { sendOtpEmail } = require("./mailer");
const { sendOtpSMS } = require("./smsAdapter");

const VALID_PURPOSES = new Set(["login", "registration", "password_reset"]);
const VALID_CHANNELS = new Set(["email", "sms"]);

function generateNumericCode(length) {
    let out = "";
    for (let i = 0; i < length; i++) {
        out += crypto.randomInt(0, 10).toString();
    }
    return out;
}

function ttlMinutes() {
    return Number(process.env.OTP_TTL_MINUTES || 5);
}

function maxAttempts() {
    return Number(process.env.OTP_MAX_ATTEMPTS || 5);
}

function codeLength() {
    return Number(process.env.OTP_CODE_LENGTH || 6);
}

// OTP_DELIVERY controls how the plaintext code is surfaced.
//   email   (default) — send via Gmail SMTP. No plaintext is ever stored.
//   console           — DEV ONLY. Skip email; log to nodemon stdout and stash the
//                       plaintext in otp_codes.payload.__dev_code so you can read
//                       it from MySQL (Workbench / phpMyAdmin). Never use in prod.
//   both              — Send the email AND log+store. Useful when verifying that
//                       email delivery works alongside local testing.
function deliveryMode() {
    return (process.env.OTP_DELIVERY || "email").toLowerCase();
}

function logCodeToConsole({ email, purpose, code, channel }) {
    const ttl = ttlMinutes();
    const border = "═".repeat(54);
    console.log("");
    console.log(`╔${border}╗`);
    console.log(`║  PAMS DEV OTP  (channel=${channel}, purpose=${purpose})`.padEnd(55) + "║");
    console.log(`║  To:      ${email}`.padEnd(55) + "║");
    console.log(`║  Code:    ${code}`.padEnd(55) + "║");
    console.log(`║  Expires: ${ttl} minutes`.padEnd(55) + "║");
    console.log(`╚${border}╝`);
    console.log("");
}

async function generateAndSendOtp(db, { email, channel = "email", purpose, payload = null }) {
    if (!email) throw new Error("email is required");
    if (!VALID_PURPOSES.has(purpose)) throw new Error(`invalid purpose: ${purpose}`);
    if (!VALID_CHANNELS.has(channel)) throw new Error(`invalid channel: ${channel}`);

    // Invalidate any older un-used codes for the same email+purpose so a fresh request
    // always supersedes them. (Prevents an attacker from racing on stale codes.)
    await db.query(
        `UPDATE otp_codes SET used_at = NOW()
         WHERE email = ? AND purpose = ? AND used_at IS NULL AND expires_at > NOW();`,
        [email, purpose]
    );

    const code = generateNumericCode(codeLength());
    const codeHash = await argon2.hash(code);
    const otpId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + ttlMinutes() * 60 * 1000);

    const mode = deliveryMode();
    const includesLocal = mode === "console" || mode === "both";
    const includesEmail = mode === "email" || mode === "both";

    // In local/dev modes, stash plaintext in payload so it's queryable from MySQL.
    // Production default (`email`) never touches the plaintext after sending.
    const storedPayload = includesLocal
        ? { ...(payload || {}), __dev_code: code }
        : payload;

    await db.query(
        `INSERT INTO otp_codes (otp_id, email, code_hash, channel, purpose, payload, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?);`,
        [otpId, email, codeHash, channel, purpose, storedPayload ? JSON.stringify(storedPayload) : null, expiresAt]
    );

    if (includesLocal) {
        logCodeToConsole({ email, purpose, code, channel });
    }

    if (includesEmail) {
        if (channel === "email") {
            await sendOtpEmail(email, code, purpose);
        } else if (channel === "sms") {
            await sendOtpSMS(email, code, purpose);
        }
    }

    return { otpId, expiresAt };
}

async function verifyOtp(db, { email, purpose, code }) {
    if (!email || !code) {
        return { ok: false, reason: "Email and code are required." };
    }
    if (!VALID_PURPOSES.has(purpose)) {
        return { ok: false, reason: `Invalid purpose: ${purpose}` };
    }

    const [rows] = await db.query(
        `SELECT otp_id, code_hash, payload, expires_at, used_at, attempts
         FROM otp_codes
         WHERE email = ? AND purpose = ?
         ORDER BY created_at DESC
         LIMIT 1;`,
        [email, purpose]
    );

    if (!rows || rows.length === 0) {
        return { ok: false, reason: "No verification code on record. Please request a new one." };
    }

    const row = rows[0];

    if (row.used_at) {
        return { ok: false, reason: "This code has already been used. Please request a new one." };
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
        return { ok: false, reason: "This code has expired. Please request a new one." };
    }
    if (row.attempts >= maxAttempts()) {
        return { ok: false, reason: "Too many incorrect attempts. Please request a new code." };
    }

    const matches = await argon2.verify(row.code_hash, String(code));

    if (!matches) {
        await db.query(
            `UPDATE otp_codes SET attempts = attempts + 1 WHERE otp_id = ?;`,
            [row.otp_id]
        );
        return { ok: false, reason: "Incorrect code. Please try again." };
    }

    await db.query(
        `UPDATE otp_codes SET used_at = NOW() WHERE otp_id = ?;`,
        [row.otp_id]
    );

    let payload = null;
    if (row.payload) {
        payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
    }

    return { ok: true, payload };
}

module.exports = { generateAndSendOtp, verifyOtp };

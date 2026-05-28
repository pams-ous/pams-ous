// SMTP mailer used by the auth flow to deliver real OTPs.
//
// Configuration is fully env-var driven so we never ship credentials.
// Required env vars in production:
//   SMTP_HOST      e.g. smtp.gmail.com
//   SMTP_PORT      e.g. 465  (SSL) or 587 (STARTTLS)
//   SMTP_SECURE    "true" for port 465, "false" for 587
//   SMTP_USER      sender Gmail address
//   SMTP_PASS      16-char Gmail App Password (NOT the account password)
//   SMTP_FROM      friendly From line, e.g. '"PUP OUS PAMS" <pams-ous@yourdomain>'
//
// When SMTP_USER is unset we fall back to "dev mode": OTPs are printed to
// the server console and a fake messageId is returned so the auth flow keeps
// working during local development without real credentials.

const nodemailer = require("nodemailer");

let cachedTransport = null;

function getTransport() {
    if (cachedTransport) return cachedTransport;

    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
        // Dev fallback — we use the "jsonTransport" so .sendMail still resolves
        // cleanly but no network call happens. The full message is logged.
        console.warn("⚠  SMTP not configured (set SMTP_HOST/USER/PASS). Falling back to console-log mode.");
        cachedTransport = nodemailer.createTransport({ jsonTransport: true });
        cachedTransport.__devMode = true;
        return cachedTransport;
    }

    cachedTransport = nodemailer.createTransport({
        host,
        port:   Number(process.env.SMTP_PORT) || 465,
        secure: String(process.env.SMTP_SECURE || "true") === "true",
        auth:   { user, pass }
    });
    cachedTransport.__devMode = false;
    return cachedTransport;
}

// Branded HTML OTP email — kept inline so no template file is needed.
function buildOtpHtml({ recipientName, otp }) {
    return `
<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Segoe UI',Tahoma,sans-serif;color:#222;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f5f5;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08);">
        <tr>
          <td style="background:#6B0A1A;color:#fff;padding:24px 32px;">
            <div style="font-size:13px;letter-spacing:1px;text-transform:uppercase;opacity:.85;">PUP — Open University System</div>
            <div style="font-size:22px;font-weight:700;margin-top:4px;">Personnel Accomplishment Monitoring System</div>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 12px;font-size:16px;">Hi ${escapeHtml(recipientName || "there")},</p>
            <p style="margin:0 0 20px;font-size:15px;line-height:1.5;">
              We received a request to reset the password on your PAMS account.
              Use the one-time passcode below to continue. It is valid for the next 10 minutes.
            </p>
            <div style="text-align:center;margin:28px 0;">
              <div style="display:inline-block;padding:18px 32px;background:#FAF3E1;border:2px dashed #E8A800;border-radius:8px;font-size:32px;letter-spacing:10px;font-weight:700;color:#6B0A1A;">
                ${otp}
              </div>
            </div>
            <p style="margin:0 0 8px;font-size:13px;color:#666;">
              If you didn't request this, you can safely ignore this email — your password will stay unchanged.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f7f1f2;padding:16px 32px;font-size:12px;color:#888;text-align:center;">
            PUP Open University System · Sta. Mesa, Manila · This is an automated message.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => (
        { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]
    ));
}

// Public API — used by auth.js
async function sendOtpEmail({ to, recipientName, otp }) {
    const transport = getTransport();
    const from = process.env.SMTP_FROM
        || `"PUP OUS PAMS" <${process.env.SMTP_USER || "no-reply@pams-ous.local"}>`;

    const info = await transport.sendMail({
        from,
        to,
        subject: "Your PAMS password reset code",
        text: `Your PAMS one-time passcode is ${otp}. It expires in 10 minutes.`,
        html: buildOtpHtml({ recipientName, otp })
    });

    if (transport.__devMode) {
        console.log("📧 [DEV] OTP email payload:", { to, otp, recipientName });
    }
    return { messageId: info.messageId, devMode: !!transport.__devMode };
}

// One-shot startup check — server.js awaits this at boot so a misconfigured
// SMTP App Password fails LOUDLY on the console instead of silently when a
// user tries to reset their password.
async function verifySmtpAtBoot() {
    const transport = getTransport();
    if (transport.__devMode) {
        console.warn("⚠  SMTP in dev mode — real OTP delivery is disabled.");
        return;
    }
    try {
        await transport.verify();
        console.log(`📧 SMTP ready — ${process.env.SMTP_USER} via ${process.env.SMTP_HOST}:${process.env.SMTP_PORT}`);
    } catch (err) {
        console.error("❌ SMTP verification failed:", err.message);
        console.error("   Check SMTP_USER / SMTP_PASS in backend/.env. Gmail requires a 16-char App Password.");
    }
}

module.exports = { sendOtpEmail, verifySmtpAtBoot };

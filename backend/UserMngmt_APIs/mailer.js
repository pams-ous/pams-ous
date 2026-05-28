const nodemailer = require("nodemailer");

let cachedTransporter = null;

function getTransporter() {
    if (cachedTransporter) return cachedTransporter;

    cachedTransporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port: Number(process.env.SMTP_PORT || 465),
        secure: String(process.env.SMTP_SECURE || "true") === "true",
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD
        }
    });

    return cachedTransporter;
}

function purposeCopy(purpose) {
    switch (purpose) {
        case "registration":
            return {
                subject: "PAMS — Confirm your registration",
                heading: "Confirm your new PAMS account",
                lead: "Use the verification code below to finish creating your PAMS account."
            };
        case "password_reset":
            return {
                subject: "PAMS — Password reset code",
                heading: "Reset your PAMS password",
                lead: "Use the verification code below to reset the password on your PAMS account."
            };
        case "login":
        default:
            return {
                subject: "PAMS — Sign-in verification code",
                heading: "Confirm your sign-in",
                lead: "Use the verification code below to complete your sign-in to PAMS."
            };
    }
}

function buildHtml(code, copy, ttlMinutes) {
    return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f8f4f4;font-family:'Segoe UI',Arial,sans-serif;color:#2d2d2d;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8f4f4;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
        <tr><td style="background:linear-gradient(135deg,#3d0000 0%,#800000 50%,#a00000 100%);padding:20px 28px;color:#ffffff;">
          <div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#DAA520;">PUP OUS &middot; PAMS</div>
          <div style="font-size:18px;font-weight:600;margin-top:4px;">${copy.heading}</div>
        </td></tr>
        <tr><td style="padding:28px;">
          <p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;">${copy.lead}</p>
          <div style="background:#fff3cd;border-left:4px solid #DAA520;border-radius:6px;padding:18px;text-align:center;margin:18px 0;">
            <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#856404;">Your verification code</div>
            <div style="font-size:32px;font-weight:700;letter-spacing:8px;color:#800000;margin-top:6px;">${code}</div>
          </div>
          <p style="margin:0 0 8px 0;font-size:13px;color:#6c757d;">
            This code expires in <strong>${ttlMinutes} minutes</strong>. If you did not request it, you can safely ignore this message.
          </p>
        </td></tr>
        <tr><td style="background:#f4f4f4;padding:14px 28px;font-size:11px;color:#6c757d;text-align:center;">
          &copy; ${new Date().getFullYear()} PUP Office of the University Secretary &mdash; Internal System
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

async function sendOtpEmail(to, code, purpose) {
    const copy = purposeCopy(purpose);
    const ttlMinutes = Number(process.env.OTP_TTL_MINUTES || 5);

    const info = await getTransporter().sendMail({
        from: process.env.SMTP_FROM || `PUP OUS PAMS <${process.env.SMTP_USER}>`,
        to,
        subject: copy.subject,
        text: `${copy.lead}\n\nYour code: ${code}\n\nThis code expires in ${ttlMinutes} minutes.`,
        html: buildHtml(code, copy, ttlMinutes)
    });

    console.log(`OTP email queued for ${to} (purpose=${purpose}) — messageId=${info.messageId}`);
    return info;
}

module.exports = { sendOtpEmail };

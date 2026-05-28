/*
 * SMS adapter — stub.
 *
 * Free SMS to Philippine numbers is no longer reliably available (Smart/Globe
 * email-to-SMS gateways were shut down). Pick a provider before relying on this.
 *
 *   1. Semaphore (PH)        — ~₱0.50/SMS, REST API. Set SMS_PROVIDER=semaphore
 *                              and SEMAPHORE_API_KEY in .env.
 *   2. Twilio                — global, mature SDK, more expensive to PH.
 *   3. WhatsApp Cloud API    — free up to ~1000 conversations/month (Meta).
 *   4. Telegram Bot          — free, but requires users to chat the bot first.
 *
 * Until a provider is chosen this throws, so OTP flows fall back to email.
 */

async function sendOtpSMS(to, code, purpose) {
    const provider = process.env.SMS_PROVIDER;
    if (!provider) {
        throw new Error("SMS channel not configured. Set SMS_PROVIDER in .env (or pick 'email' as the channel).");
    }

    // TODO: wire up the chosen provider here.
    // Example skeleton for Semaphore:
    //
    // if (provider === "semaphore") {
    //     const res = await fetch("https://api.semaphore.co/api/v4/messages", {
    //         method: "POST",
    //         headers: { "Content-Type": "application/x-www-form-urlencoded" },
    //         body: new URLSearchParams({
    //             apikey: process.env.SEMAPHORE_API_KEY,
    //             number: to,
    //             message: `Your PAMS code is ${code}. Expires in ${process.env.OTP_TTL_MINUTES} min.`,
    //             sendername: process.env.SEMAPHORE_SENDER_NAME || "PAMS"
    //         })
    //     });
    //     if (!res.ok) throw new Error(`Semaphore send failed: ${res.status}`);
    //     return await res.json();
    // }

    throw new Error(`SMS provider '${provider}' not implemented yet. See backend/UserMngmt_APIs/smsAdapter.js.`);
}

module.exports = { sendOtpSMS };

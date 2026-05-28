const { generateAndSendOtp, verifyOtp } = require("./otpService");
const { getEmployeeDetails } = require("./dbChecks");

async function otpAPI(io, db) {
    io.on("connection", (socket) => {
        console.log("OTP API connected.");

        // Generic OTP request — used by the optional sign-in OTP gate
        // and any future flow that wants a code on demand.
        socket.on("requestLoginOtp", async (data) => {
            try {
                const { email } = data || {};
                if (!email) {
                    return socket.emit("otpRequestLog", {
                        success: false,
                        purpose: "login",
                        rawData: "Email is required."
                    });
                }

                const existing = await getEmployeeDetails(db, email);
                if (!existing) {
                    return socket.emit("otpRequestLog", {
                        success: false,
                        purpose: "login",
                        rawData: "No account is registered with that email."
                    });
                }

                await generateAndSendOtp(db, { email, channel: "email", purpose: "login" });
                socket.emit("otpRequestLog", {
                    success: true,
                    purpose: "login",
                    rawData: `A verification code has been sent to ${email}.`
                });
            } catch (err) {
                console.log(err);
                socket.emit("otpRequestLog", {
                    success: false,
                    purpose: "login",
                    rawData: `${err}`
                });
            }
        });

        // Verifier for the optional sign-in OTP step (after password has passed).
        socket.on("verifyLoginOtp", async (data) => {
            try {
                const { email, code } = data || {};
                const result = await verifyOtp(db, { email, purpose: "login", code });
                if (!result.ok) {
                    return socket.emit("otpVerifyLog", {
                        success: false,
                        purpose: "login",
                        rawData: result.reason
                    });
                }

                const employee = await getEmployeeDetails(db, email);
                const empName = [employee?.first_name, employee?.middle_name, employee?.last_name, employee?.suffix]
                    .filter(Boolean)
                    .join(" ");

                socket.emit("otpVerifyLog", {
                    success: true,
                    purpose: "login",
                    rawData: "Sign-in verified.",
                    email,
                    empName
                });
            } catch (err) {
                console.log(err);
                socket.emit("otpVerifyLog", {
                    success: false,
                    purpose: "login",
                    rawData: `${err}`
                });
            }
        });
    });
}

module.exports = { otpAPI };

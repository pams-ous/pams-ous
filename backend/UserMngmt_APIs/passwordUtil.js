const argon2 = require("argon2");

// Centralized password policy — keep in sync with the frontend hint text in
// js/api.js (PAMS.PASSWORD_POLICY). Minimum 8 chars with at least one uppercase
// letter, one lowercase letter, one number, and one symbol.
const PASSWORD_POLICY = {
    minLength: 8,
    message: "Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a symbol."
};

function validatePassword(pw) {
    const value = typeof pw === "string" ? pw : "";
    const meetsPolicy =
        value.length >= PASSWORD_POLICY.minLength &&
        /[A-Z]/.test(value) &&
        /[a-z]/.test(value) &&
        /[0-9]/.test(value) &&
        /[^A-Za-z0-9]/.test(value);

    return {
        valid: meetsPolicy,
        message: meetsPolicy ? null : PASSWORD_POLICY.message
    };
}

async function hash_password(pw) {
    const hash = await argon2.hash(pw);
    return hash;
}

async function verify_pass(pw, pwHash) {
    if (!pwHash || !pwHash.startsWith('$argon2')) {
        throw new Error("Invalid database password hash format.");
    }

    return await argon2.verify(pwHash, pw);
}

module.exports = {hash_password, verify_pass, validatePassword, PASSWORD_POLICY};
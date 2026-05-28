const argon2 = require("argon2");

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

module.exports = {hash_password, verify_pass};
// Authorship: same hash_password / verify_pass interface as the group's
// ./_group_original/passwordUtil.js. Swapped to @node-rs/argon2 (Rust binding,
// no node-gyp build) so the project installs cleanly on Windows; hash output is
// fully compatible with the original `argon2` package's $argon2id$... format,
// so seed hashes from the group's SQL keep working.

// @node-rs/argon2 — Rust-backed Argon2id, hash-compatible with the existing
// $argon2id$... seed strings already stored in the Employees table.
const { hash, verify, Algorithm } = require("@node-rs/argon2");

// Hash a plaintext password using Argon2id (the same variant used by the seed data).
async function hash_password(pw) {
    return await hash(pw, { algorithm: Algorithm.Argon2id });
}

// Verify a plaintext password against a stored Argon2 hash.
// Throws if the stored hash is missing or not in argon2 format — callers should catch.
async function verify_pass(pw, pwHash) {
    if (!pwHash || !pwHash.startsWith('$argon2')) {
        throw new Error("Invalid database password hash format.");
    }
    return await verify(pwHash, pw);
}

module.exports = { hash_password, verify_pass };

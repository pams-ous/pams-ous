const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

if (!process.env.JWT_SECRET) {
    throw new Error('FATAL ERROR: JWT_SECRET is not defined in environment variables.');
}

function generateToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
}

function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (err) {
        return null;
    }
}

module.exports = {
    generateToken,
    verifyToken,
    JWT_SECRET
};

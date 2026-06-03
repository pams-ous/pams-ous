const { verifyToken } = require('./authUtil');

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, message: 'Authorization token missing' });
    }

    const user = verifyToken(token);
    if (!user) {
        return res.status(403).json({ success: false, message: 'Invalid or expired token' });
    }

    req.user = user;
    next();
}

function authorizeRole(roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ success: false, message: 'Insufficient permissions' });
        }
        next();
    };
}

module.exports = { authenticateToken, authorizeRole };

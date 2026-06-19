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
        // 1. Check if the user object and role exist
            if (!req.user || !req.user.role) {
                return res.status(403).json({ success: false, message: 'Insufficient permissions' });
            }
            // SUPERADMIN bypasses any role check
            if (req.user.role === 'SUPERADMIN') {
                return next();
            }

            // 2. Perform a case-insensitive comparison
        const hasPermission = roles.some(
            allowedRole => allowedRole.toLowerCase() === req.user.role.toLowerCase()
        );

        // 3. Reject or proceed
        if (!hasPermission) {
            return res.status(403).json({ success: false, message: 'Insufficient permissions' });
        }
        
        next();
    };
}

module.exports = { authenticateToken, authorizeRole };

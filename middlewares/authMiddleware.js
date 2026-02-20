const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
    try {
        let token;

        if (
            req.headers.authorization &&
            req.headers.authorization.startsWith('Bearer')
        ) {
            token = req.headers.authorization.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            req.user = await User.findById(decoded.userId).select('-password');

            if (!req.user) {
                res.status(401);
                return next(new Error('Not authorized, user not found'));
            }

            return next();
        }

        if (!token) {
            res.status(401);
            return next(new Error('Not authorized, no token'));
        }
    } catch (error) {
        console.error(error);
        res.status(401);
        next(new Error('Not authorized, token failed'));
    }
};

const authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            res.status(403);
            return next(new Error(`User role ${req.user.role} is not authorized to access this route`));
        }
        next();
    };
};

const checkPermission = (permission) => {
    return async (req, res, next) => {
        const RolePermission = require('../models/RolePermission');
        const rolePerm = await RolePermission.findOne({ role: req.user.role });

        if (req.user.role === 'SUPER_ADMIN') return next();

        if (!rolePerm || (!rolePerm.permissions.includes(permission) && !rolePerm.permissions.includes('ALL'))) {
            res.status(403);
            return next(new Error(`Permission denied: ${permission} required`));
        }
        next();
    };
};

module.exports = { protect, authorize, checkPermission };

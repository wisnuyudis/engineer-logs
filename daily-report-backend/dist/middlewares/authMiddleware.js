"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireRole = exports.authenticateToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const getJwtSecret = () => {
    const value = process.env.JWT_SECRET;
    if (value)
        return value;
    if (process.env.NODE_ENV === 'test')
        return 'test-access-secret';
    throw new Error('JWT_SECRET must be set');
};
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Access token missing' });
    }
    const token = authHeader.slice(7).trim();
    if (!token)
        return res.status(401).json({ error: 'Access token missing' });
    jsonwebtoken_1.default.verify(token, getJwtSecret(), (err, decoded) => {
        if (err)
            return res.status(401).json({ error: 'Invalid or expired token' });
        const payload = decoded;
        if (!payload?.userId || !payload?.email || !payload?.role) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }
        req.user = {
            userId: String(payload.userId),
            email: String(payload.email),
            role: String(payload.role),
            team: payload.team == null ? null : String(payload.team),
        };
        next();
    });
};
exports.authenticateToken = authenticateToken;
const requireRole = (roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        next();
    };
};
exports.requireRole = requireRole;

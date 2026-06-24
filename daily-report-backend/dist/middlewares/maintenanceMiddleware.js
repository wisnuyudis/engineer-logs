"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.maintenanceMiddleware = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const authMiddleware_1 = require("./authMiddleware");
const maintenanceService_1 = require("../services/maintenanceService");
const EXEMPT_PREFIXES = [
    '/api/maintenance/status',
    '/api/auth',
    '/api/settings/maintenance',
    '/health',
];
const isAdminToken = (req) => {
    const authHeader = req.headers.authorization;
    if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer '))
        return false;
    try {
        const payload = jsonwebtoken_1.default.verify(authHeader.slice(7).trim(), (0, authMiddleware_1.getJwtSecret)());
        return String(payload.role || '').toLowerCase() === 'admin';
    }
    catch {
        return false;
    }
};
const maintenanceMiddleware = async (req, res, next) => {
    if (req.method === 'OPTIONS')
        return next();
    if (EXEMPT_PREFIXES.some((prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`))) {
        return next();
    }
    try {
        const status = await (0, maintenanceService_1.getMaintenanceStatus)();
        if (!status.enabled)
            return next();
        if (status.adminBypass && isAdminToken(req))
            return next();
        res.setHeader('Retry-After', process.env.MAINTENANCE_RETRY_AFTER_SECONDS || '300');
        return res.status(503).json({
            code: 'MAINTENANCE_MODE',
            error: status.message,
            maintenance: status,
        });
    }
    catch (error) {
        req.log?.error(error, 'Maintenance middleware failed');
        return next();
    }
};
exports.maintenanceMiddleware = maintenanceMiddleware;

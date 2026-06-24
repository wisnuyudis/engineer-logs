"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateMaintenanceSettings = exports.getMaintenanceSettings = exports.getPublicMaintenanceStatus = void 0;
const maintenanceService_1 = require("../services/maintenanceService");
const auditTrail_1 = require("../utils/auditTrail");
const isAdminRole = (role) => String(role || '').toLowerCase() === 'admin';
const getPublicMaintenanceStatus = async (_req, res) => {
    try {
        const status = await (0, maintenanceService_1.getMaintenanceStatus)();
        res.json(status);
    }
    catch {
        res.status(500).json({ error: 'Failed to fetch maintenance status' });
    }
};
exports.getPublicMaintenanceStatus = getPublicMaintenanceStatus;
const getMaintenanceSettings = async (req, res) => {
    try {
        if (!isAdminRole(req.user?.role))
            return res.status(403).json({ error: 'Insufficient permissions' });
        res.json(await (0, maintenanceService_1.getMaintenanceStatus)());
    }
    catch {
        res.status(500).json({ error: 'Failed to fetch maintenance settings' });
    }
};
exports.getMaintenanceSettings = getMaintenanceSettings;
const updateMaintenanceSettings = async (req, res) => {
    try {
        if (!isAdminRole(req.user?.role))
            return res.status(403).json({ error: 'Insufficient permissions' });
        const current = await (0, maintenanceService_1.getMaintenanceStatus)();
        if (current.forcedByEnv) {
            return res.status(400).json({ error: 'Maintenance mode is forced by environment and cannot be changed from the dashboard.' });
        }
        const next = await (0, maintenanceService_1.updateMaintenanceStatus)({
            enabled: Boolean(req.body?.enabled),
            message: req.body?.message == null ? undefined : String(req.body.message),
            updatedBy: req.user?.email || req.user?.userId || null,
        });
        await (0, auditTrail_1.writeAudit)(req, {
            action: next.enabled ? 'maintenance.enable' : 'maintenance.disable',
            entityType: 'setting',
            entityId: 'maintenance_mode',
            before: current,
            after: next,
        });
        res.json(next);
    }
    catch {
        res.status(500).json({ error: 'Failed to update maintenance settings' });
    }
};
exports.updateMaintenanceSettings = updateMaintenanceSettings;

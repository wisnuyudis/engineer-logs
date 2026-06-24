"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateMaintenanceStatus = exports.getMaintenanceStatus = void 0;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const SETTING_KEY = 'maintenance_mode';
const DEFAULT_MESSAGE = 'EngineerLog sedang dalam maintenance. Silakan coba lagi beberapa saat.';
const isTruthy = (value) => ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
const parseStored = (value) => {
    if (!value)
        return {};
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' ? parsed : {};
    }
    catch {
        return {};
    }
};
const getMaintenanceStatus = async () => {
    const forcedByEnv = isTruthy(process.env.MAINTENANCE_MODE);
    const adminBypass = process.env.MAINTENANCE_ADMIN_BYPASS !== 'false';
    const setting = await prisma.setting.findUnique({ where: { key: SETTING_KEY } });
    const stored = parseStored(setting?.value);
    const storedEnabled = stored.enabled === true;
    return {
        enabled: forcedByEnv || storedEnabled,
        forcedByEnv,
        message: String(process.env.MAINTENANCE_MESSAGE || stored.message || DEFAULT_MESSAGE),
        updatedAt: setting?.updatedAt ? setting.updatedAt.toISOString() : null,
        updatedBy: typeof stored.updatedBy === 'string' ? stored.updatedBy : null,
        adminBypass,
    };
};
exports.getMaintenanceStatus = getMaintenanceStatus;
const updateMaintenanceStatus = async (input) => {
    const payload = {
        enabled: Boolean(input.enabled),
        message: String(input.message || DEFAULT_MESSAGE).trim() || DEFAULT_MESSAGE,
        updatedBy: input.updatedBy || null,
        updatedAt: new Date().toISOString(),
    };
    await prisma.setting.upsert({
        where: { key: SETTING_KEY },
        update: {
            value: JSON.stringify(payload),
            description: 'Maintenance mode state',
        },
        create: {
            key: SETTING_KEY,
            value: JSON.stringify(payload),
            description: 'Maintenance mode state',
        },
    });
    return (0, exports.getMaintenanceStatus)();
};
exports.updateMaintenanceStatus = updateMaintenanceStatus;

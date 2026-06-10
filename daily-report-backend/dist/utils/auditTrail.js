"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeAudit = writeAudit;
exports.writeAuditSystem = writeAuditSystem;
exports.cleanupExpiredAuditLogs = cleanupExpiredAuditLogs;
exports.startAuditRetentionJob = startAuditRetentionJob;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
let auditRetentionTimer = null;
async function writeAudit(req, payload) {
    try {
        await prisma.auditLog.create({
            data: {
                userId: req?.user?.userId || null,
                action: payload.action,
                entityType: payload.entityType,
                entityId: payload.entityId || null,
                before: payload.before,
                after: payload.after,
                metadata: payload.metadata,
                ipAddress: req?.ip || null,
                userAgent: req?.headers?.['user-agent'] || null,
            },
        });
    }
    catch (error) {
        console.error('Failed to write audit log', error);
    }
}
async function writeAuditSystem(payload) {
    try {
        await prisma.auditLog.create({
            data: {
                userId: payload.userId || null,
                action: payload.action,
                entityType: payload.entityType,
                entityId: payload.entityId || null,
                before: payload.before,
                after: payload.after,
                metadata: payload.metadata,
                ipAddress: payload.ipAddress || null,
                userAgent: payload.userAgent || null,
            },
        });
    }
    catch (error) {
        console.error('Failed to write audit log', error);
    }
}
const getAuditRetentionDays = () => {
    const days = Number(process.env.AUDIT_RETENTION_DAYS || 7);
    if (!Number.isFinite(days))
        return 7;
    return Math.floor(days);
};
async function cleanupExpiredAuditLogs() {
    const retentionDays = getAuditRetentionDays();
    if (retentionDays <= 0)
        return { deleted: 0, disabled: true };
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const result = await prisma.auditLog.deleteMany({
        where: { createdAt: { lt: cutoff } },
    });
    if (result.count > 0) {
        console.log(`Audit retention deleted ${result.count} log(s) older than ${retentionDays} day(s).`);
    }
    return { deleted: result.count, disabled: false, cutoff };
}
function startAuditRetentionJob() {
    if (auditRetentionTimer)
        return;
    if (getAuditRetentionDays() <= 0) {
        console.log('Audit retention disabled.');
        return;
    }
    const run = () => {
        cleanupExpiredAuditLogs().catch((error) => {
            console.error('Audit retention cleanup failed:', error);
        });
    };
    run();
    auditRetentionTimer = setInterval(run, 24 * 60 * 60 * 1000);
}

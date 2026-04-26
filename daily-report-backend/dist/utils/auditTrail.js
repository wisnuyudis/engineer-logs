"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeAudit = writeAudit;
exports.writeAuditSystem = writeAuditSystem;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
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

import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middlewares/authMiddleware';

const prisma = new PrismaClient();
let auditRetentionTimer: NodeJS.Timeout | null = null;

type AuditPayload = {
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
};

export async function writeAudit(req: AuthRequest | undefined, payload: AuditPayload) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: req?.user?.userId || null,
        action: payload.action,
        entityType: payload.entityType,
        entityId: payload.entityId || null,
        before: payload.before as any,
        after: payload.after as any,
        metadata: payload.metadata as any,
        ipAddress: (req as any)?.ip || null,
        userAgent: req?.headers?.['user-agent'] || null,
      },
    });
  } catch (error) {
    console.error('Failed to write audit log', error);
  }
}

export async function writeAuditSystem(payload: AuditPayload & { userId?: string | null; ipAddress?: string | null; userAgent?: string | null; }) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: payload.userId || null,
        action: payload.action,
        entityType: payload.entityType,
        entityId: payload.entityId || null,
        before: payload.before as any,
        after: payload.after as any,
        metadata: payload.metadata as any,
        ipAddress: payload.ipAddress || null,
        userAgent: payload.userAgent || null,
      },
    });
  } catch (error) {
    console.error('Failed to write audit log', error);
  }
}

const getAuditRetentionDays = () => {
  const days = Number(process.env.AUDIT_RETENTION_DAYS || 7);
  if (!Number.isFinite(days)) return 7;
  return Math.floor(days);
};

export async function cleanupExpiredAuditLogs() {
  const retentionDays = getAuditRetentionDays();
  if (retentionDays <= 0) return { deleted: 0, disabled: true };

  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const result = await prisma.auditLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });

  if (result.count > 0) {
    console.log(`Audit retention deleted ${result.count} log(s) older than ${retentionDays} day(s).`);
  }

  return { deleted: result.count, disabled: false, cutoff };
}

export function startAuditRetentionJob() {
  if (auditRetentionTimer) return;
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

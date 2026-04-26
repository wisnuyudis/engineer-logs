import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middlewares/authMiddleware';

const prisma = new PrismaClient();

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

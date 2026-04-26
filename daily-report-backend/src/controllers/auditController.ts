import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middlewares/authMiddleware';

const prisma = new PrismaClient();

const toPositiveInt = (value: unknown, fallback: number, min = 1, max = 100) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
};

export const getAuditLogs = async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const page = toPositiveInt(req.query.page, 1);
    const pageSize = toPositiveInt(req.query.pageSize, 25, 5, 100);
    const action = typeof req.query.action === 'string' ? req.query.action.trim() : '';
    const entityType = typeof req.query.entityType === 'string' ? req.query.entityType.trim() : '';
    const userId = typeof req.query.userId === 'string' ? req.query.userId.trim() : '';
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

    const where: any = {};
    if (action) where.action = { contains: action, mode: 'insensitive' };
    if (entityType) where.entityType = { contains: entityType, mode: 'insensitive' };
    if (userId && userId !== 'all') where.userId = userId;
    if (search) {
      where.OR = [
        { action: { contains: search, mode: 'insensitive' } },
        { entityType: { contains: search, mode: 'insensitive' } },
        { entityId: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total, users] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true, role: true, team: true, avatarUrl: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.auditLog.count({ where }),
      prisma.user.findMany({
        select: { id: true, name: true, email: true, role: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    res.json({
      items,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
      users,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
};

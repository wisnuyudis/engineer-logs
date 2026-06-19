import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { AuthRequest } from '../middlewares/authMiddleware';
import { CliAuthRequest, hashCliToken } from '../middlewares/cliAuthMiddleware';
import { ActivitySchema } from '../validators/zodSchemas';
import { writeAudit, writeAuditSystem } from '../utils/auditTrail';

const prisma = new PrismaClient();
const MANUAL_SOURCES = ['app', 'telegram', 'cli'];
const ADMIN_ROLES = ['admin', 'superadmin', 'super_admin'];
const MANAGER_ROLES = ['admin', 'mgr_dl', 'mgr_ps'];

const isAdminOrManagerRole = (role?: string | null) => MANAGER_ROLES.includes(role || '');

const toPositiveInt = (value: unknown, fallback: number, min = 1, max = 100) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
};

const canUseCategory = (
  category: { team: string; source: string; actKey: string; isActive: boolean },
  user: { role: string; team: string | null },
) => {
  if (!category.isActive) return false;
  if (category.source === 'jira') return false;
  if (category.actKey === 'pm_presentation') return false;
  if (ADMIN_ROLES.includes(user.role.toLowerCase())) return true;
  return category.team === 'all' || category.team === (user.team || '');
};

export const generateCliLinkToken = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const token = crypto.randomBytes(16).toString('base64url').toUpperCase();
    await prisma.setting.upsert({
      where: { key: `clihost_${userId}` },
      update: { value: token, description: 'CLI Handshake Token' },
      create: { key: `clihost_${userId}`, value: token, description: 'CLI Handshake Token' },
    });

    await writeAudit(req, {
      action: 'cli.link_token_generate',
      entityType: 'cli_link',
      entityId: userId,
      after: { tokenGenerated: true },
    });

    return res.json({
      token,
      message: `Gunakan token ini di CLI: elog auth --token ${token}`,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Gagal membuat token CLI' });
  }
};

export const getCliStatus = async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user?.userId },
      select: { cliTokenHash: true, cliLinkedAt: true },
    });
    return res.json({
      isLinked: !!user?.cliTokenHash,
      linkedAt: user?.cliLinkedAt || null,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Gagal mendapatkan status CLI' });
  }
};

export const exchangeCliLinkToken = async (req: Request, res: Response) => {
  try {
    const token = String(req.body?.token || '').trim().toUpperCase();
    if (!token) {
      return res.status(400).json({ error: 'token wajib diisi' });
    }

    const setting = await prisma.setting.findFirst({
      where: { value: token, key: { startsWith: 'clihost_' } },
    });

    if (!setting) {
      return res.status(400).json({ error: 'Token CLI tidak valid atau sudah digunakan' });
    }

    const userId = setting.key.replace('clihost_', '');
    const cliToken = `elog_${crypto.randomBytes(32).toString('base64url')}`;
    const tokenPreview = `${cliToken.slice(0, 10)}...${cliToken.slice(-6)}`;
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        cliTokenHash: hashCliToken(cliToken),
        cliLinkedAt: new Date(),
      },
      select: { id: true, email: true, name: true, role: true, team: true },
    });

    await prisma.setting.delete({ where: { key: setting.key } });

    await writeAuditSystem({
      userId,
      action: 'cli.link',
      entityType: 'cli_link',
      entityId: userId,
      after: { tokenIssued: true, tokenPreview },
      userAgent: req.headers['user-agent'] ? String(req.headers['user-agent']) : 'engineerlog-cli',
      ipAddress: req.ip,
    });

    return res.json({ cliToken, user });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal menghubungkan CLI';
    return res.status(400).json({ error: message });
  }
};

export const getCliMe = async (req: CliAuthRequest, res: Response) => {
  return res.json({ user: req.cliUser });
};

export const getCliCategories = async (req: CliAuthRequest, res: Response) => {
  try {
    const user = req.cliUser;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const categories = await prisma.masterActivity.findMany({
      where: { isActive: true },
      orderBy: [{ team: 'asc' }, { actKey: 'asc' }],
    });

    return res.json({
      items: categories.filter((category) => canUseCategory(category, user)),
    });
  } catch (error) {
    return res.status(500).json({ error: 'Gagal memuat kategori CLI' });
  }
};

export const getCliActivities = async (req: CliAuthRequest, res: Response) => {
  try {
    const user = req.cliUser;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const {
      limit = '5',
      actKey,
      status,
      source = 'manual',
      dateFrom,
      dateTo,
      search = '',
    } = req.query as Record<string, string | undefined>;

    const isAdminOrMgr = isAdminOrManagerRole(user.role);
    const whereClause: any = isAdminOrMgr ? {} : { userId: user.userId };
    if (actKey) whereClause.actKey = actKey;
    if (status) whereClause.status = status;
    if (source === 'manual') whereClause.source = { in: MANUAL_SOURCES };
    else if (source && source !== 'all') whereClause.source = source;
    if (dateFrom || dateTo) {
      whereClause.date = {};
      if (dateFrom) whereClause.date.gte = dateFrom;
      if (dateTo) whereClause.date.lte = dateTo;
    }
    if (search.trim()) {
      whereClause.OR = [
        { topic: { contains: search.trim(), mode: 'insensitive' } },
        { note: { contains: search.trim(), mode: 'insensitive' } },
        { ticketId: { contains: search.trim(), mode: 'insensitive' } },
        { customerName: { contains: search.trim(), mode: 'insensitive' } },
      ];
    }

    const items = await prisma.activity.findMany({
      where: whereClause,
      include: {
        attachments: true,
        user: { select: { id: true, name: true, email: true, role: true, team: true } },
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: toPositiveInt(limit, 5, 1, 50),
    });

    return res.json({ items });
  } catch (error) {
    return res.status(500).json({ error: 'Gagal memuat activity CLI' });
  }
};

export const createCliActivity = async (req: CliAuthRequest, res: Response) => {
  try {
    const user = req.cliUser;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const validation = ActivitySchema.safeParse(req.body);
    if (!validation.success) {
      const issue = validation.error.issues[0];
      const field = issue.path.join('.') || 'payload';
      return res.status(400).json({ error: `${field}: ${issue.message}` });
    }

    const data = validation.data;
    if (data.startTime && data.endTime) {
      if (data.startTime >= data.endTime) {
        return res.status(400).json({ error: 'Jam selesai harus lebih besar dari jam mulai' });
      }

      const overlaps = await prisma.activity.findMany({
        where: {
          userId: user.userId,
          date: data.date,
          NOT: {
            OR: [
              { endTime: { lte: data.startTime } },
              { startTime: { gte: data.endTime } },
            ],
          },
        },
        select: { id: true },
      });
      if (overlaps.length > 0) {
        return res.status(400).json({ error: 'Terdapat aktivitas lain pada rentang jam tersebut' });
      }
    }

    const masterAct = await prisma.masterActivity.findUnique({ where: { actKey: data.actKey } });
    if (!masterAct || !canUseCategory(masterAct, user)) {
      return res.status(400).json({ error: 'Kategori aktivitas tidak valid untuk CLI/user ini' });
    }

    const activity = await prisma.activity.create({
      data: {
        userId: user.userId,
        actKey: data.actKey,
        topic: data.topic || null,
        note: data.note || null,
        dur: data.dur,
        date: data.date,
        startTime: data.startTime || null,
        endTime: data.endTime || null,
        status: data.status || 'completed',
        source: 'cli',
        ticketId: data.ticketId || null,
        ticketTitle: data.ticketTitle || null,
        customerName: data.customerName || null,
        prName: data.prName || null,
        nps: data.nps ?? null,
        leadId: data.leadId || null,
        prospectValue: data.prospectValue ?? null,
      },
      include: {
        attachments: true,
        user: { select: { id: true, name: true, email: true, role: true, team: true } },
      },
    });

    await writeAuditSystem({
      userId: user.userId,
      action: 'activity.create_cli',
      entityType: 'activity',
      entityId: activity.id,
      after: activity,
      metadata: { source: 'cli' },
      userAgent: 'engineerlog-cli',
    });

    return res.status(201).json(activity);
  } catch (error) {
    return res.status(500).json({ error: 'Gagal menyimpan log activity dari CLI' });
  }
};

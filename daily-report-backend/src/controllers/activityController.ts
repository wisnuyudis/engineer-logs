import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middlewares/authMiddleware';
import fs from 'fs';
import path from 'path';
import { ActivitySchema } from '../validators/zodSchemas';
import { z } from 'zod';
import { writeAudit } from '../utils/auditTrail';

const prisma = new PrismaClient();

const normalizeIdentity = (value: string | null | undefined) =>
  (value || '').trim().replace(/\s+/g, ' ').toLowerCase();

const SORT_FIELDS: Record<string, string> = {
  date: 'date',
  dur: 'dur',
  status: 'status',
  actKey: 'actKey',
  source: 'source',
  topic: 'topic',
  ticketId: 'ticketId',
  ticketTitle: 'ticketTitle',
  customerName: 'customerName',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
};

const toPositiveInt = (value: unknown, fallback: number, min = 1, max = 100) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
};

export const getActivities = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const role = req.user?.role;
    const {
      page = '1',
      pageSize = '10',
      paginate = 'true',
      search = '',
      sortBy = 'date',
      sortDir = 'desc',
      actKey,
      status,
      userId: filterUserId,
      team,
      source,
      sourceGroup,
      dateFrom,
      dateTo,
    } = req.query as Record<string, string | undefined>;
    
    const isAdminOrMgr = ['admin', 'mgr_dl', 'mgr_ps'].includes(role || '');
    const shouldPaginate = paginate !== 'false';
    const currentPage = toPositiveInt(page, 1, 1, 100000);
    const currentPageSize = toPositiveInt(pageSize, 10, 1, 100);
    const normalizedSearch = search.trim();
    const normalizedSortBy = SORT_FIELDS[sortBy] || 'date';
    const normalizedSortDir = sortDir === 'asc' ? 'asc' : 'desc';

    const whereClause: any = isAdminOrMgr ? {} : { userId };

    if (actKey) whereClause.actKey = actKey;
    if (status) whereClause.status = status;
    if (dateFrom || dateTo) {
      whereClause.date = {};
      if (dateFrom) whereClause.date.gte = dateFrom;
      if (dateTo) whereClause.date.lte = dateTo;
    }
    if (isAdminOrMgr && filterUserId && filterUserId !== 'all') {
      whereClause.userId = filterUserId;
    }
    if (team && team !== 'all') {
      whereClause.user = { is: { team } };
    }
    if (sourceGroup === 'synced') {
      whereClause.source = 'jira';
    } else if (sourceGroup === 'manual') {
      whereClause.source = { in: ['app', 'telegram'] };
    } else if (source && source !== 'all') {
      whereClause.source = source;
    }
    if (normalizedSearch) {
      whereClause.OR = [
        { topic: { contains: normalizedSearch, mode: 'insensitive' } },
        { note: { contains: normalizedSearch, mode: 'insensitive' } },
        { ticketId: { contains: normalizedSearch, mode: 'insensitive' } },
        { ticketTitle: { contains: normalizedSearch, mode: 'insensitive' } },
        { customerName: { contains: normalizedSearch, mode: 'insensitive' } },
        { prName: { contains: normalizedSearch, mode: 'insensitive' } },
        { user: { is: { name: { contains: normalizedSearch, mode: 'insensitive' } } } },
      ];
    }

    const queryOptions: any = {
      where: whereClause,
      include: {
        attachments: true,
        user: {
          select: { name: true, role: true, team: true, id: true, avatarUrl: true }
        }
      },
      orderBy: [
        { [normalizedSortBy]: normalizedSortDir },
        { createdAt: 'desc' }
      ],
    };

    if (!shouldPaginate) {
      const activities = await prisma.activity.findMany(queryOptions);
      return res.json(activities);
    }

    queryOptions.skip = (currentPage - 1) * currentPageSize;
    queryOptions.take = currentPageSize;

    const [items, total] = await Promise.all([
      prisma.activity.findMany(queryOptions),
      prisma.activity.count({ where: whereClause }),
    ]);

    return res.json({
      items,
      meta: {
        page: currentPage,
        pageSize: currentPageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / currentPageSize)),
        sortBy: normalizedSortBy,
        sortDir: normalizedSortDir,
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Gagal memuat log aktivitas' });
  }
};

export const createActivity = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // Zod Validation
    const validation = ActivitySchema.safeParse(req.body);
    if (!validation.success) {
      const issue = validation.error.issues[0];
      const field = issue.path.join('.') || 'payload';
      return res.status(400).json({ error: `${field}: ${issue.message}` });
    }
    const data = validation.data;
    
    // Business Validation: Jam bentrok dan Durasi
    if (data.startTime && data.endTime) {
      if (data.startTime >= data.endTime) {
         return res.status(400).json({ error: 'Jam selesai harus lebih besar dari jam mulai' });
      }
      
      // Check overlap
      const overlaps = await prisma.activity.findMany({
        where: {
          userId,
          date: data.date,
          NOT: {
             OR: [
               { endTime: { lte: data.startTime } },
               { startTime: { gte: data.endTime } }
             ]
          }
        }
      });
      if (overlaps.length > 0) {
         return res.status(400).json({ error: 'Terdapat aktivitas lain pada rentang jam tersebut' });
      }
    }

    const masterAct = await prisma.masterActivity.findUnique({ where: { actKey: data.actKey } });
    if (!masterAct) return res.status(400).json({ error: 'Kategori aktivitas tidak valid' });
    if (masterAct.source === 'jira') {
      return res.status(400).json({ error: 'Kategori sinkron otomatis tidak bisa diinput manual. Tambahkan worklog langsung di Jira.' });
    }

    let finalTicketTitle = data.ticketTitle || null;

    const activity = await prisma.activity.create({
      data: {
        userId,
        actKey: data.actKey,
        topic: data.topic || null,
        note: data.note || null,
        dur: data.dur, // Zod already parses to number
        date: data.date,
        startTime: data.startTime || null,
        endTime: data.endTime || null,
        status: data.status || 'completed',
        source: masterAct.source,
        ticketId: data.ticketId || null,
        ticketTitle: finalTicketTitle,
        customerName: data.customerName || null,
        prName: data.prName || null,
        nps: data.nps ?? null,
        leadId: data.leadId || null,
        prospectValue: data.prospectValue ?? null,
      },
      include: { attachments: true, user: { select: { id: true, name: true, role: true, team: true, avatarUrl: true } } }
    });

    await writeAudit(req, {
      action: 'activity.create',
      entityType: 'activity',
      entityId: activity.id,
      after: activity,
    });

    res.status(201).json(activity);
  } catch (error) {
    if (req.log) req.log.error(error, "Create activity error");
    res.status(500).json({ error: 'Gagal menyimpan log aktivitas' });
  }
};

export const updateActivity = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    // Zod Validation
    const validation = ActivitySchema.safeParse(req.body);
    if (!validation.success) {
      const issue = validation.error.issues[0];
      const field = issue.path.join('.') || 'payload';
      return res.status(400).json({ error: `${field}: ${issue.message}` });
    }
    const data = validation.data;

    const current = await prisma.activity.findUnique({ where: { id } });
    if (!current) return res.status(404).json({ error: 'Activity not found' });
    if (current.source === 'jira') {
      return res.status(400).json({ error: 'Aktivitas sinkron otomatis hanya bisa diubah dari Jira.' });
    }

    const masterAct = await prisma.masterActivity.findUnique({ where: { actKey: data.actKey } });
    if (!masterAct) return res.status(400).json({ error: 'Kategori aktivitas tidak valid' });
    if (masterAct.source === 'jira') {
      return res.status(400).json({ error: 'Kategori sinkron otomatis tidak bisa dipilih untuk input manual.' });
    }
    
    // Logic: allow update if owner or admin
    
    const activity = await prisma.activity.update({
      where: { id },
      data: {
        actKey: data.actKey,
        topic: data.topic || null,
        note: data.note || null,
        dur: data.dur,
        date: data.date,
        startTime: data.startTime || null,
        endTime: data.endTime || null,
        status: data.status,
        ticketId: data.ticketId || null,
        ticketTitle: data.ticketTitle || null,
        customerName: data.customerName || null,
        prName: data.prName || null,
        nps: data.nps ?? null,
        leadId: data.leadId || null,
        prospectValue: data.prospectValue ?? null,
      },
      include: { attachments: true, user: { select: { id: true, name: true, role: true, team: true, avatarUrl: true } } }
    });

    await writeAudit(req, {
      action: 'activity.update',
      entityType: 'activity',
      entityId: activity.id,
      before: current,
      after: activity,
    });

    res.json(activity);
  } catch (error) {
    if (req.log) req.log.error(error, "Update activity error");
    res.status(500).json({ error: 'Gagal memperbarui aktivitas' });
  }
};

export const deleteActivity = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    
    // Fetch to get attachments
    const activity = await prisma.activity.findUnique({
      where: { id },
      include: { attachments: true }
    });

    if (!activity) return res.status(404).json({ error: 'Activity not found' });
    if (activity.source === 'jira') {
      return res.status(400).json({ error: 'Aktivitas sinkron otomatis hanya bisa dihapus dari Jira.' });
    }

    // Clean up files
    for (const att of activity.attachments) {
      const p = path.join(__dirname, '../../uploads', att.filename);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }

    await prisma.activity.delete({ where: { id } });

    await writeAudit(req, {
      action: 'activity.delete',
      entityType: 'activity',
      entityId: id,
      before: activity,
    });
    
    res.json({ message: 'Aktivitas berhasil dihapus' });
  } catch (error) {
    res.status(500).json({ error: 'Gagal menghapus aktivitas' });
  }
};

export const uploadAttachment = async (req: AuthRequest, res: Response) => {
  try {
    const activityId = String(req.params.id);
    const file = req.file;

    if (!file) return res.status(400).json({ error: 'Tidak ada file yang diunggah' });

    const attachment = await prisma.attachment.create({
      data: {
        activityId,
        filename: file.filename,
        path: `/uploads/${file.filename}`,
        mimetype: file.mimetype,
        size: file.size
      }
    });

    await writeAudit(req, {
      action: 'activity.attachment_upload',
      entityType: 'attachment',
      entityId: attachment.id,
      after: attachment,
      metadata: { activityId },
    });

    res.json(attachment);
  } catch (error) {
    res.status(500).json({ error: 'Gagal mengunggah file' });
  }
};

export const deleteAttachment = async (req: AuthRequest, res: Response) => {
  try {
    const attId = String(req.params.attId);

    const attachment = await prisma.attachment.findUnique({ where: { id: attId } });
    if (!attachment) return res.status(404).json({ error: 'Attachment not found' });

    const p = path.join(__dirname, '../../uploads', attachment.filename);
    if (fs.existsSync(p)) fs.unlinkSync(p);

    await prisma.attachment.delete({ where: { id: attId } });

    await writeAudit(req, {
      action: 'activity.attachment_delete',
      entityType: 'attachment',
      entityId: attId,
      before: attachment,
    });

    res.json({ message: 'File dihapus' });
  } catch (error) {
    res.status(500).json({ error: 'Gagal menghapus file' });
  }
};

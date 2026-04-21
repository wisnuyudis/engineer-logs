import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middlewares/authMiddleware';
import fs from 'fs';
import path from 'path';
import { ActivitySchema } from '../validators/zodSchemas';
import { z } from 'zod';

const prisma = new PrismaClient();

export const getActivities = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const role = req.user?.role;
    
    // Admin, PM, mgr_dl, mgr_ps can view all activities (or team specific)
    // For simplicity, let's fetch all (in production you would filter by team/subordinates)
    const isAdminOrMgr = ['admin', 'mgr_dl', 'mgr_ps'].includes(role || '');
    
    const whereClause = isAdminOrMgr ? {} : { userId };

    const activities = await prisma.activity.findMany({
      where: whereClause,
      include: {
        attachments: true,
        user: {
          select: { name: true, role: true, team: true, id: true, avatarUrl: true }
        }
      },
      orderBy: { date: 'desc' }
    });

    res.json(activities);
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
      return res.status(400).json({ error: validation.error.issues[0].message });
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

    const activity = await prisma.activity.create({
      data: {
        userId,
        actKey: data.actKey,
        topic: data.topic,
        dur: data.dur, // Zod already parses to number
        date: data.date,
        startTime: data.startTime || null,
        endTime: data.endTime || null,
        status: data.status || 'completed',
        source: 'app',
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
      return res.status(400).json({ error: validation.error.issues[0].message });
    }
    const data = validation.data;
    
    // Logic: allow update if owner or admin
    
    const activity = await prisma.activity.update({
      where: { id },
      data: {
        actKey: data.actKey,
        topic: data.topic,
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

    // Clean up files
    for (const att of activity.attachments) {
      const p = path.join(__dirname, '../../uploads', att.filename);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }

    await prisma.activity.delete({ where: { id } });
    
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

    res.json({ message: 'File dihapus' });
  } catch (error) {
    res.status(500).json({ error: 'Gagal menghapus file' });
  }
};

import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middlewares/authMiddleware';
import { writeAudit } from '../utils/auditTrail';

const prisma = new PrismaClient();

const TAXONOMY_PRESENTATION: Record<string, Partial<{ label: string; desc: string }>> = {
  jira_impl: { label: 'Implementation', desc: 'Pekerjaan implementasi yang tersinkron otomatis dari worklog project.' },
  jira_pm: { label: 'Preventive Maint.', desc: 'Pekerjaan preventive maintenance yang tersinkron otomatis dari worklog.' },
  jira_cm: { label: 'Corrective Maint.', desc: 'Penanganan problem/incident yang tersinkron otomatis dari worklog.' },
  jira_enh: { label: 'Enhancement', desc: 'Permintaan enhancement yang tersinkron otomatis dari worklog.' },
  jira_ops: { label: 'Operational Svc', desc: 'Layanan operasional yang tersinkron otomatis dari worklog.' },
};

// Get all taxonomies
export const getAllTaxonomies = async (req: Request, res: Response) => {
  try {
    const data = await prisma.masterActivity.findMany({
      orderBy: { createdAt: 'asc' }
    });
    res.json(data.map((item) => ({
      ...item,
      ...TAXONOMY_PRESENTATION[item.actKey],
    })));
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

// Toggle Active/Inactive
export const toggleTaxonomy = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { isActive } = req.body;
    const current = await prisma.masterActivity.findUnique({ where: { id } });
    const data = await prisma.masterActivity.update({
      where: { id },
      data: { isActive }
    });
    await writeAudit(req as AuthRequest, {
      action: 'taxonomy.toggle',
      entityType: 'master_activity',
      entityId: id,
      before: current,
      after: data,
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update taxonomy state' });
  }
};

// Create new taxonomy
export const createTaxonomy = async (req: Request, res: Response) => {
  try {
    const { actKey, ...rest } = req.body;
    const exists = await prisma.masterActivity.findUnique({ where: { actKey } });
    if (exists) return res.status(400).json({ error: 'Activity key (actKey) sudah terdaftar' });

    const created = await prisma.masterActivity.create({
      data: { actKey, ...rest }
    });
    await writeAudit(req as AuthRequest, {
      action: 'taxonomy.create',
      entityType: 'master_activity',
      entityId: created.id,
      after: created,
    });
    res.json(created);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create taxonomy' });
  }
};

// Update taxonomy
export const updateTaxonomy = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const current = await prisma.masterActivity.findUnique({ where: { id } });
    const updated = await prisma.masterActivity.update({
      where: { id },
      data: req.body
    });
    await writeAudit(req as AuthRequest, {
      action: 'taxonomy.update',
      entityType: 'master_activity',
      entityId: id,
      before: current,
      after: updated,
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update taxonomy' });
  }
};

import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middlewares/authMiddleware';
import { writeAudit } from '../utils/auditTrail';
import { fetchJiraOrganizationNameSuggestions } from '../services/jiraService';

const prisma = new PrismaClient();

const isAdminRole = (role?: string | null) => String(role || '').toLowerCase() === 'admin';

const normalizeName = (value: unknown) => String(value || '').trim().replace(/\s+/g, ' ');
const toNameKey = (value: string) => value.toLowerCase();
const normalizeAddress = (value: unknown) => {
  const address = String(value || '').trim();
  return address || null;
};
const normalizeStringList = (value: unknown) => {
  const items = Array.isArray(value)
    ? value
    : String(value || '').split(/\r?\n|,/);
  return Array.from(new Set(
    items
      .map((item) => String(item || '').trim().replace(/\s+/g, ' '))
      .filter(Boolean)
  )).sort((a, b) => a.localeCompare(b));
};

export const getCustomers = async (req: AuthRequest, res: Response) => {
  try {
    const includeInactive = String(req.query.includeInactive || '') === 'true' && isAdminRole(req.user?.role);
    const search = String(req.query.search || '').trim();

    const customers = await prisma.customer.findMany({
      where: {
        ...(includeInactive ? {} : { isActive: true }),
        ...(search ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { address: { contains: search, mode: 'insensitive' } },
          ],
        } : {}),
      },
      orderBy: { name: 'asc' },
    });

    res.json(customers);
  } catch {
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
};

export const createCustomer = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminRole(req.user?.role)) return res.status(403).json({ error: 'Insufficient permissions' });

    const name = normalizeName(req.body?.name);
    if (!name) return res.status(400).json({ error: 'Nama perusahaan wajib diisi' });
    const normalizedName = toNameKey(name);

    const exists = await prisma.customer.findUnique({ where: { normalizedName } });
    if (exists) return res.status(400).json({ error: 'Nama perusahaan sudah terdaftar' });

    const created = await prisma.customer.create({
      data: {
        name,
        normalizedName,
        address: normalizeAddress(req.body?.address),
        jiraOrganizationNames: normalizeStringList(req.body?.jiraOrganizationNames),
        isActive: req.body?.isActive == null ? true : Boolean(req.body.isActive),
      },
    });

    await writeAudit(req, {
      action: 'customer.create',
      entityType: 'customer',
      entityId: created.id,
      after: created,
    });

    res.status(201).json(created);
  } catch {
    res.status(500).json({ error: 'Failed to create customer' });
  }
};

export const updateCustomer = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminRole(req.user?.role)) return res.status(403).json({ error: 'Insufficient permissions' });

    const id = String(req.params.id);
    const current = await prisma.customer.findUnique({ where: { id } });
    if (!current) return res.status(404).json({ error: 'Customer tidak ditemukan' });

    const name = normalizeName(req.body?.name);
    if (!name) return res.status(400).json({ error: 'Nama perusahaan wajib diisi' });
    const normalizedName = toNameKey(name);

    const duplicate = await prisma.customer.findUnique({ where: { normalizedName } });
    if (duplicate && duplicate.id !== id) return res.status(400).json({ error: 'Nama perusahaan sudah terdaftar' });

    const updated = await prisma.customer.update({
      where: { id },
      data: {
        name,
        normalizedName,
        address: normalizeAddress(req.body?.address),
        jiraOrganizationNames: normalizeStringList(req.body?.jiraOrganizationNames),
        isActive: req.body?.isActive == null ? current.isActive : Boolean(req.body.isActive),
      },
    });

    await writeAudit(req, {
      action: 'customer.update',
      entityType: 'customer',
      entityId: id,
      before: current,
      after: updated,
    });

    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Failed to update customer' });
  }
};

export const toggleCustomer = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminRole(req.user?.role)) return res.status(403).json({ error: 'Insufficient permissions' });

    const id = String(req.params.id);
    const current = await prisma.customer.findUnique({ where: { id } });
    if (!current) return res.status(404).json({ error: 'Customer tidak ditemukan' });

    const updated = await prisma.customer.update({
      where: { id },
      data: { isActive: Boolean(req.body?.isActive) },
    });

    await writeAudit(req, {
      action: updated.isActive ? 'customer.activate' : 'customer.deactivate',
      entityType: 'customer',
      entityId: id,
      before: current,
      after: updated,
    });

    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Failed to update customer status' });
  }
};

export const getJiraOrganizationSuggestions = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminRole(req.user?.role)) return res.status(403).json({ error: 'Insufficient permissions' });
    const search = String(req.query.search || '');
    const items = await fetchJiraOrganizationNameSuggestions(search);
    res.json({ items });
  } catch (error: any) {
    req.log?.error(error, 'Failed to fetch Jira organization suggestions');
    res.status(500).json({ error: error?.message || 'Failed to fetch Jira organization suggestions' });
  }
};

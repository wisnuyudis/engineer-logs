"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toggleCustomer = exports.updateCustomer = exports.createCustomer = exports.getCustomers = void 0;
const client_1 = require("@prisma/client");
const auditTrail_1 = require("../utils/auditTrail");
const prisma = new client_1.PrismaClient();
const isAdminRole = (role) => String(role || '').toLowerCase() === 'admin';
const normalizeName = (value) => String(value || '').trim().replace(/\s+/g, ' ');
const toNameKey = (value) => value.toLowerCase();
const normalizeAddress = (value) => {
    const address = String(value || '').trim();
    return address || null;
};
const getCustomers = async (req, res) => {
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
    }
    catch {
        res.status(500).json({ error: 'Failed to fetch customers' });
    }
};
exports.getCustomers = getCustomers;
const createCustomer = async (req, res) => {
    try {
        if (!isAdminRole(req.user?.role))
            return res.status(403).json({ error: 'Insufficient permissions' });
        const name = normalizeName(req.body?.name);
        if (!name)
            return res.status(400).json({ error: 'Nama perusahaan wajib diisi' });
        const normalizedName = toNameKey(name);
        const exists = await prisma.customer.findUnique({ where: { normalizedName } });
        if (exists)
            return res.status(400).json({ error: 'Nama perusahaan sudah terdaftar' });
        const created = await prisma.customer.create({
            data: {
                name,
                normalizedName,
                address: normalizeAddress(req.body?.address),
                isActive: req.body?.isActive == null ? true : Boolean(req.body.isActive),
            },
        });
        await (0, auditTrail_1.writeAudit)(req, {
            action: 'customer.create',
            entityType: 'customer',
            entityId: created.id,
            after: created,
        });
        res.status(201).json(created);
    }
    catch {
        res.status(500).json({ error: 'Failed to create customer' });
    }
};
exports.createCustomer = createCustomer;
const updateCustomer = async (req, res) => {
    try {
        if (!isAdminRole(req.user?.role))
            return res.status(403).json({ error: 'Insufficient permissions' });
        const id = String(req.params.id);
        const current = await prisma.customer.findUnique({ where: { id } });
        if (!current)
            return res.status(404).json({ error: 'Customer tidak ditemukan' });
        const name = normalizeName(req.body?.name);
        if (!name)
            return res.status(400).json({ error: 'Nama perusahaan wajib diisi' });
        const normalizedName = toNameKey(name);
        const duplicate = await prisma.customer.findUnique({ where: { normalizedName } });
        if (duplicate && duplicate.id !== id)
            return res.status(400).json({ error: 'Nama perusahaan sudah terdaftar' });
        const updated = await prisma.customer.update({
            where: { id },
            data: {
                name,
                normalizedName,
                address: normalizeAddress(req.body?.address),
                isActive: req.body?.isActive == null ? current.isActive : Boolean(req.body.isActive),
            },
        });
        await (0, auditTrail_1.writeAudit)(req, {
            action: 'customer.update',
            entityType: 'customer',
            entityId: id,
            before: current,
            after: updated,
        });
        res.json(updated);
    }
    catch {
        res.status(500).json({ error: 'Failed to update customer' });
    }
};
exports.updateCustomer = updateCustomer;
const toggleCustomer = async (req, res) => {
    try {
        if (!isAdminRole(req.user?.role))
            return res.status(403).json({ error: 'Insufficient permissions' });
        const id = String(req.params.id);
        const current = await prisma.customer.findUnique({ where: { id } });
        if (!current)
            return res.status(404).json({ error: 'Customer tidak ditemukan' });
        const updated = await prisma.customer.update({
            where: { id },
            data: { isActive: Boolean(req.body?.isActive) },
        });
        await (0, auditTrail_1.writeAudit)(req, {
            action: updated.isActive ? 'customer.activate' : 'customer.deactivate',
            entityType: 'customer',
            entityId: id,
            before: current,
            after: updated,
        });
        res.json(updated);
    }
    catch {
        res.status(500).json({ error: 'Failed to update customer status' });
    }
};
exports.toggleCustomer = toggleCustomer;

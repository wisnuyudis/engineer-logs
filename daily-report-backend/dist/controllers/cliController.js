"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCliActivity = exports.getCliActivities = exports.getCliCategories = exports.getCliMe = exports.exchangeCliLinkToken = exports.getCliStatus = exports.generateCliLinkToken = void 0;
const client_1 = require("@prisma/client");
const crypto_1 = __importDefault(require("crypto"));
const cliAuthMiddleware_1 = require("../middlewares/cliAuthMiddleware");
const zodSchemas_1 = require("../validators/zodSchemas");
const auditTrail_1 = require("../utils/auditTrail");
const prisma = new client_1.PrismaClient();
const MANUAL_SOURCES = ['app', 'telegram', 'cli'];
const ADMIN_ROLES = ['admin', 'superadmin', 'super_admin'];
const MANAGER_ROLES = ['admin', 'mgr_dl', 'mgr_ps'];
const isAdminOrManagerRole = (role) => MANAGER_ROLES.includes(role || '');
const toPositiveInt = (value, fallback, min = 1, max = 100) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed))
        return fallback;
    return Math.min(max, Math.max(min, Math.floor(parsed)));
};
const validatePublicKey = (publicKeyPem) => {
    const key = crypto_1.default.createPublicKey(publicKeyPem);
    const details = key.asymmetricKeyDetails;
    if (key.asymmetricKeyType !== 'rsa' || details?.modulusLength !== 2048) {
        throw new Error('Public key harus RSA-2048.');
    }
    return key.export({ type: 'spki', format: 'pem' }).toString();
};
const canUseCategory = (category, user) => {
    if (!category.isActive)
        return false;
    if (category.source === 'jira')
        return false;
    if (category.actKey === 'pm_presentation')
        return false;
    if (ADMIN_ROLES.includes(user.role.toLowerCase()))
        return true;
    return category.team === 'all' || category.team === (user.team || '');
};
const generateCliLinkToken = async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const token = crypto_1.default.randomBytes(16).toString('base64url').toUpperCase();
        await prisma.setting.upsert({
            where: { key: `clihost_${userId}` },
            update: { value: token, description: 'CLI Handshake Token' },
            create: { key: `clihost_${userId}`, value: token, description: 'CLI Handshake Token' },
        });
        await (0, auditTrail_1.writeAudit)(req, {
            action: 'cli.link_token_generate',
            entityType: 'cli_link',
            entityId: userId,
            after: { tokenGenerated: true },
        });
        return res.json({
            token,
            message: `Gunakan token ini di CLI: elog auth --token ${token}`,
        });
    }
    catch (error) {
        return res.status(500).json({ error: 'Gagal membuat token CLI' });
    }
};
exports.generateCliLinkToken = generateCliLinkToken;
const getCliStatus = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user?.userId },
            select: { cliKeyFingerprint: true, cliLinkedAt: true },
        });
        return res.json({
            isLinked: !!user?.cliKeyFingerprint,
            fingerprint: user?.cliKeyFingerprint || null,
            linkedAt: user?.cliLinkedAt || null,
        });
    }
    catch (error) {
        return res.status(500).json({ error: 'Gagal mendapatkan status CLI' });
    }
};
exports.getCliStatus = getCliStatus;
const exchangeCliLinkToken = async (req, res) => {
    try {
        const token = String(req.body?.token || '').trim().toUpperCase();
        const publicKeyPemInput = String(req.body?.publicKeyPem || '').trim();
        if (!token || !publicKeyPemInput) {
            return res.status(400).json({ error: 'token dan publicKeyPem wajib diisi' });
        }
        const publicKeyPem = validatePublicKey(publicKeyPemInput);
        const setting = await prisma.setting.findFirst({
            where: { value: token, key: { startsWith: 'clihost_' } },
        });
        if (!setting) {
            return res.status(400).json({ error: 'Token CLI tidak valid atau sudah digunakan' });
        }
        const userId = setting.key.replace('clihost_', '');
        const fingerprint = (0, cliAuthMiddleware_1.publicKeyFingerprint)(publicKeyPem);
        const user = await prisma.user.update({
            where: { id: userId },
            data: {
                cliPublicKeyPem: publicKeyPem,
                cliKeyFingerprint: fingerprint,
                cliLinkedAt: new Date(),
            },
            select: { id: true, email: true, name: true, role: true, team: true },
        });
        await prisma.setting.delete({ where: { key: setting.key } });
        await (0, auditTrail_1.writeAuditSystem)({
            userId,
            action: 'cli.link',
            entityType: 'cli_link',
            entityId: userId,
            after: { fingerprint },
            userAgent: req.headers['user-agent'] ? String(req.headers['user-agent']) : 'engineerlog-cli',
            ipAddress: req.ip,
        });
        return res.json({ keyId: fingerprint, user });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Gagal menghubungkan CLI';
        return res.status(400).json({ error: message });
    }
};
exports.exchangeCliLinkToken = exchangeCliLinkToken;
const getCliMe = async (req, res) => {
    return res.json({ user: req.cliUser });
};
exports.getCliMe = getCliMe;
const getCliCategories = async (req, res) => {
    try {
        const user = req.cliUser;
        if (!user)
            return res.status(401).json({ error: 'Unauthorized' });
        const categories = await prisma.masterActivity.findMany({
            where: { isActive: true },
            orderBy: [{ team: 'asc' }, { actKey: 'asc' }],
        });
        return res.json({
            items: categories.filter((category) => canUseCategory(category, user)),
        });
    }
    catch (error) {
        return res.status(500).json({ error: 'Gagal memuat kategori CLI' });
    }
};
exports.getCliCategories = getCliCategories;
const getCliActivities = async (req, res) => {
    try {
        const user = req.cliUser;
        if (!user)
            return res.status(401).json({ error: 'Unauthorized' });
        const { limit = '5', actKey, status, source = 'manual', dateFrom, dateTo, search = '', } = req.query;
        const isAdminOrMgr = isAdminOrManagerRole(user.role);
        const whereClause = isAdminOrMgr ? {} : { userId: user.userId };
        if (actKey)
            whereClause.actKey = actKey;
        if (status)
            whereClause.status = status;
        if (source === 'manual')
            whereClause.source = { in: MANUAL_SOURCES };
        else if (source && source !== 'all')
            whereClause.source = source;
        if (dateFrom || dateTo) {
            whereClause.date = {};
            if (dateFrom)
                whereClause.date.gte = dateFrom;
            if (dateTo)
                whereClause.date.lte = dateTo;
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
    }
    catch (error) {
        return res.status(500).json({ error: 'Gagal memuat activity CLI' });
    }
};
exports.getCliActivities = getCliActivities;
const createCliActivity = async (req, res) => {
    try {
        const user = req.cliUser;
        if (!user)
            return res.status(401).json({ error: 'Unauthorized' });
        const validation = zodSchemas_1.ActivitySchema.safeParse(req.body);
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
        await (0, auditTrail_1.writeAuditSystem)({
            userId: user.userId,
            action: 'activity.create_cli',
            entityType: 'activity',
            entityId: activity.id,
            after: activity,
            metadata: { source: 'cli' },
            userAgent: 'engineerlog-cli',
        });
        return res.status(201).json(activity);
    }
    catch (error) {
        return res.status(500).json({ error: 'Gagal menyimpan log activity dari CLI' });
    }
};
exports.createCliActivity = createCliActivity;

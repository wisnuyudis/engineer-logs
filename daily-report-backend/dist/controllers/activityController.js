"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteAttachment = exports.downloadAttachment = exports.previewAttachment = exports.uploadAttachment = exports.deleteActivity = exports.updateActivity = exports.createActivity = exports.getActivities = void 0;
const client_1 = require("@prisma/client");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const zodSchemas_1 = require("../validators/zodSchemas");
const auditTrail_1 = require("../utils/auditTrail");
const prisma = new client_1.PrismaClient();
const normalizeIdentity = (value) => (value || '').trim().replace(/\s+/g, ' ').toLowerCase();
const SORT_FIELDS = {
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
const isAdminOrManagerRole = (role) => ['admin', 'mgr_dl', 'mgr_ps'].includes(role || '');
const canAccessAttachment = async (req, attachmentId) => {
    const actorId = req.user?.userId;
    const role = req.user?.role;
    if (!actorId)
        return null;
    const attachment = await prisma.attachment.findUnique({
        where: { id: attachmentId },
        include: { activity: { select: { userId: true } } },
    });
    if (!attachment)
        return null;
    const canAccess = attachment.activity.userId === actorId || isAdminOrManagerRole(role);
    return canAccess ? attachment : 'forbidden';
};
const resolveAttachmentFile = (filename) => path_1.default.join(__dirname, '../../uploads', filename);
const setAttachmentHeaders = (res, attachment, disposition) => {
    const safeName = path_1.default.basename(attachment.filename).replace(/"/g, '');
    res.setHeader('Content-Type', attachment.mimetype || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `${disposition}; filename="${safeName}"`);
};
const toPositiveInt = (value, fallback, min = 1, max = 100) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed))
        return fallback;
    return Math.min(max, Math.max(min, Math.floor(parsed)));
};
const getActivities = async (req, res) => {
    try {
        const userId = req.user?.userId;
        const role = req.user?.role;
        const { page = '1', pageSize = '10', paginate = 'true', search = '', sortBy = 'date', sortDir = 'desc', actKey, status, userId: filterUserId, team, source, sourceGroup, dateFrom, dateTo, } = req.query;
        const isAdminOrMgr = isAdminOrManagerRole(role);
        const shouldPaginate = paginate !== 'false';
        const currentPage = toPositiveInt(page, 1, 1, 100000);
        const currentPageSize = toPositiveInt(pageSize, 10, 1, 100);
        const normalizedSearch = search.trim();
        const normalizedSortBy = SORT_FIELDS[sortBy] || 'date';
        const normalizedSortDir = sortDir === 'asc' ? 'asc' : 'desc';
        const whereClause = isAdminOrMgr ? {} : { userId };
        if (actKey)
            whereClause.actKey = actKey;
        if (status)
            whereClause.status = status;
        if (dateFrom || dateTo) {
            whereClause.date = {};
            if (dateFrom)
                whereClause.date.gte = dateFrom;
            if (dateTo)
                whereClause.date.lte = dateTo;
        }
        if (isAdminOrMgr && filterUserId && filterUserId !== 'all') {
            whereClause.userId = filterUserId;
        }
        if (team && team !== 'all') {
            whereClause.user = { is: { team } };
        }
        if (sourceGroup === 'synced') {
            whereClause.source = 'jira';
        }
        else if (sourceGroup === 'manual') {
            whereClause.source = { in: ['app', 'telegram', 'cli'] };
        }
        else if (source && source !== 'all') {
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
        const queryOptions = {
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
    }
    catch (error) {
        res.status(500).json({ error: 'Gagal memuat log aktivitas' });
    }
};
exports.getActivities = getActivities;
const createActivity = async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        // Zod Validation
        const validation = zodSchemas_1.ActivitySchema.safeParse(req.body);
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
        if (!masterAct)
            return res.status(400).json({ error: 'Kategori aktivitas tidak valid' });
        if (data.actKey === 'pm_presentation') {
            return res.status(400).json({ error: 'Kategori Q PM Presentation sudah tidak digunakan.' });
        }
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
        await (0, auditTrail_1.writeAudit)(req, {
            action: 'activity.create',
            entityType: 'activity',
            entityId: activity.id,
            after: activity,
        });
        res.status(201).json(activity);
    }
    catch (error) {
        if (req.log)
            req.log.error(error, "Create activity error");
        res.status(500).json({ error: 'Gagal menyimpan log aktivitas' });
    }
};
exports.createActivity = createActivity;
const updateActivity = async (req, res) => {
    try {
        const id = String(req.params.id);
        const actorId = req.user?.userId;
        const role = req.user?.role;
        // Zod Validation
        const validation = zodSchemas_1.ActivitySchema.safeParse(req.body);
        if (!validation.success) {
            const issue = validation.error.issues[0];
            const field = issue.path.join('.') || 'payload';
            return res.status(400).json({ error: `${field}: ${issue.message}` });
        }
        const data = validation.data;
        const current = await prisma.activity.findUnique({ where: { id } });
        if (!current)
            return res.status(404).json({ error: 'Activity not found' });
        const isAdminOrMgr = isAdminOrManagerRole(role);
        if (!actorId || (current.userId !== actorId && !isAdminOrMgr)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        if (current.source === 'jira') {
            return res.status(400).json({ error: 'Aktivitas sinkron otomatis hanya bisa diubah dari Jira.' });
        }
        const masterAct = await prisma.masterActivity.findUnique({ where: { actKey: data.actKey } });
        if (!masterAct)
            return res.status(400).json({ error: 'Kategori aktivitas tidak valid' });
        if (data.actKey === 'pm_presentation') {
            return res.status(400).json({ error: 'Kategori Q PM Presentation sudah tidak digunakan.' });
        }
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
        await (0, auditTrail_1.writeAudit)(req, {
            action: 'activity.update',
            entityType: 'activity',
            entityId: activity.id,
            before: current,
            after: activity,
        });
        res.json(activity);
    }
    catch (error) {
        if (req.log)
            req.log.error(error, "Update activity error");
        res.status(500).json({ error: 'Gagal memperbarui aktivitas' });
    }
};
exports.updateActivity = updateActivity;
const deleteActivity = async (req, res) => {
    try {
        const id = String(req.params.id);
        const actorId = req.user?.userId;
        const role = req.user?.role;
        // Fetch to get attachments
        const activity = await prisma.activity.findUnique({
            where: { id },
            include: { attachments: true }
        });
        if (!activity)
            return res.status(404).json({ error: 'Activity not found' });
        const isAdminOrMgr = ['admin', 'mgr_dl', 'mgr_ps'].includes(role || '');
        if (!actorId || (activity.userId !== actorId && !isAdminOrMgr)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        if (activity.source === 'jira') {
            return res.status(400).json({ error: 'Aktivitas sinkron otomatis hanya bisa dihapus dari Jira.' });
        }
        // Clean up files
        for (const att of activity.attachments) {
            const p = path_1.default.join(__dirname, '../../uploads', att.filename);
            if (fs_1.default.existsSync(p))
                fs_1.default.unlinkSync(p);
        }
        await prisma.activity.delete({ where: { id } });
        await (0, auditTrail_1.writeAudit)(req, {
            action: 'activity.delete',
            entityType: 'activity',
            entityId: id,
            before: activity,
        });
        res.json({ message: 'Aktivitas berhasil dihapus' });
    }
    catch (error) {
        res.status(500).json({ error: 'Gagal menghapus aktivitas' });
    }
};
exports.deleteActivity = deleteActivity;
const uploadAttachment = async (req, res) => {
    try {
        const activityId = String(req.params.id);
        const file = req.file;
        const actorId = req.user?.userId;
        const role = req.user?.role;
        if (!file)
            return res.status(400).json({ error: 'Tidak ada file yang diunggah' });
        const activity = await prisma.activity.findUnique({ where: { id: activityId } });
        if (!activity)
            return res.status(404).json({ error: 'Activity not found' });
        if (!actorId || (activity.userId !== actorId && !isAdminOrManagerRole(role))) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        const attachment = await prisma.attachment.create({
            data: {
                activityId,
                filename: file.filename,
                path: `/uploads/${file.filename}`,
                mimetype: file.mimetype,
                size: file.size
            }
        });
        await (0, auditTrail_1.writeAudit)(req, {
            action: 'activity.attachment_upload',
            entityType: 'attachment',
            entityId: attachment.id,
            after: attachment,
            metadata: { activityId },
        });
        res.json(attachment);
    }
    catch (error) {
        res.status(500).json({ error: 'Gagal mengunggah file' });
    }
};
exports.uploadAttachment = uploadAttachment;
const previewAttachment = async (req, res) => {
    try {
        const attId = String(req.params.attId);
        const attachment = await canAccessAttachment(req, attId);
        if (!attachment)
            return res.status(404).json({ error: 'Attachment not found' });
        if (attachment === 'forbidden')
            return res.status(403).json({ error: 'Insufficient permissions' });
        const filePath = resolveAttachmentFile(attachment.filename);
        if (!fs_1.default.existsSync(filePath))
            return res.status(404).json({ error: 'File not found' });
        setAttachmentHeaders(res, attachment, 'inline');
        return res.sendFile(filePath);
    }
    catch (error) {
        res.status(500).json({ error: 'Gagal membuka preview lampiran' });
    }
};
exports.previewAttachment = previewAttachment;
const downloadAttachment = async (req, res) => {
    try {
        const attId = String(req.params.attId);
        const attachment = await canAccessAttachment(req, attId);
        if (!attachment)
            return res.status(404).json({ error: 'Attachment not found' });
        if (attachment === 'forbidden')
            return res.status(403).json({ error: 'Insufficient permissions' });
        const filePath = resolveAttachmentFile(attachment.filename);
        if (!fs_1.default.existsSync(filePath))
            return res.status(404).json({ error: 'File not found' });
        setAttachmentHeaders(res, attachment, 'attachment');
        return res.sendFile(filePath);
    }
    catch (error) {
        res.status(500).json({ error: 'Gagal mengunduh lampiran' });
    }
};
exports.downloadAttachment = downloadAttachment;
const deleteAttachment = async (req, res) => {
    try {
        const attId = String(req.params.attId);
        const attachment = await canAccessAttachment(req, attId);
        if (!attachment)
            return res.status(404).json({ error: 'Attachment not found' });
        if (attachment === 'forbidden')
            return res.status(403).json({ error: 'Insufficient permissions' });
        const p = resolveAttachmentFile(attachment.filename);
        if (fs_1.default.existsSync(p))
            fs_1.default.unlinkSync(p);
        await prisma.attachment.delete({ where: { id: attId } });
        await (0, auditTrail_1.writeAudit)(req, {
            action: 'activity.attachment_delete',
            entityType: 'attachment',
            entityId: attId,
            before: attachment,
        });
        res.json({ message: 'File dihapus' });
    }
    catch (error) {
        res.status(500).json({ error: 'Gagal menghapus file' });
    }
};
exports.deleteAttachment = deleteAttachment;

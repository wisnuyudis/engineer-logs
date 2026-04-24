"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteAttachment = exports.uploadAttachment = exports.deleteActivity = exports.updateActivity = exports.createActivity = exports.getActivities = void 0;
const client_1 = require("@prisma/client");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const zodSchemas_1 = require("../validators/zodSchemas");
const prisma = new client_1.PrismaClient();
const normalizeIdentity = (value) => (value || '').trim().replace(/\s+/g, ' ').toLowerCase();
const getActivities = async (req, res) => {
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
        let finalTicketTitle = data.ticketTitle || null;
        if (masterAct.source === 'jira') {
            if (!data.ticketId)
                return res.status(400).json({ error: 'Ticket ID wajib diisi untuk kategori ini' });
            try {
                const { fetchJiraTicket } = await Promise.resolve().then(() => __importStar(require('../services/jiraService')));
                const jiraData = await fetchJiraTicket(data.ticketId);
                const currentUser = await prisma.user.findUnique({ where: { id: userId } });
                const appEmail = currentUser?.email.toLowerCase() || '';
                const appName = normalizeIdentity(currentUser?.name);
                const jiraEmail = jiraData.assigneeEmail ? jiraData.assigneeEmail.toLowerCase() : '';
                const jiraDisplayName = normalizeIdentity(jiraData.assigneeDisplayName);
                if (!jiraEmail && !jiraDisplayName && !jiraData.assigneeAccountId) {
                    return res.status(400).json({ error: 'Tiket JIRA belum di-assign (Unassigned). Silakan assign ke email Anda di Jira terlebih dahulu.' });
                }
                if (jiraEmail && jiraEmail !== appEmail) {
                    return res.status(400).json({ error: `Tiket ${data.ticketId} ditugaskan ke ${jiraEmail}, bukan ke email Anda (${appEmail}). Akses ditolak!` });
                }
                if (!jiraEmail && jiraDisplayName && jiraDisplayName !== appName) {
                    return res.status(400).json({
                        error: `Tiket ${data.ticketId} ditugaskan ke ${jiraData.assigneeDisplayName}, bukan ke user Anda (${currentUser?.name}). Email assignee disembunyikan oleh Jira.`
                    });
                }
                finalTicketTitle = jiraData.summary;
            }
            catch (e) {
                return res.status(400).json({ error: e.message || 'Gagal terhubung ke Jira' });
            }
        }
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
        // Zod Validation
        const validation = zodSchemas_1.ActivitySchema.safeParse(req.body);
        if (!validation.success) {
            const issue = validation.error.issues[0];
            const field = issue.path.join('.') || 'payload';
            return res.status(400).json({ error: `${field}: ${issue.message}` });
        }
        const data = validation.data;
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
        // Fetch to get attachments
        const activity = await prisma.activity.findUnique({
            where: { id },
            include: { attachments: true }
        });
        if (!activity)
            return res.status(404).json({ error: 'Activity not found' });
        // Clean up files
        for (const att of activity.attachments) {
            const p = path_1.default.join(__dirname, '../../uploads', att.filename);
            if (fs_1.default.existsSync(p))
                fs_1.default.unlinkSync(p);
        }
        await prisma.activity.delete({ where: { id } });
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
        if (!file)
            return res.status(400).json({ error: 'Tidak ada file yang diunggah' });
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
    }
    catch (error) {
        res.status(500).json({ error: 'Gagal mengunggah file' });
    }
};
exports.uploadAttachment = uploadAttachment;
const deleteAttachment = async (req, res) => {
    try {
        const attId = String(req.params.attId);
        const attachment = await prisma.attachment.findUnique({ where: { id: attId } });
        if (!attachment)
            return res.status(404).json({ error: 'Attachment not found' });
        const p = path_1.default.join(__dirname, '../../uploads', attachment.filename);
        if (fs_1.default.existsSync(p))
            fs_1.default.unlinkSync(p);
        await prisma.attachment.delete({ where: { id: attId } });
        res.json({ message: 'File dihapus' });
    }
    catch (error) {
        res.status(500).json({ error: 'Gagal menghapus file' });
    }
};
exports.deleteAttachment = deleteAttachment;

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTelegramStatus = exports.generateLinkToken = void 0;
const client_1 = require("@prisma/client");
const crypto_1 = __importDefault(require("crypto"));
const auditTrail_1 = require("../utils/auditTrail");
const prisma = new client_1.PrismaClient();
// Endpoint: POST /api/telegram/generate-link
// Menghasilkan kode tautan berumur pendek untuk ditaruh di ProfileView
const generateLinkToken = async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        // Cek apakah sudah tautan?
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (user?.telegramId) {
            return res.status(400).json({ error: 'Akun ini sudah ditautkan ke Telegram' });
        }
        // Buat token 6 karakter alfa-numerik uppercase
        const token = crypto_1.default.randomBytes(3).toString('hex').toUpperCase();
        // Simpan token ke Setting table (bersifat sementara/ephemeral)
        // Format key: tghost_userid
        await prisma.setting.upsert({
            where: { key: `tghost_${userId}` },
            update: { value: token },
            create: { key: `tghost_${userId}`, value: token, description: 'Telegram Handshake Token' }
        });
        await (0, auditTrail_1.writeAudit)(req, {
            action: 'telegram.link_token_generate',
            entityType: 'telegram_link',
            entityId: userId,
            after: { tokenGenerated: true },
        });
        res.json({ token, message: 'Gunakan token ini di Bot Telegram Anda: /link ' + token });
    }
    catch (error) {
        res.status(500).json({ error: 'Gagal membuat token tautan' });
    }
};
exports.generateLinkToken = generateLinkToken;
// Endpoint: GET /api/telegram/status
const getTelegramStatus = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.user?.userId } });
        const isLinked = !!user?.telegramId;
        await (0, auditTrail_1.writeAudit)(req, {
            action: 'telegram.status_view',
            entityType: 'telegram_link',
            entityId: req.user?.userId || null,
            metadata: { isLinked },
        });
        res.json({ isLinked });
    }
    catch (error) {
        res.status(500).json({ error: 'Gagal mendapatkan status' });
    }
};
exports.getTelegramStatus = getTelegramStatus;

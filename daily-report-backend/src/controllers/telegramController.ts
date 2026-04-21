import { PrismaClient } from '@prisma/client';
import { Request, Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import crypto from 'crypto';

const prisma = new PrismaClient();

// Endpoint: POST /api/telegram/generate-link
// Menghasilkan kode tautan berumur pendek untuk ditaruh di ProfileView
export const generateLinkToken = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // Cek apakah sudah tautan?
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user?.telegramId) {
      return res.status(400).json({ error: 'Akun ini sudah ditautkan ke Telegram' });
    }

    // Buat token 6 karakter alfa-numerik uppercase
    const token = crypto.randomBytes(3).toString('hex').toUpperCase();

    // Simpan token ke Setting table (bersifat sementara/ephemeral)
    // Format key: tghost_userid
    await prisma.setting.upsert({
      where: { key: `tghost_${userId}` },
      update: { value: token },
      create: { key: `tghost_${userId}`, value: token, description: 'Telegram Handshake Token' }
    });

    res.json({ token, message: 'Gunakan token ini di Bot Telegram Anda: /link ' + token });
  } catch (error) {
    res.status(500).json({ error: 'Gagal membuat token tautan' });
  }
};

// Endpoint: GET /api/telegram/status
export const getTelegramStatus = async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user?.userId } });
    const isLinked = !!user?.telegramId;
    res.json({ isLinked });
  } catch (error) {
    res.status(500).json({ error: 'Gagal mendapatkan status' });
  }
};

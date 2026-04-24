import { Telegraf, Scenes } from 'telegraf';
import LocalSession from 'telegraf-session-local';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { logWizard } from './scenes/logWizard';

const prisma = new PrismaClient();
const botToken = process.env.TELEGRAM_BOT_TOKEN;

export const bot = botToken ? new Telegraf(botToken) : null;
let isBotRunning = false;

if (bot) {
  const sessionPath = path.resolve(process.cwd(), 'telegram_sessions.json');
  if (fs.existsSync(sessionPath)) {
    try {
      const stored = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
      let changed = false;
      for (const session of stored.sessions || []) {
        if (session.data?.__scenes) {
          delete session.data.__scenes;
          changed = true;
        }
      }
      if (changed) fs.writeFileSync(sessionPath, JSON.stringify(stored, null, 2));
    } catch (error) {
      console.error("Failed to clear Telegram wizard sessions:", error);
    }
  }

  // 1. Inisialisasi Session Middleware
  const localSession = new LocalSession({ database: 'telegram_sessions.json' });
  bot.use(localSession.middleware());

  bot.use(async (ctx, next) => {
    const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    const callbackData = ctx.callbackQuery && 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : '';

    if (text === '/cancel' || callbackData === 'cancel_log') {
      ((ctx as any).session as any).__scenes = {};
      if (callbackData === 'cancel_log') await ctx.answerCbQuery();
      await ctx.reply("Input log dibatalkan. Data sementara tidak disimpan. Ketik /log untuk mulai ulang.");
      return;
    }

    if (text === '/log') {
      ((ctx as any).session as any).__scenes = {};
    }

    return next();
  });

  // 2. Registrasi Scenes
  const stage = new Scenes.Stage([logWizard as any]);
  bot.use(stage.middleware() as any);

  bot.start(async (ctx) => {
    const tgId = String(ctx.from.id);
    const user = await prisma.user.findFirst({ where: { telegramId: tgId } });
    
    if (user) {
      return ctx.reply(`Selamat datang kembali, ${user.name}! 👋\n\nUntuk mulai mencatat aktivitas/pekerjaan harian Anda, cukup ketik perintah /log.`);
    }

    ctx.reply("Halo! Saya adalah Bot EngineerLog. Jika Anda belum tersambung, masuk ke Web Dashboard -> Profil, klik 'Generate Telegram Link' lalu ketikkan perintah /link [TOKEN] di sini.");
  });

  bot.command('link', async (ctx) => {
    const token = ctx.message.text.split(' ')[1];
    if (!token) {
      return ctx.reply("Gunakan perintah: /link [TOKEN_DARI_WEB]");
    }

    const tgId = String(ctx.from.id);

    try {
      // Cari setting token
      const setting = await prisma.setting.findFirst({
        where: { value: token.toUpperCase(), key: { startsWith: 'tghost_' } }
      });

      if (!setting) {
        return ctx.reply("Token tidak valid atau sudah kadaluarsa.");
      }

      const userId = setting.key.split('_')[1];

      // Tautkan telegramId
      await prisma.user.update({
        where: { id: userId },
        data: { telegramId: tgId }
      });

      // Hapus token agar tidak dipakai ulang
      await prisma.setting.delete({ where: { key: setting.key } });

      ctx.reply(`✅ Berhasil! Akun Anda kini tersambung dengan Bot EngineerLog. Anda sudah bisa mengetik /log untuk mencatat aktivitas.`);
    } catch (e) {
      ctx.reply("Terjadi kesalahan teknis saat menghubungkan akun.");
    }
  });

  // 3. Masuki Wizard saat Engineer ketik /log
  bot.command('log', async (ctx) => {
    const tgId = String(ctx.from.id);
    const user = await prisma.user.findFirst({ where: { telegramId: tgId } });
    
    if (!user) {
      return ctx.reply("⛔ Mohon maaf, akun Telegram Anda belum terdaftar. Silahkan tautkan dari Web Dashboard menggunakan /link.");
    }

    // Masuk ke arena Scene Wawancara!
    // @ts-ignore
    ctx.scene.enter('LOG_WIZARD');
  });

  bot.command('cancel', async (ctx) => {
    return ctx.reply("Tidak ada input log yang sedang berjalan. Ketik /log untuk mulai mencatat aktivitas.");
  });

  // Enable graceful stop
  const stopBot = (signal: 'SIGINT' | 'SIGTERM') => {
    if (!isBotRunning) return;
    bot.stop(signal);
    isBotRunning = false;
  };
  process.once('SIGINT', () => stopBot('SIGINT'));
  process.once('SIGTERM', () => stopBot('SIGTERM'));
} else {
  console.log("⚠️ TELEGRAM_BOT_TOKEN not found! Telegram bot is Disabled.");
}

export const startBot = () => {
    if (bot) {
        console.log("Starting Telegram Bot polling...");
        bot.telegram.getMe()
            .then((info) => {
                console.log(`Telegram Bot authenticated as @${info.username}`);
                return bot.launch({ dropPendingUpdates: true });
            })
            .then(() => {
                isBotRunning = true;
                console.log("🤖 Telegram Bot started!");
            })
            .catch((error) => {
                console.error("Telegram Bot failed to start:", error.message);
            });
    }
};

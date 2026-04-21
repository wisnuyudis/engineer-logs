import { Telegraf, Scenes } from 'telegraf';
import LocalSession from 'telegraf-session-local';
import { PrismaClient } from '@prisma/client';
import { logWizard } from './scenes/logWizard';

const prisma = new PrismaClient();
const botToken = process.env.TELEGRAM_BOT_TOKEN;

export const bot = botToken ? new Telegraf(botToken) : null;

if (bot) {
  // 1. Inisialisasi Session Middleware
  const localSession = new LocalSession({ database: 'telegram_sessions.json' });
  bot.use(localSession.middleware());

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

  // Enable graceful stop
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
} else {
  console.log("⚠️ TELEGRAM_BOT_TOKEN not found! Telegram bot is Disabled.");
}

export const startBot = () => {
    if (bot) {
        bot.launch();
        console.log("🤖 Telegram Bot started!");
    }
};

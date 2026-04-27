"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startBot = exports.bot = void 0;
const telegraf_1 = require("telegraf");
const telegraf_session_local_1 = __importDefault(require("telegraf-session-local"));
const client_1 = require("@prisma/client");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const logWizard_1 = require("./scenes/logWizard");
const prisma = new client_1.PrismaClient();
const botToken = process.env.TELEGRAM_BOT_TOKEN;
exports.bot = botToken ? new telegraf_1.Telegraf(botToken) : null;
let isBotRunning = false;
if (exports.bot) {
    const legacySessionPath = path_1.default.resolve(process.cwd(), 'telegram_sessions.json');
    const sessionPath = process.env.TELEGRAM_SESSION_FILE
        ? path_1.default.resolve(process.env.TELEGRAM_SESSION_FILE)
        : (fs_1.default.existsSync(legacySessionPath)
            ? legacySessionPath
            : path_1.default.resolve(process.cwd(), 'data/telegram_sessions.json'));
    fs_1.default.mkdirSync(path_1.default.dirname(sessionPath), { recursive: true });
    if (fs_1.default.existsSync(sessionPath)) {
        try {
            const stored = JSON.parse(fs_1.default.readFileSync(sessionPath, 'utf8'));
            let changed = false;
            for (const session of stored.sessions || []) {
                if (session.data?.__scenes) {
                    delete session.data.__scenes;
                    changed = true;
                }
            }
            if (changed)
                fs_1.default.writeFileSync(sessionPath, JSON.stringify(stored, null, 2));
        }
        catch (error) {
            console.error("Failed to clear Telegram wizard sessions:", error);
        }
    }
    // 1. Inisialisasi Session Middleware
    const localSession = new telegraf_session_local_1.default({ database: sessionPath });
    exports.bot.use(localSession.middleware());
    exports.bot.use(async (ctx, next) => {
        const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
        const callbackData = ctx.callbackQuery && 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : '';
        if (text === '/cancel' || callbackData === 'cancel_log') {
            ctx.session.__scenes = {};
            if (callbackData === 'cancel_log')
                await ctx.answerCbQuery();
            await ctx.reply("Input log dibatalkan. Data sementara tidak disimpan. Ketik /log untuk mulai ulang.");
            return;
        }
        if (text === '/log') {
            ctx.session.__scenes = {};
        }
        return next();
    });
    // 2. Registrasi Scenes
    const stage = new telegraf_1.Scenes.Stage([logWizard_1.logWizard]);
    exports.bot.use(stage.middleware());
    exports.bot.start(async (ctx) => {
        const tgId = String(ctx.from.id);
        const user = await prisma.user.findFirst({ where: { telegramId: tgId } });
        if (user) {
            return ctx.reply(`Selamat datang kembali, ${user.name}! 👋\n\nUntuk mulai mencatat aktivitas/pekerjaan harian Anda, cukup ketik perintah /log.`);
        }
        ctx.reply("Halo! Saya adalah Bot EngineerLog. Jika Anda belum tersambung, masuk ke Web Dashboard -> Profil, klik 'Generate Telegram Link' lalu ketikkan perintah /link [TOKEN] di sini.");
    });
    exports.bot.command('link', async (ctx) => {
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
        }
        catch (e) {
            ctx.reply("Terjadi kesalahan teknis saat menghubungkan akun.");
        }
    });
    // 3. Masuki Wizard saat Engineer ketik /log
    exports.bot.command('log', async (ctx) => {
        const tgId = String(ctx.from.id);
        const user = await prisma.user.findFirst({ where: { telegramId: tgId } });
        if (!user) {
            return ctx.reply("⛔ Mohon maaf, akun Telegram Anda belum terdaftar. Silahkan tautkan dari Web Dashboard menggunakan /link.");
        }
        // Masuk ke arena Scene Wawancara!
        // @ts-ignore
        ctx.scene.enter('LOG_WIZARD');
    });
    exports.bot.command('cancel', async (ctx) => {
        return ctx.reply("Tidak ada input log yang sedang berjalan. Ketik /log untuk mulai mencatat aktivitas.");
    });
    // Enable graceful stop
    const stopBot = (signal) => {
        if (!isBotRunning)
            return;
        exports.bot.stop(signal);
        isBotRunning = false;
    };
    process.once('SIGINT', () => stopBot('SIGINT'));
    process.once('SIGTERM', () => stopBot('SIGTERM'));
}
else {
    console.log("⚠️ TELEGRAM_BOT_TOKEN not found! Telegram bot is Disabled.");
}
const startBot = () => {
    if (exports.bot) {
        console.log("Starting Telegram Bot polling...");
        exports.bot.telegram.getMe()
            .then((info) => {
            console.log(`Telegram Bot authenticated as @${info.username}`);
            return exports.bot.launch({ dropPendingUpdates: true });
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
exports.startBot = startBot;

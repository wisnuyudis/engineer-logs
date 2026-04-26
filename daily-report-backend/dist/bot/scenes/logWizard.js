"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logWizard = void 0;
const telegraf_1 = require("telegraf");
const client_1 = require("@prisma/client");
const utils_1 = require("../utils");
const prisma = new client_1.PrismaClient();
const cancelKeyboard = telegraf_1.Markup.inlineKeyboard([
    [telegraf_1.Markup.button.callback("Batalkan input log", "cancel_log")]
]);
const cancelIfRequested = async (ctx) => {
    const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    const callbackData = ctx.callbackQuery && 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : '';
    if (text !== '/cancel' && callbackData !== 'cancel_log')
        return false;
    if (callbackData === 'cancel_log')
        await ctx.answerCbQuery();
    await ctx.reply("Input log dibatalkan. Data sementara tidak disimpan. Ketik /log untuk mulai ulang.");
    await ctx.scene.leave();
    return true;
};
exports.logWizard = new telegraf_1.Scenes.WizardScene('LOG_WIZARD', 
// Langkah 1: Pilih Tanggal
async (ctx) => {
    if (await cancelIfRequested(ctx))
        return;
    ctx.wizard.state.report = {};
    await ctx.reply("📝 Mari mulai mencatat log. Untuk hari apa laporan ini?", telegraf_1.Markup.inlineKeyboard([
        [telegraf_1.Markup.button.callback("📅 Hari Ini", "date_today"), telegraf_1.Markup.button.callback("📅 Kemarin", "date_yesterday")],
        [telegraf_1.Markup.button.callback("✍️ Input Manual (Ketik)", "date_manual")],
        [telegraf_1.Markup.button.callback("Batalkan input log", "cancel_log")]
    ]));
    return ctx.wizard.next();
}, 
// Langkah 2: Evaluasi Tanggal & Minta Kategori Dinamis
async (ctx) => {
    if (await cancelIfRequested(ctx))
        return;
    let dateStr = "";
    if (ctx.callbackQuery) {
        const payload = ctx.callbackQuery.data;
        if (payload === 'date_today')
            dateStr = (0, utils_1.getOffsetDate)(0);
        else if (payload === 'date_yesterday')
            dateStr = (0, utils_1.getOffsetDate)(-1);
        else if (payload === 'date_manual') {
            await ctx.answerCbQuery();
            await ctx.reply("Silahkan ketik tanggal dengan format YYYY-MM-DD (Contoh: 2024-04-20). Ketik /cancel untuk batal.", cancelKeyboard);
            return; // stay in step 2
        }
        await ctx.answerCbQuery();
    }
    else if (ctx.message && 'text' in ctx.message) {
        const text = ctx.message.text;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
            await ctx.reply("⚠ Format tanggal salah. Harus YYYY-MM-DD. Ketik lagi:");
            return;
        }
        dateStr = text;
    }
    if (dateStr) {
        ctx.wizard.state.report.date = dateStr;
        const tgId = String(ctx.from?.id || "");
        const user = await prisma.user.findFirst({ where: { telegramId: tgId } });
        const isAdmin = ["admin", "superadmin", "super_admin"].includes((user?.role || "").toLowerCase());
        // Ambil aktivitas manual dari DB
        const acts = await prisma.masterActivity.findMany({ where: { isActive: true }, orderBy: { actKey: 'asc' } });
        let filteredActs = acts.filter((a) => a.source !== 'jira');
        if (!isAdmin) {
            filteredActs = filteredActs.filter((a) => a.team === 'all' || a.team === (user?.team || ''));
        }
        ctx.wizard.state.report.actList = filteredActs;
        const appActs = filteredActs.filter((a) => a.source === 'app');
        if (appActs.length === 0) {
            await ctx.reply(`🗓 Tanggal diset: ${dateStr}\n\n⚠ Sedang tidak ada daftar aktivitas tersedia untuk Anda. Silahkan hubungi administrator.`);
            return ctx.scene.leave();
        }
        await ctx.reply(`🗓 Tanggal diset: ${dateStr}\n\nPilih kategori pekerjaan Anda di bawah ini:`);
        const btns = appActs.map((a) => telegraf_1.Markup.button.callback(`${a.icon || ''} ${a.label}`, `act_${a.actKey}`));
        const aRows = [];
        for (let i = 0; i < btns.length; i += 2)
            aRows.push(btns.slice(i, i + 2));
        aRows.push([telegraf_1.Markup.button.callback("Batalkan input log", "cancel_log")]);
        await ctx.reply("📝 INPUT MANUAL", telegraf_1.Markup.inlineKeyboard(aRows));
        return ctx.wizard.next();
    }
}, 
// Langkah 3: Evaluasi Kategori & Minta Topik
async (ctx) => {
    if (await cancelIfRequested(ctx))
        return;
    let actKey = 'internal';
    if (ctx.callbackQuery) {
        actKey = ctx.callbackQuery.data.replace('act_', '');
        await ctx.answerCbQuery();
    }
    ctx.wizard.state.report.actKey = actKey;
    const actList = ctx.wizard.state.report.actList || [];
    const actDef = actList.find((a) => a.actKey === actKey);
    const promptMsg = `Sebutkan *Nama Pekerjaan / Topik / Agenda*.\n\nKetik /cancel untuk batal.`;
    await ctx.reply(promptMsg, { parse_mode: 'Markdown', ...cancelKeyboard });
    return ctx.wizard.next();
}, 
// Langkah 4: Evaluasi Topik & Minta Catatan Tambahan (Note)
async (ctx) => {
    if (await cancelIfRequested(ctx))
        return;
    if (!ctx.message || !('text' in ctx.message))
        return;
    const text = ctx.message.text;
    ctx.wizard.state.report.topic = text;
    await ctx.reply("📝 Tuliskan *Catatan Progress* / Hambatan Anda (Ketik sekilas saja, akan masuk ke Note log).\n\nKetik /cancel untuk batal.", { parse_mode: 'Markdown', ...cancelKeyboard });
    return ctx.wizard.next();
}, 
// Langkah 5: Evaluasi Note & Minta Durasi
async (ctx) => {
    if (await cancelIfRequested(ctx))
        return;
    if (!ctx.message || !('text' in ctx.message))
        return;
    ctx.wizard.state.report.note = ctx.message.text;
    await ctx.reply("⏱ Berapa lama pengerjaannya? (Contoh ketik: 1j 20m, 90m, atau 2.5)\n\nKetik /cancel untuk batal.", cancelKeyboard);
    return ctx.wizard.next();
}, 
// Langkah 6: Evaluasi Durasi & Minta Status
async (ctx) => {
    if (await cancelIfRequested(ctx))
        return;
    if (!ctx.message || !('text' in ctx.message))
        return;
    const durMinutes = (0, utils_1.parseFlexibleDuration)(ctx.message.text);
    if (durMinutes <= 0) {
        await ctx.reply("⚠ Durasi tidak dikenali, gunakan hitungan jam/menit spt '1j 20m'. Coba lagi:");
        return;
    }
    ctx.wizard.state.report.dur = durMinutes;
    await ctx.reply("Terakhir, bagaimana status pekerjaan ini?", telegraf_1.Markup.inlineKeyboard([
        [telegraf_1.Markup.button.callback("✅ Selesai (Completed)", "stat_completed")],
        [telegraf_1.Markup.button.callback("⏳ Masih Berjalan (Progress)", "stat_in_progress")],
        [telegraf_1.Markup.button.callback("Batalkan input log", "cancel_log")]
    ]));
    return ctx.wizard.next();
}, 
// Langkah 7: Eksekusi DB
async (ctx) => {
    if (await cancelIfRequested(ctx))
        return;
    let status = 'completed';
    if (ctx.callbackQuery) {
        status = ctx.callbackQuery.data.replace('stat_', '');
        await ctx.answerCbQuery();
    }
    ctx.wizard.state.report.status = status;
    try {
        const tgId = String(ctx.from?.id);
        const user = await prisma.user.findFirst({ where: { telegramId: tgId } });
        if (!user)
            throw new Error("Unregistered");
        const r = ctx.wizard.state.report;
        await prisma.activity.create({
            data: {
                userId: user.id,
                actKey: r.actKey,
                topic: r.topic,
                note: r.note,
                dur: r.dur,
                date: r.date,
                status: r.status,
                source: 'telegram',
            }
        });
        const labelDur = `${Math.floor(r.dur / 60)}j ${r.dur % 60}m`.trim();
        await ctx.reply(`🎉 Fantastis! Log berhasil dicatat di Server.\n\n📅 Tgl: ${r.date}\n🗂 Info: ${r.topic}\n📝 Note: ${r.note}\n⏱ Dur: ${labelDur}\n✅ Status: ${r.status}`);
    }
    catch (e) {
        console.log(e);
        await ctx.reply("⛔ Gagal menyimpan log ke database.");
    }
    return ctx.scene.leave();
});
exports.logWizard.command('cancel', async (ctx) => {
    await ctx.reply("Input log dibatalkan. Data sementara tidak disimpan.");
    return ctx.scene.leave();
});
exports.logWizard.action('cancel_log', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply("Input log dibatalkan. Data sementara tidak disimpan.");
    return ctx.scene.leave();
});

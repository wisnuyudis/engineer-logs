import { Scenes, Markup } from 'telegraf';
import { PrismaClient } from '@prisma/client';
import { parseFlexibleDuration, getOffsetDate } from '../utils';

const prisma = new PrismaClient();

const normalizeIdentity = (value: string | null | undefined) =>
  (value || '').trim().replace(/\s+/g, ' ').toLowerCase();

const cancelKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("Batalkan input log", "cancel_log")]
]);

const cancelIfRequested = async (ctx: any) => {
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const callbackData = ctx.callbackQuery && 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : '';

  if (text !== '/cancel' && callbackData !== 'cancel_log') return false;

  if (callbackData === 'cancel_log') await ctx.answerCbQuery();
  await ctx.reply("Input log dibatalkan. Data sementara tidak disimpan. Ketik /log untuk mulai ulang.");
  await ctx.scene.leave();
  return true;
};

export const logWizard = new Scenes.WizardScene(
  'LOG_WIZARD',
  
  // Langkah 1: Pilih Tanggal
  async (ctx) => {
    if (await cancelIfRequested(ctx)) return;
    (ctx.wizard.state as any).report = {};
    
    await ctx.reply("📝 Mari mulai mencatat log. Untuk hari apa laporan ini?", 
      Markup.inlineKeyboard([
        [Markup.button.callback("📅 Hari Ini", "date_today"), Markup.button.callback("📅 Kemarin", "date_yesterday")],
        [Markup.button.callback("✍️ Input Manual (Ketik)", "date_manual")],
        [Markup.button.callback("Batalkan input log", "cancel_log")]
      ])
    );
    return ctx.wizard.next();
  },

  // Langkah 2: Evaluasi Tanggal & Minta Kategori Dinamis
  async (ctx) => {
    if (await cancelIfRequested(ctx)) return;
    let dateStr = "";
    if (ctx.callbackQuery) {
      const payload = (ctx.callbackQuery as any).data;
      if (payload === 'date_today') dateStr = getOffsetDate(0);
      else if (payload === 'date_yesterday') dateStr = getOffsetDate(-1);
      else if (payload === 'date_manual') {
        await ctx.answerCbQuery();
        await ctx.reply("Silahkan ketik tanggal dengan format YYYY-MM-DD (Contoh: 2024-04-20). Ketik /cancel untuk batal.", cancelKeyboard);
        return; // stay in step 2
      }
      await ctx.answerCbQuery();
    } else if (ctx.message && 'text' in ctx.message) {
      const text = (ctx.message as any).text;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        await ctx.reply("⚠ Format tanggal salah. Harus YYYY-MM-DD. Ketik lagi:");
        return;
      }
      dateStr = text;
    }

    if (dateStr) {
      (ctx.wizard.state as any).report.date = dateStr;
      
      const tgId = String(ctx.from?.id || "");
      const user = await prisma.user.findFirst({ where: { telegramId: tgId } });
      const isAdmin = ["admin", "superadmin", "super_admin"].includes((user?.role || "").toLowerCase());
      
      // Ambil aktivitas dinamis dari DB
      const acts = await prisma.masterActivity.findMany({ where: { isActive: true }, orderBy: { actKey: 'asc' } });
      
      let filteredActs = acts;
      if (!isAdmin) {
          filteredActs = acts.filter((a: any) => a.team === 'all' || a.team === (user?.team || ''));
      }

      (ctx.wizard.state as any).report.actList = filteredActs;
      
      const jiraActs = filteredActs.filter((a: any) => a.source === 'jira');
      const appActs = filteredActs.filter((a: any) => a.source === 'app');

      if (jiraActs.length === 0 && appActs.length === 0) {
        await ctx.reply(`🗓 Tanggal diset: ${dateStr}\n\n⚠ Sedang tidak ada daftar aktivitas tersedia untuk Anda. Silahkan hubungi administrator.`);
        return ctx.scene.leave();
      }

      await ctx.reply(`🗓 Tanggal diset: ${dateStr}\n\nPilih kategori pekerjaan Anda di bawah ini:`);

      if (jiraActs.length > 0) {
        const btns = jiraActs.map((a: any) => Markup.button.callback(`${a.icon || ''} ${a.label}`, `act_${a.actKey}`));
        const jRows = [];
        for(let i=0; i<btns.length; i+=2) jRows.push(btns.slice(i, i+2));
        jRows.push([Markup.button.callback("Batalkan input log", "cancel_log")]);
        await ctx.reply("🛠 TUGAS JIRA", Markup.inlineKeyboard(jRows));
      }

      if (appActs.length > 0) {
        const btns = appActs.map((a: any) => Markup.button.callback(`${a.icon || ''} ${a.label}`, `act_${a.actKey}`));
        const aRows = [];
        for(let i=0; i<btns.length; i+=2) aRows.push(btns.slice(i, i+2));
        aRows.push([Markup.button.callback("Batalkan input log", "cancel_log")]);
        await ctx.reply("📝 NON JIRA", Markup.inlineKeyboard(aRows));
      }

      return ctx.wizard.next();
    }
  },

  // Langkah 3: Evaluasi Kategori & Minta Topik
  async (ctx) => {
    if (await cancelIfRequested(ctx)) return;
    let actKey = 'internal';
    if (ctx.callbackQuery) {
      actKey = (ctx.callbackQuery as any).data.replace('act_', '');
      await ctx.answerCbQuery();
    }

    (ctx.wizard.state as any).report.actKey = actKey;
    const actList = (ctx.wizard.state as any).report.actList || [];
    const actDef = actList.find((a: any) => a.actKey === actKey);
    const isJira = actDef?.source === 'jira';

    const promptMsg = isJira 
      ? `Sebutkan *Ticket ID JIRA* (Contoh: PROJ-123).\n\nKetik /cancel untuk batal.`
      : `Sebutkan *Nama Pekerjaan / Topik / Agenda*.\n\nKetik /cancel untuk batal.`;

    await ctx.reply(promptMsg, { parse_mode: 'Markdown', ...cancelKeyboard });
    return ctx.wizard.next();
  },

  // Langkah 4: Evaluasi Topik & Minta Catatan Tambahan (Note)
  async (ctx) => {
    if (await cancelIfRequested(ctx)) return;
    if (!ctx.message || !('text' in ctx.message)) return;
    const text = (ctx.message as any).text;

    const { actKey, actList } = (ctx.wizard.state as any).report;
    const actDef = actList?.find((a: any) => a.actKey === actKey);
    
    if (actDef?.source === 'jira') {
      const ticketId = text;
      
      try {
        const { fetchJiraTicket } = await import('../../services/jiraService');
        const jiraData = await fetchJiraTicket(ticketId);
        
        const tgId = String(ctx.from?.id || "");
        const currentUser = await prisma.user.findFirst({ where: { telegramId: tgId } });
        const appEmail = currentUser?.email.toLowerCase() || '';
        const appName = normalizeIdentity(currentUser?.name);
        const jiraEmail = jiraData.assigneeEmail ? jiraData.assigneeEmail.toLowerCase() : '';
        const jiraDisplayName = normalizeIdentity(jiraData.assigneeDisplayName);

        if (!jiraEmail && !jiraDisplayName && !jiraData.assigneeAccountId) {
          await ctx.reply(`⚠ Tiket JIRA *${ticketId}* belum di-assign (Unassigned). Silakan assign ke email Anda di Jira terlebih dahulu.\n\nKetik ulang ID Tiket JIRA Anda:`, { parse_mode: 'Markdown' });
          return;
        }

        if (jiraEmail && jiraEmail !== appEmail) {
          await ctx.reply(`⚠ Tiket *${ticketId}* ditugaskan ke *${jiraEmail}*, bukan ke email Anda (*${appEmail}*).\n\nKetik ulang ID Tiket JIRA Anda yang valid:`, { parse_mode: 'Markdown' });
          return;
        }

        if (!jiraEmail && jiraDisplayName && jiraDisplayName !== appName) {
          await ctx.reply(`⚠ Tiket ${ticketId} ditugaskan ke ${jiraData.assigneeDisplayName}, bukan ke user Anda (${currentUser?.name}). Email assignee disembunyikan oleh Jira.\n\nKetik ulang ID Tiket JIRA Anda yang valid, atau ketik /cancel untuk batal.`);
          return;
        }
        
        (ctx.wizard.state as any).report.ticketId = ticketId;
        (ctx.wizard.state as any).report.ticketTitle = jiraData.summary;
        (ctx.wizard.state as any).report.topic = `${ticketId} - ${jiraData.summary}`;
      } catch (e: any) {
        await ctx.reply(`⚠ ${e.message || 'Gagal memvalidasi tiket Jira'}.\n\nKetik ulang ID Tiket JIRA Anda:`, { parse_mode: 'Markdown' });
        return;
      }
    } else {
      (ctx.wizard.state as any).report.topic = text;
    }

    await ctx.reply("📝 Tuliskan *Catatan Progress* / Hambatan Anda (Ketik sekilas saja, akan masuk ke Note log).\n\nKetik /cancel untuk batal.", { parse_mode: 'Markdown', ...cancelKeyboard });
    return ctx.wizard.next();
  },

  // Langkah 5: Evaluasi Note & Minta Durasi
  async (ctx) => {
    if (await cancelIfRequested(ctx)) return;
    if (!ctx.message || !('text' in ctx.message)) return;
    (ctx.wizard.state as any).report.note = (ctx.message as any).text;

    await ctx.reply("⏱ Berapa lama pengerjaannya? (Contoh ketik: 1j 20m, 90m, atau 2.5)\n\nKetik /cancel untuk batal.", cancelKeyboard);
    return ctx.wizard.next();
  },

  // Langkah 6: Evaluasi Durasi & Minta Status
  async (ctx) => {
    if (await cancelIfRequested(ctx)) return;
    if (!ctx.message || !('text' in ctx.message)) return;
    
    const durMinutes = parseFlexibleDuration((ctx.message as any).text);
    if (durMinutes <= 0) {
      await ctx.reply("⚠ Durasi tidak dikenali, gunakan hitungan jam/menit spt '1j 20m'. Coba lagi:");
      return;
    }

    (ctx.wizard.state as any).report.dur = durMinutes;

    await ctx.reply("Terakhir, bagaimana status pekerjaan ini?",
      Markup.inlineKeyboard([
        [Markup.button.callback("✅ Selesai (Completed)", "stat_completed")],
        [Markup.button.callback("⏳ Masih Berjalan (Progress)", "stat_in_progress")],
        [Markup.button.callback("Batalkan input log", "cancel_log")]
      ])
    );
    return ctx.wizard.next();
  },

  // Langkah 7: Eksekusi DB
  async (ctx) => {
    if (await cancelIfRequested(ctx)) return;
    let status = 'completed';
    if (ctx.callbackQuery) {
      status = (ctx.callbackQuery as any).data.replace('stat_', '');
      await ctx.answerCbQuery();
    }
    
    (ctx.wizard.state as any).report.status = status;

    try {
      const tgId = String(ctx.from?.id);
      const user = await prisma.user.findFirst({ where: { telegramId: tgId } });
      if(!user) throw new Error("Unregistered");

      const r = (ctx.wizard.state as any).report;

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
          ticketId: r.ticketId || null,
          ticketTitle: r.ticketTitle || null,
        }
      });

      const labelDur = `${Math.floor(r.dur / 60)}j ${r.dur % 60}m`.trim();
      await ctx.reply(`🎉 Fantastis! Log berhasil dicatat di Server.\n\n📅 Tgl: ${r.date}\n🗂 Info: ${r.ticketId || r.topic}\n📝 Note: ${r.note}\n⏱ Dur: ${labelDur}\n✅ Status: ${r.status}`);
      
    } catch (e) {
      console.log(e);
      await ctx.reply("⛔ Gagal menyimpan log ke database.");
    }

    return ctx.scene.leave();
  }
);

logWizard.command('cancel', async (ctx) => {
  await ctx.reply("Input log dibatalkan. Data sementara tidak disimpan.");
  return ctx.scene.leave();
});

logWizard.action('cancel_log', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply("Input log dibatalkan. Data sementara tidak disimpan.");
  return ctx.scene.leave();
});

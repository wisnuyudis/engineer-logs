import { Telegraf, Scenes } from 'telegraf';
import LocalSession from 'telegraf-session-local';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { logWizard } from './scenes/logWizard';
import { fetchJiraIssue, fetchUpcomingJiraScheduleByAssignee } from '../services/jiraService';
import { normalizeQuarter, normalizeYear, resolveKpiProfile } from '../utils/kpiManual';

const prisma = new PrismaClient();
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const DEFAULT_REMINDER_HOUR = Number(process.env.TELEGRAM_REMINDER_HOUR || 8);
const REMINDER_TIMEZONE = process.env.TELEGRAM_REMINDER_TIMEZONE || 'Asia/Jakarta';
const REMINDER_POLL_MS = Math.max(15, Number(process.env.TELEGRAM_REMINDER_POLL_MINUTES || 30)) * 60 * 1000;

const formatDueDate = (value: string | null) => {
  if (!value) return 'Tanpa due date';
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
};

const escapeHtml = (value: string | null | undefined) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const formatMinutes = (value: number | null | undefined) => {
  const minutes = Math.max(0, Math.round(Number(value || 0)));
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours && mins) return `${hours}j ${mins}m`;
  if (hours) return `${hours}j`;
  return `${mins}m`;
};

const getCurrentQuarter = () => {
  const now = new Date();
  const year = normalizeYear(now.getFullYear());
  const month = now.getMonth() + 1;
  const quarter = month <= 3 ? 'Q1' : month <= 6 ? 'Q2' : month <= 9 ? 'Q3' : 'Q4';
  return { year, quarter: normalizeQuarter(quarter) };
};

const getDatePartsInTimezone = (date = new Date(), timeZone = REMINDER_TIMEZONE) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    isoDate: `${map.year}-${map.month}-${map.day}`,
    hour: Number(map.hour || 0),
  };
};

const diffDaysFromToday = (dueDate: string | null, todayIso: string) => {
  if (!dueDate) return null;
  const today = new Date(`${todayIso}T00:00:00Z`);
  const due = new Date(`${dueDate}T00:00:00Z`);
  if (Number.isNaN(today.getTime()) || Number.isNaN(due.getTime())) return null;
  return Math.round((due.getTime() - today.getTime()) / 86400000);
};

const buildScheduleMessage = (title: string, userName: string, items: Array<{
  issueKey: string;
  issueUrl: string;
  summary: string | null;
  projectName: string | null;
  statusName: string | null;
  dueDate: string | null;
}>, limit = 12) => {
  if (!items.length) {
    return `${title}\n${userName}\n\nTidak ada task yang sesuai.`;
  }

  const lines = items.slice(0, limit).map((item, index) => [
    `${index + 1}. <a href="${item.issueUrl}">${escapeHtml(item.issueKey)}</a>`,
    `${escapeHtml(item.summary || '-')}`,
    `Project: ${escapeHtml(item.projectName || '-')}`,
    `Status: ${escapeHtml(item.statusName || '-')}`,
    `Due: ${escapeHtml(formatDueDate(item.dueDate))}`,
  ].join('\n'));

  const moreCount = items.length - lines.length;
  const footer = moreCount > 0 ? `Dan ${moreCount} task lainnya.` : '';

  return [
    `<b>${escapeHtml(title)}</b>`,
    `<b>${escapeHtml(userName)}</b>`,
    '',
    ...lines,
    footer,
  ].filter(Boolean).join('\n\n');
};

const fetchLinkedTelegramUser = async (telegramId: string) => prisma.user.findFirst({
  where: { telegramId },
  select: {
    id: true,
    name: true,
    email: true,
    role: true,
    team: true,
    status: true,
    jiraAccountId: true,
  },
});

const isTelegramManager = (role?: string | null) => ['admin', 'mgr_dl'].includes(String(role || ''));

const buildLatestActivityMessage = async (userId: string, userName: string) => {
  const activities = await prisma.activity.findMany({
    where: {
      userId,
      source: { in: ['app', 'telegram'] },
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      date: true,
      topic: true,
      actKey: true,
      dur: true,
      status: true,
      source: true,
    },
  });

  if (!activities.length) {
    return "Belum ada activity manual/app yang tercatat.";
  }

  return [
    `<b>5 Activity Terakhir</b>`,
    `<b>${escapeHtml(userName)}</b>`,
    '',
    ...activities.map((activity, index) =>
      `${index + 1}. ${escapeHtml(activity.date)} · ${escapeHtml(activity.topic || activity.actKey)}\n` +
      `Durasi: ${escapeHtml(formatMinutes(activity.dur))} · Status: ${escapeHtml(activity.status)} · Source: ${escapeHtml(activity.source)}`
    ),
  ].join('\n\n');
};

const runDailyTelegramReminders = async () => {
  if (!bot || process.env.TELEGRAM_REMINDERS_ENABLED === 'false') return;

  const { isoDate, hour } = getDatePartsInTimezone();
  if (hour < DEFAULT_REMINDER_HOUR) return;

  const recipients = await prisma.user.findMany({
    where: {
      status: 'active',
      team: 'delivery',
      telegramId: { not: null },
      jiraAccountId: { not: null },
    },
    select: {
      id: true,
      name: true,
      telegramId: true,
      jiraAccountId: true,
    },
  });

  for (const user of recipients) {
    const settingKey = `telegram_reminder_${isoDate}_${user.id}`;
    const alreadySent = await prisma.setting.findUnique({ where: { key: settingKey } });
    if (alreadySent) continue;

    try {
      const items = await fetchUpcomingJiraScheduleByAssignee(String(user.jiraAccountId), 15);
      const buckets = {
        h3: items.filter((item) => diffDaysFromToday(item.dueDate, isoDate) === 3),
        h1: items.filter((item) => diffDaysFromToday(item.dueDate, isoDate) === 1),
        overdue: items.filter((item) => {
          const diff = diffDaysFromToday(item.dueDate, isoDate);
          return diff !== null && diff < 0;
        }),
      };

      const sections: string[] = [];
      if (buckets.h3.length) {
        sections.push(`H-3\n${buckets.h3.map((item) => `- <a href="${item.issueUrl}">${escapeHtml(item.issueKey)}</a> · ${escapeHtml(item.summary || '-')}`).join('\n')}`);
      }
      if (buckets.h1.length) {
        sections.push(`H-1\n${buckets.h1.map((item) => `- <a href="${item.issueUrl}">${escapeHtml(item.issueKey)}</a> · ${escapeHtml(item.summary || '-')}`).join('\n')}`);
      }
      if (buckets.overdue.length) {
        sections.push(`Overdue\n${buckets.overdue.map((item) => `- <a href="${item.issueUrl}">${escapeHtml(item.issueKey)}</a> · due ${escapeHtml(formatDueDate(item.dueDate))}`).join('\n')}`);
      }

      if (sections.length) {
        await bot.telegram.sendMessage(String(user.telegramId), [
          `<b>Reminder Task Jira</b>`,
          `<b>${escapeHtml(user.name)}</b>`,
          '',
          ...sections,
        ].join('\n\n'), {
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: true },
        });
      }

      await prisma.setting.upsert({
        where: { key: settingKey },
        update: { value: String(sections.length), description: `Telegram reminder sent at ${new Date().toISOString()}` },
        create: {
          key: settingKey,
          value: String(sections.length),
          description: `Telegram reminder sent at ${new Date().toISOString()}`,
        },
      });
    } catch (error) {
      console.error(`Telegram reminder failed for ${user.id}:`, error);
    }
  }
};

export const bot = botToken ? new Telegraf(botToken) : null;
let isBotRunning = false;

if (bot) {
  const legacySessionPath = path.resolve(process.cwd(), 'telegram_sessions.json');
  const sessionPath = process.env.TELEGRAM_SESSION_FILE
    ? path.resolve(process.env.TELEGRAM_SESSION_FILE)
    : (fs.existsSync(legacySessionPath)
      ? legacySessionPath
      : path.resolve(process.cwd(), 'data/telegram_sessions.json'));

  fs.mkdirSync(path.dirname(sessionPath), { recursive: true });

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
  const localSession = new LocalSession({ database: sessionPath });
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
      return ctx.reply(`Selamat datang kembali, ${user.name}! 👋\n\nKetik /help untuk melihat daftar command yang tersedia.`);
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
    const commandText = ctx.message.text.trim();
    if (commandText === '/log terakhir' || commandText === '/log_terakhir') {
      const tgId = String(ctx.from.id);
      const user = await fetchLinkedTelegramUser(tgId);
      if (!user) {
        return ctx.reply("⛔ Akun Telegram Anda belum terdaftar. Tautkan dulu dari Web Dashboard dengan /link.");
      }

      return ctx.reply(await buildLatestActivityMessage(user.id, user.name), {
        parse_mode: 'HTML',
      });
    }

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

  bot.command('help', async (ctx) => {
    return ctx.reply([
      'Daftar command bot:',
      '/log - input activity manual',
      '/cek - lihat task Jira due 15 hari ke depan',
      '/cek tim - lihat schedule bawahan/tim delivery',
      '/kpi - ringkasan KPI quarter berjalan',
      '/log_terakhir - 5 activity manual/telegram terakhir',
      '/status ISSUEKEY - cek status satu issue Jira',
      '/cancel - batalkan flow input log',
      '/help - tampilkan bantuan ini',
    ].join('\n'));
  });

  bot.command('cek', async (ctx) => {
    const tgId = String(ctx.from.id);
    const commandText = ctx.message.text.trim();
    const user = await fetchLinkedTelegramUser(tgId);

    if (!user) {
      return ctx.reply("⛔ Akun Telegram Anda belum terdaftar. Tautkan dulu dari Web Dashboard dengan /link.");
    }

    try {
      if (commandText === '/cek tim') {
        if (!isTelegramManager(user.role)) {
          return ctx.reply("⛔ Perintah /cek tim hanya tersedia untuk admin atau head delivery.");
        }

        const members = await prisma.user.findMany({
          where: {
            status: 'active',
            team: 'delivery',
            jiraAccountId: { not: null },
          },
          select: {
            id: true,
            name: true,
            jiraAccountId: true,
          },
          orderBy: { name: 'asc' },
        });

        const sections: string[] = [];
        for (const member of members) {
          const items = await fetchUpcomingJiraScheduleByAssignee(String(member.jiraAccountId), 15);
          if (!items.length) continue;
          const top = items.slice(0, 3).map((item) =>
            `- <a href="${item.issueUrl}">${escapeHtml(item.issueKey)}</a> · ${escapeHtml(item.summary || '-')} · ${escapeHtml(formatDueDate(item.dueDate))}`
          ).join('\n');
          const extra = items.length > 3 ? `\n- dan ${items.length - 3} task lainnya` : '';
          sections.push(`<b>${escapeHtml(member.name)}</b>\n${top}${extra}`);
        }

        if (!sections.length) {
          return ctx.reply("Tidak ada task Jira due 15 hari ke depan untuk tim delivery.");
        }

        return ctx.reply([
          `<b>Task Schedule Tim Delivery</b>`,
          ...sections.slice(0, 8),
        ].join('\n\n'), {
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: true },
        });
      }

      if (String(user.team || '') !== 'delivery') {
        return ctx.reply("ℹ️ Perintah /cek saat ini hanya tersedia untuk user delivery yang memakai jadwal Jira.");
      }

      if (!user.jiraAccountId) {
        return ctx.reply("⚠️ Akun Anda belum memiliki Jira Account ID. Hubungkan dulu integrasi Jira dari dashboard.");
      }

      const items = await fetchUpcomingJiraScheduleByAssignee(user.jiraAccountId, 15);

      if (!items.length) {
        return ctx.reply(`Tidak ada task Jira due dalam 15 hari ke depan untuk ${user.name}.`);
      }

      return ctx.reply(buildScheduleMessage('Task Schedule in Next 15 Days', user.name, items), {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      });
    } catch (error) {
      console.error('Telegram /cek failed:', error);
      return ctx.reply("Terjadi kendala saat mengambil jadwal Jira. Coba lagi beberapa saat lagi.");
    }
  });

  bot.command('kpi', async (ctx) => {
    const tgId = String(ctx.from.id);
    const user = await fetchLinkedTelegramUser(tgId);
    if (!user) {
      return ctx.reply("⛔ Akun Telegram Anda belum terdaftar. Tautkan dulu dari Web Dashboard dengan /link.");
    }

    const profile = resolveKpiProfile(user.role);
    if (!profile) {
      return ctx.reply("ℹ️ Role Anda saat ini tidak memiliki KPI profile.");
    }

    const { year, quarter } = getCurrentQuarter();
    const scorecard = await prisma.kpiScorecard.findUnique({
      where: {
        userId_year_quarter: {
          userId: user.id,
          year,
          quarter,
        },
      },
    });

    if (!scorecard) {
      return ctx.reply(`Belum ada scorecard KPI untuk ${quarter} ${year}.`);
    }

    return ctx.reply([
      `<b>KPI ${quarter} ${year}</b>`,
      `<b>${escapeHtml(user.name)}</b>`,
      `Profile: ${escapeHtml(profile.label)}`,
      `Final Score: <b>${scorecard.finalScore ?? 'N/A'}</b>`,
      `QB Multiplier: <b>x${Number(scorecard.qbMultiplier || 0).toFixed(1)}</b>`,
      `Task Jira Done: <b>${scorecard.completedJiraTaskCount || 0}</b>`,
      `Eligible QB: <b>${scorecard.eligibleBonus ? 'Ya' : 'Tidak'}</b>`,
      `Updated: ${escapeHtml(scorecard.updatedAt ? new Date(scorecard.updatedAt).toLocaleString('id-ID') : '-')}`,
    ].join('\n'), {
      parse_mode: 'HTML',
    });
  });

  bot.command('log_terakhir', async (ctx) => {
    const tgId = String(ctx.from.id);
    const user = await fetchLinkedTelegramUser(tgId);
    if (!user) {
      return ctx.reply("⛔ Akun Telegram Anda belum terdaftar. Tautkan dulu dari Web Dashboard dengan /link.");
    }
    return ctx.reply(await buildLatestActivityMessage(user.id, user.name), {
      parse_mode: 'HTML',
    });
  });

  bot.command('status', async (ctx) => {
    const tgId = String(ctx.from.id);
    const user = await fetchLinkedTelegramUser(tgId);
    if (!user) {
      return ctx.reply("⛔ Akun Telegram Anda belum terdaftar. Tautkan dulu dari Web Dashboard dengan /link.");
    }

    const parts = ctx.message.text.trim().split(/\s+/);
    const issueKey = parts[1];
    if (!issueKey) {
      return ctx.reply("Gunakan format: /status ISSUEKEY");
    }

    try {
      const issue = await fetchJiraIssue(issueKey);
      const issueUrl = `${(process.env.JIRA_BASE_URL || '').replace(/\/$/, '').replace(/^['"]|['"]$/g, '')}/browse/${encodeURIComponent(issue.key)}`;

      return ctx.reply([
        `<b>Status Issue Jira</b>`,
        `<a href="${issueUrl}">${escapeHtml(issue.key)}</a>`,
        `${escapeHtml(issue.summary || '-')}`,
        `Project: ${escapeHtml(issue.projectName || '-')}`,
        `Type: ${escapeHtml(issue.issueTypeName || '-')}`,
        `Status: ${escapeHtml(issue.statusName || '-')}`,
        `Priority: ${escapeHtml(issue.priorityName || '-')}`,
        `Assignee: ${escapeHtml(issue.assigneeDisplayName || '-')}`,
        `Due: ${escapeHtml(formatDueDate(issue.dueDate))}`,
      ].join('\n'), {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      });
    } catch (error: any) {
      return ctx.reply(error?.message || 'Gagal mengambil status issue Jira.');
    }
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
                runDailyTelegramReminders().catch((error) => {
                  console.error('Initial Telegram reminder run failed:', error);
                });
                setInterval(() => {
                  runDailyTelegramReminders().catch((error) => {
                    console.error('Scheduled Telegram reminder run failed:', error);
                  });
                }, REMINDER_POLL_MS);
            })
            .catch((error) => {
                console.error("Telegram Bot failed to start:", error.message);
            });
    }
};

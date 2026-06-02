import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { T, FONT, MONO, DISPLAY } from '../theme/tokens';
import { canManageKpi, canManageKpiNps, canViewKpiNps, isMgr, teamOf } from '../constants/taxonomy';
import { Btn, Card, RoleBadge, Tag, TeamBadge } from './ui/Primitives';

const copy = {
  id: {
    language: 'Bahasa Indonesia',
    title: 'User Guide',
    subtitle: 'Panduan berurutan untuk menggunakan EngineerLog, dari fitur harian sampai akses berdasarkan role.',
    updated: 'Panduan ini mengikuti tampilan aplikasi yang sedang digunakan.',
    sections: {
      start: 'Mulai Cepat',
      features: 'Fitur Utama',
      admin: 'Admin & Konfigurasi',
      roles: 'Role & Hak Akses',
    },
    steps: [
      {
        key: 'login',
        title: 'Masuk ke aplikasi',
        label: 'Akses awal',
        screen: 'login',
        summary: 'Gunakan email dan password yang sudah dibuat oleh admin. Setelah berhasil, aplikasi akan membuka dashboard sesuai role kamu.',
        bullets: ['Buka URL production EngineerLog.', 'Isi email dan password.', 'Jika akun baru, ikuti instruksi aktivasi atau reset password dari email.'],
      },
      {
        key: 'dashboard',
        title: 'Baca ringkasan dashboard',
        label: 'Monitoring',
        screen: 'dashboard',
        summary: 'Dashboard menampilkan aktivitas, jam kerja, pipeline, KPI, dan NPS sesuai akses user.',
        bullets: ['Gunakan tab untuk pindah antara overview, leaderboard, detail member, KPI, dan NPS.', 'Admin dan manager melihat data tim; user biasa melihat data personal.', 'Grafik NPS menampilkan trend score dan flag per quarter.'],
      },
      {
        key: 'activities',
        title: 'Input dan kelola Activity Log',
        label: 'Aktivitas harian',
        screen: 'activities',
        summary: 'Activity Log dipakai untuk mencatat pekerjaan manual dan aktivitas yang terkait Jira.',
        bullets: ['Klik tambah aktivitas.', 'Pilih kategori aktivitas, tanggal, waktu/durasi, status, dan detail pekerjaan.', 'Untuk aktivitas Jira, isi ticket agar validasi dan sinkronisasi berjalan.'],
      },
      {
        key: 'reports',
        title: 'Generate report',
        label: 'Pelaporan',
        screen: 'reports',
        summary: 'Report membantu rekap aktivitas, KPI, NPS, dan executive summary untuk periode tertentu.',
        bullets: ['Pilih menu Reports.', 'Atur filter tanggal, member, team, atau quarter.', 'Gunakan export CSV/PDF jika perlu arsip atau dibagikan.'],
      },
      {
        key: 'kpi',
        title: 'Kelola KPI dan scorecard',
        label: 'KPI',
        screen: 'kpi',
        summary: 'KPI menggabungkan data Jira, input manual, evidence, dan NPS sesuai profil role.',
        bullets: ['Admin/manager memilih member dan quarter.', 'Review breakdown domain KPI.', 'Simpan scorecard setelah nilai dan catatan final.'],
      },
      {
        key: 'nps',
        title: 'Input NPS dan review flag',
        label: 'NPS',
        screen: 'nps',
        summary: 'NPS diinput per project/task dan otomatis diberi flag Promotor, Passive, atau Detractors.',
        bullets: ['Score 4 menjadi Promotor.', 'Score 3 menjadi Passive.', 'Score 1-2 menjadi Detractors.', 'Dashboard NPS menampilkan trend score, trend count flag, dan persentase flag quarter terpilih.'],
      },
      {
        key: 'profile',
        title: 'Kelola profil dan keamanan akun',
        label: 'Profil',
        screen: 'profile',
        summary: 'Profile dipakai untuk mengubah nama, avatar, password, serta melihat KPI personal jika role kamu punya profil KPI.',
        bullets: ['Buka Profile dari kartu user di kanan bawah sidebar atau dari avatar/header.', 'Klik Edit untuk mengubah nama/avatar.', 'Gunakan panel Keamanan Akun untuk mengganti password.', 'Review KPI personal untuk melihat score, domain, dan aktivitas Jira/non-Jira.'],
      },
      {
        key: 'jira',
        title: 'Hubungkan akun Jira',
        label: 'Integrasi Jira',
        screen: 'jira',
        summary: 'Akun Jira perlu dihubungkan agar aplikasi mengenali accountId, membaca assignment, menarik worklog, dan menampilkan data KPI/NPS terkait.',
        bullets: ['Buka Profile lalu cari kartu Integrasi Jira.', 'Klik Hubungkan ke Jira.', 'Login ke Atlassian dan approve OAuth.', 'Setelah kembali ke Profile, pastikan status berubah menjadi Terhubung.', 'Jika gagal, cek callback URL production dan pastikan akun Jira user berada di site yang benar.'],
      },
      {
        key: 'telegram',
        title: 'Hubungkan Telegram Bot',
        label: 'Integrasi Telegram',
        screen: 'telegram',
        summary: 'Telegram Bot dipakai untuk input log aktivitas harian tanpa membuka web. Bot menautkan akun lewat token sekali pakai dari halaman Profile.',
        bullets: ['Buka Profile lalu cari kartu Integrasi Telegram Bot.', 'Klik Tautkan ke Telegram untuk membuat token 6 karakter.', 'Buka Telegram dan cari @sdt_elogs_bot.', 'Kirim perintah /link TOKEN, contoh /link A1B2C3.', 'Setelah tertaut, kirim /log untuk membuka wizard input aktivitas.', 'Aktivitas dari bot akan muncul di Activity Log dengan sumber Telegram Bot.'],
      },
      {
        key: 'members',
        title: 'Kelola Team Members',
        label: 'Admin Member',
        screen: 'members',
        summary: 'Team Members dipakai admin/manager untuk melihat struktur team, mengirim invite, suspend/reactivate user, dan reset password.',
        bullets: ['Admin bisa melihat seluruh member lintas team.', 'Manager melihat member sesuai scope team/supervisor.', 'Gunakan Invite untuk membuat akun baru.', 'Gunakan Suspend untuk menonaktifkan akses tanpa menghapus histori.', 'Gunakan reset password jika user tidak bisa login.'],
      },
      {
        key: 'taxonomy',
        title: 'Atur Master Activity',
        label: 'Taxonomy',
        screen: 'taxonomy',
        summary: 'Master Activity menentukan kategori pekerjaan yang muncul di form web dan bot. Kategori Jira sync tetap ada tetapi tidak dipilih manual.',
        bullets: ['Buka Master Activity dari Setting.', 'Aktifkan/nonaktifkan kategori sesuai kebutuhan operasional.', 'Pisahkan kategori manual app dan sinkron otomatis Jira.', 'Pastikan label mudah dipahami karena dipakai di report dan dashboard.'],
      },
      {
        key: 'smtp',
        title: 'Konfigurasi SMTP',
        label: 'Email',
        screen: 'smtp',
        summary: 'SMTP dipakai untuk pengiriman email invite, aktivasi, dan reset password.',
        bullets: ['Buka SMTP dari Setting.', 'Isi host, port, security, username, password, sender name, dan sender email.', 'Tes koneksi sebelum dipakai invite user.', 'Jika email tidak terkirim, cek credential, firewall, dan kebijakan provider email.'],
      },
      {
        key: 'audit',
        title: 'Review Audit Trail',
        label: 'Audit',
        screen: 'audit',
        summary: 'Audit Trail mencatat aktivitas penting seperti login, profile update, Jira connect, Telegram link, perubahan KPI, dan update konfigurasi.',
        bullets: ['Buka Audit Trail dari menu admin.', 'Filter berdasarkan modul, entity, user, atau tanggal.', 'Gunakan audit untuk investigasi perubahan data dan troubleshooting akses.', 'Data audit membantu memastikan perubahan bisa ditelusuri.'],
      },
      {
        key: 'settings',
        title: 'Checklist konfigurasi production',
        label: 'Production',
        screen: 'settings',
        summary: 'Sebelum dipakai user, pastikan konfigurasi production sudah sinkron antara frontend, backend, Atlassian, Jira webhook, SMTP, dan Telegram bot.',
        bullets: ['FRONTEND_URL harus mengarah ke domain production.', 'VITE_API_URL harus sesuai routing API production.', 'ATLASSIAN_REDIRECT_URI harus sama persis dengan callback URL di Atlassian Developer.', 'JIRA_WEBHOOK_SECRET harus sama dengan konfigurasi webhook Jira.', 'TELEGRAM_BOT_TOKEN harus aktif jika fitur bot dipakai.'],
      },
    ],
    rolesIntro: 'Hak akses aktual tetap mengikuti role user yang login. Matrix ini merangkum fitur yang tersedia di navigasi.',
    roleColumns: ['Role', 'Team', 'Fitur utama', 'Catatan akses'],
    roleRows: [
      ['Admin', 'All', 'Semua dashboard, member, reports, KPI, NPS, settings, audit', 'Akses penuh lintas team.'],
      ['Head Delivery / Head Presales', 'Delivery / Pre-Sales', 'Overview tim, leaderboard, executive report, KPI/NPS terkait', 'Melihat data sesuai domain kepemimpinan.'],
      ['Manager Delivery / Manager Pre-Sales', 'Delivery / Pre-Sales', 'Dashboard tim, member detail, reports, KPI sesuai role', 'Mengelola dan memonitor anggota team.'],
      ['PM', 'Delivery', 'Activity, profile, KPI NPS input, NPS report terkait', 'Input NPS untuk project/task yang assigned ke akun Jira PM.'],
      ['SE / Delivery', 'Delivery', 'Dashboard personal, activity, KPI saya, NPS terkait', 'Melihat NPS yang berkaitan dengan akun Jira sendiri.'],
      ['Sales Engineer', 'Pre-Sales', 'Dashboard personal, activity, report personal', 'Fokus pada aktivitas dan pipeline pre-sales.'],
    ],
  },
  en: {
    language: 'English',
    title: 'User Guide',
    subtitle: 'A step-by-step guide for EngineerLog, from daily workflows to role-based access.',
    updated: 'This guide follows the current rendered application UI.',
    sections: {
      start: 'Quick Start',
      features: 'Core Features',
      admin: 'Admin & Configuration',
      roles: 'Roles & Access',
    },
    steps: [
      {
        key: 'login',
        title: 'Sign in',
        label: 'Access',
        screen: 'login',
        summary: 'Use the email and password created by an admin. After login, the app opens the dashboard for your role.',
        bullets: ['Open the production EngineerLog URL.', 'Enter your email and password.', 'For new accounts, follow the activation or reset password email.'],
      },
      {
        key: 'dashboard',
        title: 'Read the dashboard summary',
        label: 'Monitoring',
        screen: 'dashboard',
        summary: 'The dashboard shows activities, work hours, pipeline, KPI, and NPS based on your access.',
        bullets: ['Use tabs to switch between overview, leaderboard, member detail, KPI, and NPS.', 'Admins and managers see team data; individual users see personal data.', 'NPS charts show score trend and flag trend by quarter.'],
      },
      {
        key: 'activities',
        title: 'Create and manage Activity Log',
        label: 'Daily work',
        screen: 'activities',
        summary: 'Activity Log records manual work and Jira-related activities.',
        bullets: ['Click add activity.', 'Choose category, date, time/duration, status, and work detail.', 'For Jira activities, fill the ticket so validation and sync can run.'],
      },
      {
        key: 'reports',
        title: 'Generate reports',
        label: 'Reporting',
        screen: 'reports',
        summary: 'Reports summarize activity, KPI, NPS, and executive data for a selected period.',
        bullets: ['Open Reports.', 'Set date, member, team, or quarter filters.', 'Export CSV/PDF when you need an archive or shareable report.'],
      },
      {
        key: 'kpi',
        title: 'Manage KPI and scorecards',
        label: 'KPI',
        screen: 'kpi',
        summary: 'KPI combines Jira data, manual input, evidence, and NPS based on each role profile.',
        bullets: ['Admins/managers select a member and quarter.', 'Review KPI domain breakdown.', 'Save the scorecard after final scores and notes are ready.'],
      },
      {
        key: 'nps',
        title: 'Input NPS and review flags',
        label: 'NPS',
        screen: 'nps',
        summary: 'NPS is entered per project/task and automatically flagged as Promotor, Passive, or Detractors.',
        bullets: ['Score 4 becomes Promotor.', 'Score 3 becomes Passive.', 'Score 1-2 becomes Detractors.', 'NPS dashboard shows score trend, flag count trend, and selected-quarter flag percentage.'],
      },
      {
        key: 'profile',
        title: 'Manage profile and account security',
        label: 'Profile',
        screen: 'profile',
        summary: 'Profile is used to update name, avatar, password, and personal KPI when your role has a KPI profile.',
        bullets: ['Open Profile from the user card or avatar/header.', 'Click Edit to update name/avatar.', 'Use Account Security to change password.', 'Review personal KPI to see scores, domains, and Jira/non-Jira activity.'],
      },
      {
        key: 'jira',
        title: 'Connect Jira account',
        label: 'Jira integration',
        screen: 'jira',
        summary: 'Jira must be connected so the app can identify accountId, read assignments, pull worklogs, and show related KPI/NPS data.',
        bullets: ['Open Profile and find Jira Integration.', 'Click Connect to Jira.', 'Sign in to Atlassian and approve OAuth.', 'After redirecting back to Profile, confirm the status is Connected.', 'If it fails, verify the production callback URL and the Jira site.'],
      },
      {
        key: 'telegram',
        title: 'Connect Telegram Bot',
        label: 'Telegram integration',
        screen: 'telegram',
        summary: 'Telegram Bot lets users submit daily activity logs without opening the web app. The bot links accounts using a one-time token from Profile.',
        bullets: ['Open Profile and find Telegram Bot Integration.', 'Click Link to Telegram to generate a 6-character token.', 'Open Telegram and search @sdt_elogs_bot.', 'Send /link TOKEN, for example /link A1B2C3.', 'After linked, send /log to open the activity wizard.', 'Bot activities appear in Activity Log with Telegram Bot source.'],
      },
      {
        key: 'members',
        title: 'Manage Team Members',
        label: 'Member admin',
        screen: 'members',
        summary: 'Team Members is used by admins/managers to view team structure, invite users, suspend/reactivate users, and reset passwords.',
        bullets: ['Admins can see all members across teams.', 'Managers see members based on team/supervisor scope.', 'Use Invite to create new accounts.', 'Use Suspend to disable access without deleting history.', 'Use password reset when a user cannot sign in.'],
      },
      {
        key: 'taxonomy',
        title: 'Configure Master Activity',
        label: 'Taxonomy',
        screen: 'taxonomy',
        summary: 'Master Activity controls work categories in web forms and the bot. Jira sync categories exist but are not selected manually.',
        bullets: ['Open Master Activity from Settings.', 'Enable/disable categories based on operational needs.', 'Keep manual app categories separate from Jira sync categories.', 'Use clear labels because they appear in reports and dashboards.'],
      },
      {
        key: 'smtp',
        title: 'Configure SMTP',
        label: 'Email',
        screen: 'smtp',
        summary: 'SMTP is used for invite, activation, and password reset emails.',
        bullets: ['Open SMTP from Settings.', 'Fill host, port, security, username, password, sender name, and sender email.', 'Test the connection before inviting users.', 'If email fails, check credentials, firewall, and provider policies.'],
      },
      {
        key: 'audit',
        title: 'Review Audit Trail',
        label: 'Audit',
        screen: 'audit',
        summary: 'Audit Trail records important events such as login, profile update, Jira connect, Telegram link, KPI changes, and configuration updates.',
        bullets: ['Open Audit Trail from admin menu.', 'Filter by module, entity, user, or date.', 'Use audit for data-change investigation and access troubleshooting.', 'Audit data keeps important changes traceable.'],
      },
      {
        key: 'settings',
        title: 'Production configuration checklist',
        label: 'Production',
        screen: 'settings',
        summary: 'Before users work in production, make sure frontend, backend, Atlassian, Jira webhook, SMTP, and Telegram bot configuration are aligned.',
        bullets: ['FRONTEND_URL must point to the production domain.', 'VITE_API_URL must match production API routing.', 'ATLASSIAN_REDIRECT_URI must exactly match the Atlassian Developer callback URL.', 'JIRA_WEBHOOK_SECRET must match Jira webhook configuration.', 'TELEGRAM_BOT_TOKEN must be active if the bot is used.'],
      },
    ],
    rolesIntro: 'Actual access still follows the logged-in user role. This matrix summarizes features available in navigation.',
    roleColumns: ['Role', 'Team', 'Main features', 'Access notes'],
    roleRows: [
      ['Admin', 'All', 'All dashboards, members, reports, KPI, NPS, settings, audit', 'Full cross-team access.'],
      ['Head Delivery / Head Presales', 'Delivery / Pre-Sales', 'Team overview, leaderboard, executive report, related KPI/NPS', 'Access follows leadership domain.'],
      ['Manager Delivery / Manager Pre-Sales', 'Delivery / Pre-Sales', 'Team dashboard, member detail, reports, role-based KPI', 'Manages and monitors team members.'],
      ['PM', 'Delivery', 'Activity, profile, KPI NPS input, related NPS report', 'Inputs NPS for project/task assigned to PM Jira account.'],
      ['SE / Delivery', 'Delivery', 'Personal dashboard, activity, my KPI, related NPS', 'Views NPS related to own Jira account.'],
      ['Sales Engineer', 'Pre-Sales', 'Personal dashboard, activity, personal report', 'Focused on pre-sales activity and pipeline.'],
    ],
  },
};

const anchors = [
  ['start', '01'],
  ['features', '02'],
  ['admin', '03'],
  ['roles', '04'],
];

function MiniScreenshot({ type, lang }) {
  const isEn = lang === 'en';
  const title = {
    login: isEn ? 'Sign in' : 'Masuk',
    dashboard: 'Dashboard',
    activities: isEn ? 'Activity Log' : 'Log Aktivitas',
    reports: 'Reports',
    kpi: 'KPI Scorecard',
    nps: 'KPI NPS',
    profile: 'Profile',
    jira: 'Jira Integration',
    telegram: 'Telegram Bot',
    members: 'Team Members',
    taxonomy: 'Master Activity',
    smtp: 'SMTP Settings',
    audit: 'Audit Trail',
    settings: 'Admin',
  }[type];

  if (type === 'login') {
    return (
      <ScreenShell title="EngineerLog" active={title}>
        <div style={{ maxWidth: 280, margin: '18px auto', padding: 16, border: `1px solid ${T.border}`, borderRadius: 12, background: T.surface }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: T.textPri, fontFamily: DISPLAY }}>{title}</div>
          <MiniInput label="Email" value="user@company.com" />
          <MiniInput label="Password" value="••••••••" />
          <div style={{ height: 30, borderRadius: 8, background: `linear-gradient(135deg,${T.indigo},${T.indigoHi})`, marginTop: 10 }} />
        </div>
      </ScreenShell>
    );
  }

  if (type === 'dashboard') {
    return (
      <ScreenShell title="Dashboard" active="Dashboard">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
          {['Activity', 'Hours', 'Pipeline', 'Avg NPS'].map((item, idx) => <Metric key={item} label={item} color={[T.indigoHi, T.teal, T.violet, T.amber][idx]} />)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr .8fr', gap: 10, marginTop: 10 }}>
          <ChartLine />
          <BarMini />
        </div>
      </ScreenShell>
    );
  }

  if (type === 'activities') {
    return (
      <ScreenShell title={title} active="Activity">
        <MiniToolbar chips={['Today', 'Team', 'Jira', isEn ? 'Export' : 'Ekspor']} />
        <MiniTable headers={['Date', 'Member', 'Activity', 'Ticket', 'Status']} rows={3} />
      </ScreenShell>
    );
  }

  if (type === 'reports') {
    return (
      <ScreenShell title="Reports" active="Reports">
        <MiniToolbar chips={['Activity', 'KPI', 'NPS', 'Executive']} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <ChartLine />
          <MiniTable headers={['Member', 'Hours', 'KPI']} rows={3} />
        </div>
      </ScreenShell>
    );
  }

  if (type === 'kpi') {
    return (
      <ScreenShell title="KPI" active="KPI">
        <MiniToolbar chips={['Q1', 'Q2', 'Q3', 'Q4']} />
        <div style={{ display: 'grid', gridTemplateColumns: '.9fr 1.1fr', gap: 10 }}>
          <MiniTable headers={['Domain', 'Score']} rows={4} />
          <div style={{ display: 'grid', gap: 7 }}>
            {['Implementation', 'Operational', 'Presales'].map((item, idx) => <Progress key={item} label={item} color={[T.teal, T.amber, T.violet][idx]} />)}
          </div>
        </div>
      </ScreenShell>
    );
  }

  if (type === 'nps') {
    return (
      <ScreenShell title="KPI NPS" active="NPS">
        <MiniToolbar chips={['Q1', 'Q2', 'Q3', 'Q4']} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <BarMini grouped />
          <DonutMini />
        </div>
        <MiniTable headers={['Issue', 'NPS', 'Flag']} rows={3} flags />
      </ScreenShell>
    );
  }

  if (type === 'profile') {
    return (
      <ScreenShell title="Profile" active="Profile">
        <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 12 }}>
          <div style={{ width: 66, height: 66, borderRadius: '50%', background: `linear-gradient(135deg,${T.teal},${T.indigoHi})` }} />
          <div>
            <div style={{ width: '64%', height: 13, borderRadius: 999, background: T.surfaceHi, marginBottom: 8 }} />
            <Tag color={T.green} lo={T.greenLo}>Jira Connected</Tag>
            <div style={{ width: '84%', height: 44, borderRadius: 10, background: T.surfaceHi, marginTop: 12 }} />
          </div>
        </div>
      </ScreenShell>
    );
  }

  if (type === 'jira') {
    return (
      <ScreenShell title="Profile" active="Profile">
        <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, background: T.surface, padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ width: 24, height: 24, borderRadius: '50%', background: T.jiraLo, display: 'inline-block' }} />
            <div style={{ width: 92, height: 11, borderRadius: 999, background: T.surfaceHi }} />
            <span style={{ marginLeft: 'auto', width: 66, height: 16, borderRadius: 999, background: T.greenLo }} />
          </div>
          <MiniTable headers={['Display', 'accountId', 'cloudId']} rows={2} />
          <div style={{ width: 120, height: 24, borderRadius: 8, background: T.indigo, marginTop: 10 }} />
        </div>
      </ScreenShell>
    );
  }

  if (type === 'telegram') {
    return (
      <ScreenShell title="Profile" active="Profile">
        <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, background: T.surface, padding: 14, textAlign: 'center' }}>
          <div style={{ width: 46, height: 46, borderRadius: '50%', background: T.indigoLo, margin: '0 auto 10px' }} />
          <div style={{ fontSize: 7, color: T.textMute, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>Sync token</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: T.indigoHi, fontFamily: DISPLAY, letterSpacing: '.12em', margin: '6px 0' }}>A1B2C3</div>
          <div style={{ display: 'inline-flex', padding: '7px 10px', borderRadius: 8, background: T.surfaceHi, color: T.textSec, fontSize: 9, fontFamily: MONO }}>/link A1B2C3</div>
          <div style={{ display: 'grid', gap: 5, marginTop: 12 }}>
            {['Open @sdt_elogs_bot', 'Send /link token', 'Use /log wizard'].map((item) => (
              <div key={item} style={{ height: 18, borderRadius: 6, background: T.indigoLo, color: T.indigoHi, fontSize: 8, fontWeight: 800, display: 'grid', placeItems: 'center' }}>{item}</div>
            ))}
          </div>
        </div>
      </ScreenShell>
    );
  }

  if (type === 'members') {
    return (
      <ScreenShell title="Team Members" active="Activity">
        <MiniToolbar chips={['All', 'Delivery', 'Pre-Sales', 'Invite']} />
        <MiniTable headers={['Name', 'Role', 'Team', 'Status', 'Action']} rows={4} />
      </ScreenShell>
    );
  }

  if (type === 'taxonomy') {
    return (
      <ScreenShell title="Master Activity" active="KPI">
        <MiniToolbar chips={['Manual App', 'Telegram', 'Jira Sync', 'Active']} />
        <div style={{ display: 'grid', gap: 7 }}>
          {['Implementation', 'Preventive Maintenance', 'Meeting', 'Presales Follow Up'].map((item, idx) => (
            <div key={item} style={{ display: 'grid', gridTemplateColumns: '1fr 62px 42px', gap: 8, alignItems: 'center', border: `1px solid ${T.border}`, borderRadius: 8, padding: 8, background: T.surface }}>
              <span style={{ fontSize: 8, color: T.textSec, fontWeight: 800 }}>{item}</span>
              <span style={{ height: 14, borderRadius: 999, background: idx < 2 ? T.jiraLo : T.indigoLo }} />
              <span style={{ height: 14, borderRadius: 999, background: idx === 1 ? T.amberLo : T.greenLo }} />
            </div>
          ))}
        </div>
      </ScreenShell>
    );
  }

  if (type === 'smtp') {
    return (
      <ScreenShell title="SMTP Settings" active="KPI">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 8 }}>
          <MiniInput label="Host" value="smtp.company.com" />
          <MiniInput label="Port" value="587" />
        </div>
        <MiniInput label="Sender Email" value="no-reply@company.com" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
          <div style={{ height: 28, borderRadius: 8, background: T.teal }} />
          <div style={{ height: 28, borderRadius: 8, background: T.surfaceHi, border: `1px solid ${T.border}` }} />
        </div>
      </ScreenShell>
    );
  }

  if (type === 'audit') {
    return (
      <ScreenShell title="Audit Trail" active="KPI">
        <MiniToolbar chips={['All', 'Jira', 'Telegram', 'KPI', 'Auth']} />
        <MiniTable headers={['Time', 'User', 'Action', 'Entity']} rows={5} />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title="Admin" active="Admin">
      <MiniToolbar chips={['Members', 'Taxonomy', 'SMTP', 'Audit']} />
      <MiniTable headers={['Object', 'Action', 'Updated']} rows={4} />
    </ScreenShell>
  );
}

function ScreenShell({ title, active, children }) {
  return (
    <div style={{ border: `1px solid ${T.borderHi}`, borderRadius: 10, overflow: 'hidden', background: T.bg, boxShadow: '0 18px 50px rgba(0,0,0,.24)' }}>
      <div style={{ height: 24, display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', borderBottom: `1px solid ${T.border}`, background: T.surface }}>
        {[T.red, T.amber, T.green].map((color) => <span key={color} style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />)}
        <span style={{ marginLeft: 6, fontSize: 9, color: T.textMute, fontFamily: MONO }}>{title}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '78px 1fr', minHeight: 210 }}>
        <div style={{ borderRight: `1px solid ${T.border}`, background: T.surface, padding: 8 }}>
          {['Dashboard', 'Activity', 'Reports', 'KPI', 'NPS', 'Profile'].map((item) => (
            <div key={item} style={{ height: 18, borderRadius: 5, marginBottom: 5, background: active === item ? T.indigoLo : 'transparent', color: active === item ? T.indigoHi : T.textMute, fontSize: 7, fontWeight: 800, display: 'flex', alignItems: 'center', paddingLeft: 6 }}>
              {item}
            </div>
          ))}
        </div>
        <div style={{ padding: 10, minWidth: 0 }}>
          <div style={{ width: 130, height: 13, borderRadius: 999, background: T.surfaceHi, marginBottom: 10 }} />
          {children}
        </div>
      </div>
    </div>
  );
}

function MiniInput({ label, value }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 7, color: T.textMute, textTransform: 'uppercase', fontWeight: 800, marginBottom: 4 }}>{label}</div>
      <div style={{ height: 28, borderRadius: 8, background: T.surfaceHi, border: `1px solid ${T.border}`, color: T.textSec, fontSize: 9, display: 'flex', alignItems: 'center', padding: '0 9px', fontFamily: label === 'Password' ? MONO : FONT }}>{value}</div>
    </div>
  );
}

function Metric({ label, color }) {
  return (
    <div style={{ border: `1px solid ${T.border}`, borderRadius: 8, background: T.surface, padding: 8 }}>
      <div style={{ fontSize: 7, color: T.textMute, marginBottom: 7 }}>{label}</div>
      <div style={{ width: 38, height: 12, borderRadius: 999, background: color }} />
    </div>
  );
}

function MiniToolbar({ chips }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
      {chips.map((chip, idx) => (
        <span key={chip} style={{ height: 22, padding: '0 8px', borderRadius: 999, border: `1px solid ${idx === 0 ? T.indigo : T.border}`, background: idx === 0 ? T.indigoLo : T.surfaceHi, color: idx === 0 ? T.indigoHi : T.textMute, fontSize: 8, fontWeight: 800, display: 'inline-flex', alignItems: 'center' }}>{chip}</span>
      ))}
    </div>
  );
}

function MiniTable({ headers, rows, flags }) {
  return (
    <div style={{ border: `1px solid ${T.border}`, borderRadius: 8, overflow: 'hidden', background: T.surface }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${headers.length},1fr)`, background: T.surfaceHi }}>
        {headers.map((header) => <div key={header} style={{ padding: '7px 6px', fontSize: 7, fontWeight: 800, color: T.textMute }}>{header}</div>)}
      </div>
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} style={{ display: 'grid', gridTemplateColumns: `repeat(${headers.length},1fr)`, borderTop: `1px solid ${T.border}` }}>
          {headers.map((header, idx) => {
            const flagColor = row === 0 ? T.green : row === 1 ? T.amber : T.red;
            return (
              <div key={`${header}-${idx}`} style={{ padding: '7px 6px', minHeight: 12 }}>
                {flags && header === 'Flag' ? (
                  <span style={{ display: 'inline-block', width: 44, height: 9, borderRadius: 999, background: flagColor }} />
                ) : (
                  <span style={{ display: 'block', width: `${44 + ((row + idx) % 3) * 14}%`, height: 8, borderRadius: 999, background: idx === 0 ? T.indigoLo : T.surfaceHi }} />
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function ChartLine() {
  return (
    <div style={{ height: 112, border: `1px solid ${T.border}`, borderRadius: 8, background: T.surface, padding: 10, display: 'flex', alignItems: 'end', gap: 8 }}>
      {[36, 58, 44, 76, 64, 88].map((height, idx) => <div key={idx} style={{ flex: 1, height, borderRadius: 6, background: idx % 2 ? T.teal : T.indigoHi, opacity: .9 }} />)}
    </div>
  );
}

function BarMini() {
  return (
    <div style={{ height: 112, border: `1px solid ${T.border}`, borderRadius: 8, background: T.surface, padding: 10, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, alignItems: 'end' }}>
      {[
        [42, 24, 14],
        [58, 28, 18],
        [48, 22, 30],
        [72, 20, 12],
      ].map((group, idx) => (
        <div key={idx} style={{ display: 'flex', alignItems: 'end', gap: 3, height: '100%' }}>
          {group.map((height, inner) => <div key={inner} style={{ flex: 1, height, borderRadius: 4, background: [T.green, T.amber, T.red][inner] }} />)}
        </div>
      ))}
    </div>
  );
}

function DonutMini() {
  return (
    <div style={{ height: 112, border: `1px solid ${T.border}`, borderRadius: 8, background: T.surface, display: 'grid', placeItems: 'center' }}>
      <div style={{ width: 76, height: 76, borderRadius: '50%', background: `conic-gradient(${T.green} 0 55%, ${T.amber} 55% 78%, ${T.red} 78% 100%)`, display: 'grid', placeItems: 'center' }}>
        <div style={{ width: 38, height: 38, borderRadius: '50%', background: T.surface }} />
      </div>
    </div>
  );
}

function Progress({ label, color }) {
  return (
    <div style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: 8, background: T.surface }}>
      <div style={{ fontSize: 8, color: T.textMute, fontWeight: 800, marginBottom: 6 }}>{label}</div>
      <div style={{ height: 8, borderRadius: 999, background: T.surfaceHi, overflow: 'hidden' }}>
        <div style={{ width: `${58 + label.length * 3}%`, height: '100%', background: color, borderRadius: 999 }} />
      </div>
    </div>
  );
}

export function DocsView({ currentUser }) {
  const navigate = useNavigate();
  const [lang, setLang] = useState('id');
  const [active, setActive] = useState('start');
  const text = copy[lang];
  const team = teamOf(currentUser?.role);
  const canKpi = canManageKpi(currentUser?.role);
  const canNps = canViewKpiNps(currentUser?.role);
  const canNpsInput = canManageKpiNps(currentUser?.role);
  const canExecutive = isMgr(currentUser?.role);

  const currentAccess = useMemo(() => [
    { label: 'Team', value: team || 'all', color: team === 'presales' ? T.violet : team === 'delivery' ? T.teal : T.indigoHi },
    { label: 'KPI Admin', value: canKpi ? 'Yes' : 'No', color: canKpi ? T.green : T.textMute },
    { label: 'NPS View', value: canNps ? 'Yes' : 'No', color: canNps ? T.green : T.textMute },
    { label: 'NPS Input', value: canNpsInput ? 'Yes' : 'No', color: canNpsInput ? T.green : T.textMute },
    { label: 'Executive', value: canExecutive ? 'Yes' : 'No', color: canExecutive ? T.green : T.textMute },
  ], [canExecutive, canKpi, canNps, canNpsInput, team]);

  const featureSteps = text.steps.slice(1, 6);
  const adminSteps = text.steps.slice(6);
  const references = lang === 'id'
    ? [
        {
          title: 'Aturan data Activity Log',
          items: [
            'Aktivitas manual dibuat dari web atau Telegram dan tampil sebagai sumber App/Telegram.',
            'Aktivitas Jira berasal dari sinkronisasi worklog dan tidak dipilih manual di form.',
            'Durasi dipakai untuk dashboard jam kerja, report aktivitas, dan komposisi Jira vs non-Jira.',
            'Status completed/progress membantu report operasional membaca pekerjaan yang sudah selesai.',
          ],
        },
        {
          title: 'Command Telegram yang perlu diketahui',
          items: [
            '/link TOKEN untuk menautkan akun web ke akun Telegram.',
            '/log untuk membuka wizard input aktivitas harian.',
            '/cancel atau tombol Batalkan input log untuk membatalkan wizard.',
            'Aktivitas dari bot masuk ke Activity Log dan ikut report seperti input web.',
          ],
        },
        {
          title: 'NPS dan flag',
          items: [
            'NPS hanya menerima nilai 1 sampai 4.',
            'Nilai 4 otomatis Promotor, nilai 3 Passive, nilai 1-2 Detractors.',
            'Trend NPS Score adalah rata-rata nilai NPS per quarter dengan 2 digit desimal.',
            'Trend Count by Flag menampilkan jumlah Promotor/Passive/Detractors per Q1-Q4.',
            'Pie chart menampilkan persentase flag untuk quarter yang sedang dipilih.',
          ],
        },
        {
          title: 'Report dan export',
          items: [
            'Activity Report bisa difilter berdasarkan source Jira/non-Jira, member, team, dan periode.',
            'KPI Report berfokus pada scorecard, final score, dan domain penilaian.',
            'NPS Report menyertakan issue, project, related engineer, PM input, score, flag, dan komentar.',
            'Executive Report dirancang untuk manager/head melihat ringkasan lintas team.',
          ],
        },
        {
          title: 'Checklist integrasi production',
          items: [
            'FRONTEND_URL mengarah ke domain web production.',
            'VITE_API_URL benar saat build frontend.',
            'ATLASSIAN_REDIRECT_URI sama persis dengan callback di Atlassian Developer.',
            'Webhook Jira mengarah ke /api/jira/webhooks/worklog dan secret cocok.',
            'TELEGRAM_BOT_TOKEN aktif dan bot bisa menerima /link serta /log.',
          ],
        },
      ]
    : [
        {
          title: 'Activity Log data rules',
          items: [
            'Manual activities are created from web or Telegram and appear as App/Telegram source.',
            'Jira activities come from worklog sync and are not selected manually in forms.',
            'Duration feeds work-hours dashboard, activity reports, and Jira vs non-Jira composition.',
            'Completed/progress status helps operational reports distinguish finished work.',
          ],
        },
        {
          title: 'Telegram commands',
          items: [
            '/link TOKEN links a web account to a Telegram account.',
            '/log opens the daily activity wizard.',
            '/cancel or the cancel button stops the wizard.',
            'Bot-submitted activities appear in Activity Log and reports like web entries.',
          ],
        },
        {
          title: 'NPS and flags',
          items: [
            'NPS accepts scores from 1 to 4 only.',
            'Score 4 is Promotor, score 3 is Passive, score 1-2 is Detractors.',
            'NPS Score Trend is the quarterly average with 2 decimal digits.',
            'Flag Count Trend shows Promotor/Passive/Detractors counts across Q1-Q4.',
            'Pie chart shows selected-quarter flag percentage.',
          ],
        },
        {
          title: 'Reports and exports',
          items: [
            'Activity Report can be filtered by Jira/non-Jira source, member, team, and period.',
            'KPI Report focuses on scorecards, final scores, and scoring domains.',
            'NPS Report includes issue, project, related engineer, PM input, score, flag, and comment.',
            'Executive Report helps managers/heads review cross-team summary.',
          ],
        },
        {
          title: 'Production integration checklist',
          items: [
            'FRONTEND_URL points to the production web domain.',
            'VITE_API_URL is correct when building frontend.',
            'ATLASSIAN_REDIRECT_URI exactly matches Atlassian Developer callback.',
            'Jira webhook points to /api/jira/webhooks/worklog and the secret matches.',
            'TELEGRAM_BOT_TOKEN is active and the bot accepts /link and /log.',
          ],
        },
      ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{`
        .docs-shell {
          display:grid;
          grid-template-columns:240px minmax(0,1fr);
          gap:16px;
          align-items:start;
        }
        .docs-nav {
          position:sticky;
          top:18px;
          display:flex;
          flex-direction:column;
          gap:6px;
        }
        .docs-step-grid {
          display:grid;
          grid-template-columns:minmax(0,.85fr) minmax(320px,1.15fr);
          gap:16px;
          align-items:center;
        }
        .docs-role-table {
          width:100%;
          min-width:860px;
          border-collapse:collapse;
          font-size:12px;
        }
        .docs-role-table th,
        .docs-role-table td {
          padding:11px 12px;
          border-bottom:1px solid ${T.border};
          text-align:left;
          vertical-align:top;
        }
        .docs-role-table th {
          background:${T.surfaceHi};
          color:${T.textMute};
          text-transform:uppercase;
          letter-spacing:.06em;
          font-size:10px;
        }
        @media (max-width: 980px) {
          .docs-shell {
            grid-template-columns:1fr;
          }
          .docs-nav {
            position:static;
            flex-direction:row;
            flex-wrap:wrap;
          }
          .docs-step-grid {
            grid-template-columns:1fr;
          }
        }
      `}</style>

      <Card p={20} glow={T.indigoHi}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 10, color: T.textMute, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>EngineerLog Docs</div>
            <h2 style={{ margin: 0, fontSize: 26, color: T.textPri, fontFamily: DISPLAY, fontWeight: 800 }}>{text.title}</h2>
            <p style={{ margin: '8px 0 0', color: T.textSec, fontSize: 13, lineHeight: 1.6, maxWidth: 760 }}>{text.subtitle}</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
              <RoleBadge role={currentUser?.role} />
              <TeamBadge team={currentUser?.team} />
              <Tag color={T.textMute} lo={T.border}>{text.updated}</Tag>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, background: T.surfaceHi, border: `1px solid ${T.border}`, borderRadius: 10, padding: 4 }}>
            <button onClick={() => navigate('/')} style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px 12px', background: T.surface, color: T.textSec, cursor: 'pointer', fontFamily: FONT, fontSize: 12, fontWeight: 800 }}>
              {lang === 'id' ? 'Kembali ke App' : 'Back to App'}
            </button>
            {['id', 'en'].map((item) => (
              <button key={item} onClick={() => setLang(item)} style={{ border: 'none', borderRadius: 8, padding: '8px 12px', background: lang === item ? T.indigo : 'transparent', color: lang === item ? '#fff' : T.textSec, cursor: 'pointer', fontFamily: FONT, fontSize: 12, fontWeight: 800 }}>
                {item.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <div className="docs-shell">
        <Card p={12} style={{ overflow: 'hidden' }}>
          <div className="docs-nav">
            {anchors.map(([key, number]) => (
              <button
                key={key}
                onClick={() => {
                  setActive(key);
                  document.getElementById(`docs-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                style={{ width: '100%', border: `1px solid ${active === key ? T.indigo : T.border}`, borderRadius: 10, background: active === key ? T.indigoLo : 'transparent', color: active === key ? T.indigoHi : T.textSec, padding: '10px 12px', textAlign: 'left', cursor: 'pointer', fontFamily: FONT, fontWeight: 800, fontSize: 12 }}
              >
                <span style={{ color: T.textMute, fontFamily: MONO, marginRight: 8 }}>{number}</span>
                {text.sections[key]}
              </button>
            ))}
          </div>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section id="docs-start" style={{ scrollMarginTop: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <SectionHead number="01" title={text.sections.start} />
              <GuideStep step={text.steps[0]} lang={lang} index={1} />
              <Card p={18}>
                <div style={{ fontSize: 15, fontWeight: 800, color: T.textPri, marginBottom: 12 }}>{lang === 'id' ? 'Akses kamu saat ini' : 'Your current access'}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10 }}>
                  {currentAccess.map((item) => (
                    <div key={item.label} style={{ border: `1px solid ${T.border}`, borderRadius: 10, padding: 12, background: T.surfaceHi }}>
                      <div style={{ fontSize: 9, color: T.textMute, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 6 }}>{item.label}</div>
                      <div style={{ fontSize: 15, color: item.color, fontWeight: 800, fontFamily: MONO }}>{item.value}</div>
                    </div>
                  ))}
                </div>
              </Card>
          </section>

          <section id="docs-features" style={{ scrollMarginTop: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <SectionHead number="02" title={text.sections.features} />
            {featureSteps.map((step, idx) => <GuideStep key={step.key} step={step} lang={lang} index={idx + 2} />)}
          </section>

          <section id="docs-admin" style={{ scrollMarginTop: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <SectionHead number="03" title={text.sections.admin} />
            {adminSteps.map((step, idx) => <GuideStep key={step.key} step={step} lang={lang} index={idx + 7} />)}
            <Card p={18}>
              <div style={{ fontSize: 16, fontWeight: 800, color: T.textPri, marginBottom: 12 }}>
                {lang === 'id' ? 'Referensi detail operasional' : 'Operational detail reference'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 12 }}>
                {references.map((reference) => <DetailCard key={reference.title} reference={reference} />)}
              </div>
            </Card>
          </section>

          <section id="docs-roles" style={{ scrollMarginTop: 18 }}>
            <SectionHead number="04" title={text.sections.roles} />
            <Card p={18}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: T.textPri }}>{text.sections.roles}</div>
                  <div style={{ fontSize: 12, color: T.textMute, marginTop: 5, lineHeight: 1.5 }}>{text.rolesIntro}</div>
                </div>
                <Btn v="ghost" sz="sm" onClick={() => setActive('start')}>{lang === 'id' ? 'Kembali ke awal' : 'Back to start'}</Btn>
              </div>
              <div style={{ overflowX: 'auto', border: `1px solid ${T.border}`, borderRadius: 12 }}>
                <table className="docs-role-table">
                  <thead>
                    <tr>
                      {text.roleColumns.map((column) => <th key={column}>{column}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {text.roleRows.map((row) => (
                      <tr key={row[0]}>
                        <td style={{ color: T.textPri, fontWeight: 800 }}>{row[0]}</td>
                        <td><Tag color={row[1].includes('Pre') ? T.violet : row[1].includes('Delivery') ? T.teal : T.indigoHi} lo={T.surfaceHi}>{row[1]}</Tag></td>
                        <td style={{ color: T.textSec }}>{row[2]}</td>
                        <td style={{ color: T.textMute }}>{row[3]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
}

function GuideStep({ step, lang, index }) {
  return (
    <Card p={18}>
      <div className="docs-step-grid">
        <div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
            <Tag color={T.indigoHi} lo={T.indigoLo}>{String(index).padStart(2, '0')}</Tag>
            <Tag color={T.textMute} lo={T.border}>{step.label}</Tag>
          </div>
          <h3 style={{ margin: 0, fontSize: 18, color: T.textPri, fontFamily: DISPLAY, fontWeight: 800 }}>{step.title}</h3>
          <p style={{ margin: '8px 0 12px', color: T.textSec, lineHeight: 1.6, fontSize: 13 }}>{step.summary}</p>
          <ol style={{ margin: 0, paddingLeft: 18, color: T.textSec, fontSize: 12, lineHeight: 1.7 }}>
            {step.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
          </ol>
        </div>
        <MiniScreenshot type={step.screen} lang={lang} />
      </div>
    </Card>
  );
}

function SectionHead({ number, title }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 2px' }}>
      <span style={{ fontFamily: MONO, fontSize: 12, color: T.indigoHi, fontWeight: 800 }}>{number}</span>
      <div style={{ height: 1, width: 28, background: T.border }} />
      <h2 style={{ margin: 0, fontSize: 20, color: T.textPri, fontFamily: DISPLAY, fontWeight: 800 }}>{title}</h2>
    </div>
  );
}

function DetailCard({ reference }) {
  return (
    <div style={{ border: `1px solid ${T.border}`, borderRadius: 12, background: T.surfaceHi, padding: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: T.textPri, marginBottom: 9 }}>{reference.title}</div>
      <ul style={{ margin: 0, paddingLeft: 18, color: T.textSec, fontSize: 12, lineHeight: 1.65 }}>
        {reference.items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}

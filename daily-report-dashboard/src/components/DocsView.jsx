import { useMemo, useState } from 'react';
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
        title: 'Hubungkan akun Jira',
        label: 'Profil',
        screen: 'profile',
        summary: 'Akun Jira perlu dihubungkan agar aplikasi bisa membaca assignment, worklog, dan data KPI/NPS terkait.',
        bullets: ['Buka Profile.', 'Klik connect Jira.', 'Login dan approve OAuth Atlassian.', 'Pastikan status Jira berubah menjadi connected.'],
      },
      {
        key: 'settings',
        title: 'Konfigurasi admin',
        label: 'Admin',
        screen: 'settings',
        summary: 'Admin mengelola member, master activity, SMTP, audit trail, dan konfigurasi pendukung operasional.',
        bullets: ['Tambah atau suspend member dari Team Members.', 'Atur taxonomy aktivitas di Master Activity.', 'Atur SMTP untuk email invite/reset.', 'Cek Audit Trail untuk perubahan penting.'],
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
        title: 'Connect Jira account',
        label: 'Profile',
        screen: 'profile',
        summary: 'A Jira account is required so the app can read assignments, worklogs, and related KPI/NPS data.',
        bullets: ['Open Profile.', 'Click connect Jira.', 'Sign in and approve Atlassian OAuth.', 'Confirm that Jira status changes to connected.'],
      },
      {
        key: 'settings',
        title: 'Admin configuration',
        label: 'Admin',
        screen: 'settings',
        summary: 'Admins manage members, master activity, SMTP, audit trail, and operational configuration.',
        bullets: ['Add or suspend members from Team Members.', 'Configure activity taxonomy in Master Activity.', 'Set SMTP for invite/reset emails.', 'Review Audit Trail for important changes.'],
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
              <button key={key} onClick={() => setActive(key)} style={{ width: '100%', border: `1px solid ${active === key ? T.indigo : T.border}`, borderRadius: 10, background: active === key ? T.indigoLo : 'transparent', color: active === key ? T.indigoHi : T.textSec, padding: '10px 12px', textAlign: 'left', cursor: 'pointer', fontFamily: FONT, fontWeight: 800, fontSize: 12 }}>
                <span style={{ color: T.textMute, fontFamily: MONO, marginRight: 8 }}>{number}</span>
                {text.sections[key]}
              </button>
            ))}
          </div>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {active === 'start' && (
            <>
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
            </>
          )}

          {active === 'features' && featureSteps.map((step, idx) => <GuideStep key={step.key} step={step} lang={lang} index={idx + 2} />)}

          {active === 'admin' && adminSteps.map((step, idx) => <GuideStep key={step.key} step={step} lang={lang} index={idx + 7} />)}

          {active === 'roles' && (
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
          )}
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

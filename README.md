# EngineerLog

EngineerLog adalah aplikasi internal untuk pencatatan aktivitas harian, sinkronisasi pekerjaan Jira, KPI/QB, report operasional, dan integrasi Telegram bot untuk tim Delivery dan Presales.

## Stack

- Frontend: React 19 + Vite + React Query + Recharts
- Backend: Node.js + Express + TypeScript
- Database: MongoDB via Prisma
- Auth: JWT access token + refresh token cookie + session rotation
- Integrasi: Jira, Telegram bot, SMTP, upload attachment, native PDF export
- Dokumentasi database: [database_erd.md](./database_erd.md)

## Fitur Saat Ini

- Login dengan refresh token, audit session, dan MFA/TOTP policy untuk role user/manager sesuai konfigurasi aplikasi.
- Activity Log manual dari web dan Telegram, termasuk lampiran dokumen.
- Attachment activity dengan validasi tipe file dan fitur preview/download.
- Sinkronisasi worklog Jira ke activity, dengan proteksi agar activity hasil sync Jira tidak bisa diedit manual.
- Dashboard role-based untuk admin/head, delivery, presales, dan detail member.
- Presales dashboard dengan total jam kerja, aktivitas, pipeline, dan task per kategori.
- Master Activity untuk taxonomy aktivitas aktif/nonaktif.
- SMTP Setting terpusat untuk invite/test email.
- Jira integration untuk OAuth user, webhook worklog, upcoming task 15 hari, KPI automation, dan SUP/problem-change report.
- Telegram bot command: `/cek`, `/cek tim`, `/kpi`, `/log terakhir`, `/status ISSUEKEY`, dan `/help`, plus reminder due H-3/H-1/overdue.
- Audit trail untuk login/logout, user, activity, KPI, integrasi, dan perubahan penting.

## Menu Utama

- `Dashboard`
  - Overview admin/head, personal delivery, personal presales, KPI personal, dan detail member.
- `Activity Log`
  - Input/edit activity manual, info prospect optional untuk presales, attachment preview/download.
- `Team Members`
  - Add/invite member, optional supervisor, reset password, status active/suspended.
- `Reports`
  - `Activity Report`: export rekap activity CSV/PDF berdasarkan filter.
  - `KPI Report`: khusus admin/manager; export Kinerja Kuartalan dan Ringkasan KPI Tim.
  - `Executive Report`: khusus admin/manager; report SUP problem/change by customer dengan native PDF.
- `KPI`
  - `Scorecard`: administrasi scorecard KPI.
  - `NPS`: input NPS per project `[IMP]` dan task `[OP]`.
- `Setting`
  - `Master Activity`
  - `SMTP`
- `Audit Trail`
  - Khusus admin.

## Report

### Activity Report

Activity Report digunakan untuk export aktivitas berdasarkan filter tim, member, source, customer, dan tanggal.

Format export:

- CSV
- PDF native via `jspdf` + `jspdf-autotable`

### KPI Report

KPI Report hanya dapat diakses oleh role admin dan manager/head.

Isi:

- `Kinerja Kuartalan`
  - 1 user, 1 quarter.
  - Memuat identitas user, total activity, manhour, KPI scorecard, evidence Jira, dan detail activity.
  - Evidence Jira dipisah menjadi Implementation, Preventive Maintenance, SUP Problem/Change, dan Operational Service/MSS.
  - SUP Problem/Change difilter berdasarkan actual start/created di quarter tersebut dan menampilkan topic Jira, actual start/end, status, dan score akhir.
- `Ringkasan KPI Tim`
  - Semua engineer dan project manager dalam 1 quarter.
  - Memuat summary total engineer, total project manager, total Jira task eligible QB, serta tabel KPI engineer dan PM.

### Executive Report

Executive Report berfokus pada ticketing `SUP-*` untuk Problem dan Change.

Isi utama:

- tren tiket per bulan per customer
- problem vs change per customer
- ringkasan tiket per customer
- kategori solusi per customer
- top jenis tiket berdasarkan topic
- report by customer dengan detail SUP, actual start, actual end, dan resolution hour

Customer alias dimapping menjadi entitas customer utama, contoh `Mega Crowdstrike` dan `Mega Appsealing` menjadi `Bank Mega`.

## KPI Dan QB

KPI delivery/PM dihitung hybrid dari data Jira dan input manual.

Domain utama:

- Implementation `[IMP]`
- Preventive Maintenance `[MA]`
- Corrective Maintenance dari SUP Problem
- Enhancement dari SUP Change
- Operational Service / MSS `[OP]`

Catatan perhitungan:

- Implementation menghitung task accuracy, dokumentasi, dan NPS project.
- NPS Implementation diinput per epic/project `[IMP]`, bukan general.
- NPS Operational diinput per task `[OP]`.
- Preventive Maintenance memakai actual end pekerjaan PM dan report PM.
- Blocked by bug dapat memberi skor fair sesuai aturan blocker.
- QB menghitung eligible Jira task/subtask sesuai aturan domain, termasuk perlakuan khusus `[OP]` untuk subtask operational.

## Integrasi Jira

Integrasi Jira digunakan untuk:

- OAuth connect user ke akun Jira
- webhook worklog untuk activity sync
- upcoming task schedule 15 hari
- KPI automation berdasarkan issue, due date, actual start/end, status category, dan linked blocker bug
- NPS item discovery untuk `[IMP]` dan `[OP]`
- executive report dari `SUP-*`

Requirement operasional:

- backend harus punya URL HTTPS publik untuk callback OAuth dan webhook
- service account Jira harus punya akses baca ke project yang dipakai
- user perlu menyimpan `jiraAccountId` untuk mapping assignee
- webhook Jira harus memakai event `worklog_created`, `worklog_updated`, dan `worklog_deleted`
- URL webhook production bisa memakai `https://logs.sdt.co.id/api/jira/webhooks/worklog` jika body dikirim, atau fallback variable: `https://logs.sdt.co.id/api/jira/webhooks/worklog?event={webhookEvent}&issueKey={issue.key}&issueId={issue.id}&worklogId={worklog.id}`
- jika `JIRA_WEBHOOK_SECRET` aktif tetapi Jira tidak mengirim `X-Hub-Signature`, tambahkan `&secret=<JIRA_WEBHOOK_SECRET>` ke URL fallback

## Telegram Bot

Fitur bot:

- input log activity via wizard
- `/cek` untuk task pribadi next 15 days
- `/cek tim` untuk admin/head melihat schedule bawahan
- `/kpi` untuk KPI ringkas quarter berjalan
- `/log terakhir` untuk 5 activity terakhir
- `/status ISSUEKEY` untuk cek cepat status Jira
- reminder otomatis untuk due H-3, H-1, dan overdue

## Security Dan Compliance

- JWT access token pendek + refresh token cookie.
- Refresh token disimpan sebagai hash di `AuthSession`.
- MFA/TOTP support dengan secret terenkripsi.
- Security headers di frontend/proxy.
- Email domain invite/member dibatasi ke domain internal sesuai policy.
- Attachment upload disanitasi dan dibatasi ke tipe dokumen yang diizinkan.
- Audit trail untuk perubahan penting.

## Requirement

- Node.js 20+
- npm
- MongoDB Atlas atau MongoDB yang dapat diakses backend
- Docker + Docker Compose untuk deployment container
- Environment variables backend yang valid

## Setup Backend

```bash
cd daily-report-backend
npm install
npx prisma generate
npx prisma db push
npm run dev
```

Contoh environment backend:

```env
DATABASE_URL=
JWT_SECRET=
JWT_REFRESH_SECRET=
PORT=4000
FRONTEND_URL=http://localhost:5173
TELEGRAM_BOT_TOKEN=
JIRA_BASE_URL=
JIRA_USER_EMAIL=
JIRA_API_TOKEN=
ATLASSIAN_CLIENT_ID=
ATLASSIAN_CLIENT_SECRET=
ATLASSIAN_REDIRECT_URI=
JIRA_WEBHOOK_SECRET=
JIRA_WORKLOG_POLL_ENABLED=true
JIRA_WORKLOG_POLL_INTERVAL_MS=300000
JIRA_WORKLOG_POLL_LOOKBACK_HOURS=168
AUDIT_RETENTION_DAYS=7
```

SMTP dapat diatur dari menu aplikasi, tetapi environment tetap dapat dipakai untuk konfigurasi awal jika service membutuhkan fallback.

## Setup Frontend

```bash
cd daily-report-dashboard
npm install
npm run dev
```

Default lokal:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000`
- API base: `http://localhost:4000/api`

## Build

```bash
cd daily-report-backend
npm run build

cd ../daily-report-dashboard
npm run build
```

## Docker Deploy

```bash
docker compose build
docker compose up -d
```

Service:

- `frontend`: port `80`, serve Vite build via Nginx
- `backend`: port `4000`

Volume/persistensi:

- upload backend
- session state Telegram bot

Operasional:

```bash
docker compose logs -f
docker compose restart
docker compose down
```

## Struktur Repo

- `daily-report-backend/` - Express API, Telegram bot, Jira integration, Prisma schema
- `daily-report-dashboard/` - React dashboard
- `database_erd.md` - ERD dan detail schema database
- `kpi/` - dokumen referensi KPI
- `security-sast-report.json` - hasil security review internal
- `docker-compose.yml` - deployment container
- `start.sh` - helper lokal untuk menjalankan backend dan frontend

## Catatan Operasional

- Activity `source = jira` tidak bisa diedit manual.
- Activity manual non-Jira bisa diedit.
- Add member supervisor bersifat optional.
- Inisial avatar otomatis dibuat dari nama jika avatar kosong.
- KPI Report hanya untuk admin dan manager/head.
- Executive Report hanya untuk role yang memiliki akses manager/admin sesuai guard aplikasi.

# EngineerLog

EngineerLog adalah aplikasi daily report internal untuk tim Delivery dan Presales.
Stack saat ini:

- Frontend: React + Vite
- Backend: Node.js + Express + TypeScript
- Database: MongoDB via Prisma
- Integrasi: Jira, Telegram bot, upload attachment, KPI manual, audit trail, auth refresh token

## Fitur Utama

- Login dengan access token + refresh token
- Daily activity log manual
- Sinkronisasi activity dari Jira
- Integrasi Telegram untuk input log
- Team member management
- Dashboard operasional
- Report dengan scope akses berdasarkan role
- KPI manual per periode
- Audit trail untuk perubahan penting

## Struktur Repo

- `daily-report-backend/` - API server, bot Telegram, Prisma schema
- `daily-report-dashboard/` - frontend React
- `database_erd.md` - dokumentasi ERD dan schema database
- `kpi/` - dokumen KPI PDF
- `start.sh` - helper untuk restart backend dan frontend

## Requirement

- Node.js 20+
- npm
- MongoDB Atlas atau MongoDB yang bisa diakses backend
- Environment variables backend yang valid

## Setup Backend

Masuk ke folder backend:

```bash
cd daily-report-backend
npm install
```

Buat atau perbarui `.env` sesuai kebutuhan environment. Variabel yang dipakai saat ini antara lain:

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
```

Lalu generate Prisma client dan sync schema:

```bash
npx prisma generate
npx prisma db push
```

Jalankan backend:

```bash
npm run dev
```

## Setup Frontend

Masuk ke folder frontend:

```bash
cd daily-report-dashboard
npm install
```

Jalankan frontend:

```bash
npm run dev
```

## Menjalankan Keduanya

Gunakan helper script di root:

```bash
./start.sh
```

Script ini akan:

- membersihkan port `4000` dan `5173`
- menjalankan backend
- menjalankan frontend

## Deploy Dengan Docker

Repo ini sekarang menyediakan setup Docker untuk backend dan frontend sekaligus.

Prasyarat:

- Docker
- Docker Compose plugin (`docker compose`)
- file `daily-report-backend/.env` sudah sesuai environment server

Langkah:

```bash
git pull
docker compose build
docker compose up -d
```

Service yang dijalankan:

- `frontend` di port `80`
- `backend` di port `4000`

Arsitektur runtime:

- frontend dibuild dengan Vite lalu diserve oleh Nginx
- request `/api` dan `/uploads` dari frontend diproxy ke container backend
- state session bot Telegram dipersist di volume Docker terpisah
- folder upload backend dipersist di volume Docker `backend_uploads`

Catatan environment penting:

- set `FRONTEND_URL` ke origin publik frontend, misalnya `http://192.168.30.141`
- set `PORT=4000`
- tetap isi `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, dan env integrasi lain yang dibutuhkan

Perintah operasional umum:

```bash
docker compose logs -f
docker compose restart
docker compose down
```

## Default URL Lokal

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000`
- API base: `http://localhost:4000/api`

## Integrasi Jira

Saat ini integrasi Jira dipakai untuk dua hal:

1. OAuth connect user app ke akun Jira
2. Webhook worklog untuk sinkronisasi activity otomatis

Requirement operasional:

- backend harus punya URL HTTPS publik untuk callback OAuth dan webhook
- akun service Jira backend harus punya akses baca ke project yang mau disinkronkan

## KPI

KPI saat ini dihitung dari scorecard manual per periode.

Peran yang memakai KPI:

- Engineer Delivery
- Project Manager

Presales tidak memakai KPI quarter, tetapi tetap bisa melihat statistik aktivitas.

## Audit Trail

Audit trail mencatat perubahan penting seperti:

- login/logout
- create/update/delete activity
- update user/member
- save KPI
- recalculate QB
- connect/disconnect Jira

Halaman audit trail hanya tersedia untuk admin.

## Dokumentasi Tambahan

- [ERD / Database Schema](./database_erd.md)
- KPI reference ada di folder `kpi/`

## Catatan Operasional

- Login sekarang memakai refresh token cookie `refresh_token`
- Frontend otomatis me-refresh access token ketika menerima `401`
- Activity dari Jira tidak bisa diubah manual dari aplikasi
- Report dibatasi berdasarkan role:
  - admin: semua data
  - head: subtree bawahan
  - user biasa: diri sendiri

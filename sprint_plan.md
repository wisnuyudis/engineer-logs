# 🏃‍♂️ Detailed Sprint Plan: Fullstack EngineerLog & Jira Integration

Dokumen ini adalah rincian *sprint plan* yang sangat mendetail, memecah setiap modul menjadi fitur fundamental (inti) dan kosmetik (UI/UX), serta mencakup integrasi sistem seperti Jira dan SMTP. Rencana ini dibagi menjadi 6 Sprint utama.

---

## 🏗 Sprint 1: Foundation, Architecture & Database
**Tujuan:** Membangun kerangka dasar sistem *backend* dan *database* yang akan menopang seluruh aplikasi.

### Modul: System Core (Fundamental)
- [ ] **Setup Backend Repository:** Inisialisasi Node.js (misal: Express.js atau NestJS). Konfigurasi TypeScript, ESLint, dan Prettier.
- [ ] **Database Setup:** Setup PostgreSQL dan ORM (seperti Prisma atau TypeORM).
- [ ] **Database Schema (ERD):** Pembuatan tabel:
  - `Users` (ID, Email, Password Hash, Role, Status, Avatar URL, dll)
  - [Activities](file:///Users/wisnu/Data/Dev/engineer-logs/daily-report-dashboard/src/components/ActivitiesView.jsx#8-60) (Tipe, Durasi, Waktu, Note, Jira Ticket ID, dll)
  - `Teams` & `Hierarchy` (Relasi atasan/bawahan)
  - `Settings` (Penyimpanan rahasia konfigurasi SMTP/Jira per *tenant*)
- [ ] **API Standard & Error Handling:** Standarisasi respons JSON (Success/Error format), logging (Pino/Winston).

---

## 🔐 Sprint 2: Authentication & Team Management
**Tujuan:** Mengelola akses pengguna, hierarki tim, dan sistem undangan via email (SMTP).

### Modul: Auth & Security (Fundamental)
- [ ] **Login System:** API untuk *Login* menggunakan Email & Password, implementasi JWT (*JSON Web Token*) untuk manajemen *session*.
- [ ] **Role-Based Access Control (RBAC):** *Middleware* otorisasi untuk membedakan hak akses [Admin](file:///Users/wisnu/Data/Dev/engineer-logs/daily-report-dashboard/src/utils/kpi.js#67-69), `Manager` (Pre-Sales/Delivery), dan `Staff` (SE, PM, Sales).
- [ ] **Profile Management:** API untuk *User* mengubah data diri dan kata sandi.

### Modul: Team Member Invitation (Fundamental & Workflow)
- [ ] **Setup SMTP Engine:** Modul *backend* (menggunakan `Nodemailer`) untuk terhubung ke *provider* email pihak ketiga (Gmail, SendGrid, Amazon SES, atau Custom SMTP).
- [ ] **Invitation API:** 
  - Admin menginput Nama, Email, Role, dan Atasan (Supervisor).
  - Sistem membuat token undangan (*magic link*) yang memiliki masa kedaluwarsa (24 jam).
  - Sistem menyimpan konfigurasi SMTP (aman di `.env` atau DB teraenkripsi).
  - Sistem mengirim email berformat HTML yang rapi ke calon *user*.
- [ ] **Activation Workflow:** Halaman khusus bagi *invitee* untuk membuat *password* baru setelah mengklik tautan dari email, mengubah status akun menjadi `Active`.

### Modul: UI/UX (Kosmetik)
- [ ] **UI Loader & Toasts:** Menambahkan animasi transisi saar *login* dan *toast notifications* (Sukses kirim undangan, Error login).

---

## 📝 Sprint 3: Activity Logging & File Attachments
**Tujuan:** Memfungsikan sistem pencatatan aktivitas harian secara manual.

### Modul: Activity Log (Fundamental)
- [ ] **API Pencatatan Manual:** CRUD untuk aktivitas *Non-Jira* (Learning, Internal Meeting, Koordinasi) dan *Jira Manual* (input Ticket ID secara manual).
- [ ] **Validasi Bisnis:** Mencegah input jam yang terbalik (Jam Selesai < Jam Mulai), deteksi bentrok jam kerja (*overlapping hours*).
- [ ] **Pre-Sales / PM Extensions:** Input khusus untuk peran tertentu (misal: Lead ID, Propsect Value untuk Pre-Sales; input skor NPS Customer untuk PM).

### Modul: File Upload (Fundamental)
- [ ] **Storage System:** Integrasi penyimpanan berkas lampiran (PDF, JPG, DOCX) menggunakan AWS S3, Google Cloud Storage, atau local volume.
- [ ] **Upload API:** Penanganan *multipart/form-data*, validasi tipe file, dan pembatasan ukuran (Maks 20MB).

### Modul: UI/UX (Kosmetik)
- [ ] **Drag-and-Drop Form:** Memperhalus interaksi UI saat melampirkan file di [LogForm](file:///Users/wisnu/Data/Dev/engineer-logs/daily-report-dashboard/src/components/LogForm.jsx#6-287).
- [ ] **Interactive Time Picker:** Pemilihan jam mulai dan selesai yang responsif.

---

## 🔄 Sprint 4: Jira Cloud Integration
**Tujuan:** Mengotomatiskan penarikan data aktivitas dari ekosistem Jira Atlassian.

### Modul: Jira API Connection (Fundamental)
- [ ] **Atlassian OAuth / API Token:** Konfigurasi kredensial autentikasi dengan API Jira.
- [ ] **Jira Webhook Receiver:** Membangun *endpoint* khusus di *backend* (contoh: `/api/webhooks/jira`). 
  - Ketika *engineer* melakukan "Log Work" di Jira, Jira akan memukul *endpoint* ini.
  - *Backend* memvalidasi *payload* dan memasukkannya otomatis ke tabel [Activities](file:///Users/wisnu/Data/Dev/engineer-logs/daily-report-dashboard/src/components/ActivitiesView.jsx#8-60) sesuai email *user*.
- [ ] **Data Sync/Polling Mechanism (Fallback):** API sinkronisasi manual jika jalur *webhook* gagal, mencari *worklog* terbaru berdasarkan waktu.
- [ ] **Ticket Metadata Grabber:** Mengambil judul tiket, *Customer/Project Name* secara otomatis dari ID tiket Jira yang dikirim.

### Modul: UI/UX (Kosmetik)
- [ ] **Visual Cues (Badge):** Menambahkan label atau logo "Synced from Jira" dengan visual yang berbeda dari input manual di halaman layar `Activity Log`.

---

## 📈 Sprint 5: KPI Engine & Dashboard Aggregation
**Tujuan:** Mengolah seluruh data mentah di tabel [Activities](file:///Users/wisnu/Data/Dev/engineer-logs/daily-report-dashboard/src/components/ActivitiesView.jsx#8-60) menjadi wawasan analitik dan skor kinerja (KPI).

### Modul: Aggregation & Statistics (Fundamental)
- [ ] **Dashboard Metrics API:** Mengalkulasi Total Jam, Total Aktivitas, dan Metrik Pipeline (Pre-Sales) secara *live* dari *database*.
- [ ] **Leaderboard API:** Menghasilkan peringkat *user* berdasarkan jam kerja dan persentase tiket selesai (*efficiency*).

### Modul: KPI Calculation Engine (Fundamental)
- [ ] **Backend KPI Calculator:** Memindahkan logika skoring KPI (Q1, Q2, Q3, Q4) ke *backend* (Worker/Cron Job atau dipanggil *on-the-fly*).
- [ ] **Role-Specific Metrics:** Menghitung formula yang berbeda berdasarkan *role* (PM fokus pada NPS dan dokumentasi, SE fokus pada Preventif/Korektif).
- [ ] **Admin Overrides:** API khusus bagi Admin untuk mengubah skor manual (misal: Input NPS hasil presentasi untuk PM).

### Modul: UI/UX (Kosmetik)
- [ ] **Charts Integration:** Menyambungkan diagram batang (Recharts) di Dashboard dengan *response* API mingguan.
- [ ] **KPI Rings Animation:** Memastikan cincin persentase KPI melingkar secara *smooth* saat data KPI selesai dimuat dari jaringan.

---

## 🖨 Sprint 6: Reporting, Export, & Final Polish
**Tujuan:** Menyelesaikan sistem pelaporan formal dan pemolesan antar muka sebelum naik ke tahap produksi (*Go-Live*).

### Modul: Data Export (Fundamental)
- [ ] **Report View API:** API pencarian/filter kompleks (berdasarkan Tim, Tanggal, Customer, Jira/Non-Jira, dan Spesifik Member).
- [ ] **CSV Generation:** Implementasi algoritma pembuatan CSV (baik di *frontend/backend*).
- [ ] **PDF Rendering Engine:** Menghasilkan dokumen PDF berbentuk laporan formal (kop surat, tabel rapi, rekapan jam) untuk ditandatangani/dikirim ke eksternal.

### Modul: UI/UX & Final Polish (Kosmetik)
- [ ] **Empty States & Skeletons:** Membuat *loading state* bercahaya (*skeleton glow*) saat API masih berputar, mengisi bagian layar yang kosong jika aktivitas bulan belum ada.
- [ ] **Responsive Tweaks:** Menyesuaikan desain halaman Dashboard dan Sidebar di layar tablet/kecil.
- [ ] **Avatars:** Fitur tambahan pengguna untuk mengunggah dan memotong gambar foto profil.

### Modul: Deployment
- [ ] **Dockerization:** Membuat `Dockerfile` dan `docker-compose.yml` untuk mempermudah pengerahan sistem.
- [ ] **CI/CD Pipeline:** Otomatisasi pengerahan (opsional via GitHub Actions).
- [ ] **Setup Nginx/Domain:** Setup SSL/HTTPS agar komunikasi Jira Webhook dapat dilakukan secara aman.

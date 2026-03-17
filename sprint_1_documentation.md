# 📚 Dokumentasi Sprint 1: Foundation & Database

Dokumen ini merupakan rekapitulasi teknis yang sangat mendetail mengenai apa saja yang telah dibangun dan dikonfigurasi selama eksekusi **Sprint 1** untuk proyek `daily-report-backend`.

## 1. Arsitektur & Teknologi Dasar (Tech Stack)
Repositori *backend* telah berhasil dinisialisasi dengan standar produksi modern:
- **Runtime & Framework:** Node.js dipadukan dengan Express.js.
- **Bahasa Pemrograman:** TypeScript (v5+) dengan konfigurasi [tsconfig.json](file:///Users/wisnu/Data/Dev/engineer-logs/daily-report-backend/tsconfig.json) yang ketat (Strict Mode).
- **Execution Engine:** Menggunakan `ts-node-dev` untuk peladen lokal yang stabil dan cepat melakukan muat ulang (*hot-reloading*).
- **Logging:** Menggunakan `pino` dan `pino-http` untuk *logger* interaktif bervolume tinggi dengan penalti performa paling rendah.
- **Security:** Modul `cors` diaktifkan sebagai pertahanan dasar dari eksploitasi web *cross-origin*.
- **Database Engine:** PostgreSQL 15 via Docker.
- **ORM:** Prisma ORM versi 5.22.0 yang stabil.

## 2. Infrastruktur Basis Data (Docker & PostgreSQL)
Kita tidak menginstal PostgreSQL secara mentah di sistem operasi, melainkan menggunakan kontainer Docker mandiri melalui berkas [docker-compose.yml](file:///Users/wisnu/Data/Dev/engineer-logs/daily-report-backend/docker-compose.yml).

- **Image:** `postgres:15-alpine` (versi sangat ringan yang menghemat memori RAM).
- **Container Name:** `daily-report-db`
- **Volume Persistensi:** `postgres_data` (Data tidak akan hilang meskipun peladen Docker direstart).
- **Port Binding:** Dibuka penuh di port standar PostgreSQL `5432`.
- **Kredensial Default:** 
  - User: `postgres`
  - Password: `password123`
  - Database Name: `engineerlog`

## 3. Desain Skema Database (Entity Relationship via Prisma)
Model *database* telah digambar sepenuhnya dalam [prisma/schema.prisma](file:///Users/wisnu/Data/Dev/engineer-logs/daily-report-backend/prisma/schema.prisma) dan diimplementasikan ke PostgreSQL. Skema ini dirancang sanggup menangani hierarki *User* serta *Worklog* Jira ke depannya.

### Tabel Dasar:
1. **Model [User](file:///Users/wisnu/Data/Dev/engineer-logs/daily-report-backend/src/controllers/userController.ts#7-28)**
   - Berisi kunci unik [id](file:///Users/wisnu/Data/Dev/engineer-logs/daily-report-dashboard/src/components/ui/Primitives.jsx#131-134) (UUID) dan `email`.
   - Penyimpanan rahasia menggunakan `passwordHash`.
   - Memilki *Role-based tracking*: `role` (Admin/Manager/Staff), `status` (active/invited/suspended), dan `team` (Delivery/Pre-Sales/Admin).
   - **Self-Relation:** Menyimpan hierarki supervisor (`supervisorId` yang merujuk ke ID User lain), sehingga kita bisa tahu siapa atasan langsung seorang *engineer*.
2. **Model `Activity`**
   - Merupakan tabel transaksi utama. Menyimpan `dur` (durasi), [date](file:///Users/wisnu/Data/Dev/engineer-logs/daily-report-backend/src/controllers/userController.ts#59-76) (tanggal), hingga `status` (completed/progress).
   - Memiliki ladang Jira: `source` (jira/app), `ticketId`, dan `ticketTitle`.
   - Ekstensi Presales: Menyimpan detail CRM internal seperti `customerName`, `prName`, `nps`, dan nominal `prospectValue`.
   - **Relasi:** Terikat secara konkrit dengan `userId`.
3. **Model `Setting`**
   - Tabel *Key-Value store* fleksibel (seperti parameter SMTP/Jira Webhook yang akan dikembangkan nanti).

## 4. Mekanisme Seeding Data Otomatis
Sebuah skrip khusus [src/seed.ts](file:///Users/wisnu/Data/Dev/engineer-logs/daily-report-backend/src/seed.ts) telah kami kembangkan agar *database* selalu terisi dengan data utama seketika saat di-*deploy* ke server baru:
- **Admin Root:** Secara otomatis menciptakan akun `admin@seraphim.id` dengan akses tertinggi.
- **Staff Demo:** Otomatis menghasilkan akun `staff@seraphim.id` untuk pengetesan.
- Kata sandi seluruh akun hasil *seed* sudah disandi (algoritma *hashing*) sebanyak `10 rounds` oleh modul enkripsi murni `bcryptjs` dan mustahil dibaca melalui basis data.

## 5. Endpoints API Dasar (User Management)
Telah berdiri satu modul rute [userRoutes.ts](file:///Users/wisnu/Data/Dev/engineer-logs/daily-report-backend/src/routes/userRoutes.ts) dan kontroler [userController.ts](file:///Users/wisnu/Data/Dev/engineer-logs/daily-report-backend/src/controllers/userController.ts) yang dikaitkan pada prefiks URL `/api/users/`.
Rute ini mencakup fungsi pengelolaan hierarki dasar:

*   **`GET /api/users`**
    *   Tugas: Mengembalikan representasi larik JSON seluruh anggota yang membuang data `passwordHash` demi sistem keamanan (hanya melempar ID, Email, Nama, Tim, dan Supervisor).
*   **`POST /api/users`**
    *   Tugas: Titik akses utama untuk penambahan anggota baru ke *database*.
    *   Pengamanan: Mengecek duplikasi email secara internal (*constraint collision*); mengeksekusi *hashing* otomatis menggunakan `Bcryptjs` pada parameter sandi mentah.
*   **`PATCH /api/users/:id`**
    *   Tugas: Mengubah nilai mutasi individu layaknya penggantian jabatan (`role`), pemindahan kelompok (`team`), hingga mengubah kuasa login (`status: suspended`).
*   **`GET /health`**
    *   Tugas: Pengecekan denyut nadi peranti lunak (kesehatan sistem di infrastruktur Cloud).

---

> **Kesimpulan:** Dengan dirampungkannya *Sprint 1*, fondasi sistem (ORM stabil, arsitektur REST JSON-bersih, serta Database transaksional persisten) berhasil ditegakkan tanpa satu celah eror kompilasi. Sistem siap menerima arsitektur otentikasi di *Sprint 2*.

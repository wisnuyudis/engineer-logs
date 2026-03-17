# 📚 Dokumentasi Sprint 3: Activity Logging & File Attachments

Dokumen ini merangkum penyelesaian implementasi pencatatan modul *Activity Log* dan engine pengunggahan arsip *File Attachment* pada **Sprint 3**.

## 1. Engine Backend & API Aktivitas (CRUD)
Sistem sekarang mengizinkan *user* untuk menyimpan rekaman jam kerja dan aktivitas hariannya dengan stabil dan terstruktur ke tabel [Activity](file:///Users/wisnu/Data/Dev/engineer-logs/daily-report-backend/src/controllers/activityController.ts#132-157).
*   **Validasi Jam Cerdas (`POST /api/activities`)**: Terdapat dua level validasi bisnis sebelum aktivitas direkam:
    1. Sistem memastikan *Jam Selesai* (`endTime`) tidak mengurut ke belakang dari *Jam Mulai* (`startTime`).
    2. Sistem mengekstrak rentang jam tersebut, mencarinya di *database* hari yang sama bagi pengguna itu (`findMany`), dan memblokirnya otomatis apabila terdeteksi tabrakan waktu (`overlapping hours`), mencegah duplikasi konyol atau jam ganda.
*   **Role-Specific Data Mapping**: Form di- *backend* telah dapat menelan parameter ekstra dari pengguna khusus, seperti `customerName`, `ticketId` bagi anak *Delivery*, input kuantitatif `nps` skala 0-4 bagi *Project Manager*, serta indikator *Pipeline* (`leadId, prospectValue`) bagi para *Pre-Sales*.

## 2. File Upload Attachment (Multer)
Pada sisi server, telah disediakan mekanisme statis yang memadai untuk menerima *multipart/form-data*:
*   **Migrasi Skema PRISMA**: Ditambahkan sebuah relasi **One-to-Many** pada object tabel [Activity](file:///Users/wisnu/Data/Dev/engineer-logs/daily-report-backend/src/controllers/activityController.ts#132-157), terikat kepada model kustom yang baru saja diciptakan yakni [Attachment](file:///Users/wisnu/Data/Dev/engineer-logs/daily-report-backend/src/controllers/activityController.ts#158-180).
*   **Keamanan Ekstensi**: Endpoint `/:id/attachments` mengeblok unggahan lampiran berpenyakit dengan filtrasi MIME form. Di sisi server, kita membatasinya pada angka konservatif logis, yakni *Maks 20MB per File*.
*   **Local Storage Volumetrik**: File diurai aman dan ditempatkan tanpa bentrokan nama *(randomizer postfix)* pada selasar `/uploads/`, kemudian dirouting dan di-servis sebagai berkas awam lewat Express static middleware (`app.use('/uploads', express.static...)`).

## 3. UI/UX: LogForm Komprehensif
Keterhubungan yang selaras sukses dirajut antara Server Node.js dengan Antarmuka Vite React:
*   **State Normalisasi (GET /activities)**: Halaman aplikasi kini memancing *data* (`api.get`) dari peladen seketika saat Login, dan diatur ulang sedemikian rupa agar [ActCard](file:///Users/wisnu/Data/Dev/engineer-logs/daily-report-dashboard/src/components/shared/ActCard.jsx#6-61) *(komponen UI daftar aktivitas jadul)* dapat membaca respons bersarang model Prisma secara mumpuni tanpa perlu dikelola ulang *HTML-nya*.
*   **Klinik Drag-and-Drop Lampiran**: Logika rumit iterasi form telah digenapi dengan perabotan UI/UX yang modern. *User* dapat menyeret (*drag*) kumpulan berkas spesifik (.PDF, .JPG, .DOCX) langsung ke kolam interaktif putik, dibentengi filtrasi 20MB seketika dari peramban ([LogForm.jsx](file:///Users/wisnu/Data/Dev/engineer-logs/daily-report-dashboard/src/components/LogForm.jsx)).
*   **Dual Hit Multipart Upload**: Mekanika formulir dibuat pintar; merajut pembuatan entitas utama [Activity](file:///Users/wisnu/Data/Dev/engineer-logs/daily-report-backend/src/controllers/activityController.ts#132-157) di tembakan *API POST payload pertama*, disusul tembakan *loops payload Multipart Form* untuk mengunggah satu per satu fisikal lampirannya secara asinkron lalu diarsir sempurna di layar dalam sekejap bersamaan munculnya kotak Toaster hijau (Sukses 🌟).

---

> **Kesimpulan:** Dengan tercapainya seluruh kepingan teka-teki formulir input harian beserta perlindungan pelacak jam sibuk dan kapabilitas penyimpan awan/lokal, Sprint 3 rampung digulirkan. Aplikasi kini solid menopang pencatatan rekam harian manual. Fase berikutnya, **Sprint 4**, akan membawa otomatisasi dari Cloud: Tarikan Otomatis *JIRA Webhook*.

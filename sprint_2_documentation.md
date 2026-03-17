# 📚 Dokumentasi Sprint 2: Authentication & Team Management

Dokumen ini menjelaskan implementasi fitur Otorisasi Keamanan dan Manajemen Pengguna yang telah diselesaikan pada **Sprint 2** untuk penunjang jalannya *Daily Report Dashboard*.

## 1. Arsitektur Security & Otentikasi (JWT + RBAC)
Sistem sekarang sudah terlindungi penuh dengan kontrol akses peran ganda (RBAC) menggunakan Token Web JSON (JWT).
*   **Hash Bcrypt**: Kata sandi untuk login dikomputasi menggunakan bcrypt dengan faktor `10 rounds`, memastikannya mustahil didekripsi secara terbalik.
*   **JSON Web Token (JWT)**: Setiap entitas yang berhasil membuktikan kredensialnya (Email & Kata Sandi) di URI `/api/auth/login` akan diberikan token bertanda-tangan kripto rahasia (`JWT_SECRET`) yang menguraikan `userId, email, role, team` selama maksimal usia **24 Jam**.
*   **RBAC Middleware ([requireRole](file:///Users/wisnu/Data/Dev/engineer-logs/daily-report-backend/src/middlewares/authMiddleware.ts#28-36))**: Beberapa API spesifik seperti `/api/invite` telah dibentengi sehingga hanya *User* dengan hak akses khusus berupa `['admin', 'delivery_manager', 'sales_manager']` yang mumpuni menjangkaunya.

## 2. API Otentikasi & Profil 
| Metode | URI | Fungsionalitas | Tingkat Izin |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/login` | Mencocokkan kredensial awal untuk memperoleh JWT. | Publik |
| `GET` | `/api/auth/profile` | Menjemput seluruh biometrik dan meta-data profil pekerja berdasarkan sandi JWT-nya. | Segala Karyawan |
| `PATCH` | `/api/auth/profile` | Memperbarui nama lengkap serta Avatar URL. | Segala Karyawan |
| `PATCH` | `/api/auth/password`| Mewajibkan pin lama untuk menyusupkan kata sandi baru. | Segala Karyawan |

## 3. Workflow Undangan (Magic Link) via Nodemailer SMTP
Karena peran staf dibatasi oleh struktur internal *(Staff tak dapat mendaftarkan diri mandiri tanpa diundang petinggi)*, sebuah arsitektur Undangan Email (*Email Invitation Workflow*) berhasil dicapai di *Backend*.
1. Admin memicu **`POST /api/invite`** membalut *payload*: Nama calon, Alamat Email Baru, Role jabatan, dan ID Supervisornya.
2. Server membuat sebuah PIN heksadesimal 32-karakter temporer bernama *Magic Link* (`crypto.randomBytes`).
3. Sistem secara ganjil memasukkan pengguna tersebut dengan *State status:* `invited`. Konci masuk temporer tadi disimpan di tabel **Setting**.
4. Modul **Nodemailer** menembak email interaktif ber-UI manis berisi pranala tautan eksklusif http://klien-frontend/activate?token=[MAGIC_LINK]. *(Pada tahap lokal/dev, kita menggunakan Ethereal SMTP sebagai penangkap sandbox).*

## 4. Hooking React UI Frontend + Axios Client 
Pada proyek Vite React UI (`daily-report-dashboard`), beberapa *plumbing* eksternal telah dirampungkan:
*   **Suntikan Axios Interceptor ([lib/api.js](file:///Users/wisnu/Data/Dev/engineer-logs/daily-report-dashboard/src/lib/api.js))**: Pembuatan konfigurasi `axios.create` persisten yang secara mutlak menempelkan `Bearer Token` dari dalam *Local Storage* peramban web pada setiap kueri ke belakang. Bila kueri tertahan `401 Unauthorized`, ia akan melemparkan parameter *Promise.Reject*.
*   **Penyatuan Logika State [App.jsx](file:///Users/wisnu/Data/Dev/engineer-logs/daily-report-dashboard/src/App.jsx)**: Fitur Login sudah terhubung murni dan menggunakan mekanisme penyediaan `localStorage.getItem('user')` saat peramban di-*refresh*.
*   **Peralihan Modul [MembersView](file:///Users/wisnu/Data/Dev/engineer-logs/daily-report-dashboard/src/components/MembersView.jsx#265-337)**: *Mock array mapping* primitif di laman [MembersView](file:///Users/wisnu/Data/Dev/engineer-logs/daily-report-dashboard/src/components/MembersView.jsx#265-337) kini diturunkan; antarmuka HTML berevolusi menghubungkan klik ke `/api/invite` secara hakiki, dan menyiarkannya menggunakan notifikasi pop-up cantik berkat modul `sonner` [(Toaster)](file:///Users/wisnu/Data/Dev/engineer-logs/daily-report-dashboard/src/components/MembersView.jsx#24-25).
*   **Skema Halaman Baru (`/activate`)**: Pemasangan `React-Router-Dom`, di mana calon *User* yang mengklik surel email mereka akan diantarkan kesini dan dipaksa menyematkan kombinasi PIN rahasia ganda *(Password & Confirm Password)* sebelum akhirnya akun ditukar ke status aktif seutuhnya (`status: "active"`).

---

> **Kesimpulan:** Dengan suksesnya *Sprint 2*, maka seluruh rantai kelembagaan (login, manajemen karyawan, keamanan) dan komunikasi eksternal ringan (email registrasi baru) selesai berlabuh. Aplikasi sepenuhnya aman dan kita siap menghadapi implementasi manipulasi data *Activity Log* pada **Sprint 3**.

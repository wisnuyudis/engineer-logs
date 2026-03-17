# Minor Adjustments & UI/UX Enhancements (Pre-Sprint 5)

Dokumen ini mencatat berbagai penyesuaian khusus (perbaikan *mock data* dan peningkatan UI/UX Frontend) yang dilakukan di luar rencana Sprint utama, sebagai respon terhadap kebutuhan operasional dan *feedback* dari pengujian awal.

## 1. Migrasi Data *Mocking* ke *Database Seeding*
Sebelumnya, *Frontend* mengandalkan objek statis JavaScript (`INIT_MEMBERS`, `INIT_ACTS`) untuk memvisualisasikan data anggota tim dan aktivitas, yang menyebabkan inkonsistensi saat *Login* dan tidak mencerminkan data *Database* yang sebenarnya.

**Perubahan yang dilakukan:**
- **Backend ([src/seed.ts](file:///Users/wisnu/Data/Dev/engineer-logs/daily-report-backend/src/seed.ts)):** Menambahkan *script seeding* komprehensif yang secara otomatis membersihkan database dan memasukkan 6 pengguna nyata yang merepresentasikan setiap `role` di dalam sistem secara lengkap beserta *supervisor*-nya, contoh:
  - `admin@seraphim.id` (Admin)
  - `rizky@seraphim.id` (Manager Delivery)
  - `staff@seraphim.id` (Service Engineer)
  - `doni@seraphim.id` (Project Manager)
  - `hendra@seraphim.id` (Manager Pre-Sales)
  - `nina@seraphim.id` (Staff Pre-Sales)
  - Ditambah dengan beberapa contoh Aktivitas lintas departemen dengan tanggal hari ini agar *dashboard chart* langsung terisi.
- **Frontend ([src/App.jsx](file:///Users/wisnu/Data/Dev/engineer-logs/daily-report-dashboard/src/App.jsx)):** Menghapus impor variabel *mock data* JavaScript dan menggunakan `Promise.all` di `useEffect` untuk melakukan pemanggilan `api.get('/users')` bersamaan dengan pengambilan aktivitas secara *real-time* ke server Node.js sejak *Mounting* awal.

## 2. Peningkatan Fitur Log Aktivitas (Backdating)
**Masalah:** Engineer yang lupa melakukan *input log* aktivitas di hari H tidak bisa mengubah tanggal, sehingga pencatatan aktivitasnya akan dikaitkan pada hari ia melakukan *input* yang akan mengacaukan perhitungan ketepatan waktu KPI.
**Solusi:**
- Menambahkan *input field* berjenis [date](file:///Users/wisnu/Data/Dev/engineer-logs/daily-report-backend/src/controllers/userController.ts#59-76) pada [LogForm.jsx](file:///Users/wisnu/Data/Dev/engineer-logs/daily-report-dashboard/src/components/LogForm.jsx) di *Frontend*.
- Tanggal tidak lagi dikunci ke hari tersebut oleh sistem, melainkan memberikan keleluasaan pada engineer untuk mundur (backdate) saat mengisi form log, yang kemudian diteruskan ke Backend.

## 3. Peningkatan Visualisasi *Activity Card*
**Masalah:** Pada area *Activity List*, sangat banyak rekam jejak yang dimuat oleh spesifikasi payload di *Database* namun tidak di-*render* karena ruang *card* terbatas.
**Solusi:**
- Membuat komponen [ActCard.jsx](file:///Users/wisnu/Data/Dev/engineer-logs/daily-report-dashboard/src/components/shared/ActCard.jsx) mampu di-klik untuk membuka *expandable inline container* (laci tambahan).
- Laci otomatis mencerna *payload* yang dimilikinya dan me-*render* komponen *grid responsif* yang berisi kelengkapan data operasional seperti:
  1. Catatan / Progress lengkap.
  2. Nama Klien atau Kontak.
  3. Skor NPS dari pelanggan.
  4. Atribut Jira (*Ticket ID* & Judul aslinya).
  5. Konteks Pre-sales (*Lead ID*, *Prospect Value* dalam Rupiah, & panggung *Stage* saat ini).
  6. Sumber data *(Jira Engine / Input Manual App)*.
  7. Menampilkan *file attachment* berbentuk tombol *(pill link)* untuk diunduh langsung.

## 4. Visualisasi & Privilese Manajemen (*Pagination & Filtering*)
**Masalah:** Admin, *Delivery Manager*, dan *Project Manager* dapat melihat seluruh rekaman log dari engineer bawahannya. Jika volume datanya banyak, ini memicu lekas panas/beratnya antarmuka HTML.
**Solusi ([ActivitiesView.jsx](file:///Users/wisnu/Data/Dev/engineer-logs/daily-report-dashboard/src/components/ActivitiesView.jsx)):**
- **Sistem *Role-Based Access Control* (Analisis UI):** Menghitung anggota tim mana yang merupakan "bawahan" dari *current user*.
- **Filter Engineer:** Menyediakan pilihan *dropdown* yang menderetkan daftar bawahan atau seluruh Insinyur (Bila Admin) untuk memfilter cepat siapa pelakunya.
- **Pagination Cerdas:** Menerapkan pembatasan indeks *array* komponen React menjadi 8 hasil teratas per halaman. Menyediakan sistem kendali numerik interaktif *(Prev - Current Page - Next)* agar antarmuka tidak sesak dengan data ratusan ribu per minggu.

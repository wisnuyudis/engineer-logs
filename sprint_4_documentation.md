# 📊 Dokumentasi Sprint 4: KPI Engine, Dashboard Aggregation & Unit Testing (Swapped)

Atas permintaan pengguna, *Sprint 5 (KPI Engine)* diputar urutannya dan dieksekusikan lebih dulu menjadi **Sprint 4**, sambil memuat implementasi tambahan yakni perancangan **Unit Testing** pada sistem Backend.

## 1. Unit Testing Setup & Coverage (Jest)
Demi memastikan keandalan *core system* dan mencegah regresi pada pembaruan mendatang, *test runner* **Jest** beserta `supertest` telah dipasang pada sisi Backend (Node.js/Express).
*   **Auth Enpoint Tests ([auth.test.ts](file:///Users/wisnu/Data/Dev/engineer-logs/daily-report-backend/src/__tests__/auth.test.ts))**: Kita menguji ketahanan Login form dengan skenario input kosong, kelengkapan email/password yang tidak eksis, peringatan suspensi (403), hinggal pengujian berhasilnya generasi Token JWT (200).
*   **Activity Validation Tests ([activity.test.ts](file:///Users/wisnu/Data/Dev/engineer-logs/daily-report-backend/src/__tests__/activity.test.ts))**: Kita melakukan *mocking* pada Prisma ORM. Melaluinya, dipastikan bahwa logika validasi jam masuk (*overlapping hours* & jam yang di-*input* mundur) beroperasi mutlak mencegah kegagalan data di *production*.

## 2. API Aggregation & Leaderboard Engine
Komputasi intensif dan pengolahan rekapan data sekarang difokuskan pada lapis peladen untuk efisiensi HTTP respons:
*   `/api/dashboard/metrics`: Mengkalkulasi angka kolektif `Total Aktivitas`, `Total Jam Kerja (dalam menit kemudian dirubah menjadi Jam)`, capaian komersial `Pipeline Value`, dan kalkulus nilai rata-rata agregat dari skor `Avg NPS`.
*   `/api/dashboard/leaderboard`: Endpoint ini merekap dan mengurutkan (`sort`) nilai durasi terbesar masing-masing anak departemen secara seketika (*real-time processing*), mencocokkannya ke persentase efisiensi (jumlah *task completion rate*), sebelum akhirnya merangkum 5 kandidat teratas papan peringkat secara absolut.

## 3. Integrasi Endpoint Frontend (Recharts & DashboardView)
Sisi klien (React/Vite) telah direvitalisasi untuk merepresentasikan rekapan asinkron API Agregat yang turun dari Node.js:
*   Meniadakan variabel bayangan internal dan berfokus menggunakan `useEffect()` asinkronus ke server (Axios) untuk me-*render* nilai Overview `Total Activities`, `Total Jam Kerja`, `Pipeline PS`, dan `NPS`.
*   Modul `Recharts` yang sebelumnya merender *mock-data* kini sepenuhnya terhubung dengan model UI dari backend API sehingga performa browser tetap minimal, ringan, dengan tampilan Bar Chart modern bertemakan aksen palet harmonis (Teal, Indigo, dan Violet).

> **Status Saat Ini:** Seluruh *checklist* **Sprint 4** telah dikerjakan dan sistem agregasi siap digunakan oleh petinggi manajerial perusahaan melalui komponen Overview dan Leaderboard dari UI yang segar. Tahap ini meletakkan fondasi stabilitas aplikasi yang matang menjelang integrasi otomatis ke Atlassian (Jira).

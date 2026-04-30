# KPI Understanding

Dokumen ini merangkum pemahaman kerja saat ini atas:

- `PD-001.POS.SDT.I.2026.pdf` untuk `Service Engineer`
- `PD-002.POS.SDT.I.2026.pdf` untuk `Project Manager`

Dokumen ini sengaja ditulis sebagai catatan implementasi, bukan sebagai tafsir final kebijakan.

## Prinsip Umum

1. KPI menilai kepatuhan layanan dan tata kelola, bukan semata-mata jam kerja.
2. Skala nilai domain menggunakan:
   - `4` = sangat baik
   - `3` = baik
   - `2` = cukup
   - `1` = kurang
   - `0` = tidak memenuhi
   - `-1` = pelanggaran kritikal / layanan wajib tidak dijalankan tanpa justifikasi sah
3. Domain yang tidak berlaku (`N/A`) tidak masuk pembagi skor akhir.
4. Bila ada `-1` pada domain yang applicable, ada implikasi bonus/eligibility sesuai dokumen.

Catatan koreksi implementasi:

- komponen `Kelengkapan Dokumentasi` untuk domain `Implementation` mengikuti skala umum `4..-1`

## Service Engineer (PD-001)

### Domain KPI

1. `Implementation`
2. `Preventive Maintenance`
3. `Corrective Maintenance`
4. `Enhancement`
5. `Operational Service / MSS`

### 1) KPI Implementation

Komponen:

1. `Ketepatan Penyelesaian Task`
2. `Kelengkapan Dokumentasi Proyek`
3. `NPS`

Rumus:

```text
KPI Implementation = (Task Accuracy + Dokumentasi + NPS) / 3
```

Catatan:

- NPS default `3` bila customer tidak mengembalikan form.
- Dokumen implementasi yang disebut di PDF meliputi:
  - Method of Procedure
  - Requirement Checklist
  - Training Module
  - Installation & Configuration Guide
  - Administrator Guide

Status pemahaman implementasi saat ini:

Implementasi operasional terbaru:

#### 1.a Ketepatan Penyelesaian Task

- basis hitung: persentase `subtask` yang di-assign dan selesai tepat waktu
- `tepat waktu` = `Actual End` sebelum / pada `due date`
- `Done` tidak lagi dipakai sebagai acuan komponen ini

Skor:

- `>= 90%` task selesai tepat waktu -> `4`
- `75% - <90%` task selesai tepat waktu -> `3`
- `50% - <75%` task selesai tepat waktu -> `2`
- `25% - <50%` task selesai tepat waktu -> `1`
- `<25%` task selesai tepat waktu atau task gagal -> `0`

#### 1.b Kelengkapan Dokumentasi

Evidence wajib dicek di level `subtask`, bukan task:

- `Method Of Produce`
- `System Requirement Document`
- `Training Module`
- `Installation & Configuration Guide`
- `Administrator Guide`

Catatan penting:

- subtask dokumen bisa tersebar di task yang berbeda karena ada fase `pre deploy` dan `post deploy`
- implementasi harus mengecek `subtask`, bukan issue/task induk tunggal

Aturan scoring terbaru:

- seluruh dokumen lengkap dan tepat waktu -> `4`
- ada maksimal `1` dokumen terlambat dari `due date` -> `3`
- dokumen ada sebagian / lebih dari `1` terlambat / ada yang missing tetapi tidak nol total -> `3`
- bila naming dokumen standar belum ditemukan sama sekali, komponen dokumentasi dianggap `N/A` dan tidak masuk pembagi
- tidak ada dokumen sama sekali hanya dianggap `-1` bila memang naming standar sudah applicable dan seharusnya ada

Catatan:

- untuk implementasi saat ini, komponen dokumentasi praktis memakai bucket `4`, `3`, `-1`, atau `N/A` sesuai applicability naming

#### 1.c NPS

- `manual input`
- default `3`

### 2) KPI Preventive Maintenance

Komponen:

1. `Kepatuhan Pelaksanaan PM`
2. `Kepatuhan Pengiriman Laporan PM`

Rumus:

```text
KPI Preventive Maintenance = (Pelaksanaan PM + Laporan PM) / 2
```

Bila ada beberapa PM dalam satu periode:

```text
Domain PM = rata-rata seluruh KPI PM yang applicable
```

Implementasi operasional terbaru:

- Jira tidak memiliki `rentang tanggal`, hanya `due date`
- `Pekerjaan PM` direpresentasikan sebagai subtask dengan prefix `Pekerjaan PM`
- `Report PM` direpresentasikan sebagai subtask dengan prefix `Report PM`

#### 2.a Skor Kepatuhan Pelaksanaan Preventive Maintenance

Untuk `Pekerjaan PM`:

- gunakan `due date` sebagai acuan keterlambatan
- gunakan timestamp perubahan status `Done` sebagai tanggal aktual pelaksanaan

Skor:

- `4` -> PM dilaksanakan dalam rentang tanggal yang ditetapkan
- `3` -> PM dilaksanakan `<= 1 minggu` setelah akhir rentang tanggal
- `2` -> PM dilaksanakan `>1 - 2 minggu` setelah akhir rentang tanggal
- `1` -> PM dilaksanakan `>2 - 4 minggu` setelah akhir rentang tanggal
- `0` -> PM dilaksanakan `>4 minggu` setelah akhir rentang tanggal
- `-1` -> Preventive Maintenance tidak dilakukan tanpa justifikasi yang sah

Catatan implementasi saat ini:

- karena Jira hanya punya `due date`, implementasi sementara perlu memperlakukan `due date` sebagai batas akhir rentang tanggal

#### 2.b Skor Kepatuhan Pengiriman Laporan Preventive Maintenance

Untuk `Report PM`:

- ambil timestamp status `Done` subtask `Pekerjaan PM` pada parent yang sama
- bandingkan terhadap timestamp status `Done` subtask `Report PM`

Skor:

- `4` -> laporan PM dikirim `<= 3 hari kerja` setelah tanggal aktual pelaksanaan PM
- `3` -> laporan PM dikirim `>3 - 5 hari kerja` setelah tanggal pelaksanaan PM
- `2` -> laporan PM dikirim `>5 - 10 hari kerja` setelah tanggal pelaksanaan PM
- `1` -> laporan PM dikirim `>10 - 15 hari kerja` setelah tanggal pelaksanaan PM
- `0` -> laporan PM dikirim `>15 hari kerja` setelah tanggal pelaksanaan PM
- `-1` -> laporan PM tidak dibuat dan/atau tidak dikirim

Yang masih perlu dipastikan:

- definisi final `hari kerja` untuk implementasi sistem

### 3) KPI Corrective Maintenance

Komponen:

1. `Response Time`
2. `Resolution Time`

Rumus:

```text
KPI Corrective Maintenance = (Response Score + Resolution Score) / 2
```

Severity:

- menggunakan field Jira `priority`

SLA severity yang tertulis di PDF:

- Tingkat 1: response 15 menit, resolution 8 jam
- Tingkat 2: response 15 menit, resolution 16 jam
- Tingkat 3: response 15 menit, resolution 2 hari kerja
- Tingkat 4: response 15 menit, resolution 2 hari kerja

Definisi operasional terbaru:

- `first response` = timestamp `comment pertama`
- `resolution` = selisih `Actual Start` ke `Actual End`
- `response` tetap memakai pendekatan existing (`createdAt` ke first response/comment pertama)
- bila `priority` berubah, ambil hasil / nilai terakhir

Response Time SLA:

- semua severity: `15 menit`

Tabel SLA:

- `Tingkat 1 / Kritis-Tinggi`
  - workaround: `4 jam setelah respon awal`
  - resolution: `8 jam setelah respon awal`
- `Tingkat 2 / Medium`
  - workaround: `8 jam setelah respon awal`
  - resolution: `16 jam setelah respon awal`
- `Tingkat 3 / Rendah`
  - workaround: `1 hari kerja`
  - resolution: `2 hari kerja`
- `Tingkat 4 / Pertanyaan`
  - workaround: `1 hari kerja`
  - resolution: `2 hari kerja`

Skor untuk `Response Time` dan `Resolution Time`:

- `4` -> waktu aktual `<= SLA`
- `3` -> waktu aktual `> SLA` sampai `2x SLA`
- `2` -> waktu aktual `> 2x SLA` sampai `3x SLA`
- `1` -> waktu aktual `> 3x SLA`
- `0` -> permintaan direspon tanpa tindak lanjut teknis atau komunikasi lanjutan yang terdokumentasi
- `-1` -> tidak ada respon dan penanganan sama sekali

Catatan implementasi:

- severity akhir diambil dari nilai `priority` terakhir

### 4) KPI Enhancement

Implementasi operasional terbaru:

- sumber domain: ticketing system `(SUP)`
- request / work type: `Request Changes and Enhancement`
- komponen yang dinilai hanya `Response Time`
- `first response` = comment pertama
- SLA response time = `1 hari`

Skor:

- `4` -> waktu aktual `<= SLA`
- `3` -> waktu aktual `> SLA` sampai `2x SLA`
- `2` -> waktu aktual `> 2x SLA` sampai `3x SLA`
- `1` -> waktu aktual `> 3x SLA`
- `0` -> permintaan direspon tanpa tindak lanjut teknis atau komunikasi lanjutan yang terdokumentasi
- `-1` -> tidak ada respon dan penanganan sama sekali

### 5) KPI Operational Service / MSS

Koreksi implementasi:

- domain ini hanya fokus pada project / item dengan prefix `[OP]`

Komponen:

1. `Skor Laporan Bulanan`
2. `Skor Laporan Triwulanan`
3. `Skor NPS`

Rumus:

```text
KPI Operational Service / MSS = (Skor Laporan Bulanan + Skor Laporan Triwulanan + Skor NPS) / 3
```

Catatan:

- `NPS` tetap manual dengan default `3` bila customer tidak mengembalikan form
- bucket `(SUP)` + `[System] Change` dan `(SUP)` + `[System] Service request` tidak lagi dianggap representasi utama domain ini
- representasi otomatis harus mengacu ke prefix `[OP]`

### Skor Akhir KPI Service Engineer

Rumus umum:

```text
Skor Akhir KPI SE = jumlah skor domain aktif / jumlah domain aktif
```

Domain aktif berarti:

- applicable dalam periode penilaian
- bukan `N/A`

## Project Manager (PD-002)

### Domain KPI

1. `Implementation`
2. `Preventive Maintenance`
3. `Operational Service`

### 1) KPI Implementation

Komponen:

1. `Ketepatan Timeline Proyek`
2. `Ketepatan Penggunaan Effort dan Mandays`
3. `Administrasi / Tata Kelola Proyek`
4. `NPS`

Rumus:

```text
KPI PM Implementation = (Timeline + Mandays + Administrasi + NPS) / 4
```

Mapping yang dipahami:

- `NPS`: input manual, default `3`
- `Mandays`: saat ini belum ada source data Jira yang jelas
- `Administrasi`: sebagian dapat diwakili oleh subtask dokumen, tetapi representasi penuh dokumen wajib belum final

### 2) KPI Preventive Maintenance

Komponen utama:

1. `Ketepatan Penyerahan BAST PM`

Rumus domain:

```text
Domain PM PM = rata-rata seluruh skor PM yang applicable
```

Mapping yang sudah jelas:

- `BAST date`: subtask dengan judul awalan `BAST`, status `Done`
- `bast actual date`: tanggal `Done` subtask `BAST`

Yang masih perlu source data:

- deadline `H+70 / H+160` atau tanggal due yang ekuivalen di Jira

### 3) KPI Operational Service

Komponen:

1. `Governance Issue`
2. `Pengiriman NPS`

Rumus:

```text
KPI Operational Service PM = jumlah skor komponen applicable / jumlah komponen applicable
```

Prinsip penting:

- bila NPS belum jatuh tempo, hanya governance yang dihitung
- komponen yang belum applicable tidak masuk pembagi

Mapping yang dipahami:

- governance issue bulanan dicatat di Jira
- NPS dikirim di akhir service quarter
- NPS dapat tetap diinput manual di aplikasi

### Skor Akhir KPI Project Manager

Rumus umum:

```text
Skor Akhir KPI PM = jumlah skor domain aktif / jumlah domain aktif
```

## Mapping Jira Saat Ini

### Klasifikasi domain dari project/work type

- `[IMP]` -> `Implementation`
- `[MA]` -> `Preventive Maintenance`
- `(SUP)` + `[System] Problem` -> `Corrective Maintenance`
- `[OP]` -> `Operational Service / MSS`
- `(SUP)` + `Request Changes and Enhancement` -> `Enhancement`

### Field / evidence yang sudah diketahui

- `severity` -> field `priority`
- `report sent date` -> subtask `Report PM...` status `Done`
- `BAST date` -> subtask `BAST...` status `Done`
- `first response CM` -> comment pertama
- `first response Enhancement` -> comment pertama
- `NPS` -> manual input, default `3`
- `Pekerjaan PM actual date` -> status `Done` pada subtask prefix `Pekerjaan PM`
- `Report PM actual date` -> status `Done` pada subtask prefix `Report PM`

### Field / evidence yang belum kuat

- planned start / planned end PM yang eksplisit sebagai rentang
- implementasi `hari kerja` untuk PM / SLA tertentu
- coverage rule dokumentasi Implementation kini dipahami sebagai bucket `lengkap=4`, `selain itu tetapi masih ada evidence=3`, `tidak ada=-1`
- mandays plan / actual

## Kesimpulan Implementasi

Secara teori KPI bisa dihitung otomatis dari Jira, tetapi implementasi penuh akan rapuh bila:

1. representasi dokumen tidak konsisten
2. planned vs actual dates tidak selalu tersedia
3. mandays memang tidak ada
4. pemisahan domain Enhancement vs Operational belum strict

Karena itu, pendekatan otomatis penuh saat ini berisiko menghasilkan skor yang terlihat presisi tetapi sebenarnya lemah secara aturan.

## Aturan Agregasi Domain

- bila dalam satu quarter ada banyak item dalam domain yang sama, `skor domain = rata-rata semua item`
- domain dianggap `N/A` bila tidak ada ticket / item sama sekali pada quarter tersebut

## Kesimpulan Produk Saat Ini

Pendekatan yang lebih pragmatis untuk fase sekarang:

1. domain yang evidence-nya sudah kuat dapat diotomatisasi bertahap
2. domain yang belum stabil atau memang diarahkan manual tetap disimpan sebagai nilai manual
3. sistem hanya:
   - menyimpan evidence/domain/value
   - menghitung rata-rata domain aktif
   - menandai eligibility / status akhir

Dengan begitu:

- aturan organisasi tetap dihormati
- sistem tidak memaksakan inferensi pada area yang belum cukup stabil
- struktur data tetap siap bila nanti sebagian domain ingin diotomatisasi

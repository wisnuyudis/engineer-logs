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

- `Task Accuracy`: secara teoritis bisa diturunkan dari Jira bila ada task scope + milestone/due date yang jelas.
- `Dokumentasi`: belum jelas representasi aktualnya di workflow Jira saat ini.
- `NPS`: tidak ada di Jira, saat ini lebih realistis diinput manual dengan default `3`.

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

Mapping yang sudah teridentifikasi:

- `Report PM`: subtask dengan judul awalan `Report PM`, status `Done`
- `Report sent date`: tanggal `Done` subtask `Report PM`

Yang masih perlu dipastikan:

- sumber `planned window / date range PM`
- sumber `actual execution date`

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

Definisi operasional yang sudah dikonfirmasi:

- `first response` = ada `comment pertama` dan perubahan status dari `Confirm Priority` ke `Waiting for customer`

Catatan implementasi:

- Perlu keputusan final timestamp mana yang dipakai:
  - waktu comment pertama
  - waktu transition ke `Waiting for customer`
  - atau timestamp terlengkap yang dianggap memenuhi definisi response

### 4) KPI Enhancement

Dokumen menyebut Enhancement sebagai domain terpisah.

Namun pada praktik Jira saat ini belum terlihat representasi yang benar-benar terpisah dan strict.

Kondisi lapangan saat ini:

- `(SUP)` + `[System] Change`
- `(SUP)` + `[System] Service request`

lebih dekat ke domain non-problem operational/change request.

Kesimpulan sementara:

- domain Enhancement ada di dokumen
- tetapi representasi aktualnya di Jira belum cukup jelas untuk dihitung otomatis dengan aman

### 5) KPI Operational Service / MSS

Dokumen menyebut domain ini berlaku untuk SE.

Namun pada implementasi Jira saat ini, klasifikasi yang paling dekat adalah:

- `(SUP)` + `[System] Change`
- `(SUP)` + `[System] Service request`

Kesimpulan sementara:

- untuk kebutuhan sistem saat ini, domain non-problem `(SUP)` paling aman diklasifikasikan ke bucket operasional/change-service-request
- pemisahan tegas antara `Enhancement` vs `Operational Service` masih perlu aturan organisasi yang lebih eksplisit

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
- `(SUP)` + `[System] Change` -> `Operational / Change bucket`
- `(SUP)` + `[System] Service request` -> `Operational / Service Request bucket`

### Field / evidence yang sudah diketahui

- `severity` -> field `priority`
- `report sent date` -> subtask `Report PM...` status `Done`
- `BAST date` -> subtask `BAST...` status `Done`
- `first response CM` -> comment pertama + transisi `Confirm Priority` -> `Waiting for customer`
- `NPS` -> manual input, default `3`

### Field / evidence yang belum kuat

- planned start / planned end PM
- actual execution date PM
- dokumen wajib implementasi
- mandays plan / actual
- pemisahan final Enhancement vs Operational untuk SE

## Kesimpulan Implementasi

Secara teori KPI bisa dihitung otomatis dari Jira, tetapi implementasi penuh akan rapuh bila:

1. representasi dokumen tidak konsisten
2. planned vs actual dates tidak selalu tersedia
3. mandays memang tidak ada
4. pemisahan domain Enhancement vs Operational belum strict

Karena itu, pendekatan otomatis penuh saat ini berisiko menghasilkan skor yang terlihat presisi tetapi sebenarnya lemah secara aturan.

## Kesimpulan Produk Saat Ini

Pendekatan yang lebih pragmatis untuk fase sekarang:

1. aplikasi hanya menyimpan `nilai domain KPI manual`
2. admin / head mengisi skor domain hasil evaluasi manual
3. sistem hanya:
   - menyimpan evidence/domain/value
   - menghitung rata-rata domain aktif
   - menandai eligibility / status akhir

Dengan begitu:

- aturan organisasi tetap dihormati
- sistem tidak memaksakan inferensi dari Jira yang belum cukup stabil
- struktur data tetap siap bila nanti sebagian domain ingin diotomatisasi

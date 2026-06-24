# RBAC Module Plan

Dokumen ini adalah rencana bertahap untuk mengganti akses berbasis hardcoded role menjadi RBAC dinamis. Implementasi dilakukan nanti setelah prioritas Job Report selesai.

## Tujuan

- Mengurangi hardcoded akses seperti `role === 'admin'`, `isMgr`, `canManageKpi`, dan variasi check role lain.
- Membuat akses menu, halaman, API, dan aksi bisa diatur dari konfigurasi.
- Mendukung akses berbasis group/role dan override khusus per user.
- Tetap kompatibel dengan role existing saat migrasi.

## Masalah Saat Ini

Akses saat ini tersebar di frontend dan backend:

- Frontend memakai helper seperti `isAdmin`, `isMgr`, `canManageKpi`, `canManageKpiNps`, dan `canViewKpiNps`.
- Sidebar menentukan menu dari role hardcoded.
- Beberapa halaman melakukan guard manual seperti `currentUser.role !== 'admin'`.
- Backend route/controller melakukan check role langsung, misalnya admin-only settings, audit, KPI, customer, dan report.

Pola ini akan sulit dikelola ketika role, tim, atau variasi akses bertambah.

## Konsep RBAC

RBAC memakai permission atomik. User mendapat permission dari role group, lalu dapat override khusus per user.

Effective permission:

```text
role group permissions
+ user allow overrides
- user deny overrides
= effective permissions
```

## Permission Awal

Daftar awal permission yang disarankan:

```text
dashboard.view
activity.view
activity.create
activity.manage_own
activity.manage_team
activity.manage_all

member.view
member.manage

report.activity.view
report.kpi.view
report.nps.view
report.executive.view
report.job.view

kpi.view_own
kpi.view_team
kpi.manage

nps.view
nps.input
nps.manage

settings.activity.manage
settings.customer.manage
settings.smtp.manage
settings.maintenance.manage

audit.view
docs.view
profile.manage_own
```

Nama permission dibuat stabil dan spesifik. Jangan memakai label UI sebagai permission key.

## Role Group Default

Mapping awal sebaiknya meniru akses existing agar migrasi aman.

### Admin

```text
*
```

Admin boleh mendapat wildcard internal, atau semua permission eksplisit.

### Head Delivery / Manager Delivery

```text
dashboard.view
activity.view
activity.manage_team
member.view
report.activity.view
report.kpi.view
report.nps.view
report.executive.view
report.job.view
kpi.view_team
kpi.manage
nps.view
nps.manage
docs.view
profile.manage_own
```

### Head Presales / Manager Presales

```text
dashboard.view
activity.view
activity.manage_team
member.view
report.activity.view
report.kpi.view
report.executive.view
report.job.view
docs.view
profile.manage_own
```

### Project Manager

```text
dashboard.view
activity.view
activity.create
activity.manage_own
report.activity.view
report.nps.view
kpi.view_own
nps.view
nps.input
docs.view
profile.manage_own
```

### Delivery Engineer / SE

```text
dashboard.view
activity.view
activity.create
activity.manage_own
report.activity.view
kpi.view_own
nps.view
docs.view
profile.manage_own
```

### Presales

```text
dashboard.view
activity.view
activity.create
activity.manage_own
report.activity.view
docs.view
profile.manage_own
```

## Data Model Opsi Praktis

Karena database memakai MongoDB via Prisma, opsi simpel lebih cocok untuk tahap awal.

```prisma
model RoleGroup {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  key         String   @unique
  label       String
  description String?
  permissions String[]
  isSystem    Boolean  @default(false)
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

Tambahan di `User`:

```prisma
roleGroupIds    String[] @db.ObjectId
permissionAllow String[]
permissionDeny  String[]
```

Catatan: jika Prisma tidak cocok dengan `String[] @db.ObjectId`, gunakan `String[]` biasa untuk `roleGroupIds` dan resolve manual.

## Backend Design

Tambahkan service:

```text
src/services/rbacService.ts
```

Fungsi utama:

```ts
getEffectivePermissions(userId: string): Promise<string[]>
hasPermission(userId: string, permission: string): Promise<boolean>
```

Tambahkan middleware:

```text
src/middlewares/rbacMiddleware.ts
```

Contoh:

```ts
requirePermission('report.job.view')
```

Pemakaian:

```ts
router.get('/jobs', authenticateToken, requirePermission('report.job.view'), getJobReport);
```

## Frontend Design

Frontend sebaiknya menerima effective permissions dari backend.

Endpoint:

```http
GET /api/rbac/me
```

Response:

```json
{
  "permissions": [
    "dashboard.view",
    "report.job.view",
    "profile.manage_own"
  ],
  "roleGroups": [
    { "key": "head_delivery", "label": "Head Delivery" }
  ]
}
```

Frontend helper:

```js
can('report.job.view')
canAny(['report.kpi.view', 'report.nps.view'])
canAll(['member.view', 'member.manage'])
```

Sidebar nantinya memakai permission, bukan role:

```js
can('report.job.view') && { id: '/reports/jobs', label: 'Job Report' }
```

## Admin UI

Tahap awal UI RBAC bisa dibuat di Settings.

Menu:

```text
Setting -> Access Control
```

Fitur:

- List role group.
- Create/edit role group.
- Checklist permission per group.
- Assign user ke role group.
- User override allow/deny.
- Preview effective permissions untuk user tertentu.

## Audit

Semua perubahan RBAC harus masuk audit trail.

Action:

```text
rbac.role_group.create
rbac.role_group.update
rbac.role_group.toggle
rbac.user_group.update
rbac.user_permission_override.update
```

Entity:

```text
role_group
user_permission
```

## Migration Plan

### Phase 1 - Foundation

- Tambah schema `RoleGroup`.
- Tambah field RBAC di `User`.
- Tambah seed default role group berdasarkan role existing.
- Tambah service `getEffectivePermissions`.
- Tambah endpoint `GET /api/rbac/me`.

### Phase 2 - Frontend Menu

- Tambah context/hook `usePermissions`.
- Sidebar mulai pakai permission untuk menu.
- Tetap fallback ke role lama jika permission belum tersedia.

### Phase 3 - Backend Guard

- Tambah middleware `requirePermission`.
- Migrasi route satu per satu:
  - Job Report
  - Executive Report
  - Master Customer
  - SMTP
  - Audit Trail
  - KPI/NPS

### Phase 4 - Admin UI

- Buat halaman Access Control.
- Manage role group dan permission.
- Assign group ke user.
- User allow/deny overrides.

### Phase 5 - Cleanup

- Kurangi penggunaan `isAdmin`, `isMgr`, `canManageKpi`, dan check role langsung.
- Role lama tetap bisa dipakai sebagai metadata/display, bukan sumber utama akses.

## Prinsip Implementasi

- Permission key harus stabil.
- Jangan memakai label menu sebagai permission key.
- Backend tetap menjadi sumber kebenaran akses.
- Frontend permission hanya untuk UX/menu visibility, bukan security.
- Admin pertama harus selalu punya akses penuh agar tidak lockout.
- Sediakan fallback saat RBAC belum terseed.

## Fokus Saat Ini

Untuk sekarang, RBAC hanya didokumentasikan. Implementasi ditunda. Prioritas aktif tetap:

```text
Job Report
```

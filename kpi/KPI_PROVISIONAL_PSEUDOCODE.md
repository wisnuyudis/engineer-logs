# KPI Provisional Pseudocode

Dokumen ini adalah pseudocode sementara untuk memodelkan KPI.

Tujuannya bukan untuk langsung diimplementasikan 1:1, tetapi sebagai catatan kerja agar arah pemodelan tetap konsisten di iterasi berikutnya.

## A. Model Konseptual

```text
Period
  - year
  - quarter

User
  - id
  - role
  - team

KpiDomainScore
  - userId
  - period
  - roleProfile: SE | PM | Presales?
  - domainKey
  - domainLabel
  - score (decimal, min -1, max 4)
  - source: manual | inferred | hybrid
  - notes
  - enteredBy
  - enteredAt

KpiSummary
  - userId
  - period
  - finalScore
  - eligibleQB
  - hasViolation
  - activeDomainCount
```

## B. Aturan Umum

```text
FUNCTION isApplicable(domainScore):
  RETURN domainScore exists AND domainScore.score is not null

FUNCTION hasViolation(domainScores):
  RETURN any score == -1

FUNCTION activeScores(domainScores):
  RETURN all domainScores where score is not null

FUNCTION finalAverage(domainScores):
  LET active = activeScores(domainScores)
  IF active is empty:
    RETURN null
  IF any active.score == -1:
    RETURN -1
  RETURN average(active.score)

FUNCTION eligibleQuarterlyBonus(finalScore):
  IF finalScore is null:
    RETURN false
  IF finalScore == -1:
    RETURN false
  RETURN finalScore >= 3.0
```

## C. Domain Set per Role

```text
FUNCTION domainCatalog(roleProfile):
  IF roleProfile == "SE":
    RETURN [
      "impl",
      "pm",
      "cm",
      "enh",
      "ops"
    ]

  IF roleProfile == "PM":
    RETURN [
      "impl",
      "pm",
      "ops"
    ]

  RETURN []
```

## D. Pendekatan Manual yang Disarankan

Pendekatan ini mengasumsikan admin/head yang menghitung domain score secara manual, lalu sistem hanya menghitung skor akhir.

```text
INPUT FORM:
  selectedUser
  selectedPeriod
  roleProfile
  domainScores[]

FOR EACH domain in domainCatalog(roleProfile):
  admin may input:
    - score decimal between -1 and 4
    - optional notes
  OR leave empty to mark N/A
```

Validasi:

```text
FUNCTION validateDomainScore(score):
  IF score is null:
    RETURN ok
  IF score < -1:
    RETURN error
  IF score > 4:
    RETURN error
  RETURN ok
```

Penyimpanan:

```text
FUNCTION saveManualKpi(userId, period, roleProfile, domainInputs, actorId):
  FOR EACH input in domainInputs:
    validateDomainScore(input.score)
    UPSERT KpiDomainScore by (userId, period, domainKey):
      score = input.score
      notes = input.notes
      source = "manual"
      enteredBy = actorId
      enteredAt = now
```

Perhitungan summary:

```text
FUNCTION calculateManualKpiSummary(userId, period, roleProfile):
  LET domains = load domain scores by userId + period
  LET finalScore = finalAverage(domains)
  LET violation = hasViolation(domains)
  LET eligibleQB = eligibleQuarterlyBonus(finalScore)

  UPSERT KpiSummary:
    finalScore = finalScore
    hasViolation = violation
    eligibleQB = eligibleQB
    activeDomainCount = count(activeScores(domains))

  RETURN KpiSummary
```

## E. Label Manual Input yang Disarankan

### Service Engineer

```text
impl = "KPI Implementasi (Task + Dok + NPS) / 3"
pm   = "KPI Prev. Maint. (Pelaksanaan + Laporan) / 2 atau avg aktivitas"
cm   = "KPI Corr. Maint. (Problem only) (Response + Resolution) / 2"
enh  = "KPI Enhancement"
ops  = "KPI Operational"
```

### Project Manager

```text
impl = "KPI Implementasi PM (Timeline + Mandays + Administrasi + NPS) / 4"
pm   = "KPI Prev. Maint. PM (BAST)"
ops  = "KPI Operational PM (Governance + NPS applicable) / n"
```

## F. Hybrid Future Strategy

Kalau nanti sebagian domain ingin diotomatisasi dari Jira:

```text
FUNCTION resolveDomainScore(userId, period, roleProfile, domainKey):
  IF manual score exists:
    RETURN manual score

  IF automation for domainKey is trusted:
    RETURN inferred score from Jira evidence

  RETURN null
```

Atau:

```text
FUNCTION resolveDomainScoreHybrid(userId, period, domainKey):
  LET inferred = inferFromJira(userId, period, domainKey)
  LET manualOverride = loadManualOverride(userId, period, domainKey)

  IF manualOverride exists:
    RETURN manualOverride

  RETURN inferred
```

## G. Mengapa Manual Lebih Aman Saat Ini

```text
IF rules in policy are clear BUT
   Jira fields are inconsistent OR
   evidence is incomplete OR
   workflow is not strict
THEN
   manual domain scoring is safer than false automation
```

Alasannya:

1. menghindari skor palsu yang terlihat objektif tetapi sumber datanya lemah
2. tetap mengikuti struktur domain dari kebijakan resmi
3. mudah dioperasikan oleh admin/head
4. siap diotomatisasi sebagian di fase berikutnya

export type KpiDomainDef = {
  key: string;
  label: string;
  formula: string;
};

export type KpiProfileDef = {
  key: string;
  label: string;
  roleLabels: string[];
  domains: KpiDomainDef[];
};

export const KPI_PROFILES: Record<string, KpiProfileDef> = {
  engineer_delivery: {
    key: 'engineer_delivery',
    label: 'Engineer Delivery',
    roleLabels: ['delivery', 'SE', 'mgr_dl', 'Head Delivery'],
    domains: [
      { key: 'impl', label: 'KPI Implementasi', formula: '(Task + Dok + NPS) / 3' },
      { key: 'pm', label: 'KPI Prev. Maint.', formula: '(Pelaks + Lap) / avg' },
      { key: 'cm', label: 'KPI Corr. Maint.', formula: '(Resp + Resol) / 2' },
      { key: 'enh', label: 'KPI Enhancement', formula: 'Resp = Updated - Created' },
      { key: 'ops', label: 'KPI Operational', formula: '(Monthly + Qtrly + NPS) / n' },
    ],
  },
  project_manager: {
    key: 'project_manager',
    label: 'Project Manager',
    roleLabels: ['PM', 'pm'],
    domains: [
      { key: 'impl', label: 'KPI Implementasi', formula: '(Timeline + Admin + NPS) / n' },
      { key: 'pm', label: 'KPI Prev. Maint.', formula: 'BAST / avg' },
      { key: 'ops', label: 'KPI Operational', formula: '(Governance + NPS) / n' },
    ],
  },
};

export const resolveKpiProfile = (role?: string | null) => {
  const current = String(role || '');
  return Object.values(KPI_PROFILES).find((profile) => profile.roleLabels.includes(current)) || null;
};

export const buildQuarterLabel = (year: number, quarter: string) => `${quarter} ${year}`;

export const normalizeQuarter = (raw?: string | null) => {
  const quarter = String(raw || '').toUpperCase();
  return ['Q1', 'Q2', 'Q3', 'Q4'].includes(quarter) ? quarter : 'Q1';
};

export const normalizeYear = (raw?: string | number | null) => {
  const n = Number(raw);
  const year = Number.isFinite(n) ? Math.trunc(n) : new Date().getFullYear();
  return year >= 2020 && year <= 2100 ? year : new Date().getFullYear();
};

export const canManageKpi = (role?: string | null) => ['admin', 'mgr_dl'].includes(String(role || ''));

export const canManageUserKpi = (
  actor: { role?: string | null; team?: string | null },
  subject: { team?: string | null }
) => {
  const role = String(actor.role || '');
  if (role === 'admin') return true;
  if (role === 'mgr_dl') return subject.team === 'delivery';
  if (role === 'mgr_ps') return subject.team === 'presales';
  return false;
};

export const qbMultiplierFromCompletedTasks = (count: number) => {
  if (count >= 5) return 0.5;
  if (count >= 3) return 0.3;
  if (count >= 1) return 0.2;
  return 0;
};

export const computeKpiSummary = (
  profile: KpiProfileDef,
  rawScores: Record<string, unknown>,
  options: { completedJiraTaskCount?: number } = {}
) => {
  const scores: Record<string, number | null> = {};
  let total = 0;
  let count = 0;
  let hasViolation = false;
  const completedJiraTaskCount = Math.max(0, Number(options.completedJiraTaskCount || 0));
  const qbMultiplier = qbMultiplierFromCompletedTasks(completedJiraTaskCount);

  for (const domain of profile.domains) {
    const value = rawScores?.[domain.key];
    if (value === null || value === undefined || value === '') {
      scores[domain.key] = null;
      continue;
    }

    const num = Number(value);
    if (!Number.isFinite(num) || num < -1 || num > 4) {
      throw new Error(`Nilai domain '${domain.label}' harus berada di antara -1 sampai 4.`);
    }

    scores[domain.key] = Number(num.toFixed(2));
    if (num === -1) {
      hasViolation = true;
    } else {
      total += num;
      count += 1;
    }
  }

  const finalScore = hasViolation
    ? -1
    : count > 0
      ? Number((total / count).toFixed(2))
      : profile.key === 'project_manager'
        ? 3
        : null;

  return {
    scores,
    finalScore,
    activeDomainCount: count,
    hasViolation,
    completedJiraTaskCount,
    qbMultiplier,
    eligibleBonus: finalScore !== null && finalScore !== -1 && finalScore >= 3 && qbMultiplier > 0,
  };
};

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeKpiSummary = exports.computeResolvedKpiSummary = exports.qbMultiplierFromCompletedTasks = exports.canManageUserKpi = exports.canManageKpi = exports.normalizeYear = exports.normalizeQuarter = exports.buildQuarterLabel = exports.resolveKpiProfile = exports.KPI_PROFILES = void 0;
exports.KPI_PROFILES = {
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
const resolveKpiProfile = (role) => {
    const current = String(role || '');
    return Object.values(exports.KPI_PROFILES).find((profile) => profile.roleLabels.includes(current)) || null;
};
exports.resolveKpiProfile = resolveKpiProfile;
const buildQuarterLabel = (year, quarter) => `${quarter} ${year}`;
exports.buildQuarterLabel = buildQuarterLabel;
const normalizeQuarter = (raw) => {
    const quarter = String(raw || '').toUpperCase();
    return ['Q1', 'Q2', 'Q3', 'Q4'].includes(quarter) ? quarter : 'Q1';
};
exports.normalizeQuarter = normalizeQuarter;
const normalizeYear = (raw) => {
    const n = Number(raw);
    const year = Number.isFinite(n) ? Math.trunc(n) : new Date().getFullYear();
    return year >= 2020 && year <= 2100 ? year : new Date().getFullYear();
};
exports.normalizeYear = normalizeYear;
const canManageKpi = (role) => ['admin', 'mgr_dl'].includes(String(role || ''));
exports.canManageKpi = canManageKpi;
const canManageUserKpi = (actor, subject) => {
    const role = String(actor.role || '');
    if (role === 'admin')
        return true;
    if (role === 'mgr_dl')
        return subject.team === 'delivery';
    if (role === 'mgr_ps')
        return subject.team === 'presales';
    return false;
};
exports.canManageUserKpi = canManageUserKpi;
const qbMultiplierFromCompletedTasks = (count) => {
    if (count >= 5)
        return 0.5;
    if (count >= 3)
        return 0.3;
    if (count >= 1)
        return 0.2;
    return 0;
};
exports.qbMultiplierFromCompletedTasks = qbMultiplierFromCompletedTasks;
const computeResolvedKpiSummary = (profile, scores, options = {}) => {
    let total = 0;
    let count = 0;
    let hasViolation = false;
    const completedJiraTaskCount = Math.max(0, Number(options.completedJiraTaskCount || 0));
    const qbMultiplier = (0, exports.qbMultiplierFromCompletedTasks)(completedJiraTaskCount);
    for (const domain of profile.domains) {
        const num = scores[domain.key];
        if (num === null || num === undefined)
            continue;
        if (num === -1) {
            hasViolation = true;
        }
        else {
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
exports.computeResolvedKpiSummary = computeResolvedKpiSummary;
const computeKpiSummary = (profile, rawScores, options = {}) => {
    const scores = {};
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
    }
    return (0, exports.computeResolvedKpiSummary)(profile, scores, options);
};
exports.computeKpiSummary = computeKpiSummary;

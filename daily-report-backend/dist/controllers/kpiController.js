"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recalculateQbMetrics = exports.upsertKpiNpsEntry = exports.getKpiNpsEntries = exports.getKpiProfiles = exports.upsertUserKpiScorecard = exports.getUserKpiScorecard = exports.getKpiAssignableUsers = void 0;
const client_1 = require("@prisma/client");
const kpiManual_1 = require("../utils/kpiManual");
const jiraService_1 = require("../services/jiraService");
const kpiAutomationService_1 = require("../services/kpiAutomationService");
const auditTrail_1 = require("../utils/auditTrail");
const prisma = new client_1.PrismaClient();
const normalizeRole = (role) => String(role || '').trim().toLowerCase();
const canManageKpiNps = (role) => ['admin', 'mgr_dl', 'head delivery', 'pm'].includes(normalizeRole(role));
const canSeeAllKpiNps = (role) => ['admin', 'mgr_dl', 'head delivery', 'pm'].includes(normalizeRole(role));
const canViewRelatedKpiNps = (role) => ['admin', 'mgr_dl', 'head delivery', 'pm', 'se', 'delivery'].includes(normalizeRole(role));
const resolveNpsFlag = (score) => {
    if (score === 4)
        return { npsFlag: 'promotor', npsFlagLabel: 'Promotor' };
    if (score === 3)
        return { npsFlag: 'passive', npsFlagLabel: 'Passive' };
    if (score === 1 || score === 2)
        return { npsFlag: 'detractors', npsFlagLabel: 'Detractors' };
    return { npsFlag: null, npsFlagLabel: null };
};
const getQuarterDateRange = (year, quarter) => {
    switch (quarter) {
        case 'Q1': return { startDate: `${year}-01-01`, endDate: `${year}-03-31` };
        case 'Q2': return { startDate: `${year}-04-01`, endDate: `${year}-06-30` };
        case 'Q3': return { startDate: `${year}-07-01`, endDate: `${year}-09-30` };
        case 'Q4': return { startDate: `${year}-10-01`, endDate: `${year}-12-31` };
        default: return { startDate: `${year}-01-01`, endDate: `${year}-03-31` };
    }
};
const resolveHybridManualScore = (value, fallback) => {
    if (value === undefined || value === null || value === '')
        return fallback;
    const num = Number(value);
    if (!Number.isFinite(num) || num < -1 || num > 4) {
        throw new Error('Nilai manual KPI harus berada di antara -1 sampai 4.');
    }
    return Number(num.toFixed(2));
};
const getKpiNpsScoreInputs = async (year, quarter) => {
    const entries = await prisma.kpiNpsEntry.findMany({
        where: {
            year,
            quarter,
            score: { not: null },
        },
        select: {
            scope: true,
            jiraIssueKey: true,
            score: true,
            comment: true,
            updatedAt: true,
        },
    });
    return entries
        .filter((entry) => entry.scope === 'impl_project' || entry.scope === 'op_task')
        .map((entry) => ({
        scope: entry.scope,
        jiraIssueKey: entry.jiraIssueKey,
        score: entry.score,
        comment: entry.comment || null,
        updatedAt: entry.updatedAt?.toISOString?.() || null,
    }));
};
const getAuthorizedKpiNpsCandidates = async (actor, year, quarter, perspective = 'input') => {
    const { startDate, endDate } = getQuarterDateRange(year, quarter);
    const candidates = await (0, jiraService_1.fetchKpiNpsCandidates)(startDate, endDate);
    if (canSeeAllKpiNps(actor.role))
        return candidates;
    if (perspective === 'related') {
        return candidates.filter((candidate) => (actor.jiraAccountId
            && Array.isArray(candidate.relatedEngineerAccountIds)
            && candidate.relatedEngineerAccountIds.includes(actor.jiraAccountId)));
    }
    return candidates.filter((candidate) => candidate.assignedPmAccountId && candidate.assignedPmAccountId === actor.jiraAccountId);
};
const mapScorecardResponse = (user, profile, scorecard, year, quarter, options = {}) => ({
    user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        team: user.team,
        avatarUrl: user.avatarUrl,
        jiraAccountId: user.jiraAccountId || null,
    },
    period: {
        year,
        quarter,
        label: (0, kpiManual_1.buildQuarterLabel)(year, quarter),
    },
    profile: {
        key: profile.key,
        label: profile.label,
        domains: profile.domains,
    },
    scorecard: scorecard
        ? {
            id: scorecard.id,
            scores: scorecard.scores || {},
            notes: options.domainNotes || scorecard.notes || {},
            finalScore: scorecard.finalScore,
            activeDomainCount: scorecard.activeDomainCount,
            hasViolation: scorecard.hasViolation,
            eligibleBonus: scorecard.eligibleBonus,
            completedJiraTaskCount: scorecard.completedJiraTaskCount || 0,
            qbMultiplier: scorecard.qbMultiplier || 0,
            qbLastCalculatedAt: scorecard.qbLastCalculatedAt || null,
            enteredById: scorecard.enteredById,
            updatedAt: scorecard.updatedAt,
            manualInputs: options.manualInputs || null,
            breakdown: options.breakdown || null,
            automationWarnings: options.automationWarnings || [],
            automationMode: options.automationMode || 'manual',
        }
        : {
            scores: {},
            notes: options.domainNotes || {},
            finalScore: profile.key === 'project_manager' ? 3 : null,
            activeDomainCount: 0,
            hasViolation: false,
            eligibleBonus: false,
            completedJiraTaskCount: 0,
            qbMultiplier: 0,
            qbLastCalculatedAt: null,
            enteredById: null,
            updatedAt: null,
            manualInputs: options.manualInputs || null,
            breakdown: options.breakdown || null,
            automationWarnings: options.automationWarnings || [],
            automationMode: options.automationMode || 'manual',
        },
});
const getKpiAssignableUsers = async (req, res) => {
    try {
        if (!(0, kpiManual_1.canManageKpi)(req.user?.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        const actorRole = req.user?.role || '';
        const whereClause = actorRole === 'admin'
            ? { status: { not: 'invited' } }
            : {
                status: { not: 'invited' },
                team: actorRole === 'mgr_dl' ? 'delivery' : 'presales',
            };
        const users = await prisma.user.findMany({
            where: whereClause,
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                team: true,
                avatarUrl: true,
                status: true,
            },
            orderBy: [{ team: 'asc' }, { name: 'asc' }],
        });
        const enriched = users.map((user) => ({
            ...user,
            kpiProfile: (0, kpiManual_1.resolveKpiProfile)(user.role)?.key || null,
        })).filter((user) => !!user.kpiProfile);
        res.json(enriched);
    }
    catch (error) {
        req.log?.error(error, 'Failed to fetch KPI assignable users');
        res.status(500).json({ error: 'Failed to fetch KPI users' });
    }
};
exports.getKpiAssignableUsers = getKpiAssignableUsers;
const getUserKpiScorecard = async (req, res) => {
    try {
        const userId = String(req.params.userId);
        const year = (0, kpiManual_1.normalizeYear)(req.query.year);
        const quarter = (0, kpiManual_1.normalizeQuarter)(req.query.quarter);
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                team: true,
                avatarUrl: true,
                jiraAccountId: true,
            },
        });
        if (!user)
            return res.status(404).json({ error: 'User not found' });
        const isSelf = req.user?.userId === user.id;
        const allowed = isSelf || (0, kpiManual_1.canManageUserKpi)(req.user || {}, user);
        if (!allowed) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        const profile = (0, kpiManual_1.resolveKpiProfile)(user.role);
        if (!profile) {
            return res.json({
                unsupported: true,
                user,
                period: { year, quarter, label: (0, kpiManual_1.buildQuarterLabel)(year, quarter) },
            });
        }
        const scorecard = await prisma.kpiScorecard.findUnique({
            where: {
                userId_year_quarter: {
                    userId: user.id,
                    year,
                    quarter,
                },
            },
        });
        if (profile.key === 'engineer_delivery') {
            const npsEntries = await getKpiNpsScoreInputs(year, quarter);
            const computed = await (0, kpiAutomationService_1.computeEngineerDeliveryKpi)(profile, user, getQuarterDateRange(year, quarter), scorecard, npsEntries);
            const syntheticScorecard = scorecard
                ? {
                    ...scorecard,
                    scores: computed.scores,
                    notes: computed.domainNotes,
                    finalScore: computed.finalScore,
                    activeDomainCount: computed.activeDomainCount,
                    hasViolation: computed.hasViolation,
                    eligibleBonus: computed.eligibleBonus,
                }
                : {
                    scores: computed.scores,
                    notes: computed.domainNotes,
                    finalScore: computed.finalScore,
                    activeDomainCount: computed.activeDomainCount,
                    hasViolation: computed.hasViolation,
                    eligibleBonus: computed.eligibleBonus,
                    completedJiraTaskCount: computed.completedJiraTaskCount,
                    qbMultiplier: computed.qbMultiplier,
                    qbLastCalculatedAt: null,
                    enteredById: null,
                    updatedAt: null,
                };
            return res.json(mapScorecardResponse(user, profile, syntheticScorecard, year, quarter, {
                manualInputs: computed.manualInputs,
                domainNotes: computed.domainNotes,
                breakdown: computed.breakdown,
                automationWarnings: computed.automationWarnings,
                automationMode: 'hybrid_auto_v1',
            }));
        }
        res.json(mapScorecardResponse(user, profile, scorecard, year, quarter));
    }
    catch (error) {
        req.log?.error(error, 'Failed to fetch KPI scorecard');
        res.status(500).json({ error: 'Failed to fetch KPI scorecard' });
    }
};
exports.getUserKpiScorecard = getUserKpiScorecard;
const upsertUserKpiScorecard = async (req, res) => {
    try {
        if (!(0, kpiManual_1.canManageKpi)(req.user?.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        const userId = String(req.params.userId);
        const year = (0, kpiManual_1.normalizeYear)(req.body?.year);
        const quarter = (0, kpiManual_1.normalizeQuarter)(req.body?.quarter);
        const scores = req.body?.scores || {};
        const notes = req.body?.notes || {};
        const manualInputs = req.body?.manualInputs || {};
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                team: true,
                avatarUrl: true,
                jiraAccountId: true,
            },
        });
        if (!user)
            return res.status(404).json({ error: 'User not found' });
        if (!(0, kpiManual_1.canManageUserKpi)(req.user || {}, user)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        const profile = (0, kpiManual_1.resolveKpiProfile)(user.role);
        if (!profile) {
            return res.status(400).json({ error: 'Role ini belum punya profil KPI manual.' });
        }
        if (profile.key === 'engineer_delivery') {
            const existing = await prisma.kpiScorecard.findUnique({
                where: {
                    userId_year_quarter: {
                        userId: user.id,
                        year,
                        quarter,
                    },
                },
            });
            const persisted = (0, kpiAutomationService_1.parseEngineerDeliveryPersistedState)(existing?.notes, existing?.scores);
            const nextManualInputs = {
                implNps: resolveHybridManualScore(manualInputs.implNps, persisted.manualInputs.implNps),
                opsScore: resolveHybridManualScore(manualInputs.opsScore, persisted.manualInputs.opsScore),
            };
            const npsEntries = await getKpiNpsScoreInputs(year, quarter);
            const computed = await (0, kpiAutomationService_1.computeEngineerDeliveryKpi)(profile, user, getQuarterDateRange(year, quarter), {
                ...existing,
                notes: (0, kpiAutomationService_1.buildEngineerDeliveryPersistedNotes)(nextManualInputs, notes),
            }, npsEntries);
            const scorecard = await prisma.kpiScorecard.upsert({
                where: {
                    userId_year_quarter: {
                        userId: user.id,
                        year,
                        quarter,
                    },
                },
                update: {
                    profileKey: profile.key,
                    scores: computed.scores,
                    notes: computed.persistedNotes,
                    finalScore: computed.finalScore,
                    activeDomainCount: computed.activeDomainCount,
                    hasViolation: computed.hasViolation,
                    eligibleBonus: computed.eligibleBonus,
                    completedJiraTaskCount: computed.completedJiraTaskCount,
                    qbMultiplier: computed.qbMultiplier,
                    enteredById: req.user?.userId,
                },
                create: {
                    userId: user.id,
                    year,
                    quarter,
                    profileKey: profile.key,
                    scores: computed.scores,
                    notes: computed.persistedNotes,
                    finalScore: computed.finalScore,
                    activeDomainCount: computed.activeDomainCount,
                    hasViolation: computed.hasViolation,
                    eligibleBonus: computed.eligibleBonus,
                    completedJiraTaskCount: computed.completedJiraTaskCount,
                    qbMultiplier: computed.qbMultiplier,
                    enteredById: req.user?.userId,
                },
            });
            await (0, auditTrail_1.writeAudit)(req, {
                action: 'kpi.hybrid_save',
                entityType: 'kpi_scorecard',
                entityId: scorecard.id,
                after: scorecard,
                metadata: { year, quarter, userId: user.id },
            });
            return res.json(mapScorecardResponse(user, profile, scorecard, year, quarter, {
                manualInputs: computed.manualInputs,
                domainNotes: computed.domainNotes,
                breakdown: computed.breakdown,
                automationWarnings: computed.automationWarnings,
                automationMode: 'hybrid_auto_v1',
            }));
        }
        const existing = await prisma.kpiScorecard.findUnique({
            where: {
                userId_year_quarter: {
                    userId: user.id,
                    year,
                    quarter,
                },
            },
        });
        const summary = (0, kpiManual_1.computeKpiSummary)(profile, scores, {
            completedJiraTaskCount: existing?.completedJiraTaskCount || 0,
        });
        const scorecard = await prisma.kpiScorecard.upsert({
            where: {
                userId_year_quarter: {
                    userId: user.id,
                    year,
                    quarter,
                },
            },
            update: {
                profileKey: profile.key,
                scores: summary.scores,
                notes: notes,
                finalScore: summary.finalScore,
                activeDomainCount: summary.activeDomainCount,
                hasViolation: summary.hasViolation,
                eligibleBonus: summary.eligibleBonus,
                completedJiraTaskCount: summary.completedJiraTaskCount,
                qbMultiplier: summary.qbMultiplier,
                enteredById: req.user?.userId,
            },
            create: {
                userId: user.id,
                year,
                quarter,
                profileKey: profile.key,
                scores: summary.scores,
                notes: notes,
                finalScore: summary.finalScore,
                activeDomainCount: summary.activeDomainCount,
                hasViolation: summary.hasViolation,
                eligibleBonus: summary.eligibleBonus,
                completedJiraTaskCount: summary.completedJiraTaskCount,
                qbMultiplier: summary.qbMultiplier,
                enteredById: req.user?.userId,
            },
        });
        await (0, auditTrail_1.writeAudit)(req, {
            action: 'kpi.manual_save',
            entityType: 'kpi_scorecard',
            entityId: scorecard.id,
            after: scorecard,
            metadata: { year, quarter, userId: user.id },
        });
        res.json(mapScorecardResponse(user, profile, scorecard, year, quarter));
    }
    catch (error) {
        req.log?.error(error, 'Failed to save KPI scorecard');
        res.status(400).json({ error: error?.message || 'Failed to save KPI scorecard' });
    }
};
exports.upsertUserKpiScorecard = upsertUserKpiScorecard;
const getKpiProfiles = async (_req, res) => {
    res.json(Object.values(kpiManual_1.KPI_PROFILES));
};
exports.getKpiProfiles = getKpiProfiles;
const getKpiNpsEntries = async (req, res) => {
    try {
        const perspective = req.query.perspective === 'related' ? 'related' : 'input';
        if (perspective === 'related' ? !canViewRelatedKpiNps(req.user?.role) : !canManageKpiNps(req.user?.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        const year = (0, kpiManual_1.normalizeYear)(req.query.year);
        const quarter = (0, kpiManual_1.normalizeQuarter)(req.query.quarter);
        const actor = await prisma.user.findUnique({
            where: { id: String(req.user?.userId || '') },
            select: { id: true, role: true, jiraAccountId: true },
        });
        if (!actor)
            return res.status(401).json({ error: 'Unauthorized' });
        if (!canSeeAllKpiNps(actor.role) && !actor.jiraAccountId) {
            return res.status(400).json({ error: perspective === 'related' ? 'Akun Jira user belum terhubung.' : 'Akun Jira PM belum terhubung.' });
        }
        const candidates = await getAuthorizedKpiNpsCandidates(actor, year, quarter, perspective);
        const entries = candidates.length
            ? await prisma.kpiNpsEntry.findMany({
                where: {
                    year,
                    quarter,
                    OR: candidates.map((candidate) => ({
                        scope: candidate.scope,
                        jiraIssueKey: candidate.jiraIssueKey,
                    })),
                },
            })
            : [];
        const entryMap = new Map(entries.map((entry) => [`${entry.scope}:${entry.jiraIssueKey}`, entry]));
        res.json({
            period: { year, quarter, label: (0, kpiManual_1.buildQuarterLabel)(year, quarter) },
            canSeeAll: canSeeAllKpiNps(actor.role),
            perspective,
            items: candidates.map((candidate) => {
                const entry = entryMap.get(`${candidate.scope}:${candidate.jiraIssueKey}`);
                const score = entry?.score ?? null;
                return {
                    ...candidate,
                    score,
                    comment: entry?.comment || '',
                    enteredById: entry?.enteredById || null,
                    updatedAt: entry?.updatedAt || null,
                    hasScore: score !== null && score !== undefined,
                    ...resolveNpsFlag(score),
                };
            }),
        });
    }
    catch (error) {
        req.log?.error(error, 'Failed to fetch KPI NPS entries');
        res.status(400).json({ error: error?.message || 'Failed to fetch KPI NPS entries' });
    }
};
exports.getKpiNpsEntries = getKpiNpsEntries;
const upsertKpiNpsEntry = async (req, res) => {
    try {
        if (!canManageKpiNps(req.user?.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        const year = (0, kpiManual_1.normalizeYear)(req.body?.year);
        const quarter = (0, kpiManual_1.normalizeQuarter)(req.body?.quarter);
        const scope = String(req.body?.scope || '');
        const jiraIssueKey = String(req.body?.jiraIssueKey || '').trim().toUpperCase();
        const score = Number(req.body?.score);
        const comment = req.body?.comment == null ? null : String(req.body.comment);
        if (!['impl_project', 'op_task', 'pm_record'].includes(scope)) {
            return res.status(400).json({ error: 'Scope NPS tidak valid.' });
        }
        if (!jiraIssueKey) {
            return res.status(400).json({ error: 'Issue key wajib diisi.' });
        }
        if (!Number.isInteger(score) || score < 1 || score > 4) {
            return res.status(400).json({ error: 'Nilai NPS harus berupa angka 1-4.' });
        }
        const actor = await prisma.user.findUnique({
            where: { id: String(req.user?.userId || '') },
            select: { id: true, role: true, jiraAccountId: true },
        });
        if (!actor)
            return res.status(401).json({ error: 'Unauthorized' });
        const candidates = await getAuthorizedKpiNpsCandidates(actor, year, quarter);
        const candidate = candidates.find((item) => item.scope === scope && item.jiraIssueKey === jiraIssueKey);
        if (!candidate) {
            return res.status(403).json({ error: 'Issue ini tidak tersedia untuk input NPS Anda pada periode tersebut.' });
        }
        const entry = await prisma.kpiNpsEntry.upsert({
            where: {
                year_quarter_scope_jiraIssueKey: {
                    year,
                    quarter,
                    scope,
                    jiraIssueKey,
                },
            },
            update: {
                jiraIssueId: candidate.jiraIssueId,
                projectKey: candidate.projectKey,
                projectName: candidate.projectName,
                summary: candidate.summary,
                issueTypeName: candidate.issueTypeName,
                assignedPmAccountId: candidate.assignedPmAccountId,
                assignedPmDisplayName: candidate.assignedPmDisplayName,
                score,
                comment,
                enteredById: req.user?.userId,
            },
            create: {
                year,
                quarter,
                scope,
                jiraIssueId: candidate.jiraIssueId,
                jiraIssueKey,
                projectKey: candidate.projectKey,
                projectName: candidate.projectName,
                summary: candidate.summary,
                issueTypeName: candidate.issueTypeName,
                assignedPmAccountId: candidate.assignedPmAccountId,
                assignedPmDisplayName: candidate.assignedPmDisplayName,
                score,
                comment,
                enteredById: req.user?.userId,
            },
        });
        await (0, auditTrail_1.writeAudit)(req, {
            action: 'kpi.nps_upsert',
            entityType: 'kpi_nps_entry',
            entityId: entry.id,
            after: entry,
            metadata: { year, quarter, scope, jiraIssueKey },
        });
        res.json({
            ...entry,
            ...resolveNpsFlag(entry.score),
        });
    }
    catch (error) {
        req.log?.error(error, 'Failed to save KPI NPS entry');
        res.status(400).json({ error: error?.message || 'Failed to save KPI NPS entry' });
    }
};
exports.upsertKpiNpsEntry = upsertKpiNpsEntry;
const recalculateQbMetrics = async (req, res) => {
    try {
        if (!(0, kpiManual_1.canManageKpi)(req.user?.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        const userId = String(req.params.userId);
        const year = (0, kpiManual_1.normalizeYear)(req.body?.year ?? req.query.year);
        const quarter = (0, kpiManual_1.normalizeQuarter)(req.body?.quarter ?? req.query.quarter);
        const { startDate, endDate } = getQuarterDateRange(year, quarter);
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                team: true,
                avatarUrl: true,
                jiraAccountId: true,
            },
        });
        if (!user)
            return res.status(404).json({ error: 'User not found' });
        if (!(0, kpiManual_1.canManageUserKpi)(req.user || {}, user)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        const profile = (0, kpiManual_1.resolveKpiProfile)(user.role);
        if (!profile) {
            return res.status(400).json({ error: 'Role ini belum punya profil KPI manual.' });
        }
        if (!user.jiraAccountId) {
            return res.status(400).json({ error: 'User ini belum menghubungkan akun Jira.' });
        }
        const jiraResult = await (0, jiraService_1.fetchCompletedJiraTasksForQuarter)(user.jiraAccountId, startDate, endDate);
        const existing = await prisma.kpiScorecard.findUnique({
            where: {
                userId_year_quarter: {
                    userId: user.id,
                    year,
                    quarter,
                },
            },
        });
        if (profile.key === 'engineer_delivery') {
            const npsEntries = await getKpiNpsScoreInputs(year, quarter);
            const computed = await (0, kpiAutomationService_1.computeEngineerDeliveryKpi)(profile, user, { startDate, endDate }, {
                ...existing,
                completedJiraTaskCount: jiraResult.count,
            }, npsEntries);
            const scorecard = await prisma.kpiScorecard.upsert({
                where: {
                    userId_year_quarter: {
                        userId: user.id,
                        year,
                        quarter,
                    },
                },
                update: {
                    profileKey: profile.key,
                    scores: computed.scores,
                    notes: computed.persistedNotes,
                    finalScore: computed.finalScore,
                    activeDomainCount: computed.activeDomainCount,
                    hasViolation: computed.hasViolation,
                    eligibleBonus: computed.eligibleBonus,
                    completedJiraTaskCount: jiraResult.count,
                    qbMultiplier: computed.qbMultiplier,
                    qbLastCalculatedAt: new Date(),
                },
                create: {
                    userId: user.id,
                    year,
                    quarter,
                    profileKey: profile.key,
                    scores: computed.scores,
                    notes: computed.persistedNotes,
                    finalScore: computed.finalScore,
                    activeDomainCount: computed.activeDomainCount,
                    hasViolation: computed.hasViolation,
                    eligibleBonus: computed.eligibleBonus,
                    completedJiraTaskCount: jiraResult.count,
                    qbMultiplier: computed.qbMultiplier,
                    qbLastCalculatedAt: new Date(),
                },
            });
            await (0, auditTrail_1.writeAudit)(req, {
                action: 'kpi.qb_recalculate',
                entityType: 'kpi_scorecard',
                entityId: scorecard.id,
                after: scorecard,
                metadata: {
                    year,
                    quarter,
                    userId: user.id,
                    qbCount: jiraResult.count,
                },
            });
            return res.json({
                ...mapScorecardResponse(user, profile, scorecard, year, quarter, {
                    manualInputs: computed.manualInputs,
                    domainNotes: computed.domainNotes,
                    breakdown: computed.breakdown,
                    automationWarnings: computed.automationWarnings,
                    automationMode: 'hybrid_auto_v1',
                }),
                qbRefresh: {
                    countedIssues: jiraResult.issues,
                    count: jiraResult.count,
                    startDate,
                    endDate,
                },
            });
        }
        const scores = existing?.scores || {};
        const notes = existing?.notes || {};
        const summary = (0, kpiManual_1.computeKpiSummary)(profile, scores, { completedJiraTaskCount: jiraResult.count });
        const scorecard = await prisma.kpiScorecard.upsert({
            where: {
                userId_year_quarter: {
                    userId: user.id,
                    year,
                    quarter,
                },
            },
            update: {
                profileKey: profile.key,
                scores: scores,
                notes: notes,
                finalScore: summary.finalScore,
                activeDomainCount: summary.activeDomainCount,
                hasViolation: summary.hasViolation,
                eligibleBonus: summary.eligibleBonus,
                completedJiraTaskCount: summary.completedJiraTaskCount,
                qbMultiplier: summary.qbMultiplier,
                qbLastCalculatedAt: new Date(),
            },
            create: {
                userId: user.id,
                year,
                quarter,
                profileKey: profile.key,
                scores: scores,
                notes: notes,
                finalScore: summary.finalScore,
                activeDomainCount: summary.activeDomainCount,
                hasViolation: summary.hasViolation,
                eligibleBonus: summary.eligibleBonus,
                completedJiraTaskCount: summary.completedJiraTaskCount,
                qbMultiplier: summary.qbMultiplier,
                qbLastCalculatedAt: new Date(),
            },
        });
        await (0, auditTrail_1.writeAudit)(req, {
            action: 'kpi.qb_recalculate',
            entityType: 'kpi_scorecard',
            entityId: scorecard.id,
            after: scorecard,
            metadata: {
                year,
                quarter,
                userId: user.id,
                qbCount: jiraResult.count,
            },
        });
        res.json({
            ...mapScorecardResponse(user, profile, scorecard, year, quarter),
            qbRefresh: {
                countedIssues: jiraResult.issues,
                count: jiraResult.count,
                startDate,
                endDate,
            },
        });
    }
    catch (error) {
        req.log?.error(error, 'Failed to recalculate QB metrics');
        res.status(400).json({ error: error?.message || 'Failed to recalculate QB metrics' });
    }
};
exports.recalculateQbMetrics = recalculateQbMetrics;

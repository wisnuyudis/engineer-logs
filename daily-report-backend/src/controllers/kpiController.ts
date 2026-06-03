import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middlewares/authMiddleware';
import {
  KPI_PROFILES,
  buildQuarterLabel,
  canManageKpi,
  canManageUserKpi,
  computeKpiSummary,
  normalizeQuarter,
  normalizeYear,
  resolveKpiProfile,
} from '../utils/kpiManual';
import { fetchCompletedJiraTasksForQuarter, fetchKpiNpsCandidates } from '../services/jiraService';
import {
  buildEngineerDeliveryPersistedNotes,
  computeEngineerDeliveryKpi,
  KpiNpsScoreInput,
  parseEngineerDeliveryPersistedState,
} from '../services/kpiAutomationService';
import { writeAudit } from '../utils/auditTrail';

const prisma = new PrismaClient();

const normalizeRole = (role?: string | null) => String(role || '').trim().toLowerCase();
const canManageKpiNps = (role?: string | null) => ['admin', 'mgr_dl', 'head delivery', 'pm'].includes(normalizeRole(role));
const canSeeAllKpiNps = (role?: string | null) => ['admin', 'mgr_dl', 'head delivery', 'pm'].includes(normalizeRole(role));
const canViewRelatedKpiNps = (role?: string | null) => ['admin', 'mgr_dl', 'head delivery', 'pm', 'se', 'delivery'].includes(normalizeRole(role));

const resolveNpsFlag = (score?: number | null) => {
  if (score === 4) return { npsFlag: 'promotor', npsFlagLabel: 'Promotor' };
  if (score === 3) return { npsFlag: 'passive', npsFlagLabel: 'Passive' };
  if (score === 1 || score === 2) return { npsFlag: 'detractors', npsFlagLabel: 'Detractors' };
  return { npsFlag: null, npsFlagLabel: null };
};

const getQuarterDateRange = (year: number, quarter: string) => {
  switch (quarter) {
    case 'Q1': return { startDate: `${year}-01-01`, endDate: `${year}-03-31` };
    case 'Q2': return { startDate: `${year}-04-01`, endDate: `${year}-06-30` };
    case 'Q3': return { startDate: `${year}-07-01`, endDate: `${year}-09-30` };
    case 'Q4': return { startDate: `${year}-10-01`, endDate: `${year}-12-31` };
    default: return { startDate: `${year}-01-01`, endDate: `${year}-03-31` };
  }
};

const resolveHybridManualScore = (value: unknown, fallback: number | null) => {
  if (value === undefined || value === null || value === '') return fallback;
  const num = Number(value);
  if (!Number.isFinite(num) || num < -1 || num > 4) {
    throw new Error('Nilai manual KPI harus berada di antara -1 sampai 4.');
  }
  return Number(num.toFixed(2));
};

const getKpiNpsScoreInputs = async (year: number, quarter: string): Promise<KpiNpsScoreInput[]> => {
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
      scope: entry.scope as 'impl_project' | 'op_task',
      jiraIssueKey: entry.jiraIssueKey,
      score: entry.score,
      comment: entry.comment || null,
      updatedAt: entry.updatedAt?.toISOString?.() || null,
    }));
};

const getAuthorizedKpiNpsCandidates = async (
  actor: { role?: string | null; jiraAccountId?: string | null },
  year: number,
  quarter: string,
  perspective: 'input' | 'related' = 'input'
) => {
  const { startDate, endDate } = getQuarterDateRange(year, quarter);
  const candidates = await fetchKpiNpsCandidates(startDate, endDate);
  if (canSeeAllKpiNps(actor.role)) return candidates;
  if (perspective === 'related') {
    return candidates.filter((candidate) => (
      actor.jiraAccountId
      && Array.isArray(candidate.relatedEngineerAccountIds)
      && candidate.relatedEngineerAccountIds.includes(actor.jiraAccountId)
    ));
  }
  return candidates.filter((candidate) => candidate.assignedPmAccountId && candidate.assignedPmAccountId === actor.jiraAccountId);
};

const mapScorecardResponse = (
  user: any,
  profile: any,
  scorecard: any,
  year: number,
  quarter: string,
  options: {
    manualInputs?: any;
    domainNotes?: any;
    breakdown?: any;
    automationWarnings?: string[];
    automationMode?: string;
  } = {}
) => ({
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
    label: buildQuarterLabel(year, quarter),
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

export const getKpiAssignableUsers = async (req: AuthRequest, res: Response) => {
  try {
    if (!canManageKpi(req.user?.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const actorRole = req.user?.role || '';
    const whereClause =
      actorRole === 'admin'
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
      kpiProfile: resolveKpiProfile(user.role)?.key || null,
    })).filter((user) => !!user.kpiProfile);

    res.json(enriched);
  } catch (error) {
    req.log?.error(error, 'Failed to fetch KPI assignable users');
    res.status(500).json({ error: 'Failed to fetch KPI users' });
  }
};

export const getUserKpiScorecard = async (req: AuthRequest, res: Response) => {
  try {
    const userId = String(req.params.userId);
    const year = normalizeYear(req.query.year as string);
    const quarter = normalizeQuarter(req.query.quarter as string);

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

    if (!user) return res.status(404).json({ error: 'User not found' });

    const isSelf = req.user?.userId === user.id;
    const allowed = isSelf || canManageUserKpi(req.user || {}, user);
    if (!allowed) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const profile = resolveKpiProfile(user.role);
    if (!profile) {
      return res.json({
        unsupported: true,
        user,
        period: { year, quarter, label: buildQuarterLabel(year, quarter) },
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
      const computed = await computeEngineerDeliveryKpi(profile, user, getQuarterDateRange(year, quarter), scorecard, npsEntries);
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

      return res.json(
        mapScorecardResponse(user, profile, syntheticScorecard, year, quarter, {
          manualInputs: computed.manualInputs,
          domainNotes: computed.domainNotes,
          breakdown: computed.breakdown,
          automationWarnings: computed.automationWarnings,
          automationMode: 'hybrid_auto_v1',
        })
      );
    }

    res.json(mapScorecardResponse(user, profile, scorecard, year, quarter));
  } catch (error) {
    req.log?.error(error, 'Failed to fetch KPI scorecard');
    res.status(500).json({ error: 'Failed to fetch KPI scorecard' });
  }
};

export const upsertUserKpiScorecard = async (req: AuthRequest, res: Response) => {
  try {
    if (!canManageKpi(req.user?.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const userId = String(req.params.userId);
    const year = normalizeYear(req.body?.year);
    const quarter = normalizeQuarter(req.body?.quarter);
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

    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!canManageUserKpi(req.user || {}, user)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const profile = resolveKpiProfile(user.role);
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

      const persisted = parseEngineerDeliveryPersistedState(existing?.notes, existing?.scores);
      const nextManualInputs = {
        implNps: resolveHybridManualScore(manualInputs.implNps, persisted.manualInputs.implNps),
        opsScore: resolveHybridManualScore(manualInputs.opsScore, persisted.manualInputs.opsScore),
      };
      const npsEntries = await getKpiNpsScoreInputs(year, quarter);
      const computed = await computeEngineerDeliveryKpi(
        profile,
        user,
        getQuarterDateRange(year, quarter),
        {
          ...existing,
          notes: buildEngineerDeliveryPersistedNotes(nextManualInputs, notes),
        },
        npsEntries
      );

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
          scores: computed.scores as any,
          notes: computed.persistedNotes as any,
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
          scores: computed.scores as any,
          notes: computed.persistedNotes as any,
          finalScore: computed.finalScore,
          activeDomainCount: computed.activeDomainCount,
          hasViolation: computed.hasViolation,
          eligibleBonus: computed.eligibleBonus,
          completedJiraTaskCount: computed.completedJiraTaskCount,
          qbMultiplier: computed.qbMultiplier,
          enteredById: req.user?.userId,
        },
      });

      await writeAudit(req, {
        action: 'kpi.hybrid_save',
        entityType: 'kpi_scorecard',
        entityId: scorecard.id,
        after: scorecard,
        metadata: { year, quarter, userId: user.id },
      });

      return res.json(
        mapScorecardResponse(user, profile, scorecard, year, quarter, {
          manualInputs: computed.manualInputs,
          domainNotes: computed.domainNotes,
          breakdown: computed.breakdown,
          automationWarnings: computed.automationWarnings,
          automationMode: 'hybrid_auto_v1',
        })
      );
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

    const summary = computeKpiSummary(profile, scores, {
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
        scores: summary.scores as any,
        notes: notes as any,
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
        scores: summary.scores as any,
        notes: notes as any,
        finalScore: summary.finalScore,
        activeDomainCount: summary.activeDomainCount,
        hasViolation: summary.hasViolation,
        eligibleBonus: summary.eligibleBonus,
        completedJiraTaskCount: summary.completedJiraTaskCount,
        qbMultiplier: summary.qbMultiplier,
        enteredById: req.user?.userId,
      },
    });

    await writeAudit(req, {
      action: 'kpi.manual_save',
      entityType: 'kpi_scorecard',
      entityId: scorecard.id,
      after: scorecard,
      metadata: { year, quarter, userId: user.id },
    });

    res.json(mapScorecardResponse(user, profile, scorecard, year, quarter));
  } catch (error: any) {
    req.log?.error(error, 'Failed to save KPI scorecard');
    res.status(400).json({ error: error?.message || 'Failed to save KPI scorecard' });
  }
};

export const getKpiProfiles = async (_req: AuthRequest, res: Response) => {
  res.json(Object.values(KPI_PROFILES));
};

export const getKpiNpsEntries = async (req: AuthRequest, res: Response) => {
  try {
    const perspective = req.query.perspective === 'related' ? 'related' : 'input';
    if (perspective === 'related' ? !canViewRelatedKpiNps(req.user?.role) : !canManageKpiNps(req.user?.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const year = normalizeYear(req.query.year as string);
    const quarter = normalizeQuarter(req.query.quarter as string);
    const actor = await prisma.user.findUnique({
      where: { id: String(req.user?.userId || '') },
      select: { id: true, role: true, jiraAccountId: true },
    });
    if (!actor) return res.status(401).json({ error: 'Unauthorized' });
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
      period: { year, quarter, label: buildQuarterLabel(year, quarter) },
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
  } catch (error: any) {
    req.log?.error(error, 'Failed to fetch KPI NPS entries');
    res.status(400).json({ error: error?.message || 'Failed to fetch KPI NPS entries' });
  }
};

export const upsertKpiNpsEntry = async (req: AuthRequest, res: Response) => {
  try {
    if (!canManageKpiNps(req.user?.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const year = normalizeYear(req.body?.year);
    const quarter = normalizeQuarter(req.body?.quarter);
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
    if (!actor) return res.status(401).json({ error: 'Unauthorized' });

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

    await writeAudit(req, {
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
  } catch (error: any) {
    req.log?.error(error, 'Failed to save KPI NPS entry');
    res.status(400).json({ error: error?.message || 'Failed to save KPI NPS entry' });
  }
};

export const recalculateQbMetrics = async (req: AuthRequest, res: Response) => {
  try {
    if (!canManageKpi(req.user?.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const userId = String(req.params.userId);
    const year = normalizeYear(req.body?.year ?? req.query.year);
    const quarter = normalizeQuarter(req.body?.quarter ?? req.query.quarter);
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

    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!canManageUserKpi(req.user || {}, user)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const profile = resolveKpiProfile(user.role);
    if (!profile) {
      return res.status(400).json({ error: 'Role ini belum punya profil KPI manual.' });
    }
    if (!user.jiraAccountId) {
      return res.status(400).json({ error: 'User ini belum menghubungkan akun Jira.' });
    }

    const jiraResult = await fetchCompletedJiraTasksForQuarter(user.jiraAccountId, startDate, endDate);
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
      const computed = await computeEngineerDeliveryKpi(profile, user, { startDate, endDate }, {
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
          scores: computed.scores as any,
          notes: computed.persistedNotes as any,
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
          scores: computed.scores as any,
          notes: computed.persistedNotes as any,
          finalScore: computed.finalScore,
          activeDomainCount: computed.activeDomainCount,
          hasViolation: computed.hasViolation,
          eligibleBonus: computed.eligibleBonus,
          completedJiraTaskCount: jiraResult.count,
          qbMultiplier: computed.qbMultiplier,
          qbLastCalculatedAt: new Date(),
        },
      });

      await writeAudit(req, {
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

    const scores = (existing?.scores as Record<string, unknown> | undefined) || {};
    const notes = (existing?.notes as Record<string, unknown> | undefined) || {};
    const summary = computeKpiSummary(profile, scores, { completedJiraTaskCount: jiraResult.count });

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
        scores: scores as any,
        notes: notes as any,
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
        scores: scores as any,
        notes: notes as any,
        finalScore: summary.finalScore,
        activeDomainCount: summary.activeDomainCount,
        hasViolation: summary.hasViolation,
        eligibleBonus: summary.eligibleBonus,
        completedJiraTaskCount: summary.completedJiraTaskCount,
        qbMultiplier: summary.qbMultiplier,
        qbLastCalculatedAt: new Date(),
      },
    });

    await writeAudit(req, {
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
  } catch (error: any) {
    req.log?.error(error, 'Failed to recalculate QB metrics');
    res.status(400).json({ error: error?.message || 'Failed to recalculate QB metrics' });
  }
};

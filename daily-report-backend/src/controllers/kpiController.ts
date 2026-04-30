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
import { fetchCompletedJiraTasksForQuarter } from '../services/jiraService';
import {
  buildEngineerDeliveryPersistedNotes,
  computeEngineerDeliveryKpi,
  parseEngineerDeliveryPersistedState,
} from '../services/kpiAutomationService';
import { writeAudit } from '../utils/auditTrail';

const prisma = new PrismaClient();

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
      const computed = await computeEngineerDeliveryKpi(profile, user, getQuarterDateRange(year, quarter), scorecard);
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
      const computed = await computeEngineerDeliveryKpi(
        profile,
        user,
        getQuarterDateRange(year, quarter),
        {
          ...existing,
          notes: buildEngineerDeliveryPersistedNotes(nextManualInputs, notes),
        }
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
      const computed = await computeEngineerDeliveryKpi(profile, user, { startDate, endDate }, {
        ...existing,
        completedJiraTaskCount: jiraResult.count,
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

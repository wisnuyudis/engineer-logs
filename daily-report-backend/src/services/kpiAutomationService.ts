import { searchJiraIssues } from './jiraService';
import { KpiProfileDef, KpiScoreMap, computeResolvedKpiSummary } from '../utils/kpiManual';

export type EngineerDeliveryManualInputs = {
  implNps: number | null;
  opsScore: number | null;
};

export type EngineerDeliveryDomainNotes = Record<string, string>;

export type EngineerDeliveryBreakdown = Record<string, any>;

type EngineerDeliveryAutomationSnapshot = {
  scores: KpiScoreMap;
  breakdown: EngineerDeliveryBreakdown;
  computedAt: string;
};

type PersistedEngineerDeliveryNotes = {
  version: 'engineer_delivery_v1';
  manualInputs: EngineerDeliveryManualInputs;
  domainNotes: EngineerDeliveryDomainNotes;
  lastAutomationSnapshot?: EngineerDeliveryAutomationSnapshot | null;
};

type StoredScorecard = {
  scores?: unknown;
  notes?: unknown;
  completedJiraTaskCount?: number | null;
};

type KpiUser = {
  id: string;
  jiraAccountId: string | null;
};

type QuarterRange = {
  startDate: string;
  endDate: string;
};

export type KpiNpsScoreInput = {
  scope: 'impl_project' | 'op_task';
  jiraIssueKey: string;
  score: number | null;
  comment?: string | null;
  updatedAt?: string | null;
};

const REQUIRED_IMPL_DOCS = [
  'Method Of Produce',
  'System Requirement Document',
  'Training Module',
  'Installation & Configuration Guide',
  'Administrator Guide',
];

const normalizeSummary = (value: string | null | undefined) => String(value || '').trim().toLowerCase();
const inQuarter = (dateValue: string | null | undefined, period: QuarterRange) => Boolean(dateValue && dateValue >= period.startDate && dateValue <= period.endDate);
const isSupportKey = (issueKey: string | null | undefined) => String(issueKey || '').toUpperCase().startsWith('SUP-');

const toIsoDate = (value: string | null | undefined) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const endOfDueDate = (value: string | null) => {
  if (!value) return null;
  return new Date(`${value}T23:59:59.999Z`);
};

const isDueDatePassed = (value: string | null, referenceDate = new Date()) => {
  const due = endOfDueDate(value);
  if (!due) return false;
  return due.getTime() < referenceDate.getTime();
};

const diffMinutes = (start: string | null, end: string | null) => {
  if (!start || !end) return null;
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;
  return (endDate.getTime() - startDate.getTime()) / 60000;
};

const diffHours = (start: string | null, end: string | null) => {
  const minutes = diffMinutes(start, end);
  return minutes === null ? null : minutes / 60;
};

const diffDaysFromDue = (dueDate: string | null, actualIso: string | null) => {
  if (!dueDate || !actualIso) return null;
  const due = endOfDueDate(dueDate);
  const actual = new Date(actualIso);
  if (!due || Number.isNaN(actual.getTime())) return null;
  return Math.floor((actual.getTime() - due.getTime()) / 86400000);
};

const diffMinutesFromDueEnd = (dueDate: string | null, actualIso: string | null) => {
  if (!dueDate || !actualIso) return null;
  const due = endOfDueDate(dueDate);
  const actual = new Date(actualIso);
  if (!due || Number.isNaN(actual.getTime())) return null;
  return (actual.getTime() - due.getTime()) / 60000;
};

const businessDaysBetween = (startIso: string | null, endIso: string | null) => {
  if (!startIso || !endIso) return null;
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  if (end < start) return 0;

  const cursor = new Date(start);
  cursor.setUTCHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setUTCHours(0, 0, 0, 0);

  let count = 0;
  while (cursor < last) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
  }
  return count;
};

const roundScore = (value: number | null) => value === null ? null : Number(value.toFixed(2));

const formatHumanDuration = (minutes: number | null) => {
  if (minutes === null || !Number.isFinite(minutes)) return null;
  const abs = Math.abs(Math.round(minutes));
  const days = Math.floor(abs / 1440);
  const hours = Math.floor((abs % 1440) / 60);
  const mins = abs % 60;
  const parts = [];
  if (days) parts.push(`${days} hari`);
  if (hours) parts.push(`${hours} jam`);
  if (mins || !parts.length) parts.push(`${mins} menit`);
  return `${minutes < 0 ? 'lebih cepat' : 'terlambat'} ${parts.join(' ')}`;
};

const averageScores = (values: Array<number | null | undefined>) => {
  const filtered = values.filter((value): value is number => value !== null && value !== undefined);
  if (!filtered.length) return null;
  if (filtered.some((value) => value === -1)) return -1;
  return roundScore(filtered.reduce((sum, value) => sum + value, 0) / filtered.length);
};

const hasScorableAutoEvidence = (values: Array<number | null | undefined>) =>
  values.some((value) => value !== null && value !== undefined);

const normalizeManualScore = (value: unknown, fallback: number | null = null) => {
  if (value === null || value === undefined || value === '') return fallback;
  const num = Number(value);
  if (!Number.isFinite(num) || num < -1 || num > 4) {
    throw new Error('Nilai manual KPI harus berada di antara -1 sampai 4.');
  }
  return roundScore(num);
};

const normalizeDomainNotes = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, note]) => [key, String(note || '')])
  );
};

const parseLegacyNotes = (rawNotes: unknown) => {
  if (!rawNotes || typeof rawNotes !== 'object' || Array.isArray(rawNotes)) return {};
  return rawNotes as Record<string, unknown>;
};

export const parseEngineerDeliveryPersistedState = (rawNotes: unknown, rawScores: unknown) => {
  const legacyNotes = parseLegacyNotes(rawNotes);
  const scored = rawScores && typeof rawScores === 'object' && !Array.isArray(rawScores)
    ? rawScores as Record<string, unknown>
    : {};

  if (
    rawNotes &&
    typeof rawNotes === 'object' &&
    !Array.isArray(rawNotes) &&
    (rawNotes as Record<string, unknown>).version === 'engineer_delivery_v1'
  ) {
    const typed = rawNotes as PersistedEngineerDeliveryNotes;
    return {
      manualInputs: {
        implNps: normalizeManualScore(typed.manualInputs?.implNps, 3),
        opsScore: normalizeManualScore(typed.manualInputs?.opsScore, null),
      },
      domainNotes: normalizeDomainNotes(typed.domainNotes),
      lastAutomationSnapshot: typed.lastAutomationSnapshot || null,
    };
  }

  return {
    manualInputs: {
      implNps: 3,
      opsScore: normalizeManualScore(scored.ops, null),
    },
    domainNotes: normalizeDomainNotes(legacyNotes),
    lastAutomationSnapshot: null,
  };
};

export const buildEngineerDeliveryPersistedNotes = (
  manualInputs: EngineerDeliveryManualInputs,
  domainNotes: EngineerDeliveryDomainNotes,
  lastAutomationSnapshot: EngineerDeliveryAutomationSnapshot | null = null
): PersistedEngineerDeliveryNotes => ({
  version: 'engineer_delivery_v1',
  manualInputs,
  domainNotes,
  lastAutomationSnapshot,
});

const isProjectPrefix = (projectName: string | null, prefix: string) => String(projectName || '').toUpperCase().startsWith(prefix);

const implementationTaskScore = (onTimePct: number) => {
  if (onTimePct >= 90) return 4;
  if (onTimePct >= 75) return 3;
  if (onTimePct >= 50) return 2;
  if (onTimePct >= 25) return 1;
  return 0;
};

const pmExecutionScore = (lateMinutes: number | null) => {
  if (lateMinutes === null) return null;
  const lateDays = lateMinutes / 1440;
  if (lateMinutes <= 0) return 4;
  if (lateDays <= 7) return 3;
  if (lateDays <= 14) return 2;
  if (lateDays <= 28) return 1;
  return 0;
};

const pmReportScore = (businessDays: number | null) => {
  if (businessDays === null) return null;
  if (businessDays <= 3) return 4;
  if (businessDays <= 5) return 3;
  if (businessDays <= 10) return 2;
  if (businessDays <= 15) return 1;
  return 0;
};

const timeAgainstSlaScore = (actual: number | null, sla: number) => {
  if (actual === null) return null;
  if (actual <= sla) return 4;
  if (actual <= sla * 2) return 3;
  if (actual <= sla * 3) return 2;
  return 1;
};

const parsePrioritySeverity = (priorityName: string | null) => {
  const normalized = normalizeSummary(priorityName);
  if (normalized.includes('tingkat 1') || normalized.includes('critical') || normalized.includes('highest') || normalized.includes('urgent')) return 1;
  if (normalized.includes('tingkat 2') || normalized.includes('high') || normalized.includes('major')) return 2;
  if (normalized.includes('tingkat 3') || normalized.includes('medium') || normalized.includes('normal')) return 3;
  return 4;
};

const getBlockingBugLinks = (issue: Awaited<ReturnType<typeof searchJiraIssues>>[number]) =>
  (issue.linkedIssues || []).filter((link) => {
    const relation = normalizeSummary(link.relation);
    const typeName = normalizeSummary(link.typeName);
    const issueType = normalizeSummary(link.issueTypeName);
    const isBlockedByRelation = relation.includes('blocked by') || (link.direction === 'inward' && typeName.includes('block'));
    return isBlockedByRelation && issueType === 'bug';
  });

const isExcusedByBlockingBug = (
  issue: Awaited<ReturnType<typeof searchJiraIssues>>[number],
  dueDate: string | null,
  actualEndAt: string | null
) => {
  const blockingBugLinks = getBlockingBugLinks(issue);
  if (!blockingBugLinks.length) return false;
  const due = endOfDueDate(dueDate);
  if (!due) return false;
  if (!actualEndAt) return isDueDatePassed(dueDate);
  const actual = new Date(actualEndAt);
  return !Number.isNaN(actual.getTime()) && actual > due;
};

const computeImplementationDomain = (
  issues: Awaited<ReturnType<typeof searchJiraIssues>>,
  npsEntries: KpiNpsScoreInput[],
  period: QuarterRange,
  implParentEpicKeys: Map<string, string | null> = new Map()
) => {
  const relevant = issues.filter((issue) =>
    isProjectPrefix(issue.projectName, '[IMP]')
    && !!issue.dueDate
    && inQuarter(issue.dueDate, period)
  );
  if (!relevant.length) {
    return {
      score: null,
      breakdown: {
        mode: 'auto',
        issueCount: 0,
        components: {
          taskAccuracy: { score: null, eligibleSubtaskCount: 0, onTimeSubtaskCount: 0, lateSubtaskCount: 0, openSubtaskCount: 0, onTimePct: null },
          documentation: { score: null, expectedDocCount: REQUIRED_IMPL_DOCS.length, foundDocCount: 0, lateDocCount: 0, missingDocCount: 0, matchedDocs: [], applicable: false },
          nps: { score: null, source: 'kpi_nps', itemCount: 0, items: [] as any[] },
        },
      },
    };
  }

  const eligibleTasks = relevant.filter((issue) => !!issue.dueDate);
  const taskItems = eligibleTasks.map((issue) => {
    const actualEndAt = toIsoDate(issue.actualEndDate);
    const due = endOfDueDate(issue.dueDate);
    const blockingBugLinks = getBlockingBugLinks(issue);
    const excusedByBlocker = isExcusedByBlockingBug(issue, issue.dueDate, actualEndAt);
    const onTime = Boolean(actualEndAt && due && new Date(actualEndAt) <= due);
    return {
      issueKey: issue.key,
      summary: issue.summary,
      dueDate: issue.dueDate,
      actualEndAt,
      onTime,
      excusedByBlocker,
      blockingBugs: blockingBugLinks.map((link) => ({ issueKey: link.key, statusName: link.statusName })),
    };
  });
  const scoredTasks = eligibleTasks.filter((issue) => {
    const actualEndAt = toIsoDate(issue.actualEndDate);
    return !isExcusedByBlockingBug(issue, issue.dueDate, actualEndAt);
  });
  const onTimeSubtaskCount = scoredTasks.filter((issue) => {
    const actualEndAt = toIsoDate(issue.actualEndDate);
    const due = endOfDueDate(issue.dueDate);
    return actualEndAt && due && new Date(actualEndAt) <= due;
  }).length;
  const lateSubtaskCount = scoredTasks.filter((issue) => {
    const actualEndAt = toIsoDate(issue.actualEndDate);
    const due = endOfDueDate(issue.dueDate);
    return actualEndAt && due && new Date(actualEndAt) > due;
  }).length;
  const openSubtaskCount = scoredTasks.filter((issue) => !toIsoDate(issue.actualEndDate)).length;
  const excusedBlockedSubtaskCount = eligibleTasks.length - scoredTasks.length;
  const onTimePct = scoredTasks.length ? (onTimeSubtaskCount / scoredTasks.length) * 100 : null;
  const taskScore = onTimePct === null ? null : implementationTaskScore(onTimePct);

  const docStatus = REQUIRED_IMPL_DOCS.map((docName) => {
    const matches = relevant.filter((issue) => normalizeSummary(issue.summary) === normalizeSummary(docName));
    const present = matches.length > 0;
    const hasOnTime = matches.some((issue) => {
      const actualEndAt = toIsoDate(issue.actualEndDate);
      const due = endOfDueDate(issue.dueDate);
      return actualEndAt && due && new Date(actualEndAt) <= due;
    });
    return {
      name: docName,
      present,
      onTime: hasOnTime,
    };
  });

  const foundDocCount = docStatus.filter((doc) => doc.present).length;
  const missingDocCount = foundDocCount > 0 ? docStatus.filter((doc) => !doc.present).length : 0;
  const lateDocCount = docStatus.filter((doc) => doc.present && !doc.onTime).length;
  const documentationApplicable = foundDocCount > 0;
  const documentationScore = !documentationApplicable ? null : (missingDocCount === 0 && lateDocCount === 0 ? 4 : 3);
  const epicKeyToParentTasks = new Map<string, Set<string>>();
  for (const issue of relevant) {
    if (!issue.parentKey) continue;
    const epicKey = implParentEpicKeys.get(issue.parentKey) || issue.parentKey;
    const parentTasks = epicKeyToParentTasks.get(epicKey) || new Set<string>();
    parentTasks.add(issue.parentKey);
    epicKeyToParentTasks.set(epicKey, parentTasks);
  }
  const projectKeys = Array.from(epicKeyToParentTasks.keys());
  const npsItems = projectKeys.map((projectKey) => {
    const entry = npsEntries.find((item) => item.scope === 'impl_project' && item.jiraIssueKey === projectKey);
    return {
      issueKey: projectKey,
      parentTaskKeys: Array.from(epicKeyToParentTasks.get(projectKey) || []),
      score: entry?.score ?? null,
      filled: entry?.score !== null && entry?.score !== undefined,
    };
  });
  const npsScore = averageScores(npsItems.map((item) => item.score));
  const score = hasScorableAutoEvidence([taskScore, documentationScore])
    ? averageScores([taskScore, documentationScore, npsScore])
    : null;

  return {
    score,
    breakdown: {
      mode: 'hybrid',
      issueCount: relevant.length,
      components: {
        taskAccuracy: {
          score: taskScore,
          eligibleSubtaskCount: scoredTasks.length,
          rawEligibleSubtaskCount: eligibleTasks.length,
          onTimeSubtaskCount,
          lateSubtaskCount,
          openSubtaskCount,
          excusedBlockedSubtaskCount,
          onTimePct: onTimePct === null ? null : Number(onTimePct.toFixed(2)),
          items: taskItems,
        },
        documentation: {
          score: documentationScore,
          expectedDocCount: REQUIRED_IMPL_DOCS.length,
          foundDocCount,
          lateDocCount,
          missingDocCount,
          matchedDocs: docStatus,
          applicable: documentationApplicable,
        },
        nps: {
          score: npsScore,
          source: 'kpi_nps',
          itemCount: npsItems.length,
          filledCount: npsItems.filter((item) => item.filled).length,
          missingCount: npsItems.filter((item) => !item.filled).length,
          items: npsItems,
        },
      },
    },
  };
};

const computePreventiveMaintenanceDomain = (
  issues: Awaited<ReturnType<typeof searchJiraIssues>>,
  parentDueDates: Map<string, string | null>,
  period: QuarterRange
) => {
  const relevant = issues.filter((issue) => isProjectPrefix(issue.projectName, '[MA]'));
  if (!relevant.length) {
    return {
      score: null,
      breakdown: {
        mode: 'auto',
        parentCount: 0,
        components: {
          execution: { score: null, itemCount: 0, items: [] as any[] },
          report: { score: null, itemCount: 0, items: [] as any[] },
        },
      },
    };
  }

  const grouped = new Map<string, typeof relevant>();
  for (const issue of relevant) {
    const key = issue.parentId || issue.parentKey || issue.key;
    const current = grouped.get(key) || [];
    current.push(issue);
    grouped.set(key, current);
  }

  const execItems: any[] = [];
  const reportItems: any[] = [];
  let applicableParentCount = 0;

  for (const [parentRef, group] of grouped.entries()) {
    const parentDueDate = parentDueDates.get(parentRef) || null;
    if (!inQuarter(parentDueDate, period)) {
      continue;
    }
    applicableParentCount += 1;

    const job = group
      .filter((issue) => normalizeSummary(issue.summary).startsWith('pekerjaan pm'))
      .sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || '')))[0];
    const report = group
      .filter((issue) => normalizeSummary(issue.summary).startsWith('report pm'))
      .sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || '')))[0];

    if (job) {
      const jobActualEndAt = toIsoDate(job.actualEndDate);
      const lateMinutes = diffMinutesFromDueEnd(job.dueDate, jobActualEndAt);
      const blockingBugLinks = getBlockingBugLinks(job);
      const excusedByBlocker = isExcusedByBlockingBug(job, job.dueDate, jobActualEndAt);
      const score = excusedByBlocker
        ? null
        : jobActualEndAt
          ? pmExecutionScore(lateMinutes)
          : (isDueDatePassed(job.dueDate) ? -1 : null);
      execItems.push({
        parentRef,
        parentDueDate,
        issueKey: job.key,
        dueDate: job.dueDate,
        actualEndAt: jobActualEndAt,
        doneAt: jobActualEndAt,
        lateMinutes: roundScore(lateMinutes),
        lateHuman: formatHumanDuration(lateMinutes),
        score,
        blockedByBug: blockingBugLinks.length > 0,
        excusedByBlocker,
        blockingBugs: blockingBugLinks.map((link) => ({ issueKey: link.key, statusName: link.statusName })),
        pendingWithinDueDate: !jobActualEndAt && !isDueDatePassed(job.dueDate),
      });
    }

    const relatedJobActualEndAt = job ? toIsoDate(job.actualEndDate) : null;
    const reportActualEndAt = report ? toIsoDate(report.actualEndDate) : null;
    const reportDays = businessDaysBetween(relatedJobActualEndAt, reportActualEndAt);
    const reportDueDate = report?.dueDate || parentDueDate;
    const reportBlockingBugLinks = report ? getBlockingBugLinks(report) : [];
    const reportExcusedByBlocker = report ? isExcusedByBlockingBug(report, reportDueDate, reportActualEndAt) : false;
    const reportScore = !report
      ? 4
      : reportExcusedByBlocker
        ? null
        : reportActualEndAt
          ? pmReportScore(reportDays)
          : (isDueDatePassed(reportDueDate) ? -1 : null);
    reportItems.push({
      parentRef,
      parentDueDate,
      issueKey: report?.key || null,
      dueDate: reportDueDate,
      actualPmEndAt: relatedJobActualEndAt,
      actualPmDoneAt: relatedJobActualEndAt,
      reportActualEndAt,
      reportDoneAt: reportActualEndAt,
      businessDaysLate: reportDays,
      score: reportScore,
      assumedByPolicy: !report,
      blockedByBug: reportBlockingBugLinks.length > 0,
      excusedByBlocker: reportExcusedByBlocker,
      blockingBugs: reportBlockingBugLinks.map((link) => ({ issueKey: link.key, statusName: link.statusName })),
      pendingWithinDueDate: !!report && !reportActualEndAt && !isDueDatePassed(reportDueDate),
    });
  }

  const executionScore = averageScores(execItems.map((item) => item.score));
  const reportScore = averageScores(reportItems.map((item) => item.score));
  const score = hasScorableAutoEvidence([executionScore, reportScore])
    ? averageScores([executionScore, reportScore])
    : null;

  return {
    score,
    breakdown: {
      mode: 'hybrid',
      parentCount: applicableParentCount,
      components: {
        execution: {
          score: executionScore,
          itemCount: execItems.length,
          items: execItems,
        },
        report: {
          score: reportScore,
          itemCount: reportItems.length,
          items: reportItems,
        },
      },
    },
  };
};

const computeCorrectiveMaintenanceDomain = (issues: Awaited<ReturnType<typeof searchJiraIssues>>) => {
  const relevant = issues.filter((issue) => {
    const issueType = normalizeSummary(issue.issueTypeName);
    return isSupportKey(issue.key) && issueType === '[system] problem';
  });
  if (!relevant.length) {
    return {
      score: null,
      breakdown: {
        mode: 'auto',
        issueCount: 0,
        components: {
          response: { score: null, itemCount: 0, items: [] as any[] },
          resolution: { score: null, itemCount: 0, items: [] as any[] },
        },
      },
    };
  }

  const responseItems: any[] = [];
  const resolutionItems: any[] = [];

  for (const issue of relevant) {
    const comments = [...issue.comments].sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
    const firstCommentAt = comments[0]?.createdAt || null;
    const severity = parsePrioritySeverity(issue.priorityName);
    const hasFollowUp = issue.timeSpentSeconds > 0 || comments.length > 1 || !!issue.resolutionDate;

    let responseScore: number;
    if (!firstCommentAt && !hasFollowUp) {
      responseScore = -1;
    } else if (firstCommentAt && !hasFollowUp) {
      responseScore = 0;
    } else {
      responseScore = timeAgainstSlaScore(diffMinutes(issue.createdAt, firstCommentAt), 15) ?? 0;
    }

    let resolutionScore: number;
    const actualResolutionHours = diffHours(issue.actualStartDate, issue.actualEndDate);

    if (!firstCommentAt && !hasFollowUp && !issue.actualEndDate) {
      resolutionScore = -1;
    } else if (actualResolutionHours === null) {
      resolutionScore = 0;
    } else {
      const slaHours = severity === 1 ? 8 : severity === 2 ? 16 : 48;
      resolutionScore = timeAgainstSlaScore(actualResolutionHours, slaHours) ?? 0;
    }

    responseItems.push({
      issueKey: issue.key,
      priority: issue.priorityName,
      firstCommentAt,
      createdAt: issue.createdAt,
      actualMinutes: diffMinutes(issue.createdAt, firstCommentAt),
      score: responseScore,
    });

    resolutionItems.push({
      issueKey: issue.key,
      priority: issue.priorityName,
      severity,
      actualStartAt: issue.actualStartDate,
      actualEndAt: issue.actualEndDate,
      actualHours: roundScore(actualResolutionHours),
      score: resolutionScore,
    });
  }

  const responseScore = averageScores(responseItems.map((item) => item.score));
  const resolutionScore = averageScores(resolutionItems.map((item) => item.score));

  return {
    score: averageScores([responseScore, resolutionScore]),
    breakdown: {
      mode: 'auto',
      issueCount: relevant.length,
      components: {
        response: {
          score: responseScore,
          itemCount: responseItems.length,
          items: responseItems,
        },
        resolution: {
          score: resolutionScore,
          itemCount: resolutionItems.length,
          items: resolutionItems,
        },
      },
    },
  };
};

const computeEnhancementDomain = (issues: Awaited<ReturnType<typeof searchJiraIssues>>) => {
  const relevant = issues.filter((issue) => {
    const issueType = normalizeSummary(issue.issueTypeName);
    return isSupportKey(issue.key) && issueType === '[system] change';
  });
  if (!relevant.length) {
    return {
      score: null,
      breakdown: {
        mode: 'auto',
        issueCount: 0,
        components: {
          response: { score: null, itemCount: 0, items: [] as any[] },
        },
      },
    };
  }

  const responseItems = relevant.map((issue) => {
    const comments = [...issue.comments].sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
    const firstCommentAt = comments[0]?.createdAt || null;
    const hasFollowUp = issue.timeSpentSeconds > 0 || comments.length > 1;

    let score: number;
    if (!firstCommentAt && !hasFollowUp) {
      score = -1;
    } else if (firstCommentAt && !hasFollowUp) {
      score = 0;
    } else {
      score = timeAgainstSlaScore(diffHours(issue.createdAt, firstCommentAt), 24) ?? 0;
    }

    return {
      issueKey: issue.key,
      createdAt: issue.createdAt,
      firstCommentAt,
      actualHours: roundScore(diffHours(issue.createdAt, firstCommentAt)),
      score,
    };
  });

  return {
    score: averageScores(responseItems.map((item) => item.score)),
    breakdown: {
      mode: 'auto',
      issueCount: relevant.length,
      components: {
        response: {
          score: averageScores(responseItems.map((item) => item.score)),
          itemCount: responseItems.length,
          items: responseItems,
        },
      },
    },
  };
};

const computeOperationalDomain = (
  subtasks: Awaited<ReturnType<typeof searchJiraIssues>>,
  parentTasks: Awaited<ReturnType<typeof searchJiraIssues>>,
  npsEntries: KpiNpsScoreInput[],
  manualScore: number | null
) => {
  const relevantParentKeys = new Set(parentTasks.filter((issue) => isProjectPrefix(issue.projectName, '[OP]')).map((issue) => issue.key));
  const relevantSubtasks = subtasks.filter((issue) => issue.parentKey && relevantParentKeys.has(issue.parentKey));
  const parentByKey = new Map(parentTasks.map((issue) => [issue.key, issue]));
  const grouped = new Map<string, typeof relevantSubtasks>();

  for (const issue of relevantSubtasks) {
    const key = issue.parentKey as string;
    const current = grouped.get(key) || [];
    current.push(issue);
    grouped.set(key, current);
  }

  const items = parentTasks
    .filter((issue) => relevantParentKeys.has(issue.key))
    .sort((left, right) => left.key.localeCompare(right.key))
    .map((parent) => [parent.key, grouped.get(parent.key) || []] as const)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([taskKey, children]) => {
      const parent = parentByKey.get(taskKey);
      const nps = npsEntries.find((entry) => entry.scope === 'op_task' && entry.jiraIssueKey === taskKey);
      return {
        taskKey,
        taskSummary: parent?.summary || null,
        projectKey: parent?.projectKey || children[0]?.projectKey || null,
        projectName: parent?.projectName || children[0]?.projectName || null,
        issueTypeName: parent?.issueTypeName || null,
        statusName: parent?.statusName || null,
        dueDate: parent?.dueDate || null,
        resolutionDate: parent?.resolutionDate || null,
        nps: {
          score: nps?.score ?? null,
          hasScore: nps?.score !== null && nps?.score !== undefined,
          comment: nps?.comment || null,
          updatedAt: nps?.updatedAt || null,
        },
        subtasks: children
          .sort((left, right) => left.key.localeCompare(right.key))
          .map((child) => ({
            issueKey: child.key,
            summary: child.summary,
            issueTypeName: child.issueTypeName,
            statusName: child.statusName,
            dueDate: child.dueDate,
            resolutionDate: child.resolutionDate,
            updatedAt: child.updatedAt,
            actualStartAt: child.actualStartDate,
            actualEndAt: child.actualEndDate,
          })),
      };
    });

  return {
    score: manualScore,
    breakdown: {
      mode: 'manual_with_jira_detail',
      taskCount: items.length,
      subtaskCount: relevantSubtasks.length,
      components: {
        overall: { score: manualScore, source: 'manual' },
        taskTree: {
          taskCount: items.length,
          subtaskCount: relevantSubtasks.length,
          items,
        },
      },
    },
  };
};

export const computeEngineerDeliveryKpi = async (
  profile: KpiProfileDef,
  user: KpiUser,
  period: QuarterRange,
  storedScorecard?: StoredScorecard | null,
  npsEntries: KpiNpsScoreInput[] = []
) => {
  const persistedState = parseEngineerDeliveryPersistedState(storedScorecard?.notes, storedScorecard?.scores);
  const manualInputs = persistedState.manualInputs;
  const domainNotes = persistedState.domainNotes;
  const lastAutomationSnapshot = persistedState.lastAutomationSnapshot;
  const completedJiraTaskCount = Math.max(0, Number(storedScorecard?.completedJiraTaskCount || 0));

  const fallbackScores: KpiScoreMap = {
    impl: null,
    pm: null,
    cm: null,
    enh: null,
    ops: manualInputs.opsScore,
  };
  const breakdown: EngineerDeliveryBreakdown = {
    impl: { mode: 'auto', issueCount: 0, components: { taskAccuracy: { score: null }, documentation: { score: null }, nps: { score: null, source: 'kpi_nps' } } },
    pm: { mode: 'auto', parentCount: 0, components: { execution: { score: null }, report: { score: null } } },
    cm: { mode: 'auto', issueCount: 0, components: { response: { score: null }, resolution: { score: null } } },
    enh: { mode: 'auto', issueCount: 0, components: { response: { score: null } } },
    ops: { mode: 'manual', components: { overall: { score: manualInputs.opsScore, source: 'manual' } } },
  };
  const warnings: string[] = [];

  if (!user.jiraAccountId) {
    warnings.push('User belum menghubungkan akun Jira. Domain otomatis belum bisa dihitung.');
    const summary = computeResolvedKpiSummary(profile, fallbackScores, { completedJiraTaskCount });
    return {
      ...summary,
      scores: fallbackScores,
      manualInputs,
      domainNotes,
      breakdown,
      automationWarnings: warnings,
      persistedNotes: buildEngineerDeliveryPersistedNotes(manualInputs, domainNotes, lastAutomationSnapshot),
    };
  }

  const subtaskJql = [
    `assignee = "${user.jiraAccountId}"`,
    'issuetype in subTaskIssueTypes()',
    `updated >= "${period.startDate}"`,
    `updated <= "${period.endDate}"`,
  ].join(' AND ');

  const supportJql = [
    `assignee = "${user.jiraAccountId}"`,
    'issuetype not in subTaskIssueTypes()',
    'issuetype != Epic',
    'issuekey ~ "SUP-"',
    `"Actual Start" >= "${period.startDate}"`,
    `"Actual Start" <= "${period.endDate}"`,
  ].join(' AND ');

  const opTaskJql = [
    `assignee = "${user.jiraAccountId}"`,
    'issuetype not in subTaskIssueTypes()',
    'issuetype != Epic',
    'project IS NOT EMPTY',
    `resolved >= "${period.startDate}"`,
    `resolved <= "${period.endDate}"`,
    'statusCategory = Done',
  ].join(' AND ');

  let subtasks;
  let supportIssues;
  let opTaskCandidates;
  let pmParents;
  let implParents;
  let opParents;
  try {
    [subtasks, supportIssues, opTaskCandidates] = await Promise.all([
      searchJiraIssues({
        jql: `${subtaskJql} ORDER BY updated DESC`,
        fields: ['summary', 'issuetype', 'project', 'assignee', 'parent', 'duedate', 'resolutiondate', 'created', 'updated', 'status'],
      }),
      searchJiraIssues({
        jql: `${supportJql} ORDER BY updated DESC`,
        fields: ['summary', 'issuetype', 'project', 'assignee', 'created', 'updated', 'resolutiondate', 'status', 'priority', 'comment', 'timespent'],
      }),
      searchJiraIssues({
        jql: `${opTaskJql} ORDER BY resolved DESC`,
        fields: ['summary', 'issuetype', 'project', 'status', 'parent', 'duedate', 'resolutiondate', 'assignee'],
      }),
    ]);
    const parentKeys = Array.from(
      new Set(
        subtasks
          .filter((issue) => isProjectPrefix(issue.projectName, '[MA]') && issue.parentKey)
          .map((issue) => issue.parentKey as string)
      )
    );
    pmParents = parentKeys.length
      ? await searchJiraIssues({
          jql: `issuekey in (${parentKeys.map((key) => `"${key}"`).join(',')})`,
          fields: ['summary', 'issuetype', 'project', 'status', 'duedate'],
        })
      : [];
    const implParentKeys = Array.from(
      new Set(
        subtasks
          .filter((issue) => isProjectPrefix(issue.projectName, '[IMP]') && issue.parentKey)
          .map((issue) => issue.parentKey as string)
      )
    );
    implParents = implParentKeys.length
      ? await searchJiraIssues({
          jql: `issuekey in (${implParentKeys.map((key) => `"${key}"`).join(',')})`,
          fields: ['summary', 'issuetype', 'project', 'status', 'parent'],
        })
      : [];
    opParents = (opTaskCandidates || []).filter((issue) =>
      isProjectPrefix(issue.projectName, '[OP]')
      && normalizeSummary(issue.issueTypeName) !== 'bug'
    );
  } catch (error: any) {
    if (lastAutomationSnapshot) {
      warnings.push(`Jira automation fallback aktif. Snapshot terakhir dipakai karena kalkulasi terbaru gagal: ${error?.message || 'Unknown Jira error'}`);
      const scores: KpiScoreMap = {
        ...lastAutomationSnapshot.scores,
        ops: manualInputs.opsScore,
      };
      const summary = computeResolvedKpiSummary(profile, scores, { completedJiraTaskCount });
      const fallbackBreakdown = {
        ...lastAutomationSnapshot.breakdown,
        ops: { mode: 'manual', components: { overall: { score: manualInputs.opsScore, source: 'manual' } } },
      };
      return {
        ...summary,
        scores,
        manualInputs,
        domainNotes,
        breakdown: fallbackBreakdown,
        automationWarnings: warnings,
        persistedNotes: buildEngineerDeliveryPersistedNotes(manualInputs, domainNotes, lastAutomationSnapshot),
      };
    }
    warnings.push(`Kalkulasi Jira belum bisa dijalankan: ${error?.message || 'Unknown Jira error'}`);
    const summary = computeResolvedKpiSummary(profile, fallbackScores, { completedJiraTaskCount });
    return {
      ...summary,
      scores: fallbackScores,
      manualInputs,
      domainNotes,
      breakdown,
      automationWarnings: warnings,
      persistedNotes: buildEngineerDeliveryPersistedNotes(manualInputs, domainNotes, null),
    };
  }

  const implParentEpicKeys = new Map<string, string | null>(
    (implParents || []).map((issue) => [issue.key, issue.parentKey || null] as const)
  );
  const implementation = computeImplementationDomain(subtasks, npsEntries, period, implParentEpicKeys);
  const pmParentDueDates = new Map<string, string | null>(
    (pmParents || []).flatMap((issue) => [
      [issue.key, issue.dueDate || null] as const,
      [issue.id, issue.dueDate || null] as const,
    ])
  );
  const preventiveMaintenance = computePreventiveMaintenanceDomain(subtasks, pmParentDueDates, period);
  const supportIssuesInQuarter = supportIssues.filter((issue) => inQuarter(issue.actualStartDate, period));
  const supportIssueDebug = supportIssues.map((issue) => ({
    issueKey: issue.key,
    issueTypeName: issue.issueTypeName,
    requestType: issue.workTypeName,
    actualStartDate: issue.actualStartDate,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
    inQuarterByActualStart: inQuarter(issue.actualStartDate, period),
  }));
  const correctiveMaintenance = computeCorrectiveMaintenanceDomain(supportIssuesInQuarter);
  const enhancement = computeEnhancementDomain(supportIssuesInQuarter);
  const operational = computeOperationalDomain(subtasks, opParents || [], npsEntries, manualInputs.opsScore);

  const scores: KpiScoreMap = {
    impl: implementation.score,
    pm: preventiveMaintenance.score,
    cm: correctiveMaintenance.score,
    enh: enhancement.score,
    ops: operational.score,
  };

  breakdown.impl = implementation.breakdown;
  breakdown.pm = preventiveMaintenance.breakdown;
  breakdown.cm = {
    ...correctiveMaintenance.breakdown,
    debug: {
      totalSupportCandidates: supportIssues.length,
      inQuarterCandidates: supportIssuesInQuarter.length,
      rawIssues: supportIssueDebug,
    },
  };
  breakdown.enh = {
    ...enhancement.breakdown,
    debug: {
      totalSupportCandidates: supportIssues.length,
      inQuarterCandidates: supportIssuesInQuarter.length,
      rawIssues: supportIssueDebug,
    },
  };
  breakdown.ops = operational.breakdown;

  const summary = computeResolvedKpiSummary(profile, scores, { completedJiraTaskCount });
  const currentSnapshot = {
    scores: {
      impl: scores.impl,
      pm: scores.pm,
      cm: scores.cm,
      enh: scores.enh,
      ops: null,
    },
    breakdown: {
      impl: breakdown.impl,
      pm: breakdown.pm,
      cm: breakdown.cm,
      enh: breakdown.enh,
    },
    computedAt: new Date().toISOString(),
  };
  return {
    ...summary,
    scores,
    manualInputs,
    domainNotes,
    breakdown,
    automationWarnings: warnings,
    persistedNotes: buildEngineerDeliveryPersistedNotes(manualInputs, domainNotes, currentSnapshot),
  };
};

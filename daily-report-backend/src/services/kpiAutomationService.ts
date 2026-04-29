import { searchJiraIssues } from './jiraService';
import { KpiProfileDef, KpiScoreMap, computeResolvedKpiSummary } from '../utils/kpiManual';

export type EngineerDeliveryManualInputs = {
  implNps: number | null;
  pmNps: number | null;
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

const REQUIRED_IMPL_DOCS = [
  'Method Of Produce',
  'System Requirement Document',
  'Training Module',
  'Installation & Configuration Guide',
  'Administrator Guide',
];

const normalizeSummary = (value: string | null | undefined) => String(value || '').trim().toLowerCase();
const inQuarter = (dateValue: string | null | undefined, period: QuarterRange) => Boolean(dateValue && dateValue >= period.startDate && dateValue <= period.endDate);

const toIsoDate = (value: string | null | undefined) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const endOfDueDate = (value: string | null) => {
  if (!value) return null;
  return new Date(`${value}T23:59:59.999Z`);
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

const averageScores = (values: Array<number | null | undefined>) => {
  const filtered = values.filter((value): value is number => value !== null && value !== undefined);
  if (!filtered.length) return null;
  if (filtered.some((value) => value === -1)) return -1;
  return roundScore(filtered.reduce((sum, value) => sum + value, 0) / filtered.length);
};

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
        pmNps: normalizeManualScore(typed.manualInputs?.pmNps, 3),
        opsScore: normalizeManualScore(typed.manualInputs?.opsScore, null),
      },
      domainNotes: normalizeDomainNotes(typed.domainNotes),
      lastAutomationSnapshot: typed.lastAutomationSnapshot || null,
    };
  }

  return {
    manualInputs: {
      implNps: 3,
      pmNps: 3,
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

const pmExecutionScore = (lateDays: number | null) => {
  if (lateDays === null) return null;
  if (lateDays <= 0) return 4;
  if (lateDays <= 7) return 3;
  if (lateDays <= 14) return 2;
  if (lateDays <= 28) return 1;
  return 0;
};

const pmReportScore = (businessDays: number | null) => {
  if (businessDays === null) return -1;
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

const computeImplementationDomain = (issues: Awaited<ReturnType<typeof searchJiraIssues>>, implNps: number | null) => {
  const relevant = issues.filter((issue) => isProjectPrefix(issue.projectName, '[IMP]'));
  if (!relevant.length) {
    return {
      score: null,
      breakdown: {
        mode: 'auto',
        issueCount: 0,
        components: {
          taskAccuracy: { score: null, eligibleSubtaskCount: 0, onTimeSubtaskCount: 0, lateSubtaskCount: 0, openSubtaskCount: 0, onTimePct: null },
          documentation: { score: null, expectedDocCount: REQUIRED_IMPL_DOCS.length, foundDocCount: 0, lateDocCount: 0, missingDocCount: REQUIRED_IMPL_DOCS.length, matchedDocs: [] },
          nps: { score: implNps, source: 'manual' },
        },
      },
    };
  }

  const eligibleTasks = relevant.filter((issue) => !!issue.dueDate);
  const taskItems = eligibleTasks.map((issue) => {
    const doneAt = toIsoDate(issue.resolutionDate);
    const due = endOfDueDate(issue.dueDate);
    const onTime = Boolean(doneAt && due && new Date(doneAt) <= due);
    return {
      issueKey: issue.key,
      summary: issue.summary,
      dueDate: issue.dueDate,
      doneAt,
      onTime,
    };
  });
  const onTimeSubtaskCount = eligibleTasks.filter((issue) => {
    const doneAt = toIsoDate(issue.resolutionDate);
    const due = endOfDueDate(issue.dueDate);
    return doneAt && due && new Date(doneAt) <= due;
  }).length;
  const lateSubtaskCount = eligibleTasks.filter((issue) => {
    const doneAt = toIsoDate(issue.resolutionDate);
    const due = endOfDueDate(issue.dueDate);
    return doneAt && due && new Date(doneAt) > due;
  }).length;
  const openSubtaskCount = eligibleTasks.filter((issue) => !toIsoDate(issue.resolutionDate)).length;
  const onTimePct = eligibleTasks.length ? (onTimeSubtaskCount / eligibleTasks.length) * 100 : null;
  const taskScore = onTimePct === null ? null : implementationTaskScore(onTimePct);

  const docStatus = REQUIRED_IMPL_DOCS.map((docName) => {
    const matches = relevant.filter((issue) => normalizeSummary(issue.summary) === normalizeSummary(docName));
    const present = matches.length > 0;
    const hasOnTime = matches.some((issue) => {
      const doneAt = toIsoDate(issue.resolutionDate);
      const due = endOfDueDate(issue.dueDate);
      return doneAt && due && new Date(doneAt) <= due;
    });
    return {
      name: docName,
      present,
      onTime: hasOnTime,
    };
  });

  const foundDocCount = docStatus.filter((doc) => doc.present).length;
  const missingDocCount = docStatus.filter((doc) => !doc.present).length;
  const lateDocCount = docStatus.filter((doc) => doc.present && !doc.onTime).length;
  const documentationScore = foundDocCount === 0 ? -1 : (missingDocCount === 0 && lateDocCount === 0 ? 4 : 3);
  const score = averageScores([taskScore, documentationScore, implNps]);

  return {
    score,
    breakdown: {
      mode: 'hybrid',
      issueCount: relevant.length,
      components: {
        taskAccuracy: {
          score: taskScore,
          eligibleSubtaskCount: eligibleTasks.length,
          onTimeSubtaskCount,
          lateSubtaskCount,
          openSubtaskCount,
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
        },
        nps: { score: implNps, source: 'manual' },
      },
    },
  };
};

const computePreventiveMaintenanceDomain = (
  issues: Awaited<ReturnType<typeof searchJiraIssues>>,
  parentStartDates: Map<string, string | null>,
  period: QuarterRange,
  pmNps: number | null
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
          nps: { score: pmNps, source: 'manual' },
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
    const parentStartDate = parentStartDates.get(parentRef) || null;
    if (!inQuarter(parentStartDate, period)) {
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
      const jobDoneAt = toIsoDate(job.resolutionDate);
      const lateDays = diffDaysFromDue(job.dueDate, jobDoneAt);
      const score = jobDoneAt ? pmExecutionScore(lateDays) : -1;
      execItems.push({
        parentRef,
        parentStartDate,
        issueKey: job.key,
        dueDate: job.dueDate,
        doneAt: jobDoneAt,
        lateDays,
        score,
      });
    }

    const relatedJobDoneAt = job ? toIsoDate(job.resolutionDate) : null;
    const reportDoneAt = report ? toIsoDate(report.resolutionDate) : null;
    const reportDays = businessDaysBetween(relatedJobDoneAt, reportDoneAt);
    const reportScore = report ? pmReportScore(reportDays) : -1;
    reportItems.push({
      parentRef,
      parentStartDate,
      issueKey: report?.key || null,
      actualPmDoneAt: relatedJobDoneAt,
      reportDoneAt,
      businessDaysLate: reportDays,
      score: reportScore,
    });
  }

  const executionScore = averageScores(execItems.map((item) => item.score));
  const reportScore = averageScores(reportItems.map((item) => item.score));
  const score = averageScores([executionScore, reportScore, pmNps]);

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
        nps: { score: pmNps, source: 'manual' },
      },
    },
  };
};

const computeCorrectiveMaintenanceDomain = (issues: Awaited<ReturnType<typeof searchJiraIssues>>) => {
  const relevant = issues.filter((issue) => {
    const workType = normalizeSummary(issue.workTypeName);
    return isProjectPrefix(issue.projectName, '(SUP)') && workType.includes('problem');
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
    if (!firstCommentAt && !hasFollowUp) {
      resolutionScore = -1;
    } else {
      const actualHours = severity >= 3
        ? (issue.timeSpentSeconds > 0 ? issue.timeSpentSeconds / 3600 : null)
        : diffHours(firstCommentAt, issue.resolutionDate);

      if (actualHours === null) {
        resolutionScore = 0;
      } else {
        const slaHours = severity === 1 ? 8 : severity === 2 ? 16 : 48;
        resolutionScore = timeAgainstSlaScore(actualHours, slaHours) ?? 0;
      }
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
      resolutionAt: issue.resolutionDate,
      timeSpentHours: roundScore(issue.timeSpentSeconds > 0 ? issue.timeSpentSeconds / 3600 : null),
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
    const workType = normalizeSummary(issue.workTypeName);
    return isProjectPrefix(issue.projectName, '(SUP)')
      && (workType.includes('request changes and enhancement') || workType.includes('enhancement') || workType.includes('change'));
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

export const computeEngineerDeliveryKpi = async (
  profile: KpiProfileDef,
  user: KpiUser,
  period: QuarterRange,
  storedScorecard?: StoredScorecard | null
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
    impl: { mode: 'auto', issueCount: 0, components: { taskAccuracy: { score: null }, documentation: { score: null }, nps: { score: manualInputs.implNps, source: 'manual' } } },
    pm: { mode: 'auto', parentCount: 0, components: { execution: { score: null }, report: { score: null }, nps: { score: manualInputs.pmNps, source: 'manual' } } },
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
    `updated >= "${period.startDate}"`,
    `updated <= "${period.endDate}"`,
  ].join(' AND ');

  let subtasks;
  let supportIssues;
  let pmParents;
  try {
    [subtasks, supportIssues] = await Promise.all([
      searchJiraIssues({
        jql: `${subtaskJql} ORDER BY updated DESC`,
        fields: ['summary', 'issuetype', 'project', 'assignee', 'parent', 'duedate', 'resolutiondate', 'created', 'updated', 'status'],
      }),
      searchJiraIssues({
        jql: `${supportJql} ORDER BY updated DESC`,
        fields: ['summary', 'issuetype', 'project', 'assignee', 'created', 'updated', 'resolutiondate', 'status', 'priority', 'comment', 'timespent'],
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
          fields: ['summary', 'issuetype', 'project', 'status'],
        })
      : [];
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

  const implementation = computeImplementationDomain(subtasks, manualInputs.implNps);
  const pmParentStartDates = new Map<string, string | null>(
    (pmParents || []).flatMap((issue) => [
      [issue.key, issue.startDate || null] as const,
      [issue.id, issue.startDate || null] as const,
    ])
  );
  const preventiveMaintenance = computePreventiveMaintenanceDomain(subtasks, pmParentStartDates, period, manualInputs.pmNps);
  const correctiveMaintenance = computeCorrectiveMaintenanceDomain(supportIssues);
  const enhancement = computeEnhancementDomain(supportIssues);

  const scores: KpiScoreMap = {
    impl: implementation.score,
    pm: preventiveMaintenance.score,
    cm: correctiveMaintenance.score,
    enh: enhancement.score,
    ops: manualInputs.opsScore,
  };

  breakdown.impl = implementation.breakdown;
  breakdown.pm = preventiveMaintenance.breakdown;
  breakdown.cm = correctiveMaintenance.breakdown;
  breakdown.enh = enhancement.breakdown;

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

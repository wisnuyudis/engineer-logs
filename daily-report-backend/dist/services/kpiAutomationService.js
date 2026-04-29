"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeEngineerDeliveryKpi = exports.buildEngineerDeliveryPersistedNotes = exports.parseEngineerDeliveryPersistedState = void 0;
const jiraService_1 = require("./jiraService");
const kpiManual_1 = require("../utils/kpiManual");
const REQUIRED_IMPL_DOCS = [
    'Method Of Produce',
    'System Requirement Document',
    'Training Module',
    'Installation & Configuration Guide',
    'Administrator Guide',
];
const normalizeSummary = (value) => String(value || '').trim().toLowerCase();
const inQuarter = (dateValue, period) => Boolean(dateValue && dateValue >= period.startDate && dateValue <= period.endDate);
const toIsoDate = (value) => {
    if (!value)
        return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
const endOfDueDate = (value) => {
    if (!value)
        return null;
    return new Date(`${value}T23:59:59.999Z`);
};
const diffMinutes = (start, end) => {
    if (!start || !end)
        return null;
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()))
        return null;
    return (endDate.getTime() - startDate.getTime()) / 60000;
};
const diffHours = (start, end) => {
    const minutes = diffMinutes(start, end);
    return minutes === null ? null : minutes / 60;
};
const diffDaysFromDue = (dueDate, actualIso) => {
    if (!dueDate || !actualIso)
        return null;
    const due = endOfDueDate(dueDate);
    const actual = new Date(actualIso);
    if (!due || Number.isNaN(actual.getTime()))
        return null;
    return Math.floor((actual.getTime() - due.getTime()) / 86400000);
};
const businessDaysBetween = (startIso, endIso) => {
    if (!startIso || !endIso)
        return null;
    const start = new Date(startIso);
    const end = new Date(endIso);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()))
        return null;
    if (end < start)
        return 0;
    const cursor = new Date(start);
    cursor.setUTCHours(0, 0, 0, 0);
    const last = new Date(end);
    last.setUTCHours(0, 0, 0, 0);
    let count = 0;
    while (cursor < last) {
        cursor.setUTCDate(cursor.getUTCDate() + 1);
        const day = cursor.getUTCDay();
        if (day !== 0 && day !== 6)
            count += 1;
    }
    return count;
};
const roundScore = (value) => value === null ? null : Number(value.toFixed(2));
const averageScores = (values) => {
    const filtered = values.filter((value) => value !== null && value !== undefined);
    if (!filtered.length)
        return null;
    if (filtered.some((value) => value === -1))
        return -1;
    return roundScore(filtered.reduce((sum, value) => sum + value, 0) / filtered.length);
};
const normalizeManualScore = (value, fallback = null) => {
    if (value === null || value === undefined || value === '')
        return fallback;
    const num = Number(value);
    if (!Number.isFinite(num) || num < -1 || num > 4) {
        throw new Error('Nilai manual KPI harus berada di antara -1 sampai 4.');
    }
    return roundScore(num);
};
const normalizeDomainNotes = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return {};
    return Object.fromEntries(Object.entries(value).map(([key, note]) => [key, String(note || '')]));
};
const parseLegacyNotes = (rawNotes) => {
    if (!rawNotes || typeof rawNotes !== 'object' || Array.isArray(rawNotes))
        return {};
    return rawNotes;
};
const parseEngineerDeliveryPersistedState = (rawNotes, rawScores) => {
    const legacyNotes = parseLegacyNotes(rawNotes);
    const scored = rawScores && typeof rawScores === 'object' && !Array.isArray(rawScores)
        ? rawScores
        : {};
    if (rawNotes &&
        typeof rawNotes === 'object' &&
        !Array.isArray(rawNotes) &&
        rawNotes.version === 'engineer_delivery_v1') {
        const typed = rawNotes;
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
exports.parseEngineerDeliveryPersistedState = parseEngineerDeliveryPersistedState;
const buildEngineerDeliveryPersistedNotes = (manualInputs, domainNotes, lastAutomationSnapshot = null) => ({
    version: 'engineer_delivery_v1',
    manualInputs,
    domainNotes,
    lastAutomationSnapshot,
});
exports.buildEngineerDeliveryPersistedNotes = buildEngineerDeliveryPersistedNotes;
const isProjectPrefix = (projectName, prefix) => String(projectName || '').toUpperCase().startsWith(prefix);
const implementationTaskScore = (onTimePct) => {
    if (onTimePct >= 90)
        return 4;
    if (onTimePct >= 75)
        return 3;
    if (onTimePct >= 50)
        return 2;
    if (onTimePct >= 25)
        return 1;
    return 0;
};
const pmExecutionScore = (lateDays) => {
    if (lateDays === null)
        return null;
    if (lateDays <= 0)
        return 4;
    if (lateDays <= 7)
        return 3;
    if (lateDays <= 14)
        return 2;
    if (lateDays <= 28)
        return 1;
    return 0;
};
const pmReportScore = (businessDays) => {
    if (businessDays === null)
        return -1;
    if (businessDays <= 3)
        return 4;
    if (businessDays <= 5)
        return 3;
    if (businessDays <= 10)
        return 2;
    if (businessDays <= 15)
        return 1;
    return 0;
};
const timeAgainstSlaScore = (actual, sla) => {
    if (actual === null)
        return null;
    if (actual <= sla)
        return 4;
    if (actual <= sla * 2)
        return 3;
    if (actual <= sla * 3)
        return 2;
    return 1;
};
const parsePrioritySeverity = (priorityName) => {
    const normalized = normalizeSummary(priorityName);
    if (normalized.includes('tingkat 1') || normalized.includes('critical') || normalized.includes('highest') || normalized.includes('urgent'))
        return 1;
    if (normalized.includes('tingkat 2') || normalized.includes('high') || normalized.includes('major'))
        return 2;
    if (normalized.includes('tingkat 3') || normalized.includes('medium') || normalized.includes('normal'))
        return 3;
    return 4;
};
const computeImplementationDomain = (issues, implNps) => {
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
const computePreventiveMaintenanceDomain = (issues, parentDueDates, period, pmNps) => {
    const relevant = issues.filter((issue) => isProjectPrefix(issue.projectName, '[MA]'));
    if (!relevant.length) {
        return {
            score: null,
            breakdown: {
                mode: 'auto',
                parentCount: 0,
                components: {
                    execution: { score: null, itemCount: 0, items: [] },
                    report: { score: null, itemCount: 0, items: [] },
                    nps: { score: pmNps, source: 'manual' },
                },
            },
        };
    }
    const grouped = new Map();
    for (const issue of relevant) {
        const key = issue.parentId || issue.parentKey || issue.key;
        const current = grouped.get(key) || [];
        current.push(issue);
        grouped.set(key, current);
    }
    const execItems = [];
    const reportItems = [];
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
            const jobDoneAt = toIsoDate(job.resolutionDate);
            const lateDays = diffDaysFromDue(job.dueDate, jobDoneAt);
            const score = jobDoneAt ? pmExecutionScore(lateDays) : -1;
            execItems.push({
                parentRef,
                parentDueDate,
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
            parentDueDate,
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
const computeCorrectiveMaintenanceDomain = (issues) => {
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
                    response: { score: null, itemCount: 0, items: [] },
                    resolution: { score: null, itemCount: 0, items: [] },
                },
            },
        };
    }
    const responseItems = [];
    const resolutionItems = [];
    for (const issue of relevant) {
        const comments = [...issue.comments].sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
        const firstCommentAt = comments[0]?.createdAt || null;
        const severity = parsePrioritySeverity(issue.priorityName);
        const hasFollowUp = issue.timeSpentSeconds > 0 || comments.length > 1 || !!issue.resolutionDate;
        let responseScore;
        if (!firstCommentAt && !hasFollowUp) {
            responseScore = -1;
        }
        else if (firstCommentAt && !hasFollowUp) {
            responseScore = 0;
        }
        else {
            responseScore = timeAgainstSlaScore(diffMinutes(issue.createdAt, firstCommentAt), 15) ?? 0;
        }
        let resolutionScore;
        if (!firstCommentAt && !hasFollowUp) {
            resolutionScore = -1;
        }
        else {
            const actualHours = severity >= 3
                ? (issue.timeSpentSeconds > 0 ? issue.timeSpentSeconds / 3600 : null)
                : diffHours(firstCommentAt, issue.resolutionDate);
            if (actualHours === null) {
                resolutionScore = 0;
            }
            else {
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
const computeEnhancementDomain = (issues) => {
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
                    response: { score: null, itemCount: 0, items: [] },
                },
            },
        };
    }
    const responseItems = relevant.map((issue) => {
        const comments = [...issue.comments].sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
        const firstCommentAt = comments[0]?.createdAt || null;
        const hasFollowUp = issue.timeSpentSeconds > 0 || comments.length > 1;
        let score;
        if (!firstCommentAt && !hasFollowUp) {
            score = -1;
        }
        else if (firstCommentAt && !hasFollowUp) {
            score = 0;
        }
        else {
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
const computeEngineerDeliveryKpi = async (profile, user, period, storedScorecard) => {
    const persistedState = (0, exports.parseEngineerDeliveryPersistedState)(storedScorecard?.notes, storedScorecard?.scores);
    const manualInputs = persistedState.manualInputs;
    const domainNotes = persistedState.domainNotes;
    const lastAutomationSnapshot = persistedState.lastAutomationSnapshot;
    const completedJiraTaskCount = Math.max(0, Number(storedScorecard?.completedJiraTaskCount || 0));
    const fallbackScores = {
        impl: null,
        pm: null,
        cm: null,
        enh: null,
        ops: manualInputs.opsScore,
    };
    const breakdown = {
        impl: { mode: 'auto', issueCount: 0, components: { taskAccuracy: { score: null }, documentation: { score: null }, nps: { score: manualInputs.implNps, source: 'manual' } } },
        pm: { mode: 'auto', parentCount: 0, components: { execution: { score: null }, report: { score: null }, nps: { score: manualInputs.pmNps, source: 'manual' } } },
        cm: { mode: 'auto', issueCount: 0, components: { response: { score: null }, resolution: { score: null } } },
        enh: { mode: 'auto', issueCount: 0, components: { response: { score: null } } },
        ops: { mode: 'manual', components: { overall: { score: manualInputs.opsScore, source: 'manual' } } },
    };
    const warnings = [];
    if (!user.jiraAccountId) {
        warnings.push('User belum menghubungkan akun Jira. Domain otomatis belum bisa dihitung.');
        const summary = (0, kpiManual_1.computeResolvedKpiSummary)(profile, fallbackScores, { completedJiraTaskCount });
        return {
            ...summary,
            scores: fallbackScores,
            manualInputs,
            domainNotes,
            breakdown,
            automationWarnings: warnings,
            persistedNotes: (0, exports.buildEngineerDeliveryPersistedNotes)(manualInputs, domainNotes, lastAutomationSnapshot),
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
            (0, jiraService_1.searchJiraIssues)({
                jql: `${subtaskJql} ORDER BY updated DESC`,
                fields: ['summary', 'issuetype', 'project', 'assignee', 'parent', 'duedate', 'resolutiondate', 'created', 'updated', 'status'],
            }),
            (0, jiraService_1.searchJiraIssues)({
                jql: `${supportJql} ORDER BY updated DESC`,
                fields: ['summary', 'issuetype', 'project', 'assignee', 'created', 'updated', 'resolutiondate', 'status', 'priority', 'comment', 'timespent'],
            }),
        ]);
        const parentKeys = Array.from(new Set(subtasks
            .filter((issue) => isProjectPrefix(issue.projectName, '[MA]') && issue.parentKey)
            .map((issue) => issue.parentKey)));
        pmParents = parentKeys.length
            ? await (0, jiraService_1.searchJiraIssues)({
                jql: `issuekey in (${parentKeys.map((key) => `"${key}"`).join(',')})`,
                fields: ['summary', 'issuetype', 'project', 'status', 'duedate'],
            })
            : [];
    }
    catch (error) {
        if (lastAutomationSnapshot) {
            warnings.push(`Jira automation fallback aktif. Snapshot terakhir dipakai karena kalkulasi terbaru gagal: ${error?.message || 'Unknown Jira error'}`);
            const scores = {
                ...lastAutomationSnapshot.scores,
                ops: manualInputs.opsScore,
            };
            const summary = (0, kpiManual_1.computeResolvedKpiSummary)(profile, scores, { completedJiraTaskCount });
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
                persistedNotes: (0, exports.buildEngineerDeliveryPersistedNotes)(manualInputs, domainNotes, lastAutomationSnapshot),
            };
        }
        warnings.push(`Kalkulasi Jira belum bisa dijalankan: ${error?.message || 'Unknown Jira error'}`);
        const summary = (0, kpiManual_1.computeResolvedKpiSummary)(profile, fallbackScores, { completedJiraTaskCount });
        return {
            ...summary,
            scores: fallbackScores,
            manualInputs,
            domainNotes,
            breakdown,
            automationWarnings: warnings,
            persistedNotes: (0, exports.buildEngineerDeliveryPersistedNotes)(manualInputs, domainNotes, null),
        };
    }
    const implementation = computeImplementationDomain(subtasks, manualInputs.implNps);
    const pmParentDueDates = new Map((pmParents || []).flatMap((issue) => [
        [issue.key, issue.dueDate || null],
        [issue.id, issue.dueDate || null],
    ]));
    const preventiveMaintenance = computePreventiveMaintenanceDomain(subtasks, pmParentDueDates, period, manualInputs.pmNps);
    const correctiveMaintenance = computeCorrectiveMaintenanceDomain(supportIssues);
    const enhancement = computeEnhancementDomain(supportIssues);
    const scores = {
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
    const summary = (0, kpiManual_1.computeResolvedKpiSummary)(profile, scores, { completedJiraTaskCount });
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
        persistedNotes: (0, exports.buildEngineerDeliveryPersistedNotes)(manualInputs, domainNotes, currentSnapshot),
    };
};
exports.computeEngineerDeliveryKpi = computeEngineerDeliveryKpi;

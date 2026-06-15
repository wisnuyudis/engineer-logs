"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchUpcomingJiraScheduleByAssignee = exports.fetchKpiNpsCandidates = exports.searchJiraIssues = exports.fetchCompletedJiraTasksForQuarter = exports.fetchJiraWorklogsByIds = exports.fetchDeletedJiraWorklogChanges = exports.fetchUpdatedJiraWorklogChanges = exports.fetchJiraWorklog = exports.fetchJiraIssue = exports.fetchJiraTicket = exports.resolveJiraActKey = void 0;
const jiraFetch = async (pathname, options = {}) => {
    const baseUrl = process.env.JIRA_BASE_URL;
    const email = process.env.JIRA_USER_EMAIL;
    const token = process.env.JIRA_API_TOKEN;
    const timeoutMs = Number(process.env.JIRA_TIMEOUT_MS || 10000);
    if (!baseUrl || !email || !token) {
        throw new Error('Jira credentials are not configured in system environment.');
    }
    const auth = Buffer.from(`${email}:${token}`).toString('base64');
    // Clean URL just in case
    const cleanUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
        res = await fetch(`${cleanUrl}${pathname}`, {
            method: 'GET',
            ...options,
            headers: {
                'Authorization': `Basic ${auth}`,
                'Accept': 'application/json',
                ...(options.headers || {})
            },
            signal: controller.signal
        });
    }
    catch (error) {
        if (error?.name === 'AbortError') {
            throw new Error(`Validasi JIRA timeout setelah ${Math.round(timeoutMs / 1000)} detik. Coba lagi atau input sebagai aktivitas non-JIRA.`);
        }
        throw new Error('Gagal menghubungi API JIRA. Periksa koneksi server atau konfigurasi JIRA.');
    }
    finally {
        clearTimeout(timeout);
    }
    return res;
};
const flattenJiraComment = (node) => {
    if (!node)
        return '';
    if (typeof node === 'string')
        return node;
    if (Array.isArray(node))
        return node.map(flattenJiraComment).filter(Boolean).join(' ').trim();
    if (node.type === 'text')
        return node.text || '';
    return flattenJiraComment(node.content);
};
const normalizeSummary = (value) => String(value || '').trim().toLowerCase();
const isBastSummary = (value) => normalizeSummary(value).includes('bast');
const isProjectPrefix = (projectName, prefix) => String(projectName || '').toUpperCase().startsWith(prefix);
let jiraFieldNameMapCache = null;
const loadJiraFieldNameMap = async () => {
    if (jiraFieldNameMapCache)
        return jiraFieldNameMapCache;
    const res = await jiraFetch('/rest/api/3/field');
    if (!res.ok) {
        throw new Error(`Gagal mengambil metadata field Jira. Status: ${res.status}`);
    }
    const fields = await res.json();
    jiraFieldNameMapCache = Object.fromEntries(fields
        .filter((field) => field?.name && field?.id)
        .map((field) => [String(field.name).toLowerCase(), String(field.id)]));
    return jiraFieldNameMapCache;
};
const extractFieldValue = (fields, fieldKey) => {
    if (!fields || !fieldKey)
        return null;
    const value = fields[fieldKey];
    if (!value)
        return null;
    if (typeof value === 'string')
        return value;
    if (typeof value === 'number' || typeof value === 'boolean')
        return value;
    if (typeof value?.value === 'string')
        return value.value;
    if (typeof value?.name === 'string')
        return value.name;
    if (Array.isArray(value)) {
        const first = value.find((item) => typeof item === 'string' || typeof item?.value === 'string' || typeof item?.name === 'string');
        if (typeof first === 'string')
            return first;
        if (typeof first?.value === 'string')
            return first.value;
        if (typeof first?.name === 'string')
            return first.name;
    }
    return null;
};
const extractNamedFieldValue = (fields, names, fieldName) => {
    if (!fields || !names)
        return null;
    const entry = Object.entries(names).find(([, name]) => name?.toLowerCase() === fieldName.toLowerCase());
    if (!entry)
        return null;
    const [fieldKey] = entry;
    const value = fields[fieldKey];
    if (!value)
        return null;
    if (typeof value === 'string')
        return value;
    if (typeof value?.value === 'string')
        return value.value;
    if (Array.isArray(value)) {
        const first = value.find((item) => typeof item === 'string' || typeof item?.value === 'string');
        if (typeof first === 'string')
            return first;
        if (typeof first?.value === 'string')
            return first.value;
    }
    return null;
};
const extractNamedFieldValueByMap = (fields, fieldMap, fieldNames) => {
    for (const fieldName of fieldNames) {
        const key = fieldMap[fieldName.toLowerCase()];
        const value = extractFieldValue(fields, key);
        if (value !== null)
            return value;
    }
    return null;
};
const parseJiraIssueLinks = (issueLinks) => {
    if (!Array.isArray(issueLinks))
        return [];
    return issueLinks
        .map((link) => {
        const linkedIssue = link?.inwardIssue || link?.outwardIssue;
        if (!linkedIssue?.key)
            return null;
        const direction = link?.inwardIssue ? 'inward' : 'outward';
        const relation = direction === 'inward' ? link?.type?.inward : link?.type?.outward;
        return {
            id: linkedIssue.id ? String(linkedIssue.id) : null,
            key: String(linkedIssue.key),
            direction,
            typeName: link?.type?.name ? String(link.type.name) : null,
            relation: relation ? String(relation) : null,
            summary: linkedIssue.fields?.summary || null,
            issueTypeName: linkedIssue.fields?.issuetype?.name || null,
            statusName: linkedIssue.fields?.status?.name || null,
            statusCategoryKey: linkedIssue.fields?.status?.statusCategory?.key || null,
            statusCategoryName: linkedIssue.fields?.status?.statusCategory?.name || null,
        };
    })
        .filter((link) => Boolean(link));
};
const resolveJiraActKey = (issueKey, issueTypeName, projectName, workTypeName) => {
    const key = (issueKey || '').toUpperCase();
    const issueType = (issueTypeName || '').toLowerCase();
    const project = (projectName || '').toUpperCase();
    const workType = (workTypeName || '').toLowerCase();
    if (project.startsWith('[MA]'))
        return 'jira_pm';
    if (project.startsWith('[IMP]'))
        return 'jira_impl';
    if (project.startsWith('[OP]'))
        return 'jira_ops';
    if (key.startsWith('SUP-') && issueType === '[system] problem')
        return 'jira_cm';
    if (key.startsWith('SUP-') && issueType === '[system] change')
        return 'jira_enh';
    if (workType.includes('service request'))
        return 'jira_ops';
    if (key.startsWith('MAINT-') || issueType.includes('preventive'))
        return 'jira_pm';
    if (key.startsWith('CM-') || key.startsWith('SUP-') || issueType.includes('incident') || issueType.includes('bug'))
        return 'jira_cm';
    if (issueType.includes('enhancement') || issueType.includes('change request') || issueType.includes('improvement'))
        return 'jira_enh';
    if (key.startsWith('OP-') || key.startsWith('OPS-') || key.startsWith('KB4-') || issueType.includes('operation'))
        return 'jira_ops';
    return process.env.JIRA_DEFAULT_ACT_KEY || 'jira_impl';
};
exports.resolveJiraActKey = resolveJiraActKey;
const fetchJiraTicket = async (ticketId) => {
    const res = await jiraFetch(`/rest/api/3/issue/${ticketId}`);
    if (!res.ok) {
        if (res.status === 404) {
            throw new Error(`Tiket JIRA dengan ID ${ticketId} tidak ditemukan.`);
        }
        throw new Error(`Gagal menghubungi API JIRA. Status: ${res.status}`);
    }
    const data = await res.json();
    // Extract summary
    const summary = data.fields?.summary || 'No Summary';
    // Jira Cloud may hide emailAddress even when an assignee exists.
    const assignee = data.fields?.assignee || null;
    return {
        summary,
        assigneeEmail: assignee?.emailAddress || null,
        assigneeDisplayName: assignee?.displayName || null,
        assigneeAccountId: assignee?.accountId || null,
    };
};
exports.fetchJiraTicket = fetchJiraTicket;
const fetchJiraIssue = async (issueKeyOrId) => {
    const fieldMap = await loadJiraFieldNameMap();
    const extraFields = [
        fieldMap['work type'],
        fieldMap['request type'],
        fieldMap['customer request type'],
        fieldMap['start date'],
        fieldMap['actual start'],
        fieldMap['actual start date'],
    ].filter(Boolean);
    const queryFields = ['summary', 'issuetype', 'project', 'status', 'priority', 'duedate', 'resolutiondate', 'assignee', ...extraFields].join(',');
    const res = await jiraFetch(`/rest/api/3/issue/${issueKeyOrId}?fields=${encodeURIComponent(queryFields)}&expand=names`);
    if (!res.ok) {
        if (res.status === 404) {
            throw new Error(`Issue Jira ${issueKeyOrId} tidak ditemukan.`);
        }
        throw new Error(`Gagal mengambil issue Jira. Status: ${res.status}`);
    }
    const data = await res.json();
    return {
        id: data.id,
        key: data.key,
        summary: data.fields?.summary || null,
        issueTypeName: data.fields?.issuetype?.name || null,
        projectKey: data.fields?.project?.key || null,
        projectName: data.fields?.project?.name || null,
        statusName: data.fields?.status?.name || null,
        priorityName: data.fields?.priority?.name || null,
        dueDate: data.fields?.duedate || null,
        resolutionDate: data.fields?.resolutiondate || null,
        assigneeDisplayName: data.fields?.assignee?.displayName || null,
        assigneeAccountId: data.fields?.assignee?.accountId || null,
        workTypeName: extractNamedFieldValue(data.fields, data.names, 'Work Type')
            || extractNamedFieldValue(data.fields, data.names, 'Request Type')
            || extractNamedFieldValue(data.fields, data.names, 'Customer Request Type')
            || extractNamedFieldValueByMap(data.fields, fieldMap, ['Work Type', 'Request Type', 'Customer Request Type']),
        actualStartDate: extractNamedFieldValueByMap(data.fields, fieldMap, ['Actual Start', 'Actual Start Date', 'Start date']),
    };
};
exports.fetchJiraIssue = fetchJiraIssue;
const fetchJiraWorklog = async (issueKeyOrId, worklogId) => {
    const res = await jiraFetch(`/rest/api/3/issue/${issueKeyOrId}/worklog/${worklogId}`);
    if (!res.ok) {
        if (res.status === 404) {
            throw new Error(`Worklog Jira ${worklogId} tidak ditemukan.`);
        }
        throw new Error(`Gagal mengambil worklog Jira. Status: ${res.status}`);
    }
    const data = await res.json();
    return {
        id: String(data.id),
        issueId: data.issueId ? String(data.issueId) : null,
        authorAccountId: data.author?.accountId || null,
        authorDisplayName: data.author?.displayName || null,
        started: data.started || null,
        timeSpentSeconds: Number(data.timeSpentSeconds || 0),
        commentText: flattenJiraComment(data.comment),
        updated: data.updated || null,
    };
};
exports.fetchJiraWorklog = fetchJiraWorklog;
const fetchJiraWorklogChanges = async (pathname, since, maxPages = 5) => {
    const values = [];
    let until = since;
    let nextPath = `${pathname}?since=${encodeURIComponent(String(since))}`;
    for (let page = 0; page < maxPages; page += 1) {
        const res = await jiraFetch(nextPath);
        if (!res.ok) {
            throw new Error(`Gagal mengambil perubahan worklog Jira. Status: ${res.status}`);
        }
        const data = await res.json();
        values.push(...(Array.isArray(data.values) ? data.values : []).map((item) => ({
            worklogId: String(item.worklogId),
            updatedTime: Number(item.updatedTime || 0),
        })));
        if (Number.isFinite(Number(data.until)))
            until = Number(data.until);
        if (data.lastPage !== false || !data.nextPage)
            break;
        const nextUrl = new URL(String(data.nextPage));
        nextPath = `${nextUrl.pathname}${nextUrl.search}`;
    }
    return { values, until };
};
const fetchUpdatedJiraWorklogChanges = (since) => fetchJiraWorklogChanges('/rest/api/3/worklog/updated', since);
exports.fetchUpdatedJiraWorklogChanges = fetchUpdatedJiraWorklogChanges;
const fetchDeletedJiraWorklogChanges = (since) => fetchJiraWorklogChanges('/rest/api/3/worklog/deleted', since);
exports.fetchDeletedJiraWorklogChanges = fetchDeletedJiraWorklogChanges;
const fetchJiraWorklogsByIds = async (ids) => {
    if (!ids.length)
        return [];
    const res = await jiraFetch('/rest/api/3/worklog/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ids.map((id) => Number(id)).filter(Number.isFinite) }),
    });
    if (!res.ok) {
        throw new Error(`Gagal mengambil daftar worklog Jira. Status: ${res.status}`);
    }
    const data = await res.json();
    return (Array.isArray(data) ? data : []).map((worklog) => ({
        id: String(worklog.id),
        issueId: worklog.issueId ? String(worklog.issueId) : null,
    }));
};
exports.fetchJiraWorklogsByIds = fetchJiraWorklogsByIds;
const fetchCompletedJiraTasksForQuarter = async (assigneeAccountId, startDate, endDate) => {
    const fieldMap = await loadJiraFieldNameMap();
    const actualStartField = fieldMap['actual start'] || fieldMap['actual start date'] || fieldMap['start date'];
    const requestTypeField = fieldMap['request type'] || fieldMap['customer request type'] || fieldMap['work type'];
    const conditions = [
        `assignee = "${assigneeAccountId}"`,
        `issuetype != Epic`,
    ];
    if (actualStartField) {
        conditions.push(`"${actualStartField}" >= "${startDate}"`);
        conditions.push(`"${actualStartField}" <= "${endDate}"`);
    }
    else {
        conditions.push(`updated >= "${startDate}"`);
        conditions.push(`updated <= "${endDate}"`);
    }
    const jql = `${conditions.join(' AND ')} ORDER BY statusCategoryChangedDate DESC`;
    const matchedIssues = [];
    const pmParentGroups = new Map();
    let nextPageToken;
    const maxResults = 50;
    while (true) {
        const payload = {
            jql,
            maxResults,
            nextPageToken,
            fields: ['summary', 'issuetype', 'project', 'status', 'resolutiondate', 'parent', actualStartField, requestTypeField].filter(Boolean),
        };
        const res = await jiraFetch('/rest/api/3/search/jql', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            throw new Error(`Gagal mengambil issue Jira untuk QB. Status: ${res.status}`);
        }
        const data = await res.json();
        const issues = Array.isArray(data.issues) ? data.issues : [];
        for (const issue of issues) {
            const summary = issue.fields?.summary || null;
            const issueTypeName = issue.fields?.issuetype?.name || null;
            const isSubtask = Boolean(issue.fields?.issuetype?.subtask);
            const projectName = issue.fields?.project?.name || null;
            const statusCategoryKey = String(issue.fields?.status?.statusCategory?.key || '').toLowerCase();
            const isCompleted = statusCategoryKey === 'done';
            const normalizedSummary = normalizeSummary(summary);
            const isPmSubtask = isSubtask && isProjectPrefix(projectName, '[MA]');
            const isImplementationSubtask = isSubtask && isProjectPrefix(projectName, '[IMP]');
            const isOperationalSubtask = isSubtask && isProjectPrefix(projectName, '[OP]');
            const parentKey = issue.fields?.parent?.key || null;
            const parentId = issue.fields?.parent?.id || null;
            if (!isCompleted)
                continue;
            if (isPmSubtask) {
                const groupKey = parentKey || parentId || issue.key;
                const current = pmParentGroups.get(groupKey) || {
                    parentKey,
                    sampleKey: issue.key,
                    hasJobDone: false,
                    hasReportDone: false,
                };
                if (normalizedSummary.startsWith('pekerjaan pm'))
                    current.hasJobDone = true;
                if (normalizedSummary.startsWith('report pm'))
                    current.hasReportDone = true;
                pmParentGroups.set(groupKey, current);
                continue;
            }
            if (isImplementationSubtask) {
                matchedIssues.push({ key: issue.key, actKey: 'jira_impl' });
                continue;
            }
            if (isOperationalSubtask) {
                matchedIssues.push({ key: issue.key, actKey: 'jira_ops' });
                continue;
            }
            if (isSubtask || String(issueTypeName || '').toLowerCase() === 'epic')
                continue;
            const actKey = (0, exports.resolveJiraActKey)(issue.key, issueTypeName, projectName, extractFieldValue(issue.fields, requestTypeField));
            if (['jira_impl', 'jira_cm', 'jira_enh', 'jira_ops'].includes(actKey)) {
                matchedIssues.push({ key: issue.key, actKey });
            }
        }
        nextPageToken = data.nextPageToken || undefined;
        if (!nextPageToken || data.isLast || issues.length === 0)
            break;
    }
    for (const group of pmParentGroups.values()) {
        if (group.hasJobDone && group.hasReportDone) {
            matchedIssues.push({ key: group.parentKey || group.sampleKey, actKey: 'jira_pm' });
        }
    }
    return {
        count: matchedIssues.length,
        issues: matchedIssues,
    };
};
exports.fetchCompletedJiraTasksForQuarter = fetchCompletedJiraTasksForQuarter;
const searchJiraIssues = async ({ jql, fields }) => {
    const matchedIssues = [];
    let nextPageToken;
    const maxResults = 50;
    const fieldMap = await loadJiraFieldNameMap();
    const additionalFields = [
        fieldMap['work type'],
        fieldMap['request type'],
        fieldMap['customer request type'],
        fieldMap['start date'],
        fieldMap['actual start'],
        fieldMap['actual start date'],
        fieldMap['actual end'],
        fieldMap['actual end date'],
        fieldMap['customer'],
        fieldMap['customer name'],
        fieldMap['organization'],
        fieldMap['organizations'],
        fieldMap['client'],
        fieldMap['account'],
        fieldMap['ticket used'],
        fieldMap['total ticket'],
        fieldMap['remaining ticket'],
    ].filter(Boolean);
    const queryFields = Array.from(new Set([...fields, 'issuelinks', ...additionalFields]));
    while (true) {
        const payload = {
            jql,
            maxResults,
            nextPageToken,
            fields: queryFields,
        };
        const res = await jiraFetch('/rest/api/3/search/jql', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            let detail = '';
            try {
                const data = await res.json();
                const messages = [
                    ...(Array.isArray(data?.errorMessages) ? data.errorMessages : []),
                    ...Object.values(data?.errors || {}).map((value) => String(value)),
                ].filter(Boolean);
                if (messages.length)
                    detail = ` - ${messages.join('; ')}`;
            }
            catch {
                try {
                    const text = await res.text();
                    if (text)
                        detail = ` - ${text.slice(0, 300)}`;
                }
                catch {
                    detail = '';
                }
            }
            throw new Error(`Gagal mengambil issue Jira untuk KPI. Status: ${res.status}${detail}`);
        }
        const data = await res.json();
        const issues = Array.isArray(data.issues) ? data.issues : [];
        for (const issue of issues) {
            matchedIssues.push({
                id: String(issue.id),
                key: String(issue.key),
                summary: issue.fields?.summary || null,
                issueTypeName: issue.fields?.issuetype?.name || null,
                issueTypeIsSubtask: Boolean(issue.fields?.issuetype?.subtask),
                projectKey: issue.fields?.project?.key || null,
                projectName: issue.fields?.project?.name || null,
                workTypeName: extractNamedFieldValueByMap(issue.fields, fieldMap, ['Work Type', 'Request Type', 'Customer Request Type'])
                    || extractNamedFieldValue(issue.fields, data.names || issue.names, 'Work Type')
                    || extractNamedFieldValue(issue.fields, data.names || issue.names, 'Request Type')
                    || extractNamedFieldValue(issue.fields, data.names || issue.names, 'Customer Request Type'),
                assigneeAccountId: issue.fields?.assignee?.accountId || null,
                assigneeDisplayName: issue.fields?.assignee?.displayName || null,
                parentId: issue.fields?.parent?.id ? String(issue.fields.parent.id) : null,
                parentKey: issue.fields?.parent?.key || null,
                startDate: extractNamedFieldValueByMap(issue.fields, fieldMap, ['Start date']),
                actualStartDate: extractNamedFieldValueByMap(issue.fields, fieldMap, ['Actual Start', 'Actual Start Date', 'Start date']),
                actualEndDate: extractNamedFieldValueByMap(issue.fields, fieldMap, ['Actual End', 'Actual End Date']),
                dueDate: issue.fields?.duedate || null,
                createdAt: issue.fields?.created || null,
                updatedAt: issue.fields?.updated || null,
                resolutionDate: issue.fields?.resolutiondate || null,
                statusName: issue.fields?.status?.name || null,
                statusCategoryKey: issue.fields?.status?.statusCategory?.key || null,
                statusCategoryName: issue.fields?.status?.statusCategory?.name || null,
                priorityName: issue.fields?.priority?.name || null,
                customerName: extractNamedFieldValueByMap(issue.fields, fieldMap, [
                    'Customer',
                    'Customer Name',
                    'Organization',
                    'Organizations',
                    'Client',
                    'Account',
                ]),
                ticketUsed: Number(extractNamedFieldValueByMap(issue.fields, fieldMap, ['Ticket Used']) || 0),
                totalTicket: Number(extractNamedFieldValueByMap(issue.fields, fieldMap, ['Total Ticket']) || 0),
                remainingTicket: Number(extractNamedFieldValueByMap(issue.fields, fieldMap, ['Remaining Ticket']) || 0),
                timeSpentSeconds: Number(issue.fields?.timespent || 0),
                comments: Array.isArray(issue.fields?.comment?.comments)
                    ? issue.fields.comment.comments.map((comment) => ({
                        id: String(comment.id),
                        createdAt: comment.created || null,
                        bodyText: flattenJiraComment(comment.body),
                    }))
                    : [],
                linkedIssues: parseJiraIssueLinks(issue.fields?.issuelinks),
            });
        }
        nextPageToken = data.nextPageToken || undefined;
        if (!nextPageToken || data.isLast || issues.length === 0)
            break;
    }
    return matchedIssues;
};
exports.searchJiraIssues = searchJiraIssues;
const chunk = (items, size) => {
    const chunks = [];
    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }
    return chunks;
};
const addRelatedEngineer = (map, accountId, displayName) => {
    if (!accountId)
        return;
    map.set(accountId, displayName || accountId);
};
const setBastAssigneeForParent = (map, parentKey, issue) => {
    if (!parentKey || map.has(parentKey))
        return;
    map.set(parentKey, {
        accountId: issue.assigneeAccountId,
        displayName: issue.assigneeDisplayName,
    });
};
const fetchKpiNpsCandidates = async (startDate, endDate) => {
    const baseUrl = (process.env.JIRA_BASE_URL || '').replace(/\/+$/, '');
    const doneInPeriod = [
        'statusCategory = Done',
        `resolved >= "${startDate}"`,
        `resolved <= "${endDate}"`,
    ].join(' AND ');
    const [epics, opTasks] = await Promise.all([
        (0, exports.searchJiraIssues)({
            jql: `issuetype = Epic AND ${doneInPeriod} ORDER BY resolved DESC`,
            fields: ['summary', 'issuetype', 'project', 'status', 'resolutiondate', 'assignee'],
        }),
        (0, exports.searchJiraIssues)({
            jql: `issuetype not in subTaskIssueTypes() AND issuetype != Epic AND ${doneInPeriod} ORDER BY resolved DESC`,
            fields: ['summary', 'issuetype', 'project', 'status', 'resolutiondate', 'assignee'],
        }),
    ]);
    const implEpics = epics.filter((issue) => isProjectPrefix(issue.projectName, '[IMP]'));
    const bastAssigneesByParent = new Map();
    const relatedEngineersByImplEpic = new Map();
    for (const keys of chunk(implEpics.map((issue) => issue.key), 50)) {
        if (!keys.length)
            continue;
        const childTasks = await (0, exports.searchJiraIssues)({
            jql: `parent in (${keys.map((key) => `"${key}"`).join(',')}) AND issuetype not in subTaskIssueTypes() ORDER BY updated DESC`,
            fields: ['summary', 'issuetype', 'project', 'status', 'parent', 'assignee', 'updated'],
        });
        const epicByTaskKey = new Map(childTasks
            .filter((task) => task.parentKey)
            .map((task) => [task.key, task.parentKey]));
        for (const task of childTasks) {
            if (!task.parentKey)
                continue;
            if (isBastSummary(task.summary)) {
                setBastAssigneeForParent(bastAssigneesByParent, task.parentKey, task);
                continue;
            }
            const relatedMap = relatedEngineersByImplEpic.get(task.parentKey) || new Map();
            addRelatedEngineer(relatedMap, task.assigneeAccountId, task.assigneeDisplayName);
            relatedEngineersByImplEpic.set(task.parentKey, relatedMap);
        }
        for (const taskKeys of chunk(Array.from(epicByTaskKey.keys()), 50)) {
            if (!taskKeys.length)
                continue;
            const subtasks = await (0, exports.searchJiraIssues)({
                jql: `parent in (${taskKeys.map((key) => `"${key}"`).join(',')}) AND issuetype in subTaskIssueTypes() ORDER BY updated DESC`,
                fields: ['summary', 'issuetype', 'project', 'status', 'parent', 'assignee', 'updated'],
            });
            for (const subtask of subtasks) {
                if (!subtask.parentKey)
                    continue;
                const epicKey = epicByTaskKey.get(subtask.parentKey);
                if (!epicKey)
                    continue;
                const relatedMap = relatedEngineersByImplEpic.get(epicKey) || new Map();
                if (!isBastSummary(subtask.summary)) {
                    addRelatedEngineer(relatedMap, subtask.assigneeAccountId, subtask.assigneeDisplayName);
                }
                relatedEngineersByImplEpic.set(epicKey, relatedMap);
            }
            const bastIssues = subtasks.filter((issue) => isBastSummary(issue.summary));
            for (const bast of bastIssues) {
                if (!bast.parentKey)
                    continue;
                const epicKey = epicByTaskKey.get(bast.parentKey);
                if (!epicKey || bastAssigneesByParent.has(epicKey))
                    continue;
                setBastAssigneeForParent(bastAssigneesByParent, epicKey, bast);
            }
        }
    }
    const implCandidates = implEpics.map((issue) => {
        const bastAssignee = bastAssigneesByParent.get(issue.key);
        const relatedMap = relatedEngineersByImplEpic.get(issue.key) || new Map();
        addRelatedEngineer(relatedMap, issue.assigneeAccountId, issue.assigneeDisplayName);
        return {
            scope: 'impl_project',
            jiraIssueId: issue.id,
            jiraIssueKey: issue.key,
            issueUrl: baseUrl ? `${baseUrl}/browse/${issue.key}` : issue.key,
            projectKey: issue.projectKey,
            projectName: issue.projectName,
            summary: issue.summary,
            issueTypeName: issue.issueTypeName,
            statusName: issue.statusName,
            resolutionDate: issue.resolutionDate,
            assignedPmAccountId: bastAssignee?.accountId || null,
            assignedPmDisplayName: bastAssignee?.displayName || null,
            relatedEngineerAccountIds: Array.from(relatedMap.keys()),
            relatedEngineerDisplayNames: Array.from(relatedMap.values()),
        };
    });
    const opIssues = opTasks.filter((issue) => (isProjectPrefix(issue.projectName, '[OP]')
        && normalizeSummary(issue.issueTypeName) !== 'bug'));
    const pmIssues = opTasks.filter((issue) => (isProjectPrefix(issue.projectName, '[MA]')
        && normalizeSummary(issue.issueTypeName) !== 'bug'));
    const bastAssigneesByOpTask = new Map();
    const bastAssigneesByPmTask = new Map();
    for (const keys of chunk(opIssues.map((issue) => issue.key), 50)) {
        if (!keys.length)
            continue;
        const childIssues = await (0, exports.searchJiraIssues)({
            jql: `parent in (${keys.map((key) => `"${key}"`).join(',')}) ORDER BY updated DESC`,
            fields: ['summary', 'issuetype', 'project', 'status', 'parent', 'assignee', 'updated'],
        });
        for (const bast of childIssues.filter((issue) => isBastSummary(issue.summary))) {
            setBastAssigneeForParent(bastAssigneesByOpTask, bast.parentKey, bast);
        }
    }
    for (const keys of chunk(pmIssues.map((issue) => issue.key), 50)) {
        if (!keys.length)
            continue;
        const childIssues = await (0, exports.searchJiraIssues)({
            jql: `parent in (${keys.map((key) => `"${key}"`).join(',')}) ORDER BY updated DESC`,
            fields: ['summary', 'issuetype', 'project', 'status', 'parent', 'assignee', 'updated'],
        });
        for (const bast of childIssues.filter((issue) => isBastSummary(issue.summary))) {
            setBastAssigneeForParent(bastAssigneesByPmTask, bast.parentKey, bast);
        }
    }
    const opCandidates = opIssues
        .map((issue) => {
        const bastAssignee = bastAssigneesByOpTask.get(issue.key);
        return {
            scope: 'op_task',
            jiraIssueId: issue.id,
            jiraIssueKey: issue.key,
            issueUrl: baseUrl ? `${baseUrl}/browse/${issue.key}` : issue.key,
            projectKey: issue.projectKey,
            projectName: issue.projectName,
            summary: issue.summary,
            issueTypeName: issue.issueTypeName,
            statusName: issue.statusName,
            resolutionDate: issue.resolutionDate,
            assignedPmAccountId: bastAssignee?.accountId || issue.assigneeAccountId,
            assignedPmDisplayName: bastAssignee?.displayName || issue.assigneeDisplayName,
            relatedEngineerAccountIds: issue.assigneeAccountId ? [issue.assigneeAccountId] : [],
            relatedEngineerDisplayNames: issue.assigneeDisplayName ? [issue.assigneeDisplayName] : [],
        };
    });
    const pmCandidates = pmIssues.map((issue) => {
        const bastAssignee = bastAssigneesByPmTask.get(issue.key);
        return {
            scope: 'pm_record',
            jiraIssueId: issue.id,
            jiraIssueKey: issue.key,
            issueUrl: baseUrl ? `${baseUrl}/browse/${issue.key}` : issue.key,
            projectKey: issue.projectKey,
            projectName: issue.projectName,
            summary: issue.summary,
            issueTypeName: issue.issueTypeName,
            statusName: issue.statusName,
            resolutionDate: issue.resolutionDate,
            assignedPmAccountId: bastAssignee?.accountId || issue.assigneeAccountId,
            assignedPmDisplayName: bastAssignee?.displayName || issue.assigneeDisplayName,
            relatedEngineerAccountIds: issue.assigneeAccountId ? [issue.assigneeAccountId] : [],
            relatedEngineerDisplayNames: issue.assigneeDisplayName ? [issue.assigneeDisplayName] : [],
        };
    });
    return [...implCandidates, ...opCandidates, ...pmCandidates];
};
exports.fetchKpiNpsCandidates = fetchKpiNpsCandidates;
const fetchUpcomingJiraScheduleByAssignee = async (assigneeAccountId, dayWindow = 15) => {
    const clauses = [
        `assignee = "${assigneeAccountId}"`,
        'duedate >= startOfDay()',
        `duedate <= startOfDay("+${Math.max(1, Math.floor(dayWindow))}d")`,
        'statusCategory != Done',
    ];
    const issues = await (0, exports.searchJiraIssues)({
        jql: `${clauses.join(' AND ')} ORDER BY duedate ASC`,
        fields: ['summary', 'project', 'status', 'priority', 'duedate', 'issuetype', 'assignee'],
    });
    const baseUrl = (process.env.JIRA_BASE_URL || '').replace(/\/+$/, '');
    return issues
        .filter((issue) => issue.dueDate)
        .map((issue) => ({
        issueId: issue.id,
        issueKey: issue.key,
        issueUrl: baseUrl ? `${baseUrl}/browse/${issue.key}` : issue.key,
        summary: issue.summary,
        projectName: issue.projectName,
        statusName: issue.statusName,
        priorityName: issue.priorityName,
        dueDate: issue.dueDate,
        issueTypeName: issue.issueTypeName,
    }));
};
exports.fetchUpcomingJiraScheduleByAssignee = fetchUpcomingJiraScheduleByAssignee;

const jiraFetch = async (pathname: string, options: RequestInit = {}) => {
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

  let res: Response;
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
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error(`Validasi JIRA timeout setelah ${Math.round(timeoutMs / 1000)} detik. Coba lagi atau input sebagai aktivitas non-JIRA.`);
    }
    throw new Error('Gagal menghubungi API JIRA. Periksa koneksi server atau konfigurasi JIRA.');
  } finally {
    clearTimeout(timeout);
  }

  return res;
};

const flattenJiraComment = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flattenJiraComment).filter(Boolean).join(' ').trim();
  if (node.type === 'text') return node.text || '';
  return flattenJiraComment(node.content);
};

let jiraFieldNameMapCache: Record<string, string> | null = null;

const loadJiraFieldNameMap = async () => {
  if (jiraFieldNameMapCache) return jiraFieldNameMapCache;

  const res = await jiraFetch('/rest/api/3/field');
  if (!res.ok) {
    throw new Error(`Gagal mengambil metadata field Jira. Status: ${res.status}`);
  }

  const fields = await res.json() as any[];
  jiraFieldNameMapCache = Object.fromEntries(
    fields
      .filter((field) => field?.name && field?.id)
      .map((field) => [String(field.name).toLowerCase(), String(field.id)])
  );

  return jiraFieldNameMapCache;
};

const extractFieldValue = (fields: Record<string, any> | undefined, fieldKey: string | null | undefined) => {
  if (!fields || !fieldKey) return null;
  const value = fields[fieldKey];
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value?.value === 'string') return value.value;
  if (typeof value?.name === 'string') return value.name;
  if (Array.isArray(value)) {
    const first = value.find((item) => typeof item === 'string' || typeof item?.value === 'string' || typeof item?.name === 'string');
    if (typeof first === 'string') return first;
    if (typeof first?.value === 'string') return first.value;
    if (typeof first?.name === 'string') return first.name;
  }
  return null;
};

const extractNamedFieldValue = (fields: Record<string, any> | undefined, names: Record<string, string> | undefined, fieldName: string) => {
  if (!fields || !names) return null;

  const entry = Object.entries(names).find(([, name]) => name?.toLowerCase() === fieldName.toLowerCase());
  if (!entry) return null;

  const [fieldKey] = entry;
  const value = fields[fieldKey];
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value?.value === 'string') return value.value;
  if (Array.isArray(value)) {
    const first = value.find((item) => typeof item === 'string' || typeof item?.value === 'string');
    if (typeof first === 'string') return first;
    if (typeof first?.value === 'string') return first.value;
  }

  return null;
};

const extractNamedFieldValueByMap = (
  fields: Record<string, any> | undefined,
  fieldMap: Record<string, string>,
  fieldNames: string[]
) => {
  for (const fieldName of fieldNames) {
    const key = fieldMap[fieldName.toLowerCase()];
    const value = extractFieldValue(fields, key);
    if (value !== null) return value;
  }
  return null;
};

export const resolveJiraActKey = (
  issueKey: string,
  issueTypeName?: string | null,
  projectName?: string | null,
  workTypeName?: string | null
) => {
  const key = (issueKey || '').toUpperCase();
  const issueType = (issueTypeName || '').toLowerCase();
  const project = (projectName || '').toUpperCase();
  const workType = (workTypeName || '').toLowerCase();

  if (project.startsWith('[MA]')) return 'jira_pm';
  if (project.startsWith('[IMP]')) return 'jira_impl';
  if (project.startsWith('[OPS]')) return 'jira_ops';
  if (key.startsWith('SUP-') && issueType === '[system] problem') return 'jira_cm';
  if (key.startsWith('SUP-') && issueType === '[system] change') return 'jira_enh';
  if (workType.includes('service request')) return 'jira_ops';

  if (key.startsWith('MAINT-') || issueType.includes('preventive')) return 'jira_pm';
  if (key.startsWith('CM-') || key.startsWith('SUP-') || issueType.includes('incident') || issueType.includes('bug')) return 'jira_cm';
  if (issueType.includes('enhancement') || issueType.includes('change request') || issueType.includes('improvement')) return 'jira_enh';
  if (key.startsWith('OPS-') || key.startsWith('KB4-') || issueType.includes('operation')) return 'jira_ops';
  return process.env.JIRA_DEFAULT_ACT_KEY || 'jira_impl';
};

export const fetchJiraTicket = async (ticketId: string) => {
  const res = await jiraFetch(`/rest/api/3/issue/${ticketId}`);

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(`Tiket JIRA dengan ID ${ticketId} tidak ditemukan.`);
    }
    throw new Error(`Gagal menghubungi API JIRA. Status: ${res.status}`);
  }

  const data: any = await res.json();
  
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

export const fetchJiraIssue = async (issueKeyOrId: string) => {
  const fieldMap = await loadJiraFieldNameMap();
  const extraFields = [
    fieldMap['work type'],
    fieldMap['request type'],
    fieldMap['customer request type'],
    fieldMap['start date'],
    fieldMap['actual start'],
    fieldMap['actual start date'],
  ].filter(Boolean);
  const queryFields = ['summary', 'issuetype', 'project', ...extraFields].join(',');
  const res = await jiraFetch(`/rest/api/3/issue/${issueKeyOrId}?fields=${encodeURIComponent(queryFields)}&expand=names`);

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(`Issue Jira ${issueKeyOrId} tidak ditemukan.`);
    }
    throw new Error(`Gagal mengambil issue Jira. Status: ${res.status}`);
  }

  const data: any = await res.json();
  return {
    id: data.id,
    key: data.key,
    summary: data.fields?.summary || null,
    issueTypeName: data.fields?.issuetype?.name || null,
    projectKey: data.fields?.project?.key || null,
    projectName: data.fields?.project?.name || null,
    workTypeName:
      extractNamedFieldValue(data.fields, data.names, 'Work Type')
      || extractNamedFieldValue(data.fields, data.names, 'Request Type')
      || extractNamedFieldValue(data.fields, data.names, 'Customer Request Type')
      || extractNamedFieldValueByMap(data.fields, fieldMap, ['Work Type', 'Request Type', 'Customer Request Type']),
    actualStartDate: extractNamedFieldValueByMap(data.fields, fieldMap, ['Actual Start', 'Actual Start Date', 'Start date']),
  };
};

export const fetchJiraWorklog = async (issueKeyOrId: string, worklogId: string) => {
  const res = await jiraFetch(`/rest/api/3/issue/${issueKeyOrId}/worklog/${worklogId}`);

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(`Worklog Jira ${worklogId} tidak ditemukan.`);
    }
    throw new Error(`Gagal mengambil worklog Jira. Status: ${res.status}`);
  }

  const data: any = await res.json();
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

export const fetchCompletedJiraTasksForQuarter = async (
  assigneeAccountId: string,
  startDate: string,
  endDate: string
) => {
  const conditions = [
    `assignee = "${assigneeAccountId}"`,
    `statusCategory = Done`,
    `statusCategoryChangedDate >= "${startDate}"`,
    `statusCategoryChangedDate <= "${endDate}"`,
    `issuetype not in subTaskIssueTypes()`,
    `issuetype != Epic`,
  ];
  const jql = `${conditions.join(' AND ')} ORDER BY statusCategoryChangedDate DESC`;

  const matchedIssues: Array<{ key: string; actKey: string }> = [];
  let nextPageToken: string | undefined;
  const maxResults = 50;

  while (true) {
    const payload = {
      jql,
      maxResults,
      nextPageToken,
      fields: ['summary', 'issuetype', 'project', 'status', 'resolutiondate'],
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

    const data: any = await res.json();
    const issues = Array.isArray(data.issues) ? data.issues : [];

    for (const issue of issues) {
      const issueTypeName = issue.fields?.issuetype?.name || null;
      const isSubtask = Boolean(issue.fields?.issuetype?.subtask);
      if (isSubtask || String(issueTypeName || '').toLowerCase() === 'epic') continue;

      const actKey = resolveJiraActKey(
        issue.key,
        issueTypeName,
        issue.fields?.project?.name || null,
        null
      );

      if (['jira_impl', 'jira_pm', 'jira_cm', 'jira_ops'].includes(actKey)) {
        matchedIssues.push({ key: issue.key, actKey });
      }
    }

    nextPageToken = data.nextPageToken || undefined;
    if (!nextPageToken || data.isLast || issues.length === 0) break;
  }

  return {
    count: matchedIssues.length,
    issues: matchedIssues,
  };
};

export type JiraSearchIssue = {
  id: string;
  key: string;
  summary: string | null;
  issueTypeName: string | null;
  issueTypeIsSubtask: boolean;
  projectKey: string | null;
  projectName: string | null;
  workTypeName: string | null;
  assigneeAccountId: string | null;
  parentId: string | null;
  parentKey: string | null;
  startDate: string | null;
  actualStartDate: string | null;
  dueDate: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  resolutionDate: string | null;
  statusName: string | null;
  priorityName: string | null;
  timeSpentSeconds: number;
  comments: Array<{ id: string; createdAt: string | null; bodyText: string }>;
};

type SearchJiraIssuesOptions = {
  jql: string;
  fields: string[];
};

export const searchJiraIssues = async ({ jql, fields }: SearchJiraIssuesOptions) => {
  const matchedIssues: JiraSearchIssue[] = [];
  let nextPageToken: string | undefined;
  const maxResults = 50;
  const fieldMap = await loadJiraFieldNameMap();
  const additionalFields = [
    fieldMap['work type'],
    fieldMap['request type'],
    fieldMap['customer request type'],
    fieldMap['start date'],
    fieldMap['actual start'],
    fieldMap['actual start date'],
  ].filter(Boolean);
  const queryFields = Array.from(new Set([...fields, ...additionalFields]));

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
        const data: any = await res.json();
        const messages = [
          ...(Array.isArray(data?.errorMessages) ? data.errorMessages : []),
          ...Object.values(data?.errors || {}).map((value) => String(value)),
        ].filter(Boolean);
        if (messages.length) detail = ` - ${messages.join('; ')}`;
      } catch {
        try {
          const text = await res.text();
          if (text) detail = ` - ${text.slice(0, 300)}`;
        } catch {
          detail = '';
        }
      }
      throw new Error(`Gagal mengambil issue Jira untuk KPI. Status: ${res.status}${detail}`);
    }

    const data: any = await res.json();
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
        workTypeName:
          extractNamedFieldValueByMap(issue.fields, fieldMap, ['Work Type', 'Request Type', 'Customer Request Type'])
          || extractNamedFieldValue(issue.fields, data.names || issue.names, 'Work Type')
          || extractNamedFieldValue(issue.fields, data.names || issue.names, 'Request Type')
          || extractNamedFieldValue(issue.fields, data.names || issue.names, 'Customer Request Type'),
        assigneeAccountId: issue.fields?.assignee?.accountId || null,
        parentId: issue.fields?.parent?.id ? String(issue.fields.parent.id) : null,
        parentKey: issue.fields?.parent?.key || null,
        startDate: extractNamedFieldValueByMap(issue.fields, fieldMap, ['Start date']),
        actualStartDate: extractNamedFieldValueByMap(issue.fields, fieldMap, ['Actual Start', 'Actual Start Date', 'Start date']),
        dueDate: issue.fields?.duedate || null,
        createdAt: issue.fields?.created || null,
        updatedAt: issue.fields?.updated || null,
        resolutionDate: issue.fields?.resolutiondate || null,
        statusName: issue.fields?.status?.name || null,
        priorityName: issue.fields?.priority?.name || null,
        timeSpentSeconds: Number(issue.fields?.timespent || 0),
        comments: Array.isArray(issue.fields?.comment?.comments)
          ? issue.fields.comment.comments.map((comment: any) => ({
              id: String(comment.id),
              createdAt: comment.created || null,
              bodyText: flattenJiraComment(comment.body),
            }))
          : [],
      });
    }

    nextPageToken = data.nextPageToken || undefined;
    if (!nextPageToken || data.isLast || issues.length === 0) break;
  }

  return matchedIssues;
};

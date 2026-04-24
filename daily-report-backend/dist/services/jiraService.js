"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchJiraWorklog = exports.fetchJiraIssue = exports.fetchJiraTicket = exports.resolveJiraActKey = void 0;
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
const resolveJiraActKey = (issueKey, issueTypeName) => {
    const key = (issueKey || '').toUpperCase();
    const issueType = (issueTypeName || '').toLowerCase();
    if (key.startsWith('MAINT-') || issueType.includes('preventive'))
        return 'jira_pm';
    if (key.startsWith('CM-') || key.startsWith('SUP-') || issueType.includes('incident') || issueType.includes('bug'))
        return 'jira_cm';
    if (issueType.includes('enhancement') || issueType.includes('change request') || issueType.includes('improvement'))
        return 'jira_enh';
    if (key.startsWith('OPS-') || key.startsWith('KB4-') || issueType.includes('operation'))
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
    const res = await jiraFetch(`/rest/api/3/issue/${issueKeyOrId}?fields=summary,issuetype,project`);
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

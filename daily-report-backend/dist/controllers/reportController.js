"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getExecutiveReport = void 0;
const jiraService_1 = require("../services/jiraService");
const monthKey = (value) => String(value || '').slice(0, 7) || 'unknown';
const hoursBetween = (start, end) => {
    if (!start || !end)
        return null;
    const diff = new Date(end).getTime() - new Date(start).getTime();
    if (!Number.isFinite(diff) || diff < 0)
        return null;
    return diff / 36e5;
};
const classifyTicket = (issue) => {
    const type = String(issue.issueTypeName || '').toLowerCase();
    if (type.includes('change'))
        return 'change';
    if (type.includes('problem'))
        return 'problem';
    return issue.key.toUpperCase().startsWith('SUP-') ? 'problem' : 'other';
};
const CUSTOMER_ALIASES = [
    ['Bank Mega', ['Mega Crowdstrike', 'Mega Appsealing']],
    ['Serasi Autoraya', ['Serasi Autoraya']],
    ['United Tractors', ['United Tractors']],
    ['Mandiri Sekuritas', ['Mandiri Sekuritas']],
    ['Pupuk Kaltim', ['Pupuk Kaltim']],
    ['Mandiri Taspen', ['Bank Mandiri Taspen - KB4']],
    ['ACC', ['ACC - Crowdstrike', 'ACC - KB4']],
    ['Bank Saqu', ['Bank Saqu - Forcepoint']],
    ['Allo Bank', ['Allo Bank - PRMG', 'Allo Bank - AML']],
    ['Mandiri', ['Mandiri']],
    ['Tempo', ['Tempo']],
    ['Orang Tua Group', ['Orang Tua']],
    ['OJK', ['OJK', 'OJK - Thales']],
    ['MTP', ['MTP - TDX']],
    ['WOM Finance', ['WOM Finance']],
    ['Bank Mas', ['Bank Mas - Forcepoint', 'Bank Mas - KB4']],
    ['Panah Merah', ['Panah Merah']],
    ['GS Battery', ['GS Battery - Forcepoint']],
];
const normalizeText = (value) => String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
const normalizeCustomer = (rawCustomer) => {
    const normalized = normalizeText(rawCustomer);
    for (const [canonical, aliases] of CUSTOMER_ALIASES) {
        if (aliases.some((alias) => normalized.includes(normalizeText(alias))))
            return canonical;
    }
    return rawCustomer;
};
const inferCustomer = (issue) => {
    if (issue.customerName)
        return normalizeCustomer(issue.customerName);
    const summary = String(issue.summary || '');
    const bracket = summary.match(/\[(.*?)\]/);
    if (bracket?.[1] && !/system|problem|change/i.test(bracket[1]))
        return normalizeCustomer(bracket[1].trim());
    const dashParts = summary.split(/\s[-–—]\s/).map((part) => part.trim()).filter(Boolean);
    if (dashParts.length >= 2 && dashParts[0].length <= 60)
        return normalizeCustomer(dashParts[0]);
    const mapped = normalizeCustomer(summary);
    if (mapped !== summary)
        return mapped;
    return 'Unknown Customer';
};
const issueText = (issue) => (`${issue.summary || ''} ${issue.comments.map((comment) => comment.bodyText).join(' ')}`);
const classifyWorkTopic = (issue) => {
    const text = normalizeText(issueText(issue));
    const checks = [
        ['Training', /\b(training|handover|workshop|knowledge transfer|sosialisasi|enablement)\b/],
        ['Discussion', /\b(discussion|meeting|coordination|koordinasi|review|clarification|consult|sync)\b/],
        ['Creation', /\b(create|creation|setup|configure|configuration|implement|deployment|onboard|provision)\b/],
        ['Investigation', /\b(investigation|investigate|analysis|analisa|malicious|suspicious|threat|ioc|rca|forensic)\b/],
        ['Troubleshooting', /\b(troubleshoot|troubleshooting|error|failed|failure|issue|problem|down|cannot|unable|tidak bisa|gagal)\b/],
    ];
    return checks.find(([, regex]) => regex.test(text))?.[0] || 'Troubleshooting';
};
const classifyMappedWorkTopic = (issue) => {
    const text = normalizeText(issueText(issue));
    const checks = [
        ['Training', /\b(training|handover|workshop|knowledge transfer|sosialisasi|enablement)\b/],
        ['Discussion', /\b(discussion|meeting|coordination|koordinasi|review|clarification|consult|sync)\b/],
        ['Creation', /\b(create|creation|setup|configure|configuration|implement|deployment|onboard|provision)\b/],
        ['Investigation', /\b(investigation|investigate|analysis|analisa|malicious|suspicious|threat|ioc|rca|forensic)\b/],
        ['Troubleshooting', /\b(troubleshoot|troubleshooting|error|failed|failure|issue|problem|down|cannot|unable|tidak bisa|gagal)\b/],
    ];
    return checks.find(([, regex]) => regex.test(text))?.[0] || 'Other';
};
const classifySpecificTicketTopic = (issue) => {
    const text = normalizeText(issueText(issue));
    const checks = [
        ['On Demand Scan', /\b(on demand scan|ondemand scan|scan now|full scan|ioc scan)\b/],
        ['Investigation Malicious', /\b(malicious|malware|suspicious|threat|ioc|investigation|forensic|false positive)\b/],
        ['Query Creation', /\b(query|kql|lucene|sql|search query|detection query|report query)\b/],
        ['API Crowdstrike', /\b(crowdstrike api|falcon api|api crowdstrike|oauth falcon|falcon integration)\b/],
        ['Whitelist', /\b(whitelist|allowlist|exception|exclusion|exclude|bypass)\b/],
        ['Dashboard / Workflow', /\b(dashboard|workflow|automation|playbook|widget|visualization)\b/],
        ['Policy / IoA Setting', /\b(policy|ioa|indicator of attack|prevention rule|detection rule|sensor policy)\b/],
        ['Uninstall Sensor', /\b(uninstall|remove sensor|sensor removal|hapus sensor|agent removal)\b/],
        ['SIEM Connector', /\b(siem|connector|log source|log collector|parser|syslog|splunk|qradar)\b/],
        ['Kubernetes', /\b(kubernetes|k8s|cluster|pod|container|helm|namespace)\b/],
    ];
    return checks.find(([, regex]) => regex.test(text))?.[0] || classifyWorkTopic(issue);
};
const inferSolutionCategory = (issue) => {
    return classifyMappedWorkTopic(issue);
};
const topTopics = (issues) => {
    const counts = new Map();
    for (const issue of issues) {
        const topic = classifySpecificTicketTopic(issue);
        counts.set(topic, (counts.get(topic) || 0) + 1);
    }
    return Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([topic, count]) => ({ topic, count }));
};
const getExecutiveReport = async (req, res) => {
    try {
        const startDate = String(req.query.startDate || '');
        const endDate = String(req.query.endDate || '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
            return res.status(400).json({ error: 'startDate dan endDate wajib format YYYY-MM-DD' });
        }
        const clauses = [
            'issuekey ~ "SUP-"',
            'issuetype in ("[System] Problem", "[System] Change")',
            `created >= "${startDate}"`,
            `created <= "${endDate}"`,
        ];
        const jql = `${clauses.join(' AND ')} ORDER BY created ASC`;
        const issues = await (0, jiraService_1.searchJiraIssues)({
            jql,
            fields: ['summary', 'issuetype', 'project', 'status', 'priority', 'created', 'updated', 'resolutiondate', 'comment', 'timespent'],
        });
        const customers = new Map();
        const monthly = new Map();
        const solutionByCustomer = new Map();
        for (const issue of issues) {
            const customer = inferCustomer(issue);
            const type = classifyTicket(issue);
            const key = monthKey(issue.createdAt);
            const resolutionHours = hoursBetween(issue.createdAt, issue.resolutionDate);
            const solutionCategory = inferSolutionCategory(issue);
            const row = customers.get(customer) || {
                customer,
                totalTickets: 0,
                problem: 0,
                change: 0,
                avgResolutionHours: null,
                ticketsPerMonth: 0,
                problemPct: 0,
                _resolutionSum: 0,
                _resolutionCount: 0,
            };
            row.totalTickets += 1;
            if (type === 'problem')
                row.problem += 1;
            if (type === 'change')
                row.change += 1;
            if (resolutionHours !== null) {
                row._resolutionSum += resolutionHours;
                row._resolutionCount += 1;
            }
            customers.set(customer, row);
            const monthlyKey = `${key}__${customer}`;
            const monthRow = monthly.get(monthlyKey) || { month: key, customer, problem: 0, change: 0, total: 0 };
            monthRow.total += 1;
            if (type === 'problem')
                monthRow.problem += 1;
            if (type === 'change')
                monthRow.change += 1;
            monthly.set(monthlyKey, monthRow);
            const solutionCounts = solutionByCustomer.get(customer) || new Map();
            solutionCounts.set(solutionCategory, (solutionCounts.get(solutionCategory) || 0) + 1);
            solutionByCustomer.set(customer, solutionCounts);
        }
        const monthCount = Math.max(1, new Set(Array.from(monthly.values()).map((row) => row.month)).size);
        const customerRows = Array.from(customers.values()).map((row) => ({
            customer: row.customer,
            totalTickets: row.totalTickets,
            problem: row.problem,
            change: row.change,
            avgResolutionHours: row.totalTickets ? Number((row._resolutionSum / row.totalTickets).toFixed(2)) : 0,
            resolvedTicketCount: row._resolutionCount,
            totalResolutionHours: Number(row._resolutionSum.toFixed(2)),
            ticketsPerMonth: Number((row.totalTickets / monthCount).toFixed(2)),
            problemPct: row.totalTickets ? Number(((row.problem / row.totalTickets) * 100).toFixed(1)) : 0,
        })).sort((a, b) => b.totalTickets - a.totalTickets);
        res.json({
            period: { startDate, endDate },
            totals: {
                totalTickets: issues.length,
                problem: issues.filter((issue) => classifyTicket(issue) === 'problem').length,
                change: issues.filter((issue) => classifyTicket(issue) === 'change').length,
                customers: customerRows.length,
            },
            monthlyTrend: Array.from(monthly.values()).sort((a, b) => `${a.month}${a.customer}`.localeCompare(`${b.month}${b.customer}`)),
            customerRows,
            solutionCategories: Array.from(solutionByCustomer.entries()).map(([customer, counts]) => ({
                customer,
                categories: Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(([category, count]) => ({ category, count })),
            })),
            topTopics: topTopics(issues),
            issues: issues.map((issue) => ({
                key: issue.key,
                summary: issue.summary,
                customer: inferCustomer(issue),
                type: classifyTicket(issue),
                workTopic: classifyWorkTopic(issue),
                ticketTopic: classifySpecificTicketTopic(issue),
                status: issue.statusName,
                createdAt: issue.createdAt,
                resolutionDate: issue.resolutionDate,
                resolutionHours: hoursBetween(issue.createdAt, issue.resolutionDate),
                priority: issue.priorityName,
            })),
        });
    }
    catch (error) {
        req.log?.error(error, 'Executive report failed');
        res.status(500).json({ error: error.message || 'Failed to build executive report' });
    }
};
exports.getExecutiveReport = getExecutiveReport;

import { Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import { searchJiraIssues, JiraSearchIssue } from '../services/jiraService';

const monthKey = (value: string | null | undefined) => String(value || '').slice(0, 7) || 'unknown';

const hoursBetween = (start?: string | null, end?: string | null) => {
  if (!start || !end) return null;
  const diff = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(diff) || diff < 0) return null;
  return diff / 36e5;
};

const ticketMetric = (value?: number | null) => Number((Number(value || 0) || 0).toFixed(2));

const ticketNumber = (key: string | null | undefined) => {
  const match = String(key || '').match(/(\d+)$/);
  return match ? Number(match[1]) : 0;
};

const isLaterTicketState = (
  candidate: { key: string; createdAt: string | null },
  current?: { key: string; createdAt: string | null } | null
) => {
  if (!current) return true;
  const candidateTime = candidate.createdAt ? new Date(candidate.createdAt).getTime() : 0;
  const currentTime = current.createdAt ? new Date(current.createdAt).getTime() : 0;
  if (candidateTime !== currentTime) return candidateTime > currentTime;
  return ticketNumber(candidate.key) > ticketNumber(current.key);
};

const classifyTicket = (issue: JiraSearchIssue) => {
  const type = String(issue.issueTypeName || '').toLowerCase();
  if (type.includes('change')) return 'change';
  if (type.includes('problem')) return 'problem';
  return issue.key.toUpperCase().startsWith('SUP-') ? 'problem' : 'other';
};

const CUSTOMER_ALIASES: Array<[string, string[]]> = [
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

const normalizeText = (value: string | null | undefined) => String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();

const normalizeCustomer = (rawCustomer: string) => {
  const normalized = normalizeText(rawCustomer);
  for (const [canonical, aliases] of CUSTOMER_ALIASES) {
    if (aliases.some((alias) => normalized.includes(normalizeText(alias)))) return canonical;
  }
  return rawCustomer;
};

const inferCustomerIdentity = (issue: JiraSearchIssue) => {
  if (issue.customerName) return issue.customerName.trim() || 'Unknown Customer';
  const summary = String(issue.summary || '');
  const bracket = summary.match(/\[(.*?)\]/);
  if (bracket?.[1] && !/system|problem|change/i.test(bracket[1])) return bracket[1].trim();
  const dashParts = summary.split(/\s[-–—]\s/).map((part) => part.trim()).filter(Boolean);
  if (dashParts.length >= 2 && dashParts[0].length <= 60) return dashParts[0];
  const mapped = normalizeCustomer(summary);
  if (mapped !== summary) return mapped;
  return 'Unknown Customer';
};

const inferCustomer = (issue: JiraSearchIssue) => normalizeCustomer(inferCustomerIdentity(issue));

const issueText = (issue: JiraSearchIssue) => (
  `${issue.summary || ''} ${issue.comments.map((comment) => comment.bodyText).join(' ')}`
);

const classifyWorkTopic = (issue: JiraSearchIssue) => {
  const text = normalizeText(issueText(issue));
  const checks: Array<[string, RegExp]> = [
    ['Training', /\b(training|handover|workshop|knowledge transfer|sosialisasi|enablement)\b/],
    ['Discussion', /\b(discussion|meeting|coordination|koordinasi|review|clarification|consult|sync)\b/],
    ['Creation', /\b(create|creation|setup|configure|configuration|implement|deployment|onboard|provision)\b/],
    ['Investigation', /\b(investigation|investigate|analysis|analisa|malicious|suspicious|threat|ioc|rca|forensic)\b/],
    ['Troubleshooting', /\b(troubleshoot|troubleshooting|error|failed|failure|issue|problem|down|cannot|unable|tidak bisa|gagal)\b/],
  ];
  return checks.find(([, regex]) => regex.test(text))?.[0] || 'Troubleshooting';
};

const classifyMappedWorkTopic = (issue: JiraSearchIssue) => {
  const text = normalizeText(issueText(issue));
  const checks: Array<[string, RegExp]> = [
    ['Training', /\b(training|handover|workshop|knowledge transfer|sosialisasi|enablement)\b/],
    ['Discussion', /\b(discussion|meeting|coordination|koordinasi|review|clarification|consult|sync)\b/],
    ['Creation', /\b(create|creation|setup|configure|configuration|implement|deployment|onboard|provision)\b/],
    ['Investigation', /\b(investigation|investigate|analysis|analisa|malicious|suspicious|threat|ioc|rca|forensic)\b/],
    ['Troubleshooting', /\b(troubleshoot|troubleshooting|error|failed|failure|issue|problem|down|cannot|unable|tidak bisa|gagal)\b/],
  ];
  return checks.find(([, regex]) => regex.test(text))?.[0] || 'Other';
};

const classifySpecificTicketTopic = (issue: JiraSearchIssue) => {
  const text = normalizeText(issueText(issue));
  const checks: Array<[string, RegExp]> = [
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

const inferSolutionCategory = (issue: JiraSearchIssue) => {
  return classifyMappedWorkTopic(issue);
};

const topTopics = (issues: JiraSearchIssue[]) => {
  const counts = new Map<string, number>();
  for (const issue of issues) {
    const topic = classifySpecificTicketTopic(issue);
    counts.set(topic, (counts.get(topic) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([topic, count]) => ({ topic, count }));
};

export const getExecutiveReport = async (req: AuthRequest, res: Response) => {
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

    const issues = await searchJiraIssues({
      jql,
      fields: ['summary', 'issuetype', 'project', 'status', 'priority', 'created', 'updated', 'resolutiondate', 'comment', 'timespent'],
    });

    const customers = new Map<string, any>();
    const monthly = new Map<string, any>();
    const solutionByCustomer = new Map<string, Map<string, number>>();

    for (const issue of issues) {
      const customerIdentity = inferCustomerIdentity(issue);
      const customer = inferCustomer(issue);
      const type = classifyTicket(issue);
      const key = monthKey(issue.createdAt);
      const resolutionHours = hoursBetween(issue.actualStartDate, issue.actualEndDate);
      const solutionCategory = inferSolutionCategory(issue);

      const row = customers.get(customer) || {
        customer,
        totalTickets: 0,
        problem: 0,
        change: 0,
        avgResolutionHours: null,
        ticketsPerMonth: 0,
        problemPct: 0,
        remainingTickets: 0,
        totalChangeTickets: 0,
        changeTicketUsed: 0,
        _latestChangeTicketState: null,
        _identityStates: new Map<string, any>(),
        _identityTicketUsed: new Map<string, number>(),
        _resolutionSum: 0,
        _resolutionCount: 0,
      };
      row.totalTickets += 1;
      if (type === 'problem') row.problem += 1;
      if (type === 'change') {
        row.change += 1;
        row.changeTicketUsed += ticketMetric(issue.ticketUsed);
        row._identityTicketUsed.set(
          customerIdentity,
          ticketMetric((row._identityTicketUsed.get(customerIdentity) || 0) + ticketMetric(issue.ticketUsed))
        );
        const currentIdentityState = row._identityStates.get(customerIdentity);
        if (isLaterTicketState(issue, currentIdentityState)) {
          row._identityStates.set(customerIdentity, {
            identity: customerIdentity,
            key: issue.key,
            createdAt: issue.createdAt,
            ticketUsed: ticketMetric(issue.ticketUsed),
            totalTicket: ticketMetric(issue.totalTicket),
            remainingTicket: ticketMetric(issue.remainingTicket),
          });
        }
        if (isLaterTicketState(issue, row._latestChangeTicketState)) {
          row._latestChangeTicketState = {
            key: issue.key,
            createdAt: issue.createdAt,
            totalTicket: ticketMetric(issue.totalTicket),
            remainingTicket: ticketMetric(issue.remainingTicket),
          };
        }
      }
      if (resolutionHours !== null) {
        row._resolutionSum += resolutionHours;
        row._resolutionCount += 1;
      }
      customers.set(customer, row);

      const monthlyKey = `${key}__${customer}`;
      const monthRow = monthly.get(monthlyKey) || { month: key, customer, problem: 0, change: 0, total: 0 };
      monthRow.total += 1;
      if (type === 'problem') monthRow.problem += 1;
      if (type === 'change') monthRow.change += 1;
      monthly.set(monthlyKey, monthRow);

      const solutionCounts = solutionByCustomer.get(customer) || new Map<string, number>();
      solutionCounts.set(solutionCategory, (solutionCounts.get(solutionCategory) || 0) + 1);
      solutionByCustomer.set(customer, solutionCounts);
    }

    const monthCount = Math.max(1, new Set(Array.from(monthly.values()).map((row) => row.month)).size);
    const customerRows = Array.from(customers.values()).map((row) => {
      const ticketIdentities = Array.from(row._identityStates.values())
        .sort((a: any, b: any) => a.identity.localeCompare(b.identity))
        .map((state: any) => ({
          identity: state.identity,
          latestChangeTicketKey: state.key,
          ticketUsed: ticketMetric(row._identityTicketUsed.get(state.identity) || 0),
          latestTicketUsed: state.ticketUsed,
          totalTicket: state.totalTicket,
          remainingTicket: state.remainingTicket,
        }));
      return {
        customer: row.customer,
        totalTickets: row.totalTickets,
        problem: row.problem,
        change: row.change,
        avgResolutionHours: row._resolutionCount ? Number((row._resolutionSum / row.totalTickets).toFixed(2)) : null,
        resolvedTicketCount: row._resolutionCount,
        totalResolutionHours: Number(row._resolutionSum.toFixed(2)),
        ticketsPerMonth: Number((row.totalTickets / monthCount).toFixed(2)),
        problemPct: row.totalTickets ? Number(((row.problem / row.totalTickets) * 100).toFixed(1)) : 0,
        totalChangeTickets: ticketMetric(ticketIdentities.reduce((sum, item) => sum + Number(item.totalTicket || 0), 0)),
        remainingTickets: ticketMetric(ticketIdentities.reduce((sum, item) => sum + Number(item.remainingTicket || 0), 0)),
        latestChangeTicketKey: row._latestChangeTicketState?.key || null,
        changeTicketUsed: Number(row.changeTicketUsed.toFixed(2)),
        ticketIdentities,
      };
    }).sort((a, b) => b.totalTickets - a.totalTickets);

    const totalChangeTickets = ticketMetric(customerRows.reduce((sum, row) => sum + Number(row.totalChangeTickets || 0), 0));
    const remainingTickets = ticketMetric(customerRows.reduce((sum, row) => sum + Number(row.remainingTickets || 0), 0));
    const changeTicketUsed = ticketMetric(
      issues
        .filter((issue) => classifyTicket(issue) === 'change')
        .reduce((sum, issue) => sum + Number(issue.ticketUsed || 0), 0)
    );

    res.json({
      period: { startDate, endDate },
      totals: {
        totalTickets: issues.length,
        totalTicketUsed: changeTicketUsed,
        totalChangeTickets,
        remainingTickets,
        problem: issues.filter((issue) => classifyTicket(issue) === 'problem').length,
        change: issues.filter((issue) => classifyTicket(issue) === 'change').length,
        changeTicketUsed,
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
        customerIdentity: inferCustomerIdentity(issue),
        type: classifyTicket(issue),
        workTopic: classifyWorkTopic(issue),
        ticketTopic: classifySpecificTicketTopic(issue),
        status: issue.statusName,
        statusCategoryKey: issue.statusCategoryKey,
        createdAt: issue.createdAt,
        actualStartDate: issue.actualStartDate,
        actualEndDate: issue.actualEndDate,
        resolutionDate: issue.resolutionDate,
        resolutionHours: hoursBetween(issue.actualStartDate, issue.actualEndDate),
        priority: issue.priorityName,
        timeSpentSeconds: issue.timeSpentSeconds,
        ticketUsed: issue.ticketUsed,
        totalTicket: issue.totalTicket,
        remainingTicket: issue.remainingTicket,
      })),
    });
  } catch (error: any) {
    req.log?.error(error, 'Executive report failed');
    res.status(500).json({ error: error.message || 'Failed to build executive report' });
  }
};

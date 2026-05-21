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

const classifyTicket = (issue: JiraSearchIssue) => {
  const type = String(issue.issueTypeName || '').toLowerCase();
  if (type.includes('change')) return 'change';
  if (type.includes('problem')) return 'problem';
  return issue.key.toUpperCase().startsWith('SUP-') ? 'problem' : 'other';
};

const inferCustomer = (issue: JiraSearchIssue) => {
  if (issue.customerName) return issue.customerName;
  const summary = String(issue.summary || '');
  const bracket = summary.match(/\[(.*?)\]/);
  if (bracket?.[1] && !/system|problem|change/i.test(bracket[1])) return bracket[1].trim();
  const dashParts = summary.split(/\s[-–—]\s/).map((part) => part.trim()).filter(Boolean);
  if (dashParts.length >= 2 && dashParts[0].length <= 60) return dashParts[0];
  return 'Unknown Customer';
};

const inferSolutionCategory = (issue: JiraSearchIssue) => {
  const text = `${issue.summary || ''} ${issue.comments.map((comment) => comment.bodyText).join(' ')}`.toLowerCase();
  const checks: Array<[string, RegExp]> = [
    ['Network / Connectivity', /\b(network|connect|vpn|link|latency|packet|routing|dns)\b/],
    ['Security Policy / Firewall', /\b(firewall|policy|rule|waf|ips|ids|block|allow)\b/],
    ['Endpoint / Agent', /\b(endpoint|agent|sensor|edr|client)\b/],
    ['SIEM / Log', /\b(siem|log|parser|correlation|event|collector)\b/],
    ['Access / Account', /\b(access|login|user|account|permission|role|password)\b/],
    ['Certificate / SSL', /\b(cert|certificate|ssl|tls|expired)\b/],
    ['Server / Platform', /\b(server|service|cpu|memory|disk|database|db|pod|container)\b/],
  ];
  return checks.find(([, regex]) => regex.test(text))?.[0] || 'General / Others';
};

const topTopics = (issues: JiraSearchIssue[]) => {
  const stopWords = new Set(['the', 'and', 'atau', 'yang', 'untuk', 'dari', 'pada', 'dengan', 'issue', 'problem', 'change', 'request', 'error']);
  const counts = new Map<string, number>();
  for (const issue of issues) {
    const words = String(issue.summary || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
      .split(/\s+/)
      .map((word) => word.trim())
      .filter((word) => word.length >= 4 && !stopWords.has(word));
    for (const word of words) counts.set(word, (counts.get(word) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
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
      if (type === 'problem') row.problem += 1;
      if (type === 'change') row.change += 1;
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
    const customerRows = Array.from(customers.values()).map((row) => ({
      customer: row.customer,
      totalTickets: row.totalTickets,
      problem: row.problem,
      change: row.change,
      avgResolutionHours: row._resolutionCount ? Number((row._resolutionSum / row._resolutionCount).toFixed(2)) : null,
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
        status: issue.statusName,
        createdAt: issue.createdAt,
        resolutionDate: issue.resolutionDate,
        resolutionHours: hoursBetween(issue.createdAt, issue.resolutionDate),
        priority: issue.priorityName,
      })),
    });
  } catch (error: any) {
    req.log?.error(error, 'Executive report failed');
    res.status(500).json({ error: error.message || 'Failed to build executive report' });
  }
};

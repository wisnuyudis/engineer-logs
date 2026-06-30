import { PrismaClient } from '@prisma/client';
import { fetchJiraIssue, fetchJiraWorklog, resolveJiraActKey } from './jiraService';

const prisma = new PrismaClient();

const getAppTimeZone = () => process.env.APP_TIMEZONE || 'Asia/Jakarta';

const getDatePartsInAppTimeZone = () => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: getAppTimeZone(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(new Date());
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
};

export const getTodayDateKey = () => {
  const values = getDatePartsInAppTimeZone();
  return `${values.year}-${values.month}-${values.day}`;
};

export const getCurrentMonthKey = () => {
  const values = getDatePartsInAppTimeZone();
  return `${values.year}-${values.month}`;
};

const toDateParts = (isoString: string | null) => {
  if (!isoString) {
    return {
      date: new Date().toISOString().slice(0, 10),
      startTime: null as string | null,
    };
  }

  const jiraDateTime = isoString.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (jiraDateTime) {
    return {
      date: jiraDateTime[1],
      startTime: `${jiraDateTime[2]}:${jiraDateTime[3]}`,
    };
  }

  const date = new Date(isoString);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return {
    date: date.toISOString().slice(0, 10),
    startTime: `${hh}:${mm}`,
  };
};

const addMinutes = (time: string | null, minutes: number) => {
  if (!time) return null;
  const [hours, mins] = time.split(':').map(Number);
  const total = hours * 60 + mins + minutes;
  const hh = String(Math.floor(total / 60) % 24).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
};

export const syncJiraWorklogToActivity = async (
  issueKeyOrId: string,
  worklogId: string,
  options: { onlyDate?: string | null; onlyMonth?: string | null } = {}
) => {
  const [issue, worklog] = await Promise.all([
    fetchJiraIssue(issueKeyOrId),
    fetchJiraWorklog(issueKeyOrId, worklogId),
  ]);

  if (!worklog.authorAccountId) {
    throw new Error(`Worklog ${worklogId} tidak memiliki author accountId.`);
  }

  const user = await prisma.user.findFirst({
    where: { jiraAccountId: worklog.authorAccountId }
  });

  if (!user) {
    throw new Error(`Belum ada user app yang terhubung ke Jira accountId ${worklog.authorAccountId}.`);
  }

  const { date, startTime } = toDateParts(worklog.started);
  const allowedDate = options.onlyDate === undefined ? null : options.onlyDate;
  if (allowedDate && date !== allowedDate) {
    return null;
  }
  const allowedMonth = options.onlyMonth === undefined ? null : options.onlyMonth;
  if (allowedMonth && date.slice(0, 7) !== allowedMonth) {
    return null;
  }

  const durMinutes = Math.max(1, Math.round(worklog.timeSpentSeconds / 60));
  const endTime = addMinutes(startTime, durMinutes);
  const actKey = resolveJiraActKey(
    issue.key,
    issue.issueTypeName,
    issue.projectName,
    issue.workTypeName
  );
  const topic = `${issue.key} - ${issue.summary || 'No Summary'}`;
  const note = worklog.commentText || `Synced from Jira worklog ${worklog.id}`;

  const existing = await prisma.activity.findFirst({
    where: { jiraWorklogId: worklog.id }
  });

  const payload = {
    userId: user.id,
    actKey,
    topic,
    note,
    dur: durMinutes,
    date,
    startTime,
    endTime,
    status: 'completed',
    source: 'jira',
    ticketId: issue.key,
    jiraIssueId: issue.id,
    jiraWorklogId: worklog.id,
    jiraAuthorAccountId: worklog.authorAccountId,
    jiraUpdatedAt: worklog.updated ? new Date(worklog.updated) : new Date(),
    ticketTitle: issue.summary,
  };

  if (existing) {
    return prisma.activity.update({
      where: { id: existing.id },
      data: payload,
    });
  }

  return prisma.activity.create({
    data: payload,
  });
};

export const syncTodayJiraWorklogToActivity = (issueKeyOrId: string, worklogId: string) =>
  syncJiraWorklogToActivity(issueKeyOrId, worklogId, { onlyDate: getTodayDateKey() });

export const syncCurrentMonthJiraWorklogToActivity = (issueKeyOrId: string, worklogId: string) =>
  syncJiraWorklogToActivity(issueKeyOrId, worklogId, { onlyMonth: getCurrentMonthKey() });

export const deleteSyncedJiraWorklog = async (worklogId: string, options: { onlyDate?: string | null; onlyMonth?: string | null } = {}) => {
  const activity = await prisma.activity.findFirst({
    where: { jiraWorklogId: worklogId }
  });

  if (!activity) return null;
  if (options.onlyDate && activity.date !== options.onlyDate) return null;
  if (options.onlyMonth && activity.date.slice(0, 7) !== options.onlyMonth) return null;
  return prisma.activity.delete({
    where: { id: activity.id }
  });
};

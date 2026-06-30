"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteSyncedJiraWorklog = exports.syncTodayJiraWorklogToActivity = exports.syncJiraWorklogToActivity = exports.getTodayDateKey = void 0;
const client_1 = require("@prisma/client");
const jiraService_1 = require("./jiraService");
const prisma = new client_1.PrismaClient();
const getAppTimeZone = () => process.env.APP_TIMEZONE || 'Asia/Jakarta';
const getTodayDateKey = () => {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: getAppTimeZone(),
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
    const parts = formatter.formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
};
exports.getTodayDateKey = getTodayDateKey;
const toDateParts = (isoString) => {
    if (!isoString) {
        return {
            date: new Date().toISOString().slice(0, 10),
            startTime: null,
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
const addMinutes = (time, minutes) => {
    if (!time)
        return null;
    const [hours, mins] = time.split(':').map(Number);
    const total = hours * 60 + mins + minutes;
    const hh = String(Math.floor(total / 60) % 24).padStart(2, '0');
    const mm = String(total % 60).padStart(2, '0');
    return `${hh}:${mm}`;
};
const syncJiraWorklogToActivity = async (issueKeyOrId, worklogId, options = {}) => {
    const [issue, worklog] = await Promise.all([
        (0, jiraService_1.fetchJiraIssue)(issueKeyOrId),
        (0, jiraService_1.fetchJiraWorklog)(issueKeyOrId, worklogId),
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
    const durMinutes = Math.max(1, Math.round(worklog.timeSpentSeconds / 60));
    const endTime = addMinutes(startTime, durMinutes);
    const actKey = (0, jiraService_1.resolveJiraActKey)(issue.key, issue.issueTypeName, issue.projectName, issue.workTypeName);
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
exports.syncJiraWorklogToActivity = syncJiraWorklogToActivity;
const syncTodayJiraWorklogToActivity = (issueKeyOrId, worklogId) => (0, exports.syncJiraWorklogToActivity)(issueKeyOrId, worklogId, { onlyDate: (0, exports.getTodayDateKey)() });
exports.syncTodayJiraWorklogToActivity = syncTodayJiraWorklogToActivity;
const deleteSyncedJiraWorklog = async (worklogId, options = {}) => {
    const activity = await prisma.activity.findFirst({
        where: { jiraWorklogId: worklogId }
    });
    if (!activity)
        return null;
    if (options.onlyDate && activity.date !== options.onlyDate)
        return null;
    return prisma.activity.delete({
        where: { id: activity.id }
    });
};
exports.deleteSyncedJiraWorklog = deleteSyncedJiraWorklog;

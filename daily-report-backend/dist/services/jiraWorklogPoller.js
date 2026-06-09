"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startJiraWorklogPoller = exports.pollJiraWorklogsOnce = void 0;
const client_1 = require("@prisma/client");
const jiraService_1 = require("./jiraService");
const jiraSyncService_1 = require("./jiraSyncService");
const auditTrail_1 = require("../utils/auditTrail");
const prisma = new client_1.PrismaClient();
const SETTING_KEY = 'jira_worklog_poll_since';
let timer = null;
let running = false;
const envBool = (value, fallback) => {
    if (value === undefined)
        return fallback;
    return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
};
const getIntervalMs = () => Math.max(60000, Number(process.env.JIRA_WORKLOG_POLL_INTERVAL_MS || 300000));
const getLookbackMs = () => Math.max(60000, Number(process.env.JIRA_WORKLOG_POLL_LOOKBACK_HOURS || 168) * 60 * 60 * 1000);
const getMaxUpdatesPerRun = () => Math.max(1, Number(process.env.JIRA_WORKLOG_POLL_MAX_UPDATES || 200));
const getSince = async () => {
    const setting = await prisma.setting.findUnique({ where: { key: SETTING_KEY } });
    const stored = Number(setting?.value || 0);
    if (Number.isFinite(stored) && stored > 0)
        return stored;
    return Date.now() - getLookbackMs();
};
const setSince = async (since) => {
    await prisma.setting.upsert({
        where: { key: SETTING_KEY },
        update: {
            value: String(since),
            description: 'Last Jira worklog poll cursor in epoch milliseconds',
        },
        create: {
            key: SETTING_KEY,
            value: String(since),
            description: 'Last Jira worklog poll cursor in epoch milliseconds',
        },
    });
};
const pollJiraWorklogsOnce = async () => {
    if (running)
        return { skipped: true, reason: 'already_running' };
    running = true;
    const since = await getSince();
    let nextSince = since;
    let synced = 0;
    let deleted = 0;
    const errors = [];
    try {
        const [updatedResult, deletedResult] = await Promise.all([
            (0, jiraService_1.fetchUpdatedJiraWorklogChanges)(since),
            (0, jiraService_1.fetchDeletedJiraWorklogChanges)(since),
        ]);
        nextSince = Math.max(since, updatedResult.until || since, deletedResult.until || since);
        for (const change of deletedResult.values) {
            try {
                await (0, jiraSyncService_1.deleteSyncedJiraWorklog)(change.worklogId);
                deleted += 1;
            }
            catch (error) {
                errors.push({ worklogId: change.worklogId, error: error.message || 'Gagal menghapus worklog Jira' });
            }
        }
        const deletedIds = new Set(deletedResult.values.map((item) => item.worklogId));
        const updatedValues = updatedResult.values
            .filter((item) => !deletedIds.has(item.worklogId))
            .slice(0, getMaxUpdatesPerRun());
        const updatedWorklogs = await (0, jiraService_1.fetchJiraWorklogsByIds)(updatedValues.map((item) => item.worklogId));
        const issueIdByWorklogId = new Map(updatedWorklogs.map((worklog) => [worklog.id, worklog.issueId]));
        for (const change of updatedValues) {
            try {
                const issueId = issueIdByWorklogId.get(change.worklogId);
                if (!issueId)
                    throw new Error('Issue ID worklog Jira tidak ditemukan dari endpoint worklog/list.');
                const activity = await (0, jiraSyncService_1.syncJiraWorklogToActivity)(issueId, change.worklogId);
                synced += activity ? 1 : 0;
            }
            catch (error) {
                errors.push({ worklogId: change.worklogId, error: error.message || 'Gagal sync worklog Jira' });
            }
        }
        await setSince(nextSince);
        await (0, auditTrail_1.writeAuditSystem)({
            action: errors.length ? 'jira.worklog_poll.partial' : 'jira.worklog_poll.synced',
            entityType: 'jira_worklog_poll',
            metadata: {
                since,
                nextSince,
                updatedSeen: updatedResult.values.length,
                deletedSeen: deletedResult.values.length,
                synced,
                deleted,
                errors: errors.slice(0, 20),
            },
        });
        return { skipped: false, since, nextSince, synced, deleted, errors };
    }
    catch (error) {
        await (0, auditTrail_1.writeAuditSystem)({
            action: 'jira.worklog_poll.failed',
            entityType: 'jira_worklog_poll',
            metadata: { since, nextSince, error: error.message || 'Jira worklog poll failed' },
        });
        throw error;
    }
    finally {
        running = false;
    }
};
exports.pollJiraWorklogsOnce = pollJiraWorklogsOnce;
const startJiraWorklogPoller = () => {
    const enabled = envBool(process.env.JIRA_WORKLOG_POLL_ENABLED, true);
    if (!enabled)
        return;
    if (timer)
        return;
    if (!process.env.JIRA_BASE_URL || !process.env.JIRA_USER_EMAIL || !process.env.JIRA_API_TOKEN) {
        console.warn('Jira worklog poller disabled: Jira credentials are not configured.');
        return;
    }
    const run = () => {
        (0, exports.pollJiraWorklogsOnce)().catch((error) => {
            console.error('Jira worklog poller failed:', error.message || error);
        });
    };
    run();
    timer = setInterval(run, getIntervalMs());
    console.log(`Jira worklog poller started. interval=${getIntervalMs()}ms`);
};
exports.startJiraWorklogPoller = startJiraWorklogPoller;

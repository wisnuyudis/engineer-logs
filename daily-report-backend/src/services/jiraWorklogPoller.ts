import { PrismaClient } from '@prisma/client';
import { fetchDeletedJiraWorklogChanges, fetchJiraWorklogsByIds, fetchUpdatedJiraWorklogChanges } from './jiraService';
import { deleteSyncedJiraWorklog, syncJiraWorklogToActivity } from './jiraSyncService';
import { writeAuditSystem } from '../utils/auditTrail';

const prisma = new PrismaClient();

const SETTING_KEY = 'jira_worklog_poll_since';
let timer: NodeJS.Timeout | null = null;
let running = false;

const envBool = (value: string | undefined, fallback: boolean) => {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
};

const getIntervalMs = () => Math.max(60_000, Number(process.env.JIRA_WORKLOG_POLL_INTERVAL_MS || 300_000));
const getLookbackMs = () => Math.max(60_000, Number(process.env.JIRA_WORKLOG_POLL_LOOKBACK_HOURS || 168) * 60 * 60 * 1000);
const getMaxUpdatesPerRun = () => Math.max(1, Number(process.env.JIRA_WORKLOG_POLL_MAX_UPDATES || 200));

const getSince = async () => {
  const setting = await prisma.setting.findUnique({ where: { key: SETTING_KEY } });
  const stored = Number(setting?.value || 0);
  if (Number.isFinite(stored) && stored > 0) return stored;
  return Date.now() - getLookbackMs();
};

const setSince = async (since: number) => {
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

export const pollJiraWorklogsOnce = async () => {
  if (running) return { skipped: true, reason: 'already_running' };
  running = true;

  const since = await getSince();
  let nextSince = since;
  let synced = 0;
  let deleted = 0;
  const errors: Array<{ worklogId: string; error: string }> = [];

  try {
    const [updatedResult, deletedResult] = await Promise.all([
      fetchUpdatedJiraWorklogChanges(since),
      fetchDeletedJiraWorklogChanges(since),
    ]);
    nextSince = Math.max(since, updatedResult.until || since, deletedResult.until || since);

    for (const change of deletedResult.values) {
      try {
        await deleteSyncedJiraWorklog(change.worklogId);
        deleted += 1;
      } catch (error: any) {
        errors.push({ worklogId: change.worklogId, error: error.message || 'Gagal menghapus worklog Jira' });
      }
    }

    const deletedIds = new Set(deletedResult.values.map((item) => item.worklogId));
    const updatedValues = updatedResult.values
      .filter((item) => !deletedIds.has(item.worklogId))
      .slice(0, getMaxUpdatesPerRun());
    const updatedWorklogs = await fetchJiraWorklogsByIds(updatedValues.map((item) => item.worklogId));
    const issueIdByWorklogId = new Map(updatedWorklogs.map((worklog) => [worklog.id, worklog.issueId]));

    for (const change of updatedValues) {
      try {
        const issueId = issueIdByWorklogId.get(change.worklogId);
        if (!issueId) throw new Error('Issue ID worklog Jira tidak ditemukan dari endpoint worklog/list.');
        const activity = await syncJiraWorklogToActivity(issueId, change.worklogId);
        synced += activity ? 1 : 0;
      } catch (error: any) {
        errors.push({ worklogId: change.worklogId, error: error.message || 'Gagal sync worklog Jira' });
      }
    }

    await setSince(nextSince);

    await writeAuditSystem({
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
  } catch (error: any) {
    await writeAuditSystem({
      action: 'jira.worklog_poll.failed',
      entityType: 'jira_worklog_poll',
      metadata: { since, nextSince, error: error.message || 'Jira worklog poll failed' },
    });
    throw error;
  } finally {
    running = false;
  }
};

export const startJiraWorklogPoller = () => {
  const enabled = envBool(process.env.JIRA_WORKLOG_POLL_ENABLED, true);
  if (!enabled) return;
  if (timer) return;
  if (!process.env.JIRA_BASE_URL || !process.env.JIRA_USER_EMAIL || !process.env.JIRA_API_TOKEN) {
    console.warn('Jira worklog poller disabled: Jira credentials are not configured.');
    return;
  }

  const run = () => {
    pollJiraWorklogsOnce().catch((error) => {
      console.error('Jira worklog poller failed:', error.message || error);
    });
  };

  run();
  timer = setInterval(run, getIntervalMs());
  console.log(`Jira worklog poller started. interval=${getIntervalMs()}ms`);
};

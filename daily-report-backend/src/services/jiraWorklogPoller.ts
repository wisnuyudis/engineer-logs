import { PrismaClient } from '@prisma/client';
import { fetchDeletedJiraWorklogChanges, fetchJiraWorklogsByIds, fetchUpdatedJiraWorklogChanges } from './jiraService';
import { deleteSyncedJiraWorklog, getTodayDateKey, syncJiraWorklogToActivity } from './jiraSyncService';

const prisma = new PrismaClient();

const SETTING_KEY = 'jira_worklog_poll_since';
let timer: NodeJS.Timeout | null = null;
let running = false;

const envBool = (value: string | undefined, fallback: boolean) => {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
};

const getIntervalMs = () => Math.max(60_000, Number(process.env.JIRA_WORKLOG_POLL_INTERVAL_MS || 300_000));
const getMaxUpdatesPerRun = () => Math.max(1, Number(process.env.JIRA_WORKLOG_POLL_MAX_UPDATES || 200));
const getTodayStartMs = () => Date.parse(`${getTodayDateKey()}T00:00:00+07:00`);

const toNumber = (value: unknown) => {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
};

const getSince = async () => {
  const setting = await prisma.setting.findUnique({ where: { key: SETTING_KEY } });
  const stored = Number(setting?.value || 0);
  const todayStart = getTodayStartMs();
  if (Number.isFinite(stored) && stored > 0) return Math.max(Math.min(stored, Date.now()), todayStart);
  return todayStart;
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

const upsertDailyPollAudit = async (
  action: 'jira.worklog_poll.synced' | 'jira.worklog_poll.partial' | 'jira.worklog_poll.failed',
  todayDate: string,
  runMetadata: Record<string, any>
) => {
  const entityId = `jira_worklog_poll:${todayDate}`;
  const current = await prisma.auditLog.findFirst({
    where: {
      entityType: 'jira_worklog_poll',
      entityId,
    },
    orderBy: { createdAt: 'desc' },
  });
  const currentMetadata = (current?.metadata && typeof current.metadata === 'object' && !Array.isArray(current.metadata))
    ? current.metadata as Record<string, any>
    : {};
  const runCount = toNumber(currentMetadata.runCount) + 1;
  const errors = [
    ...((Array.isArray(currentMetadata.errors) ? currentMetadata.errors : []) as any[]),
    ...((Array.isArray(runMetadata.errors) ? runMetadata.errors : []) as any[]),
  ].slice(-20);
  const nextMetadata = {
    ...currentMetadata,
    onlyDate: todayDate,
    runCount,
    firstRunAt: currentMetadata.firstRunAt || new Date().toISOString(),
    lastRunAt: new Date().toISOString(),
    lastAction: action,
    lastSince: runMetadata.since,
    lastNextSince: runMetadata.nextSince,
    updatedSeen: toNumber(currentMetadata.updatedSeen) + toNumber(runMetadata.updatedSeen),
    deletedSeen: toNumber(currentMetadata.deletedSeen) + toNumber(runMetadata.deletedSeen),
    synced: toNumber(currentMetadata.synced) + toNumber(runMetadata.synced),
    deleted: toNumber(currentMetadata.deleted) + toNumber(runMetadata.deleted),
    skippedOutOfDate: toNumber(currentMetadata.skippedOutOfDate) + toNumber(runMetadata.skippedOutOfDate),
    failedRuns: toNumber(currentMetadata.failedRuns) + (action === 'jira.worklog_poll.failed' ? 1 : 0),
    partialRuns: toNumber(currentMetadata.partialRuns) + (action === 'jira.worklog_poll.partial' ? 1 : 0),
    errors,
  };

  if (current) {
    await prisma.auditLog.update({
      where: { id: current.id },
      data: {
        action,
        metadata: nextMetadata as any,
      },
    });
    return;
  }

  await prisma.auditLog.create({
    data: {
      action,
      entityType: 'jira_worklog_poll',
      entityId,
      metadata: nextMetadata as any,
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
  let skippedOutOfDate = 0;
  const errors: Array<{ worklogId: string; error: string }> = [];
  const todayDate = getTodayDateKey();

  try {
    const [updatedResult, deletedResult] = await Promise.all([
      fetchUpdatedJiraWorklogChanges(since),
      fetchDeletedJiraWorklogChanges(since),
    ]);
    nextSince = Math.max(since, updatedResult.until || since, deletedResult.until || since);

    for (const change of deletedResult.values) {
      try {
        const deletedActivity = await deleteSyncedJiraWorklog(change.worklogId, { onlyDate: todayDate });
        if (deletedActivity) deleted += 1;
        else skippedOutOfDate += 1;
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
        const activity = await syncJiraWorklogToActivity(issueId, change.worklogId, { onlyDate: todayDate });
        if (activity) synced += 1;
        else skippedOutOfDate += 1;
      } catch (error: any) {
        errors.push({ worklogId: change.worklogId, error: error.message || 'Gagal sync worklog Jira' });
      }
    }

    await setSince(nextSince);

    await upsertDailyPollAudit(errors.length ? 'jira.worklog_poll.partial' : 'jira.worklog_poll.synced', todayDate, {
      since,
      nextSince,
      updatedSeen: updatedResult.values.length,
      deletedSeen: deletedResult.values.length,
      synced,
      deleted,
      skippedOutOfDate,
      errors: errors.slice(0, 20),
    });

    return { skipped: false, since, nextSince, synced, deleted, skippedOutOfDate, onlyDate: todayDate, errors };
  } catch (error: any) {
    await upsertDailyPollAudit('jira.worklog_poll.failed', todayDate, {
      since,
      nextSince,
      errors: [{ error: error.message || 'Jira worklog poll failed' }],
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

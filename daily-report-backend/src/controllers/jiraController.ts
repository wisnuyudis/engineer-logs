import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { Request, Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import { deleteSyncedJiraWorklog, syncJiraWorklogToActivity } from '../services/jiraSyncService';
import { writeAudit, writeAuditSystem } from '../utils/auditTrail';

const prisma = new PrismaClient();

const authBaseUrl = 'https://auth.atlassian.com/authorize';
const tokenUrl = 'https://auth.atlassian.com/oauth/token';
const accessibleResourcesUrl = 'https://api.atlassian.com/oauth/token/accessible-resources';

const requiredEnv = () => {
  const clientId = process.env.ATLASSIAN_CLIENT_ID;
  const clientSecret = process.env.ATLASSIAN_CLIENT_SECRET;
  const redirectUri = process.env.ATLASSIAN_REDIRECT_URI;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Atlassian OAuth belum dikonfigurasi penuh di environment.');
  }

  return { clientId, clientSecret, redirectUri, frontendUrl };
};

const createFrontendRedirect = (status: 'connected' | 'failed', message?: string) => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const url = new URL('/profile', frontendUrl);
  url.searchParams.set('jira', status);
  if (message) url.searchParams.set('message', message);
  return url.toString();
};

const firstValue = (value: unknown) => Array.isArray(value) ? value[0] : value;

const headerValue = (req: Request, name: string) => {
  const value = req.headers[name.toLowerCase()];
  return typeof value === 'string' ? value : '';
};

const queryValue = (req: Request, name: string) => {
  const value = firstValue(req.query?.[name]);
  return typeof value === 'string' ? value.trim() : '';
};

const timingSafeStringEqual = (a: string, b: string) => {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  return aBuf.length === bBuf.length && crypto.timingSafeEqual(aBuf, bBuf);
};

const validateJiraWebhookSecret = (req: Request) => {
  const expectedSecret = process.env.JIRA_WEBHOOK_SECRET;
  if (!expectedSecret) return true;

  const signatureHeader = headerValue(req, 'x-hub-signature');
  if (signatureHeader) {
    const [methodRaw, signature] = signatureHeader.split('=');
    const method = String(methodRaw || '').toLowerCase();
    if (!method || !signature) return false;

    try {
      const digest = crypto
        .createHmac(method, expectedSecret)
        .update((req as any).rawBody || '')
        .digest('hex');
      return timingSafeStringEqual(signatureHeader, `${method}=${digest}`);
    } catch {
      return false;
    }
  }

  const providedSecret =
    headerValue(req, 'x-jira-webhook-secret')
    || headerValue(req, 'authorization').replace(/^Bearer\s+/i, '')
    || queryValue(req, 'secret')
    || queryValue(req, 'token')
    || queryValue(req, 'jiraWebhookSecret');

  return timingSafeStringEqual(providedSecret, expectedSecret);
};

const buildWebhookAudit = (
  req: Request,
  overrides: Record<string, unknown> = {}
) => ({
  webhookIdentifier: headerValue(req, 'x-atlassian-webhook-identifier') || null,
  webhookRetry: headerValue(req, 'x-atlassian-webhook-retry') || null,
  webhookFlow: headerValue(req, 'x-atlassian-webhook-flow') || null,
  signaturePresent: Boolean(headerValue(req, 'x-hub-signature')),
  event: req.body?.webhookEvent || req.body?.event || queryValue(req, 'event') || queryValue(req, 'webhookEvent') || null,
  issueKey: req.body?.issue?.key || req.body?.issueKey || queryValue(req, 'issueKey') || null,
  issueId: req.body?.issue?.id || req.body?.issueId || req.body?.worklog?.issueId || queryValue(req, 'issueId') || null,
  worklogId: req.body?.worklog?.id || req.body?.worklogId || queryValue(req, 'worklogId') || null,
  ...overrides,
});

const pickCloudResource = (resources: any[]) => {
  const configuredCloudId = process.env.JIRA_CLOUD_ID;
  if (configuredCloudId) {
    return resources.find(r => r.id === configuredCloudId) || null;
  }

  const configuredBaseUrl = process.env.JIRA_BASE_URL;
  if (configuredBaseUrl) {
    return resources.find(r => r.url === configuredBaseUrl) || null;
  }

  return resources[0] || null;
};

export const getJiraStatus = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        jiraAccountId: true,
        jiraCloudId: true,
        jiraDisplayName: true,
        jiraAvatarUrl: true,
        jiraConnectedAt: true,
      }
    });

    res.json({
      isLinked: !!user?.jiraAccountId,
      accountId: user?.jiraAccountId || null,
      cloudId: user?.jiraCloudId || null,
      displayName: user?.jiraDisplayName || null,
      avatarUrl: user?.jiraAvatarUrl || null,
      connectedAt: user?.jiraConnectedAt || null,
    });
  } catch (error) {
    res.status(500).json({ error: 'Gagal mendapatkan status koneksi Jira' });
  }
};

export const beginJiraConnect = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { clientId, redirectUri } = requiredEnv();
    const state = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await prisma.setting.upsert({
      where: { key: `jira_oauth_state_${state}` },
      update: { value: userId, description: expiresAt },
      create: {
        key: `jira_oauth_state_${state}`,
        value: userId,
        description: expiresAt,
      }
    });

    const url = new URL(authBaseUrl);
    url.searchParams.set('audience', 'api.atlassian.com');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('scope', 'read:jira-user read:me');
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('prompt', 'consent');

    res.json({ authUrl: url.toString() });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Gagal memulai koneksi Jira' });
  }
};

export const handleJiraCallback = async (req: Request, res: Response) => {
  const { code, state } = req.query as { code?: string; state?: string };

  if (!code || !state) {
    return res.redirect(createFrontendRedirect('failed', 'Missing code/state from Atlassian callback'));
  }

  try {
    const { clientId, clientSecret, redirectUri } = requiredEnv();
    const setting = await prisma.setting.findUnique({
      where: { key: `jira_oauth_state_${state}` }
    });

    if (!setting) {
      return res.redirect(createFrontendRedirect('failed', 'Invalid or expired Jira connect state'));
    }

    const expiresAt = setting.description ? new Date(setting.description).getTime() : 0;
    if (!expiresAt || expiresAt < Date.now()) {
      await prisma.setting.delete({ where: { key: setting.key } }).catch(() => null);
      return res.redirect(createFrontendRedirect('failed', 'Jira connect state expired'));
    }

    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      })
    });

    if (!tokenRes.ok) {
      const errorText = await tokenRes.text();
      throw new Error(`Gagal menukar code OAuth Jira: ${tokenRes.status} ${errorText}`);
    }

    const tokenData: any = await tokenRes.json();
    const accessToken = tokenData.access_token;

    const resourcesRes = await fetch(accessibleResourcesUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
    });
    if (!resourcesRes.ok) {
      throw new Error(`Gagal mengambil accessible resources Jira. Status: ${resourcesRes.status}`);
    }

    const resources = await resourcesRes.json() as any[];
    const resource = pickCloudResource(resources);
    if (!resource?.id) {
      throw new Error('Tidak ada Jira cloud resource yang bisa dipakai.');
    }

    const myselfRes = await fetch(`https://api.atlassian.com/ex/jira/${resource.id}/rest/api/2/myself`, {
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
    });

    if (!myselfRes.ok) {
      throw new Error(`Gagal mengambil profil Jira user. Status: ${myselfRes.status}`);
    }

    const myself: any = await myselfRes.json();

    await prisma.user.update({
      where: { id: setting.value },
      data: {
        jiraAccountId: myself.accountId || null,
        jiraCloudId: resource.id,
        jiraDisplayName: myself.displayName || null,
        jiraAvatarUrl: myself.avatarUrls?.['48x48'] || myself.avatarUrls?.['24x24'] || null,
        jiraConnectedAt: new Date(),
      }
    });

    await writeAuditSystem({
      userId: setting.value,
      action: 'jira.connect',
      entityType: 'jira_account',
      entityId: resource.id,
      after: {
        jiraAccountId: myself.accountId || null,
        jiraCloudId: resource.id,
        jiraDisplayName: myself.displayName || null,
      },
      ipAddress: req.ip || null,
      userAgent: req.headers['user-agent'] || null,
    });

    await prisma.setting.delete({ where: { key: setting.key } }).catch(() => null);
    return res.redirect(createFrontendRedirect('connected'));
  } catch (error: any) {
    return res.redirect(createFrontendRedirect('failed', error.message || 'Jira callback failed'));
  }
};

export const disconnectJira = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    await prisma.user.update({
      where: { id: userId },
      data: {
        jiraAccountId: null,
        jiraCloudId: null,
        jiraDisplayName: null,
        jiraAvatarUrl: null,
        jiraConnectedAt: null,
      }
    });

    await writeAudit(req, {
      action: 'jira.disconnect',
      entityType: 'jira_account',
      entityId: userId,
      after: { connected: false },
    });

    res.json({ message: 'Koneksi Jira diputus' });
  } catch (error) {
    res.status(500).json({ error: 'Gagal memutus koneksi Jira' });
  }
};

export const handleJiraWorklogWebhook = async (req: Request, res: Response) => {
  try {
    if (!validateJiraWebhookSecret(req)) {
      await writeAuditSystem({
        action: 'jira.webhook.rejected',
        entityType: 'jira_webhook',
        metadata: buildWebhookAudit(req, { reason: 'invalid_secret' }),
        ipAddress: req.ip || null,
        userAgent: req.headers['user-agent'] || null,
      });
      return res.status(401).json({ error: 'Invalid Jira webhook secret' });
    }

    const eventName = String(
      req.body?.webhookEvent
      || req.body?.event
      || queryValue(req, 'event')
      || queryValue(req, 'webhookEvent')
      || ''
    );
    const issueKey =
      req.body?.issue?.key
      || req.body?.issue?.id
      || req.body?.issueKey
      || req.body?.issueId
      || req.body?.worklog?.issueId
      || queryValue(req, 'issueKey')
      || queryValue(req, 'issueId');
    const worklogId =
      req.body?.worklog?.id
      || req.body?.worklogId
      || queryValue(req, 'worklogId');

    if (!eventName || !worklogId) {
      await writeAuditSystem({
        action: 'jira.webhook.rejected',
        entityType: 'jira_webhook',
        entityId: worklogId ? String(worklogId) : null,
        metadata: buildWebhookAudit(req, { reason: 'missing_event_or_worklog_id' }),
        ipAddress: req.ip || null,
        userAgent: req.headers['user-agent'] || null,
      });
      return res.status(400).json({ error: 'Webhook payload tidak memiliki event/worklogId yang cukup' });
    }

    if (eventName.includes('deleted')) {
      await deleteSyncedJiraWorklog(String(worklogId));
      await writeAuditSystem({
        action: 'jira.webhook.deleted',
        entityType: 'jira_webhook',
        entityId: String(worklogId),
        metadata: buildWebhookAudit(req),
        ipAddress: req.ip || null,
        userAgent: req.headers['user-agent'] || null,
      });
      return res.json({ ok: true, action: 'deleted' });
    }

    if (!issueKey) {
      await writeAuditSystem({
        action: 'jira.webhook.rejected',
        entityType: 'jira_webhook',
        entityId: String(worklogId),
        metadata: buildWebhookAudit(req, { reason: 'missing_issue_key_or_id' }),
        ipAddress: req.ip || null,
        userAgent: req.headers['user-agent'] || null,
      });
      return res.status(400).json({ error: 'Webhook payload tidak memiliki issue key/id' });
    }

    const activity = await syncJiraWorklogToActivity(String(issueKey), String(worklogId));
    await writeAuditSystem({
      action: 'jira.webhook.synced',
      entityType: 'jira_webhook',
      entityId: String(worklogId),
      metadata: buildWebhookAudit(req, { activityId: activity.id }),
      ipAddress: req.ip || null,
      userAgent: req.headers['user-agent'] || null,
    });
    res.json({ ok: true, action: 'upserted', activityId: activity.id });
  } catch (error: any) {
    await writeAuditSystem({
      action: 'jira.webhook.failed',
      entityType: 'jira_webhook',
      metadata: buildWebhookAudit(req, { error: error.message || 'Gagal memproses webhook Jira' }),
      ipAddress: req.ip || null,
      userAgent: req.headers['user-agent'] || null,
    });
    res.status(500).json({ error: error.message || 'Gagal memproses webhook Jira' });
  }
};

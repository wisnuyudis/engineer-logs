"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleJiraWorklogWebhook = exports.disconnectJira = exports.handleJiraCallback = exports.beginJiraConnect = exports.getJiraStatus = void 0;
const crypto_1 = __importDefault(require("crypto"));
const client_1 = require("@prisma/client");
const jiraSyncService_1 = require("../services/jiraSyncService");
const prisma = new client_1.PrismaClient();
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
const createFrontendRedirect = (status, message) => {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const url = new URL('/profile', frontendUrl);
    url.searchParams.set('jira', status);
    if (message)
        url.searchParams.set('message', message);
    return url.toString();
};
const pickCloudResource = (resources) => {
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
const getJiraStatus = async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
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
    }
    catch (error) {
        res.status(500).json({ error: 'Gagal mendapatkan status koneksi Jira' });
    }
};
exports.getJiraStatus = getJiraStatus;
const beginJiraConnect = async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const { clientId, redirectUri } = requiredEnv();
        const state = crypto_1.default.randomBytes(24).toString('hex');
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
    }
    catch (error) {
        res.status(500).json({ error: error.message || 'Gagal memulai koneksi Jira' });
    }
};
exports.beginJiraConnect = beginJiraConnect;
const handleJiraCallback = async (req, res) => {
    const { code, state } = req.query;
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
        const tokenData = await tokenRes.json();
        const accessToken = tokenData.access_token;
        const resourcesRes = await fetch(accessibleResourcesUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
        });
        if (!resourcesRes.ok) {
            throw new Error(`Gagal mengambil accessible resources Jira. Status: ${resourcesRes.status}`);
        }
        const resources = await resourcesRes.json();
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
        const myself = await myselfRes.json();
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
        await prisma.setting.delete({ where: { key: setting.key } }).catch(() => null);
        return res.redirect(createFrontendRedirect('connected'));
    }
    catch (error) {
        return res.redirect(createFrontendRedirect('failed', error.message || 'Jira callback failed'));
    }
};
exports.handleJiraCallback = handleJiraCallback;
const disconnectJira = async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
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
        res.json({ message: 'Koneksi Jira diputus' });
    }
    catch (error) {
        res.status(500).json({ error: 'Gagal memutus koneksi Jira' });
    }
};
exports.disconnectJira = disconnectJira;
const handleJiraWorklogWebhook = async (req, res) => {
    try {
        const expectedSecret = process.env.JIRA_WEBHOOK_SECRET;
        if (expectedSecret) {
            const providedSecret = req.headers['x-jira-webhook-secret'] || req.headers['authorization'];
            const normalized = typeof providedSecret === 'string' ? providedSecret.replace(/^Bearer\s+/i, '') : '';
            if (normalized !== expectedSecret) {
                return res.status(401).json({ error: 'Invalid Jira webhook secret' });
            }
        }
        const eventName = String(req.body?.webhookEvent || req.body?.event || '');
        const issueKey = req.body?.issue?.key || req.body?.issueKey || req.body?.worklog?.issueId;
        const worklogId = req.body?.worklog?.id || req.body?.worklogId;
        if (!eventName || !worklogId) {
            return res.status(400).json({ error: 'Webhook payload tidak memiliki event/worklogId yang cukup' });
        }
        if (eventName.includes('deleted')) {
            await (0, jiraSyncService_1.deleteSyncedJiraWorklog)(String(worklogId));
            return res.json({ ok: true, action: 'deleted' });
        }
        if (!issueKey) {
            return res.status(400).json({ error: 'Webhook payload tidak memiliki issue key/id' });
        }
        const activity = await (0, jiraSyncService_1.syncJiraWorklogToActivity)(String(issueKey), String(worklogId));
        res.json({ ok: true, action: 'upserted', activityId: activity.id });
    }
    catch (error) {
        res.status(500).json({ error: error.message || 'Gagal memproses webhook Jira' });
    }
};
exports.handleJiraWorklogWebhook = handleJiraWorklogWebhook;

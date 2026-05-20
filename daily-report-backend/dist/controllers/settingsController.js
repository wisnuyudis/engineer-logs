"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.testSmtpSettings = exports.updateSmtpSettings = exports.getSmtpSettings = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const smtpSettingsService_1 = require("../services/smtpSettingsService");
const emailPolicy_1 = require("../utils/emailPolicy");
const auditTrail_1 = require("../utils/auditTrail");
const isAdminRole = (role) => String(role || '').toLowerCase() === 'admin';
const getSmtpErrorDetail = (error) => {
    const parts = [
        error?.message,
        error?.code ? `code=${error.code}` : null,
        error?.command ? `command=${error.command}` : null,
        error?.responseCode ? `responseCode=${error.responseCode}` : null,
        error?.response ? `response=${String(error.response).slice(0, 240)}` : null,
    ].filter(Boolean);
    return parts.join(' | ') || 'Unknown SMTP error';
};
const getSmtpSettings = async (req, res) => {
    try {
        if (!isAdminRole(req.user?.role))
            return res.status(403).json({ error: 'Insufficient permissions' });
        const stored = await (0, smtpSettingsService_1.getStoredSmtpConfig)();
        const effective = await (0, smtpSettingsService_1.resolveSmtpConfig)();
        res.json({
            configured: Boolean(effective),
            settings: (0, smtpSettingsService_1.maskSmtpConfig)({ ...effective, ...stored }),
        });
    }
    catch (error) {
        req.log?.error(error, 'Failed to fetch SMTP settings');
        res.status(500).json({ error: 'Failed to fetch SMTP settings' });
    }
};
exports.getSmtpSettings = getSmtpSettings;
const updateSmtpSettings = async (req, res) => {
    try {
        if (!isAdminRole(req.user?.role))
            return res.status(403).json({ error: 'Insufficient permissions' });
        const port = Number(req.body?.port);
        const fromEmail = (0, emailPolicy_1.normalizeEmail)(req.body?.fromEmail || req.body?.user);
        const payload = {
            provider: String(req.body?.provider || 'custom'),
            host: String(req.body?.host || '').trim(),
            port,
            secure: Boolean(req.body?.secure),
            user: String(req.body?.user || '').trim(),
            pass: req.body?.pass === undefined ? undefined : String(req.body.pass || ''),
            fromName: String(req.body?.fromName || 'EngineerLog Admin').trim(),
            fromEmail,
        };
        if (!payload.host)
            return res.status(400).json({ error: 'SMTP host wajib diisi.' });
        if (!Number.isFinite(payload.port) || payload.port <= 0)
            return res.status(400).json({ error: 'SMTP port tidak valid.' });
        if (!payload.user)
            return res.status(400).json({ error: 'SMTP username wajib diisi.' });
        if (!(0, emailPolicy_1.isAllowedSmtpFromEmail)(payload.fromEmail)) {
            return res.status(400).json({ error: `Email pengirim harus menggunakan domain ${emailPolicy_1.ALLOWED_SMTP_FROM_DOMAINS.join(' atau ')}.` });
        }
        const saved = await (0, smtpSettingsService_1.upsertSmtpConfig)(payload);
        await (0, auditTrail_1.writeAudit)(req, {
            action: 'settings.smtp_update',
            entityType: 'setting',
            entityId: 'smtp_config',
            after: (0, smtpSettingsService_1.maskSmtpConfig)(saved),
        });
        res.json({ configured: true, settings: (0, smtpSettingsService_1.maskSmtpConfig)(saved) });
    }
    catch (error) {
        req.log?.error(error, 'Failed to update SMTP settings');
        res.status(500).json({ error: 'Failed to update SMTP settings' });
    }
};
exports.updateSmtpSettings = updateSmtpSettings;
const testSmtpSettings = async (req, res) => {
    try {
        if (!isAdminRole(req.user?.role))
            return res.status(403).json({ error: 'Insufficient permissions' });
        const config = await (0, smtpSettingsService_1.resolveSmtpConfig)();
        if (!config)
            return res.status(400).json({ error: 'SMTP belum dikonfigurasi.' });
        const to = (0, emailPolicy_1.normalizeEmail)(req.body?.to || req.user?.email);
        if (!(0, emailPolicy_1.isAllowedCompanyEmail)(to))
            return res.status(400).json({ error: 'Email tujuan harus menggunakan domain @sdt.co.id.' });
        const transporter = nodemailer_1.default.createTransport({
            host: config.host,
            port: config.port,
            secure: config.secure,
            auth: { user: config.user, pass: config.pass },
            connectionTimeout: 15000,
            greetingTimeout: 10000,
            socketTimeout: 20000,
        });
        await transporter.verify();
        const info = await transporter.sendMail({
            from: `"${config.fromName}" <${config.fromEmail}>`,
            to,
            subject: 'EngineerLog SMTP Test',
            html: '<p>SMTP EngineerLog berhasil dikonfigurasi.</p>',
        });
        res.json({ message: 'SMTP test sent', messageId: info.messageId });
    }
    catch (error) {
        const detail = getSmtpErrorDetail(error);
        req.log?.error(error, 'Failed to test SMTP settings');
        res.status(400).json({
            error: `Gagal mengirim test email SMTP: ${detail}`,
            detail,
        });
    }
};
exports.testSmtpSettings = testSmtpSettings;

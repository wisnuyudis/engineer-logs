"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.maskSmtpConfig = exports.upsertSmtpConfig = exports.resolveSmtpConfig = exports.getStoredSmtpConfig = void 0;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const SMTP_SETTING_KEY = 'smtp_config';
const parseStoredConfig = (value) => {
    if (!value)
        return {};
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' ? parsed : {};
    }
    catch {
        return {};
    }
};
const getStoredSmtpConfig = async () => {
    const setting = await prisma.setting.findUnique({ where: { key: SMTP_SETTING_KEY } });
    return parseStoredConfig(setting?.value);
};
exports.getStoredSmtpConfig = getStoredSmtpConfig;
const resolveSmtpConfig = async () => {
    const stored = await (0, exports.getStoredSmtpConfig)();
    const port = Number(stored.port || process.env.SMTP_PORT || 587);
    const config = {
        provider: String(stored.provider || process.env.SMTP_PROVIDER || 'custom'),
        host: String(stored.host || process.env.SMTP_HOST || ''),
        port: Number.isFinite(port) ? port : 587,
        secure: Boolean(stored.secure ?? (port === 465)),
        user: String(stored.user || process.env.SMTP_USER || ''),
        pass: String(stored.pass || process.env.SMTP_PASS || ''),
        fromName: String(stored.fromName || process.env.SMTP_FROM_NAME || 'EngineerLog Admin'),
        fromEmail: String(stored.fromEmail || process.env.SMTP_FROM_EMAIL || stored.user || process.env.SMTP_USER || ''),
    };
    if (!config.host || !config.user || !config.pass || !config.fromEmail)
        return null;
    return config;
};
exports.resolveSmtpConfig = resolveSmtpConfig;
const upsertSmtpConfig = async (input) => {
    const existing = await (0, exports.getStoredSmtpConfig)();
    const port = Number(input.port ?? existing.port ?? 587);
    const pass = input.pass === undefined || input.pass === '' ? existing.pass : input.pass;
    const next = {
        provider: String(input.provider || existing.provider || 'custom'),
        host: String(input.host || existing.host || '').trim(),
        port: Number.isFinite(port) ? port : 587,
        secure: Boolean(input.secure ?? existing.secure ?? port === 465),
        user: String(input.user || existing.user || '').trim(),
        pass: String(pass || ''),
        fromName: String(input.fromName || existing.fromName || 'EngineerLog Admin').trim(),
        fromEmail: String(input.fromEmail || existing.fromEmail || input.user || existing.user || '').trim(),
    };
    await prisma.setting.upsert({
        where: { key: SMTP_SETTING_KEY },
        update: {
            value: JSON.stringify(next),
            description: 'SMTP configuration for member invitation emails',
        },
        create: {
            key: SMTP_SETTING_KEY,
            value: JSON.stringify(next),
            description: 'SMTP configuration for member invitation emails',
        },
    });
    return next;
};
exports.upsertSmtpConfig = upsertSmtpConfig;
const maskSmtpConfig = (config) => ({
    provider: config?.provider || 'custom',
    host: config?.host || '',
    port: config?.port || 587,
    secure: Boolean(config?.secure),
    user: config?.user || '',
    fromName: config?.fromName || 'EngineerLog Admin',
    fromEmail: config?.fromEmail || config?.user || '',
    hasPassword: Boolean(config?.pass),
});
exports.maskSmtpConfig = maskSmtpConfig;

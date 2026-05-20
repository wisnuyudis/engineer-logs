import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const SMTP_SETTING_KEY = 'smtp_config';

export type SmtpConfig = {
  provider: string;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
  fromEmail: string;
};

const parseStoredConfig = (value: string | null | undefined): Partial<SmtpConfig> => {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

export const getStoredSmtpConfig = async () => {
  const setting = await prisma.setting.findUnique({ where: { key: SMTP_SETTING_KEY } });
  return parseStoredConfig(setting?.value);
};

export const resolveSmtpConfig = async (): Promise<SmtpConfig | null> => {
  const stored = await getStoredSmtpConfig();
  const port = Number(stored.port || process.env.SMTP_PORT || 587);
  const config: SmtpConfig = {
    provider: String(stored.provider || process.env.SMTP_PROVIDER || 'custom'),
    host: String(stored.host || process.env.SMTP_HOST || ''),
    port: Number.isFinite(port) ? port : 587,
    secure: Boolean(stored.secure ?? (port === 465)),
    user: String(stored.user || process.env.SMTP_USER || ''),
    pass: String(stored.pass || process.env.SMTP_PASS || ''),
    fromName: String(stored.fromName || process.env.SMTP_FROM_NAME || 'EngineerLog Admin'),
    fromEmail: String(stored.fromEmail || process.env.SMTP_FROM_EMAIL || stored.user || process.env.SMTP_USER || ''),
  };

  if (!config.host || !config.user || !config.pass || !config.fromEmail) return null;
  return config;
};

export const upsertSmtpConfig = async (input: Partial<SmtpConfig>) => {
  const existing = await getStoredSmtpConfig();
  const port = Number(input.port ?? existing.port ?? 587);
  const pass = input.pass === undefined || input.pass === '' ? existing.pass : input.pass;
  const next: SmtpConfig = {
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

export const maskSmtpConfig = (config: Partial<SmtpConfig> | null | undefined) => ({
  provider: config?.provider || 'custom',
  host: config?.host || '',
  port: config?.port || 587,
  secure: Boolean(config?.secure),
  user: config?.user || '',
  fromName: config?.fromName || 'EngineerLog Admin',
  fromEmail: config?.fromEmail || config?.user || '',
  hasPassword: Boolean(config?.pass),
});

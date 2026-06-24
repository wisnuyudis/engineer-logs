import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const SETTING_KEY = 'maintenance_mode';

export type MaintenanceStatus = {
  enabled: boolean;
  forcedByEnv: boolean;
  message: string;
  updatedAt: string | null;
  updatedBy: string | null;
  adminBypass: boolean;
};

const DEFAULT_MESSAGE = 'EngineerLog sedang dalam maintenance. Silakan coba lagi beberapa saat.';

const isTruthy = (value: string | undefined) => ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());

const parseStored = (value: string | null | undefined) => {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
};

export const getMaintenanceStatus = async (): Promise<MaintenanceStatus> => {
  const forcedByEnv = isTruthy(process.env.MAINTENANCE_MODE);
  const adminBypass = process.env.MAINTENANCE_ADMIN_BYPASS !== 'false';
  const setting = await prisma.setting.findUnique({ where: { key: SETTING_KEY } });
  const stored = parseStored(setting?.value);
  const storedEnabled = stored.enabled === true;

  return {
    enabled: forcedByEnv || storedEnabled,
    forcedByEnv,
    message: String(process.env.MAINTENANCE_MESSAGE || stored.message || DEFAULT_MESSAGE),
    updatedAt: setting?.updatedAt ? setting.updatedAt.toISOString() : null,
    updatedBy: typeof stored.updatedBy === 'string' ? stored.updatedBy : null,
    adminBypass,
  };
};

export const updateMaintenanceStatus = async (input: {
  enabled: boolean;
  message?: string | null;
  updatedBy?: string | null;
}) => {
  const payload = {
    enabled: Boolean(input.enabled),
    message: String(input.message || DEFAULT_MESSAGE).trim() || DEFAULT_MESSAGE,
    updatedBy: input.updatedBy || null,
    updatedAt: new Date().toISOString(),
  };

  await prisma.setting.upsert({
    where: { key: SETTING_KEY },
    update: {
      value: JSON.stringify(payload),
      description: 'Maintenance mode state',
    },
    create: {
      key: SETTING_KEY,
      value: JSON.stringify(payload),
      description: 'Maintenance mode state',
    },
  });

  return getMaintenanceStatus();
};

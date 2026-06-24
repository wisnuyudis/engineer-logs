import { Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import { getMaintenanceStatus, updateMaintenanceStatus } from '../services/maintenanceService';
import { writeAudit } from '../utils/auditTrail';

const isAdminRole = (role?: string | null) => String(role || '').toLowerCase() === 'admin';

export const getPublicMaintenanceStatus = async (_req: AuthRequest, res: Response) => {
  try {
    const status = await getMaintenanceStatus();
    res.json(status);
  } catch {
    res.status(500).json({ error: 'Failed to fetch maintenance status' });
  }
};

export const getMaintenanceSettings = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminRole(req.user?.role)) return res.status(403).json({ error: 'Insufficient permissions' });
    res.json(await getMaintenanceStatus());
  } catch {
    res.status(500).json({ error: 'Failed to fetch maintenance settings' });
  }
};

export const updateMaintenanceSettings = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminRole(req.user?.role)) return res.status(403).json({ error: 'Insufficient permissions' });

    const current = await getMaintenanceStatus();
    if (current.forcedByEnv) {
      return res.status(400).json({ error: 'Maintenance mode is forced by environment and cannot be changed from the dashboard.' });
    }

    const next = await updateMaintenanceStatus({
      enabled: Boolean(req.body?.enabled),
      message: req.body?.message == null ? undefined : String(req.body.message),
      updatedBy: req.user?.email || req.user?.userId || null,
    });

    await writeAudit(req, {
      action: next.enabled ? 'maintenance.enable' : 'maintenance.disable',
      entityType: 'setting',
      entityId: 'maintenance_mode',
      before: current,
      after: next,
    });

    res.json(next);
  } catch {
    res.status(500).json({ error: 'Failed to update maintenance settings' });
  }
};

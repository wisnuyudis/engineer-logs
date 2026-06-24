import { NextFunction, Response } from 'express';
import jwt from 'jsonwebtoken';
import { AuthRequest, getJwtSecret } from './authMiddleware';
import { getMaintenanceStatus } from '../services/maintenanceService';

const EXEMPT_PREFIXES = [
  '/api/maintenance/status',
  '/api/auth',
  '/api/settings/maintenance',
  '/health',
];

const isAdminToken = (req: AuthRequest) => {
  const authHeader = req.headers.authorization;
  if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) return false;
  try {
    const payload = jwt.verify(authHeader.slice(7).trim(), getJwtSecret()) as { role?: string };
    return String(payload.role || '').toLowerCase() === 'admin';
  } catch {
    return false;
  }
};

export const maintenanceMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.method === 'OPTIONS') return next();
  if (EXEMPT_PREFIXES.some((prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`))) {
    return next();
  }

  try {
    const status = await getMaintenanceStatus();
    if (!status.enabled) return next();
    if (status.adminBypass && isAdminToken(req)) return next();

    res.setHeader('Retry-After', process.env.MAINTENANCE_RETRY_AFTER_SECONDS || '300');
    return res.status(503).json({
      code: 'MAINTENANCE_MODE',
      error: status.message,
      maintenance: status,
    });
  } catch (error) {
    req.log?.error(error, 'Maintenance middleware failed');
    return next();
  }
};

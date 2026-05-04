import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const getJwtSecret = () => {
  const value = process.env.JWT_SECRET;
  if (value) return value;
  if (process.env.NODE_ENV === 'test') return 'test-access-secret';
  throw new Error('JWT_SECRET must be set');
};

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    email: string;
    role: string;
    team: string | null;
  };
  rawBody?: string;
}

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access token missing' });
  }

  const token = authHeader.slice(7).trim();

  if (!token) return res.status(401).json({ error: 'Access token missing' });

  jwt.verify(token, getJwtSecret(), (err, decoded) => {
    if (err) return res.status(401).json({ error: 'Invalid or expired token' });
    const payload = decoded as Partial<AuthRequest['user']>;
    if (!payload?.userId || !payload?.email || !payload?.role) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    req.user = {
      userId: String(payload.userId),
      email: String(payload.email),
      role: String(payload.role),
      team: payload.team == null ? null : String(payload.team),
    };
    next();
  });
};

export const requireRole = (roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};

import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const requireSecret = (name: 'JWT_SECRET' | 'JWT_REFRESH_SECRET', fallback?: string) => {
  const value = process.env[name];
  if (value) return value;
  if (process.env.NODE_ENV === 'test' && fallback) return fallback;
  throw new Error(`${name} must be set`);
};

const ACCESS_SECRET = requireSecret('JWT_SECRET', 'test-access-secret');
const REFRESH_SECRET = requireSecret('JWT_REFRESH_SECRET', 'test-refresh-secret');
const ACCESS_EXPIRES_IN = '15m';
const REFRESH_EXPIRES_IN = '30d';

export type JwtUserPayload = {
  userId: string;
  email: string;
  role: string;
  team: string | null;
};

export type RefreshTokenPayload = {
  userId: string;
  jti: string;
};

export const signAccessToken = (payload: JwtUserPayload) =>
  jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES_IN });

export const signRefreshToken = (payload: RefreshTokenPayload) =>
  jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES_IN });

export const verifyAccessToken = (token: string) =>
  jwt.verify(token, ACCESS_SECRET) as JwtUserPayload;

export const verifyRefreshToken = (token: string) =>
  jwt.verify(token, REFRESH_SECRET) as RefreshTokenPayload;

export const hashToken = (token: string) =>
  crypto.createHash('sha256').update(token).digest('hex');

export const createRefreshTokenCookie = (token: string) => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/api/auth',
  maxAge: 30 * 24 * 60 * 60 * 1000,
  value: token,
});

export const parseCookie = (cookieHeader: string | undefined, name: string) => {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';').map((part) => part.trim());
  for (const part of parts) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    if (key === name) return decodeURIComponent(part.slice(index + 1));
  }
  return null;
};

export const makeJti = () => crypto.randomUUID();

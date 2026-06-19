import { NextFunction, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

export interface CliAuthRequest extends Request {
  cliUser?: {
    userId: string;
    email: string;
    role: string;
    team: string | null;
    name: string;
  };
  rawBody?: string;
}

export const hashCliToken = (token: string) =>
  crypto.createHash('sha256').update(token).digest('hex');

const timingSafeStringEqual = (a: string, b: string) => {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  return aBuf.length === bBuf.length && crypto.timingSafeEqual(aBuf, bBuf);
};

export const authenticateCliRequest = async (req: CliAuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = String(req.header('authorization') || '').trim();
    if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'CLI token missing' });

    const token = authHeader.slice(7).trim();
    if (!token) return res.status(401).json({ error: 'CLI token missing' });
    const tokenHash = hashCliToken(token);
    const user = await prisma.user.findFirst({
      where: {
        cliTokenHash: tokenHash,
        status: 'active',
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        team: true,
        cliTokenHash: true,
      },
    });

    if (!user?.cliTokenHash || !timingSafeStringEqual(user.cliTokenHash, tokenHash)) {
      return res.status(401).json({ error: 'Invalid CLI token' });
    }

    req.cliUser = {
      userId: user.id,
      email: user.email,
      role: user.role,
      team: user.team,
      name: user.name,
    };

    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid CLI authentication' });
  }
};

import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { AuthRequest } from '../middlewares/authMiddleware';
import { LoginSchema } from '../validators/zodSchemas';
import {
  createRefreshTokenCookie,
  hashToken,
  makeJti,
  parseCookie,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../utils/authTokens';
import { writeAudit, writeAuditSystem } from '../utils/auditTrail';

const prisma = new PrismaClient();
const REFRESH_COOKIE = 'refresh_token';

export const login = async (req: Request, res: Response) => {
  try {
    const validation = LoginSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.issues[0].message });
    }
    const { email, password } = validation.data;

    // Find user
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Email atau password salah' });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({ error: 'Akun kamu sedang disuspend. Hubungi Administrator.' });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Email atau password salah' });
    }

    const jti = makeJti();
    const refreshToken = signRefreshToken({ userId: user.id, jti });
    const accessToken = signAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      team: user.team,
    });

    await prisma.authSession.create({
      data: {
        userId: user.id,
        jti,
        tokenHash: hashToken(refreshToken),
        userAgent: req.headers['user-agent'] || null,
        ipAddress: req.ip || null,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    const cookie = createRefreshTokenCookie(refreshToken);
    res.cookie(REFRESH_COOKIE, cookie.value, {
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite,
      secure: cookie.secure,
      path: cookie.path,
      maxAge: cookie.maxAge,
    });

    await writeAuditSystem({
      userId: user.id,
      action: 'auth.login',
      entityType: 'auth_session',
      entityId: jti,
      after: { email: user.email, role: user.role, team: user.team },
      ipAddress: req.ip || null,
      userAgent: req.headers['user-agent'] || null,
    });

    res.json({
      token: accessToken,
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        team: user.team,
        avatarUrl: user.avatarUrl,
        status: user.status,
        jiraAccountId: user.jiraAccountId,
        jiraCloudId: user.jiraCloudId,
        jiraDisplayName: user.jiraDisplayName,
        jiraAvatarUrl: user.jiraAvatarUrl,
        jiraConnectedAt: user.jiraConnectedAt,
      }
    });

  } catch (error) {
    if(req.log) req.log.error(error, 'Login fail');
    res.status(500).json({ error: 'Terjadi kesalahan pada server' });
  }
};

export const refreshToken = async (req: Request, res: Response) => {
  try {
    const token = parseCookie(req.headers.cookie, REFRESH_COOKIE);
    if (!token) {
      return res.status(401).json({ error: 'Refresh token missing' });
    }

    const payload = verifyRefreshToken(token);
    const tokenHash = hashToken(token);

    const session = await prisma.authSession.findFirst({
      where: {
        userId: payload.userId,
        jti: payload.jti,
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: {
        user: {
          select: { id: true, email: true, role: true, team: true, name: true, avatarUrl: true, status: true, jiraAccountId: true, jiraCloudId: true, jiraDisplayName: true, jiraAvatarUrl: true, jiraConnectedAt: true },
        },
      },
    });

    if (!session) {
      return res.status(401).json({ error: 'Refresh session invalid or expired' });
    }

    await prisma.authSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    const nextJti = makeJti();
    const nextRefreshToken = signRefreshToken({ userId: session.userId, jti: nextJti });
    const nextAccessToken = signAccessToken({
      userId: session.user.id,
      email: session.user.email,
      role: session.user.role,
      team: session.user.team,
    });

    await prisma.authSession.create({
      data: {
        userId: session.userId,
        jti: nextJti,
        tokenHash: hashToken(nextRefreshToken),
        userAgent: req.headers['user-agent'] || null,
        ipAddress: req.ip || null,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    const cookie = createRefreshTokenCookie(nextRefreshToken);
    res.cookie(REFRESH_COOKIE, cookie.value, {
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite,
      secure: cookie.secure,
      path: cookie.path,
      maxAge: cookie.maxAge,
    });

    await writeAuditSystem({
      userId: session.userId,
      action: 'auth.refresh',
      entityType: 'auth_session',
      entityId: nextJti,
      metadata: { rotatedFrom: session.jti },
      ipAddress: req.ip || null,
      userAgent: req.headers['user-agent'] || null,
    });

    res.json({
      token: nextAccessToken,
      accessToken: nextAccessToken,
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        role: session.user.role,
        team: session.user.team,
        avatarUrl: session.user.avatarUrl,
        status: session.user.status,
        jiraAccountId: session.user.jiraAccountId,
        jiraCloudId: session.user.jiraCloudId,
        jiraDisplayName: session.user.jiraDisplayName,
        jiraAvatarUrl: session.user.jiraAvatarUrl,
        jiraConnectedAt: session.user.jiraConnectedAt,
      },
    });
  } catch (error) {
    return res.status(401).json({ error: 'Refresh session invalid or expired' });
  }
};

export const logout = async (req: Request, res: Response) => {
  try {
    const token = parseCookie(req.headers.cookie, REFRESH_COOKIE);
    if (token) {
      try {
        const payload = verifyRefreshToken(token);
        await prisma.authSession.updateMany({
          where: { userId: payload.userId, jti: payload.jti, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await writeAuditSystem({
          userId: payload.userId,
          action: 'auth.logout',
          entityType: 'auth_session',
          entityId: payload.jti,
          ipAddress: req.ip || null,
          userAgent: req.headers['user-agent'] || null,
        });
      } catch {
        // ignore invalid token on logout
      }
    }

    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
    res.json({ message: 'Logged out' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to logout' });
  }
};

export const getProfile = async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user?.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        team: true,
        avatarUrl: true,
        supervisorId: true,
        jiraAccountId: true,
        jiraCloudId: true,
        jiraDisplayName: true,
        jiraAvatarUrl: true,
        jiraConnectedAt: true,
      }
    });
    if (!user) return res.status(404).json({ error: 'Not found' });
    
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
};

export const updateProfile = async (req: AuthRequest, res: Response) => {
  try {
    const { name, avatarUrl } = req.body;
    const userId = req.user?.userId;

    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const user = await prisma.user.update({
      where: { id: userId },
      data: { name, avatarUrl },
      select: { id: true, email: true, name: true, role: true, team: true, avatarUrl: true }
    });

    await writeAudit(req, {
      action: 'profile.update',
      entityType: 'user',
      entityId: user.id,
      after: user,
    });
    
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

export const changePassword = async (req: AuthRequest, res: Response) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user?.userId;

    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const validPassword = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Password lamamu salah' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash }
    });

    await writeAudit(req, {
      action: 'profile.password_change',
      entityType: 'user',
      entityId: userId,
    });

    res.json({ message: 'Password berhasil diubah' });
  } catch (error) {
    res.status(500).json({ error: 'Gagal mengubah password' });
  }
};

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
  SESSION_TIMEOUT_MS,
  signAccessToken,
  signRefreshToken,
  signMfaChallengeToken,
  verifyRefreshToken,
  verifyMfaChallengeToken,
} from '../utils/authTokens';
import { writeAudit, writeAuditSystem } from '../utils/auditTrail';
import { buildOtpAuthUrl, decryptMfaSecret, encryptMfaSecret, generateTotpSecret, verifyTotp } from '../utils/totp';

const prisma = new PrismaClient();
const REFRESH_COOKIE = 'refresh_token';

const isSuperAdminRole = (role?: string | null) =>
  ['admin', 'superadmin', 'super_admin', 'super admin'].includes(String(role || '').trim().toLowerCase());

const isMfaEnforcedRole = (role?: string | null) => !isSuperAdminRole(role);

const decodeJwtPayloadUnsafe = (token: string) => {
  try {
    const payloadRaw = String(token || '').split('.')[1];
    if (!payloadRaw) return null;
    const normalized = payloadRaw.replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(normalized, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
};

const buildAuthUser = (user: any) => ({
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
  mfaEnabled: Boolean(user.mfaEnabled),
});

const issueSession = async (req: Request, res: Response, user: any, auditAction = 'auth.login') => {
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
      expiresAt: new Date(Date.now() + SESSION_TIMEOUT_MS),
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
    action: auditAction,
    entityType: 'auth_session',
    entityId: jti,
    after: { email: user.email, role: user.role, team: user.team, mfaEnabled: Boolean(user.mfaEnabled) },
    ipAddress: req.ip || null,
    userAgent: req.headers['user-agent'] || null,
  });

  return {
    token: accessToken,
    accessToken,
    user: buildAuthUser(user),
  };
};

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

    if (!user.mfaEnabled) {
      if (!isMfaEnforcedRole(user.role)) {
        const response = await issueSession(req, res, user);
        return res.json(response);
      }

      const setupSecret = generateTotpSecret();
      const challengeToken = signMfaChallengeToken({ userId: user.id, purpose: 'setup', setupSecret });
      await writeAuditSystem({
        userId: user.id,
        action: 'mfa.setup_required',
        entityType: 'user',
        entityId: user.id,
        ipAddress: req.ip || null,
        userAgent: req.headers['user-agent'] || null,
      });
      return res.json({
        mfaSetupRequired: true,
        challengeToken,
        secret: setupSecret,
        otpauthUrl: buildOtpAuthUrl(user.email, setupSecret),
        user: { id: user.id, email: user.email, name: user.name },
      });
    }

    const challengeToken = signMfaChallengeToken({ userId: user.id, purpose: 'login' });
    return res.json({
      mfaRequired: true,
      challengeToken,
      user: { id: user.id, email: user.email, name: user.name },
    });

  } catch (error) {
    if(req.log) req.log.error(error, 'Login fail');
    res.status(500).json({ error: 'Terjadi kesalahan pada server' });
  }
};

export const verifyMfaLogin = async (req: Request, res: Response) => {
  let stage = 'start';
  let userIdForLog: string | null = null;
  let diagnosticCode = 'MFA_UNKNOWN_ERROR';
  try {
    const { challengeToken, code } = req.body || {};
    stage = 'verify_challenge';
    diagnosticCode = 'MFA_CHALLENGE_INVALID';
    const payload = verifyMfaChallengeToken(String(challengeToken || ''));
    userIdForLog = payload.userId;
    if (payload.purpose !== 'login') return res.status(400).json({ error: 'Challenge MFA tidak valid.' });

    stage = 'load_user';
    diagnosticCode = 'MFA_USER_STATE_INVALID';
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user || user.status === 'suspended' || !user.mfaEnabled || !user.mfaSecretEnc) {
      req.log?.warn({
        userId: payload.userId,
        userFound: Boolean(user),
        status: user?.status || null,
        mfaEnabled: Boolean(user?.mfaEnabled),
        hasMfaSecretEnc: Boolean(user?.mfaSecretEnc),
      }, 'MFA login rejected before TOTP verification');
      return res.status(401).json({ error: 'Challenge MFA tidak valid.' });
    }

    stage = 'decrypt_secret';
    diagnosticCode = 'MFA_SECRET_DECRYPT_FAILED';
    const secret = decryptMfaSecret(user.mfaSecretEnc);
    stage = 'verify_totp';
    diagnosticCode = 'MFA_TOTP_INVALID';
    if (!verifyTotp(secret, String(code || ''))) {
      await writeAuditSystem({
        userId: user.id,
        action: 'mfa.login_failed',
        entityType: 'user',
        entityId: user.id,
        ipAddress: req.ip || null,
        userAgent: req.headers['user-agent'] || null,
      });
      return res.status(401).json({ error: 'Kode authenticator tidak valid.' });
    }

    stage = 'issue_session';
    diagnosticCode = 'MFA_SESSION_CREATE_FAILED';
    const response = await issueSession(req, res, user, 'auth.login_mfa');
    res.json(response);
  } catch (error) {
    if (error instanceof Error && error.name === 'TokenExpiredError') diagnosticCode = 'MFA_CHALLENGE_EXPIRED';
    if (error instanceof Error && error.name === 'JsonWebTokenError') diagnosticCode = 'MFA_CHALLENGE_SIGNATURE_INVALID';
    const unsafePayload = decodeJwtPayloadUnsafe(String(req.body?.challengeToken || ''));
    const metadata = {
      stage,
      userIdFromUnverifiedToken: unsafePayload?.userId || null,
      purposeFromUnverifiedToken: unsafePayload?.purpose || null,
      issuedAtFromUnverifiedToken: unsafePayload?.iat ? new Date(Number(unsafePayload.iat) * 1000).toISOString() : null,
      expiresAtFromUnverifiedToken: unsafePayload?.exp ? new Date(Number(unsafePayload.exp) * 1000).toISOString() : null,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : String(error),
      hasChallengeToken: Boolean(req.body?.challengeToken),
      challengeTokenLength: String(req.body?.challengeToken || '').length,
      codeLength: String(req.body?.code || '').replace(/\s+/g, '').length,
      serverTime: new Date().toISOString(),
    };
    req.log?.warn({
      userId: userIdForLog,
      ...metadata,
    }, 'MFA login challenge failed');
    await writeAuditSystem({
      userId: userIdForLog || unsafePayload?.userId || null,
      action: 'mfa.challenge_failed',
      entityType: 'user',
      entityId: userIdForLog || unsafePayload?.userId || null,
      metadata,
      ipAddress: req.ip || null,
      userAgent: req.headers['user-agent'] || null,
    });
    res.status(401).json({
      error: 'Challenge MFA tidak valid atau kedaluwarsa.',
      diagnosticCode,
      diagnosticStage: stage,
      diagnosticError: error instanceof Error ? error.message : String(error),
    });
  }
};

export const verifyMfaSetup = async (req: Request, res: Response) => {
  try {
    const { challengeToken, code } = req.body || {};
    const payload = verifyMfaChallengeToken(String(challengeToken || ''));
    if (payload.purpose !== 'setup' || !payload.setupSecret) return res.status(400).json({ error: 'Challenge setup MFA tidak valid.' });

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user || user.status === 'suspended') return res.status(401).json({ error: 'Challenge setup MFA tidak valid.' });

    if (!verifyTotp(payload.setupSecret, String(code || ''))) {
      return res.status(401).json({ error: 'Kode authenticator tidak valid.' });
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        mfaEnabled: true,
        mfaSecretEnc: encryptMfaSecret(payload.setupSecret),
        mfaEnabledAt: new Date(),
      },
    });

    await writeAuditSystem({
      userId: user.id,
      action: 'mfa.enabled',
      entityType: 'user',
      entityId: user.id,
      ipAddress: req.ip || null,
      userAgent: req.headers['user-agent'] || null,
    });

    const response = await issueSession(req, res, updatedUser, 'auth.login_mfa_setup');
    res.json(response);
  } catch (error) {
    res.status(401).json({ error: 'Challenge setup MFA tidak valid atau kedaluwarsa.' });
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
          select: { id: true, email: true, role: true, team: true, name: true, avatarUrl: true, status: true, jiraAccountId: true, jiraCloudId: true, jiraDisplayName: true, jiraAvatarUrl: true, jiraConnectedAt: true, mfaEnabled: true },
        },
      },
    });

    if (!session) {
      return res.status(401).json({ error: 'Refresh session invalid or expired' });
    }

    if (!session.user.mfaEnabled && isMfaEnforcedRole(session.user.role)) {
      await prisma.authSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
      return res.status(403).json({ error: 'MFA enrollment required' });
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
        expiresAt: new Date(Date.now() + SESSION_TIMEOUT_MS),
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
        mfaEnabled: session.user.mfaEnabled,
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
        mfaEnabled: true,
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
      select: { id: true, email: true, name: true, role: true, team: true, avatarUrl: true, mfaEnabled: true }
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

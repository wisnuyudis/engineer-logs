"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.changePassword = exports.updateProfile = exports.getProfile = exports.logout = exports.refreshToken = exports.verifyMfaSetup = exports.verifyMfaLogin = exports.login = void 0;
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const zodSchemas_1 = require("../validators/zodSchemas");
const authTokens_1 = require("../utils/authTokens");
const auditTrail_1 = require("../utils/auditTrail");
const totp_1 = require("../utils/totp");
const prisma = new client_1.PrismaClient();
const REFRESH_COOKIE = 'refresh_token';
const isSuperAdminRole = (role) => ['admin', 'superadmin', 'super_admin', 'super admin'].includes(String(role || '').trim().toLowerCase());
const isMfaEnforcedRole = (role) => !isSuperAdminRole(role);
const decodeJwtPayloadUnsafe = (token) => {
    try {
        const payloadRaw = String(token || '').split('.')[1];
        if (!payloadRaw)
            return null;
        const normalized = payloadRaw.replace(/-/g, '+').replace(/_/g, '/');
        const json = Buffer.from(normalized, 'base64').toString('utf8');
        return JSON.parse(json);
    }
    catch {
        return null;
    }
};
const buildAuthUser = (user) => ({
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
const issueSession = async (req, res, user, auditAction = 'auth.login') => {
    const jti = (0, authTokens_1.makeJti)();
    const refreshToken = (0, authTokens_1.signRefreshToken)({ userId: user.id, jti });
    const accessToken = (0, authTokens_1.signAccessToken)({
        userId: user.id,
        email: user.email,
        role: user.role,
        team: user.team,
    });
    await prisma.authSession.create({
        data: {
            userId: user.id,
            jti,
            tokenHash: (0, authTokens_1.hashToken)(refreshToken),
            userAgent: req.headers['user-agent'] || null,
            ipAddress: req.ip || null,
            expiresAt: new Date(Date.now() + authTokens_1.SESSION_TIMEOUT_MS),
        },
    });
    const cookie = (0, authTokens_1.createRefreshTokenCookie)(refreshToken);
    res.cookie(REFRESH_COOKIE, cookie.value, {
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite,
        secure: cookie.secure,
        path: cookie.path,
        maxAge: cookie.maxAge,
    });
    await (0, auditTrail_1.writeAuditSystem)({
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
const login = async (req, res) => {
    try {
        const validation = zodSchemas_1.LoginSchema.safeParse(req.body);
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
        const validPassword = await bcryptjs_1.default.compare(password, user.passwordHash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Email atau password salah' });
        }
        if (!user.mfaEnabled) {
            if (!isMfaEnforcedRole(user.role)) {
                const response = await issueSession(req, res, user);
                return res.json(response);
            }
            const setupSecret = (0, totp_1.generateTotpSecret)();
            const challengeToken = (0, authTokens_1.signMfaChallengeToken)({ userId: user.id, purpose: 'setup', setupSecret });
            await (0, auditTrail_1.writeAuditSystem)({
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
                otpauthUrl: (0, totp_1.buildOtpAuthUrl)(user.email, setupSecret),
                user: { id: user.id, email: user.email, name: user.name },
            });
        }
        const challengeToken = (0, authTokens_1.signMfaChallengeToken)({ userId: user.id, purpose: 'login' });
        return res.json({
            mfaRequired: true,
            challengeToken,
            user: { id: user.id, email: user.email, name: user.name },
        });
    }
    catch (error) {
        if (req.log)
            req.log.error(error, 'Login fail');
        res.status(500).json({ error: 'Terjadi kesalahan pada server' });
    }
};
exports.login = login;
const verifyMfaLogin = async (req, res) => {
    let stage = 'start';
    let userIdForLog = null;
    let diagnosticCode = 'MFA_UNKNOWN_ERROR';
    try {
        const { challengeToken, code } = req.body || {};
        stage = 'verify_challenge';
        diagnosticCode = 'MFA_CHALLENGE_INVALID';
        const payload = (0, authTokens_1.verifyMfaChallengeToken)(String(challengeToken || ''));
        userIdForLog = payload.userId;
        if (payload.purpose !== 'login')
            return res.status(400).json({ error: 'Challenge MFA tidak valid.' });
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
        const secret = (0, totp_1.decryptMfaSecret)(user.mfaSecretEnc);
        stage = 'verify_totp';
        diagnosticCode = 'MFA_TOTP_INVALID';
        if (!(0, totp_1.verifyTotp)(secret, String(code || ''))) {
            await (0, auditTrail_1.writeAuditSystem)({
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
    }
    catch (error) {
        if (error instanceof Error && error.name === 'TokenExpiredError')
            diagnosticCode = 'MFA_CHALLENGE_EXPIRED';
        if (error instanceof Error && error.name === 'JsonWebTokenError')
            diagnosticCode = 'MFA_CHALLENGE_SIGNATURE_INVALID';
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
        await (0, auditTrail_1.writeAuditSystem)({
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
exports.verifyMfaLogin = verifyMfaLogin;
const verifyMfaSetup = async (req, res) => {
    try {
        const { challengeToken, code } = req.body || {};
        const payload = (0, authTokens_1.verifyMfaChallengeToken)(String(challengeToken || ''));
        if (payload.purpose !== 'setup' || !payload.setupSecret)
            return res.status(400).json({ error: 'Challenge setup MFA tidak valid.' });
        const user = await prisma.user.findUnique({ where: { id: payload.userId } });
        if (!user || user.status === 'suspended')
            return res.status(401).json({ error: 'Challenge setup MFA tidak valid.' });
        if (!(0, totp_1.verifyTotp)(payload.setupSecret, String(code || ''))) {
            return res.status(401).json({ error: 'Kode authenticator tidak valid.' });
        }
        const updatedUser = await prisma.user.update({
            where: { id: user.id },
            data: {
                mfaEnabled: true,
                mfaSecretEnc: (0, totp_1.encryptMfaSecret)(payload.setupSecret),
                mfaEnabledAt: new Date(),
            },
        });
        await (0, auditTrail_1.writeAuditSystem)({
            userId: user.id,
            action: 'mfa.enabled',
            entityType: 'user',
            entityId: user.id,
            ipAddress: req.ip || null,
            userAgent: req.headers['user-agent'] || null,
        });
        const response = await issueSession(req, res, updatedUser, 'auth.login_mfa_setup');
        res.json(response);
    }
    catch (error) {
        res.status(401).json({ error: 'Challenge setup MFA tidak valid atau kedaluwarsa.' });
    }
};
exports.verifyMfaSetup = verifyMfaSetup;
const refreshToken = async (req, res) => {
    try {
        const token = (0, authTokens_1.parseCookie)(req.headers.cookie, REFRESH_COOKIE);
        if (!token) {
            return res.status(401).json({ error: 'Refresh token missing' });
        }
        const payload = (0, authTokens_1.verifyRefreshToken)(token);
        const tokenHash = (0, authTokens_1.hashToken)(token);
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
        const nextJti = (0, authTokens_1.makeJti)();
        const nextRefreshToken = (0, authTokens_1.signRefreshToken)({ userId: session.userId, jti: nextJti });
        const nextAccessToken = (0, authTokens_1.signAccessToken)({
            userId: session.user.id,
            email: session.user.email,
            role: session.user.role,
            team: session.user.team,
        });
        await prisma.authSession.create({
            data: {
                userId: session.userId,
                jti: nextJti,
                tokenHash: (0, authTokens_1.hashToken)(nextRefreshToken),
                userAgent: req.headers['user-agent'] || null,
                ipAddress: req.ip || null,
                expiresAt: new Date(Date.now() + authTokens_1.SESSION_TIMEOUT_MS),
            },
        });
        const cookie = (0, authTokens_1.createRefreshTokenCookie)(nextRefreshToken);
        res.cookie(REFRESH_COOKIE, cookie.value, {
            httpOnly: cookie.httpOnly,
            sameSite: cookie.sameSite,
            secure: cookie.secure,
            path: cookie.path,
            maxAge: cookie.maxAge,
        });
        await (0, auditTrail_1.writeAuditSystem)({
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
    }
    catch (error) {
        return res.status(401).json({ error: 'Refresh session invalid or expired' });
    }
};
exports.refreshToken = refreshToken;
const logout = async (req, res) => {
    try {
        const token = (0, authTokens_1.parseCookie)(req.headers.cookie, REFRESH_COOKIE);
        if (token) {
            try {
                const payload = (0, authTokens_1.verifyRefreshToken)(token);
                await prisma.authSession.updateMany({
                    where: { userId: payload.userId, jti: payload.jti, revokedAt: null },
                    data: { revokedAt: new Date() },
                });
                await (0, auditTrail_1.writeAuditSystem)({
                    userId: payload.userId,
                    action: 'auth.logout',
                    entityType: 'auth_session',
                    entityId: payload.jti,
                    ipAddress: req.ip || null,
                    userAgent: req.headers['user-agent'] || null,
                });
            }
            catch {
                // ignore invalid token on logout
            }
        }
        res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
        res.json({ message: 'Logged out' });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to logout' });
    }
};
exports.logout = logout;
const getProfile = async (req, res) => {
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
        if (!user)
            return res.status(404).json({ error: 'Not found' });
        res.json(user);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
};
exports.getProfile = getProfile;
const updateProfile = async (req, res) => {
    try {
        const { name, avatarUrl } = req.body;
        const userId = req.user?.userId;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const user = await prisma.user.update({
            where: { id: userId },
            data: { name, avatarUrl },
            select: { id: true, email: true, name: true, role: true, team: true, avatarUrl: true, mfaEnabled: true }
        });
        await (0, auditTrail_1.writeAudit)(req, {
            action: 'profile.update',
            entityType: 'user',
            entityId: user.id,
            after: user,
        });
        res.json(user);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to update profile' });
    }
};
exports.updateProfile = updateProfile;
const changePassword = async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;
        const userId = req.user?.userId;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user)
            return res.status(404).json({ error: 'User not found' });
        const validPassword = await bcryptjs_1.default.compare(oldPassword, user.passwordHash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Password lamamu salah' });
        }
        const passwordHash = await bcryptjs_1.default.hash(newPassword, 10);
        await prisma.user.update({
            where: { id: userId },
            data: { passwordHash }
        });
        await (0, auditTrail_1.writeAudit)(req, {
            action: 'profile.password_change',
            entityType: 'user',
            entityId: userId,
        });
        res.json({ message: 'Password berhasil diubah' });
    }
    catch (error) {
        res.status(500).json({ error: 'Gagal mengubah password' });
    }
};
exports.changePassword = changePassword;

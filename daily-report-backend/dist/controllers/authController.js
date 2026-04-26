"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.changePassword = exports.updateProfile = exports.getProfile = exports.logout = exports.refreshToken = exports.login = void 0;
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const zodSchemas_1 = require("../validators/zodSchemas");
const authTokens_1 = require("../utils/authTokens");
const auditTrail_1 = require("../utils/auditTrail");
const prisma = new client_1.PrismaClient();
const REFRESH_COOKIE = 'refresh_token';
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
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
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
    }
    catch (error) {
        if (req.log)
            req.log.error(error, 'Login fail');
        res.status(500).json({ error: 'Terjadi kesalahan pada server' });
    }
};
exports.login = login;
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
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
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
            select: { id: true, email: true, name: true, role: true, team: true, avatarUrl: true }
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

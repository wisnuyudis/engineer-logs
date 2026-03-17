"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.changePassword = exports.updateProfile = exports.getProfile = exports.login = void 0;
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma = new client_1.PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-me';
const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email dan password harus diisi' });
        }
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
        // Create token
        const token = jsonwebtoken_1.default.sign({ userId: user.id, email: user.email, role: user.role, team: user.team }, JWT_SECRET, { expiresIn: '24h' });
        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                team: user.team,
                avatarUrl: user.avatarUrl,
                status: user.status
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
const getProfile = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user?.userId },
            select: { id: true, email: true, name: true, role: true, team: true, avatarUrl: true, supervisorId: true }
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
        res.json({ message: 'Password berhasil diubah' });
    }
    catch (error) {
        res.status(500).json({ error: 'Gagal mengubah password' });
    }
};
exports.changePassword = changePassword;

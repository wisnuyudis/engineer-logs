"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activateUser = void 0;
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma = new client_1.PrismaClient();
const activateUser = async (req, res) => {
    try {
        const { token, password } = req.body;
        if (!token || !password)
            return res.status(400).json({ error: 'Token & Password are required' });
        const tokenKey = `invite_${token}`;
        // Check if token exists
        const setting = await prisma.setting.findUnique({
            where: { key: tokenKey }
        });
        if (!setting) {
            return res.status(400).json({ error: 'Invalid or expired activation link' });
        }
        const userId = setting.value;
        // Check if user still exists and is invited
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user || user.status !== 'invited') {
            return res.status(400).json({ error: 'User is not in an invited state anymore' });
        }
        // Hash new password
        const passwordHash = await bcryptjs_1.default.hash(password, 10);
        // Update user
        await prisma.user.update({
            where: { id: userId },
            data: {
                passwordHash,
                status: 'active'
            }
        });
        // Clean up used token
        await prisma.setting.delete({
            where: { key: tokenKey }
        });
        res.status(200).json({ message: 'Account activated successfully! You can now login.' });
    }
    catch (error) {
        if (req.log)
            req.log.error(error, 'Activation error');
        else
            console.error(error);
        res.status(500).json({ error: 'Terjadi kesalahan server saat aktivasi' });
    }
};
exports.activateUser = activateUser;

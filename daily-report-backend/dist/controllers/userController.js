"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteUser = exports.updateUser = exports.createUser = exports.getUsers = void 0;
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma = new client_1.PrismaClient();
const getUsers = async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                status: true,
                avatarUrl: true,
                team: true,
                supervisorId: true,
            }
        });
        res.json(users);
    }
    catch (error) {
        if (req.log)
            req.log.error(error, 'Error fetching users');
        else
            console.error(error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
};
exports.getUsers = getUsers;
const createUser = async (req, res) => {
    try {
        const { email, password, name, role, team } = req.body;
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ error: 'Email already exists' });
        }
        const passwordHash = await bcryptjs_1.default.hash(password, 10);
        const user = await prisma.user.create({
            data: {
                email,
                passwordHash,
                name,
                role,
                team,
                status: 'active'
            },
            select: { id: true, email: true, name: true, role: true }
        });
        res.status(201).json(user);
    }
    catch (error) {
        if (req.log)
            req.log.error(error, 'Error creating user');
        else
            console.error(error);
        res.status(500).json({ error: 'Failed to create user' });
    }
};
exports.createUser = createUser;
const updateUser = async (req, res) => {
    try {
        const id = req.params.id;
        const { name, role, team, status } = req.body;
        const user = await prisma.user.update({
            where: { id: String(id) },
            data: { name, role, team, status },
            select: { id: true, email: true, name: true, role: true, status: true }
        });
        res.json(user);
    }
    catch (error) {
        if (req.log)
            req.log.error(error, 'Error updating user');
        else
            console.error(error);
        res.status(500).json({ error: 'Failed to update user' });
    }
};
exports.updateUser = updateUser;
const deleteUser = async (req, res) => {
    try {
        const id = String(req.params.id);
        const authUserId = req.user?.id ? String(req.user.id) : null;
        const existingUser = await prisma.user.findUnique({
            where: { id },
            select: { id: true, name: true }
        });
        if (!existingUser) {
            return res.status(404).json({ error: 'User not found' });
        }
        if (authUserId && authUserId === id) {
            return res.status(400).json({ error: 'Tidak bisa menghapus akun yang sedang dipakai login' });
        }
        const activityIds = await prisma.activity.findMany({
            where: { userId: id },
            select: { id: true }
        });
        const idsToDelete = activityIds.map((activity) => activity.id);
        await prisma.$transaction(async (tx) => {
            if (idsToDelete.length) {
                await tx.attachment.deleteMany({
                    where: { activityId: { in: idsToDelete } }
                });
            }
            await tx.activity.deleteMany({
                where: { userId: id }
            });
            await tx.kpiScorecard.deleteMany({
                where: { userId: id }
            });
            await tx.kpiScorecard.updateMany({
                where: { enteredById: id },
                data: { enteredById: null }
            });
            await tx.user.updateMany({
                where: { supervisorId: id },
                data: { supervisorId: null }
            });
            await tx.user.delete({
                where: { id }
            });
        });
        res.json({
            success: true,
            deletedUserId: id,
            name: existingUser.name
        });
    }
    catch (error) {
        if (req.log)
            req.log.error(error, 'Error deleting user');
        else
            console.error(error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
};
exports.deleteUser = deleteUser;

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateUser = exports.createUser = exports.getUsers = void 0;
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

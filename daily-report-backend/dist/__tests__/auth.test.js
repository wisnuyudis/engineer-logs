"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const app_1 = __importDefault(require("../app"));
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
// Mock PrismaClient globally
jest.mock('@prisma/client', () => {
    const mPrismaClient = {
        user: {
            findUnique: jest.fn(),
        },
    };
    return { PrismaClient: jest.fn(() => mPrismaClient) };
});
const prisma = new client_1.PrismaClient();
describe('Auth API Endpoints', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });
    describe('POST /api/auth/login', () => {
        it('should return 400 if email or password is empty', async () => {
            const res = await (0, supertest_1.default)(app_1.default).post('/api/auth/login').send({ email: '', password: '' });
            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('error', 'Email dan password harus diisi');
        });
        it('should return 401 if user not found', async () => {
            prisma.user.findUnique.mockResolvedValue(null);
            const res = await (0, supertest_1.default)(app_1.default).post('/api/auth/login').send({ email: 'test@notfound.com', password: 'password123' });
            expect(res.statusCode).toEqual(401);
            expect(res.body).toHaveProperty('error', 'Email atau password salah');
        });
        it('should return 403 if account is suspended', async () => {
            prisma.user.findUnique.mockResolvedValue({
                id: 'user1', email: 'test@suspend.com', passwordHash: 'hash', status: 'suspended', role: 'pm'
            });
            const res = await (0, supertest_1.default)(app_1.default).post('/api/auth/login').send({ email: 'test@suspend.com', password: 'password123' });
            expect(res.statusCode).toEqual(403);
            expect(res.body).toHaveProperty('error', 'Akun kamu sedang disuspend. Hubungi Administrator.');
        });
        it('should return 200 and token on successful login', async () => {
            const hash = await bcryptjs_1.default.hash('password123', 10);
            prisma.user.findUnique.mockResolvedValue({
                id: 'user1', email: 'valid@test.com', passwordHash: hash, status: 'active', role: 'admin', team: 'all', name: 'Admin Test'
            });
            const res = await (0, supertest_1.default)(app_1.default).post('/api/auth/login').send({ email: 'valid@test.com', password: 'password123' });
            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('token');
            expect(res.body.user).toHaveProperty('email', 'valid@test.com');
            expect(res.body.user).toHaveProperty('role', 'admin');
        });
    });
});

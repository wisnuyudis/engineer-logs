"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const app_1 = __importDefault(require("../app"));
const client_1 = require("@prisma/client");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
jest.mock('@prisma/client', () => {
    const mPrismaClient = {
        activity: {
            findMany: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            findUnique: jest.fn()
        },
        user: {
            findUnique: jest.fn()
        }
    };
    return { PrismaClient: jest.fn(() => mPrismaClient) };
});
const prisma = new client_1.PrismaClient();
const secret = process.env.JWT_SECRET || 'secret';
const generateToken = (payload) => jsonwebtoken_1.default.sign(payload, secret);
describe('Activity API Endpoints', () => {
    let token;
    beforeAll(() => {
        token = generateToken({ userId: 'u1', email: 'test@se.com', role: 'se', team: 'delivery' });
    });
    afterEach(() => {
        jest.clearAllMocks();
    });
    describe('POST /api/activities', () => {
        it('should fail if startTime >= endTime', async () => {
            const res = await (0, supertest_1.default)(app_1.default)
                .post('/api/activities')
                .set('Authorization', `Bearer ${token}`)
                .send({
                actKey: 'jira_impl',
                date: '2023-11-20',
                startTime: '10:00',
                endTime: '10:00',
                dur: 0,
                ticketId: 'PROJ-1',
                customerName: 'Customer X'
            });
            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('error', 'Jam selesai harus lebih besar dari jam mulai');
        });
        it('should fail if hours overlap with existing activities', async () => {
            // Mock findMany returning 1 record (overlap exists)
            prisma.activity.findMany.mockResolvedValue([{ id: 'a1' }]);
            const res = await (0, supertest_1.default)(app_1.default)
                .post('/api/activities')
                .set('Authorization', `Bearer ${token}`)
                .send({
                actKey: 'jira_impl',
                date: '2023-11-20',
                startTime: '09:00',
                endTime: '11:00',
                dur: 2,
                ticketId: 'PROJ-1',
                customerName: 'Customer X'
            });
            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('error', 'Terdapat aktivitas lain pada rentang jam tersebut');
        });
        it('should pass and create activity if no overlap', async () => {
            prisma.activity.findMany.mockResolvedValue([]);
            prisma.activity.create.mockResolvedValue({
                id: 'new_act',
                startTime: '09:00',
                endTime: '11:00',
                dur: 2
            });
            const res = await (0, supertest_1.default)(app_1.default)
                .post('/api/activities')
                .set('Authorization', `Bearer ${token}`)
                .send({
                actKey: 'jira_impl',
                date: '2023-11-20',
                startTime: '09:00',
                endTime: '11:00',
                dur: 2,
                ticketId: 'PROJ-1',
                customerName: 'Customer X'
            });
            expect(res.statusCode).toEqual(201);
            expect(res.body).toHaveProperty('id', 'new_act');
            expect(prisma.activity.create).toHaveBeenCalled();
        });
    });
});

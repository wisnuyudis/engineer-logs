"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const app_1 = __importDefault(require("../app"));
describe('User API authorization', () => {
    it('returns 401 for GET /api/users without bearer token', async () => {
        const res = await (0, supertest_1.default)(app_1.default).get('/api/users');
        expect(res.statusCode).toBe(401);
        expect(res.body).toHaveProperty('error', 'Access token missing');
    });
});

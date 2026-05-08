"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const authMiddleware_1 = require("../middlewares/authMiddleware");
describe('authenticateToken', () => {
    it('returns 401 when authorization header is missing', () => {
        const req = { headers: {} };
        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis(),
        };
        const next = jest.fn();
        (0, authMiddleware_1.authenticateToken)(req, res, next);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'Access token missing' });
        expect(next).not.toHaveBeenCalled();
    });
    it('returns 401 when authorization header is not a bearer token', () => {
        const req = { headers: { authorization: 'Basic abc123' } };
        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis(),
        };
        const next = jest.fn();
        (0, authMiddleware_1.authenticateToken)(req, res, next);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'Access token missing' });
        expect(next).not.toHaveBeenCalled();
    });
});

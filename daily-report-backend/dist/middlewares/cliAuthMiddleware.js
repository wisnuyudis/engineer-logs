"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateCliRequest = exports.hashCliToken = void 0;
const client_1 = require("@prisma/client");
const crypto_1 = __importDefault(require("crypto"));
const prisma = new client_1.PrismaClient();
const hashCliToken = (token) => crypto_1.default.createHash('sha256').update(token).digest('hex');
exports.hashCliToken = hashCliToken;
const timingSafeStringEqual = (a, b) => {
    const aBuf = Buffer.from(a);
    const bBuf = Buffer.from(b);
    return aBuf.length === bBuf.length && crypto_1.default.timingSafeEqual(aBuf, bBuf);
};
const authenticateCliRequest = async (req, res, next) => {
    try {
        const authHeader = String(req.header('authorization') || '').trim();
        if (!authHeader.startsWith('Bearer '))
            return res.status(401).json({ error: 'CLI token missing' });
        const token = authHeader.slice(7).trim();
        if (!token)
            return res.status(401).json({ error: 'CLI token missing' });
        const tokenHash = (0, exports.hashCliToken)(token);
        const user = await prisma.user.findFirst({
            where: {
                cliTokenHash: tokenHash,
                status: 'active',
            },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                team: true,
                cliTokenHash: true,
            },
        });
        if (!user?.cliTokenHash || !timingSafeStringEqual(user.cliTokenHash, tokenHash)) {
            return res.status(401).json({ error: 'Invalid CLI token' });
        }
        req.cliUser = {
            userId: user.id,
            email: user.email,
            role: user.role,
            team: user.team,
            name: user.name,
        };
        next();
    }
    catch (error) {
        return res.status(401).json({ error: 'Invalid CLI authentication' });
    }
};
exports.authenticateCliRequest = authenticateCliRequest;

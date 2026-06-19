"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateCliRequest = exports.publicKeyFingerprint = void 0;
const client_1 = require("@prisma/client");
const crypto_1 = __importDefault(require("crypto"));
const prisma = new client_1.PrismaClient();
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const bodyHash = (body) => crypto_1.default.createHash('sha256').update(body || '').digest('hex');
const timingSafeStringEqual = (a, b) => {
    const aBuf = Buffer.from(a);
    const bBuf = Buffer.from(b);
    return aBuf.length === bBuf.length && crypto_1.default.timingSafeEqual(aBuf, bBuf);
};
const publicKeyFingerprint = (publicKeyPem) => crypto_1.default.createHash('sha256').update(publicKeyPem.trim()).digest('hex');
exports.publicKeyFingerprint = publicKeyFingerprint;
const canonicalPath = (req) => req.originalUrl;
const authenticateCliRequest = async (req, res, next) => {
    try {
        const keyId = String(req.header('x-elog-key-id') || '').trim();
        const timestamp = String(req.header('x-elog-timestamp') || '').trim();
        const nonce = String(req.header('x-elog-nonce') || '').trim();
        const signature = String(req.header('x-elog-signature') || '').trim();
        if (!keyId || !timestamp || !nonce || !signature) {
            return res.status(401).json({ error: 'CLI signature headers missing' });
        }
        const ts = Number(timestamp);
        const cutoff = new Date(Date.now() - MAX_CLOCK_SKEW_MS);
        await prisma.setting.deleteMany({
            where: {
                key: { startsWith: 'cli_nonce_' },
                updatedAt: { lt: cutoff },
            },
        });
        if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > MAX_CLOCK_SKEW_MS) {
            return res.status(401).json({ error: 'CLI signature timestamp expired' });
        }
        const user = await prisma.user.findFirst({
            where: {
                cliKeyFingerprint: keyId,
                cliPublicKeyPem: { not: null },
                status: 'active',
            },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                team: true,
                cliPublicKeyPem: true,
            },
        });
        if (!user?.cliPublicKeyPem) {
            return res.status(401).json({ error: 'CLI key not linked' });
        }
        const actualFingerprint = (0, exports.publicKeyFingerprint)(user.cliPublicKeyPem);
        if (!timingSafeStringEqual(actualFingerprint, keyId)) {
            return res.status(401).json({ error: 'CLI key mismatch' });
        }
        const nonceKey = `cli_nonce_${keyId}_${nonce}`;
        const existingNonce = await prisma.setting.findUnique({ where: { key: nonceKey } });
        if (existingNonce) {
            return res.status(401).json({ error: 'CLI nonce already used' });
        }
        const canonical = [
            req.method.toUpperCase(),
            canonicalPath(req),
            timestamp,
            nonce,
            bodyHash(req.rawBody),
        ].join('\n');
        const isValid = crypto_1.default.verify('RSA-SHA256', Buffer.from(canonical), user.cliPublicKeyPem, Buffer.from(signature, 'base64'));
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid CLI signature' });
        }
        await prisma.setting.create({
            data: {
                key: nonceKey,
                value: String(ts),
                description: 'CLI signed request nonce',
            },
        });
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

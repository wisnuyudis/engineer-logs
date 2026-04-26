"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeJti = exports.parseCookie = exports.createRefreshTokenCookie = exports.hashToken = exports.verifyRefreshToken = exports.verifyAccessToken = exports.signRefreshToken = exports.signAccessToken = void 0;
const crypto_1 = __importDefault(require("crypto"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const ACCESS_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-me';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || `${ACCESS_SECRET}-refresh`;
const ACCESS_EXPIRES_IN = '15m';
const REFRESH_EXPIRES_IN = '30d';
const signAccessToken = (payload) => jsonwebtoken_1.default.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES_IN });
exports.signAccessToken = signAccessToken;
const signRefreshToken = (payload) => jsonwebtoken_1.default.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES_IN });
exports.signRefreshToken = signRefreshToken;
const verifyAccessToken = (token) => jsonwebtoken_1.default.verify(token, ACCESS_SECRET);
exports.verifyAccessToken = verifyAccessToken;
const verifyRefreshToken = (token) => jsonwebtoken_1.default.verify(token, REFRESH_SECRET);
exports.verifyRefreshToken = verifyRefreshToken;
const hashToken = (token) => crypto_1.default.createHash('sha256').update(token).digest('hex');
exports.hashToken = hashToken;
const createRefreshTokenCookie = (token) => ({
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/auth',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    value: token,
});
exports.createRefreshTokenCookie = createRefreshTokenCookie;
const parseCookie = (cookieHeader, name) => {
    if (!cookieHeader)
        return null;
    const parts = cookieHeader.split(';').map((part) => part.trim());
    for (const part of parts) {
        const index = part.indexOf('=');
        if (index === -1)
            continue;
        const key = part.slice(0, index).trim();
        if (key === name)
            return decodeURIComponent(part.slice(index + 1));
    }
    return null;
};
exports.parseCookie = parseCookie;
const makeJti = () => crypto_1.default.randomUUID();
exports.makeJti = makeJti;

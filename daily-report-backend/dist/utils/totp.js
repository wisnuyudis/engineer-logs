"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildOtpAuthUrl = exports.decryptMfaSecret = exports.encryptMfaSecret = exports.verifyTotp = exports.generateTotpSecret = void 0;
const crypto_1 = __importDefault(require("crypto"));
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const getEncryptionKey = () => {
    const source = process.env.MFA_ENCRYPTION_KEY || process.env.JWT_SECRET || 'development-mfa-key';
    return crypto_1.default.createHash('sha256').update(source).digest();
};
const generateTotpSecret = () => {
    const bytes = crypto_1.default.randomBytes(20);
    let bits = '';
    for (const byte of bytes)
        bits += byte.toString(2).padStart(8, '0');
    let output = '';
    for (let index = 0; index < bits.length; index += 5) {
        const chunk = bits.slice(index, index + 5).padEnd(5, '0');
        output += BASE32_ALPHABET[parseInt(chunk, 2)];
    }
    return output;
};
exports.generateTotpSecret = generateTotpSecret;
const base32ToBuffer = (secret) => {
    const cleaned = secret.replace(/=+$/g, '').replace(/\s+/g, '').toUpperCase();
    let bits = '';
    for (const char of cleaned) {
        const value = BASE32_ALPHABET.indexOf(char);
        if (value === -1)
            throw new Error('Invalid TOTP secret');
        bits += value.toString(2).padStart(5, '0');
    }
    const bytes = [];
    for (let index = 0; index + 8 <= bits.length; index += 8) {
        bytes.push(parseInt(bits.slice(index, index + 8), 2));
    }
    return Buffer.from(bytes);
};
const generateTotpAtCounter = (secret, counter) => {
    const key = base32ToBuffer(secret);
    const buffer = Buffer.alloc(8);
    buffer.writeBigUInt64BE(BigInt(counter));
    const hmac = crypto_1.default.createHmac('sha1', key).update(buffer).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const code = (((hmac[offset] & 0x7f) << 24)
        | ((hmac[offset + 1] & 0xff) << 16)
        | ((hmac[offset + 2] & 0xff) << 8)
        | (hmac[offset + 3] & 0xff)) % 1000000;
    return String(code).padStart(6, '0');
};
const verifyTotp = (secret, token, window = 1) => {
    const cleaned = String(token || '').replace(/\s+/g, '');
    if (!/^\d{6}$/.test(cleaned))
        return false;
    const counter = Math.floor(Date.now() / 1000 / 30);
    for (let offset = -window; offset <= window; offset += 1) {
        const expected = generateTotpAtCounter(secret, counter + offset);
        if (crypto_1.default.timingSafeEqual(Buffer.from(cleaned), Buffer.from(expected)))
            return true;
    }
    return false;
};
exports.verifyTotp = verifyTotp;
const encryptMfaSecret = (secret) => {
    const iv = crypto_1.default.randomBytes(12);
    const cipher = crypto_1.default.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.');
};
exports.encryptMfaSecret = encryptMfaSecret;
const decryptMfaSecret = (value) => {
    const [ivRaw, tagRaw, encryptedRaw] = String(value || '').split('.');
    if (!ivRaw || !tagRaw || !encryptedRaw)
        throw new Error('Invalid encrypted MFA secret');
    const decipher = crypto_1.default.createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(ivRaw, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
    return Buffer.concat([
        decipher.update(Buffer.from(encryptedRaw, 'base64url')),
        decipher.final(),
    ]).toString('utf8');
};
exports.decryptMfaSecret = decryptMfaSecret;
const buildOtpAuthUrl = (email, secret) => {
    const issuer = 'EngineerLog';
    const label = `${issuer}:${email}`;
    const params = new URLSearchParams({
        secret,
        issuer,
        algorithm: 'SHA1',
        digits: '6',
        period: '30',
    });
    return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
};
exports.buildOtpAuthUrl = buildOtpAuthUrl;

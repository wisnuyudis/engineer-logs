"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAllowedSmtpFromEmail = exports.isAllowedCompanyEmail = exports.normalizeEmail = exports.ALLOWED_SMTP_FROM_DOMAINS = exports.ALLOWED_EMAIL_DOMAIN = void 0;
exports.ALLOWED_EMAIL_DOMAIN = '@sdt.co.id';
exports.ALLOWED_SMTP_FROM_DOMAINS = ['@sdt.co.id', '@gmail.com', '@support.sdt.co.id'];
const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
exports.normalizeEmail = normalizeEmail;
const isAllowedCompanyEmail = (email) => (0, exports.normalizeEmail)(email).endsWith(exports.ALLOWED_EMAIL_DOMAIN);
exports.isAllowedCompanyEmail = isAllowedCompanyEmail;
const isAllowedSmtpFromEmail = (email) => {
    const normalized = (0, exports.normalizeEmail)(email);
    return exports.ALLOWED_SMTP_FROM_DOMAINS.some((domain) => normalized.endsWith(domain));
};
exports.isAllowedSmtpFromEmail = isAllowedSmtpFromEmail;

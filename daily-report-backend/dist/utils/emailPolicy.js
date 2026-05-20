"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAllowedCompanyEmail = exports.normalizeEmail = exports.ALLOWED_EMAIL_DOMAIN = void 0;
exports.ALLOWED_EMAIL_DOMAIN = '@sdt.co.id';
const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
exports.normalizeEmail = normalizeEmail;
const isAllowedCompanyEmail = (email) => (0, exports.normalizeEmail)(email).endsWith(exports.ALLOWED_EMAIL_DOMAIN);
exports.isAllowedCompanyEmail = isAllowedCompanyEmail;

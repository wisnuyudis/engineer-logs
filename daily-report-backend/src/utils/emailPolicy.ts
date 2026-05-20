export const ALLOWED_EMAIL_DOMAIN = '@sdt.co.id';

export const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();

export const isAllowedCompanyEmail = (email: string) => normalizeEmail(email).endsWith(ALLOWED_EMAIL_DOMAIN);

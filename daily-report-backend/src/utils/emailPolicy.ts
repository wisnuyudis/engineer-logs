export const ALLOWED_EMAIL_DOMAIN = '@sdt.co.id';
export const ALLOWED_SMTP_FROM_DOMAINS = ['@sdt.co.id', '@gmail.com', '@support.sdt.co.id'];

export const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();

export const isAllowedCompanyEmail = (email: string) => normalizeEmail(email).endsWith(ALLOWED_EMAIL_DOMAIN);

export const isAllowedSmtpFromEmail = (email: string) => {
  const normalized = normalizeEmail(email);
  return ALLOWED_SMTP_FROM_DOMAINS.some((domain) => normalized.endsWith(domain));
};

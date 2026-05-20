import { Response } from 'express';
import nodemailer from 'nodemailer';
import { AuthRequest } from '../middlewares/authMiddleware';
import { getStoredSmtpConfig, maskSmtpConfig, resolveSmtpConfig, upsertSmtpConfig } from '../services/smtpSettingsService';
import { isAllowedCompanyEmail, normalizeEmail } from '../utils/emailPolicy';
import { writeAudit } from '../utils/auditTrail';

const isAdminRole = (role?: string | null) => String(role || '').toLowerCase() === 'admin';

export const getSmtpSettings = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminRole(req.user?.role)) return res.status(403).json({ error: 'Insufficient permissions' });
    const stored = await getStoredSmtpConfig();
    const effective = await resolveSmtpConfig();
    res.json({
      configured: Boolean(effective),
      settings: maskSmtpConfig({ ...effective, ...stored }),
    });
  } catch (error) {
    req.log?.error(error, 'Failed to fetch SMTP settings');
    res.status(500).json({ error: 'Failed to fetch SMTP settings' });
  }
};

export const updateSmtpSettings = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminRole(req.user?.role)) return res.status(403).json({ error: 'Insufficient permissions' });

    const port = Number(req.body?.port);
    const fromEmail = normalizeEmail(req.body?.fromEmail || req.body?.user);
    const payload = {
      provider: String(req.body?.provider || 'custom'),
      host: String(req.body?.host || '').trim(),
      port,
      secure: Boolean(req.body?.secure),
      user: String(req.body?.user || '').trim(),
      pass: req.body?.pass === undefined ? undefined : String(req.body.pass || ''),
      fromName: String(req.body?.fromName || 'EngineerLog Admin').trim(),
      fromEmail,
    };

    if (!payload.host) return res.status(400).json({ error: 'SMTP host wajib diisi.' });
    if (!Number.isFinite(payload.port) || payload.port <= 0) return res.status(400).json({ error: 'SMTP port tidak valid.' });
    if (!payload.user) return res.status(400).json({ error: 'SMTP username wajib diisi.' });
    if (!isAllowedCompanyEmail(payload.fromEmail)) return res.status(400).json({ error: 'Email pengirim harus menggunakan domain @sdt.co.id.' });

    const saved = await upsertSmtpConfig(payload);
    await writeAudit(req, {
      action: 'settings.smtp_update',
      entityType: 'setting',
      entityId: 'smtp_config',
      after: maskSmtpConfig(saved),
    });

    res.json({ configured: true, settings: maskSmtpConfig(saved) });
  } catch (error) {
    req.log?.error(error, 'Failed to update SMTP settings');
    res.status(500).json({ error: 'Failed to update SMTP settings' });
  }
};

export const testSmtpSettings = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminRole(req.user?.role)) return res.status(403).json({ error: 'Insufficient permissions' });
    const config = await resolveSmtpConfig();
    if (!config) return res.status(400).json({ error: 'SMTP belum dikonfigurasi.' });

    const to = normalizeEmail(req.body?.to || req.user?.email);
    if (!isAllowedCompanyEmail(to)) return res.status(400).json({ error: 'Email tujuan harus menggunakan domain @sdt.co.id.' });

    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass },
    });

    const info = await transporter.sendMail({
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to,
      subject: 'EngineerLog SMTP Test',
      html: '<p>SMTP EngineerLog berhasil dikonfigurasi.</p>',
    });

    res.json({ message: 'SMTP test sent', messageId: info.messageId });
  } catch (error) {
    req.log?.error(error, 'Failed to test SMTP settings');
    res.status(400).json({ error: 'Gagal mengirim test email SMTP.' });
  }
};

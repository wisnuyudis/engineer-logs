import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { AuthRequest } from '../middlewares/authMiddleware';
import { writeAudit } from '../utils/auditTrail';
import { resolveSmtpConfig } from '../services/smtpSettingsService';
import { ALLOWED_EMAIL_DOMAIN, isAllowedCompanyEmail, normalizeEmail } from '../utils/emailPolicy';

const prisma = new PrismaClient();

let transporter: nodemailer.Transporter | null = null;
let transporterKey: string | null = null;

async function setupTransporter() {
  const config = await resolveSmtpConfig();
  if (!config) {
    throw new Error('SMTP belum dikonfigurasi. Atur SMTP Settings terlebih dahulu.');
  }

  const nextKey = `${config.host}:${config.port}:${config.user}:${config.fromEmail}`;
  if (transporter && transporterKey === nextKey) return { transporter, config };

  transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass }
  });
  transporterKey = nextKey;

  return { transporter, config };
}

export const inviteUser = async (req: AuthRequest, res: Response) => {
  try {
    const { name, role, team, supervisorId, bypassSmtp, manualPassword } = req.body;
    const email = normalizeEmail(req.body?.email);

    if (!isAllowedCompanyEmail(email)) {
      return res.status(400).json({ error: `Email member harus menggunakan domain ${ALLOWED_EMAIL_DOMAIN}.` });
    }
    
    // Check if email exist
    const exist = await prisma.user.findUnique({ where: { email } });
    if(exist) return res.status(400).json({ error: 'Email already exists' });

    if (bypassSmtp) {
      // BYPASS SMTP: Generate customized / default password
      const passToHash = manualPassword || 'password123';
      const hashedPassword = await bcrypt.hash(passToHash, 10);
      
      const user = await prisma.user.create({
        data: {
          email,
          name,
          role,
          team,
          supervisorId,
          status: 'active',
          passwordHash: hashedPassword
        }
      });
      await writeAudit(req, {
        action: 'invite.create',
        entityType: 'user',
        entityId: user.id,
        after: { email, name, role, team, supervisorId, status: 'active', bypassSmtp: true },
      });
      return res.status(200).json({ message: 'Aktivasi langsung berhasil. Member aktif.' });
    } else {
      // NORMAL SMTP FLOW
      const { transporter: mailTransporter, config } = await setupTransporter();
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenKey = `invite_${rawToken}`;
      
      const user = await prisma.user.create({
        data: {
          email,
          name,
          role,
          team,
          supervisorId,
          status: 'invited',
          passwordHash: 'pending' // Will be updated on activation
        }
      });
      await writeAudit(req, {
        action: 'invite.create',
        entityType: 'user',
        entityId: user.id,
        after: { email, name, role, team, supervisorId, status: 'invited', bypassSmtp: false },
      });

      await prisma.setting.create({
        data: {
          key: tokenKey,
          value: user.id,
          description: 'Invite token, expires 24h'
        }
      });

      const frontEndUrl = process.env.FRONTEND_URL || 'http://localhost:5174';
      const link = `${frontEndUrl}/activate?token=${rawToken}`;

      // Send Email
      const info = await mailTransporter.sendMail({
        from: `"${config.fromName}" <${config.fromEmail}>`,
        to: email,
        subject: "Invitation to EngineerLog Dashboard",
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
            <h2 style="color: #4f46e5;">Welcome to EngineerLog, ${name}!</h2>
            <p>You have been invited to join the Seraphim Digital Technology Daily Report Dashboard as a <strong>${role}</strong>.</p>
            <p>Please click the button below to set up your password and activate your account:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${link}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Activate Account</a>
            </div>
            <p style="font-size: 12px; color: #6b7280;">This link is valid for 24 hours.</p>
          </div>
        `,
      });

      console.log("Message sent: %s", info.messageId);

      return res.status(200).json({ message: 'Invitation sent' });
    }

  } catch (error: any) {
    if(req.log) req.log.error(error, 'Invite user fail');
    res.status(500).json({ error: error?.message || 'Terjadi kesalahan server saat mengundang' });
  }
};

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.inviteUser = void 0;
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const crypto_1 = __importDefault(require("crypto"));
const nodemailer_1 = __importDefault(require("nodemailer"));
const auditTrail_1 = require("../utils/auditTrail");
const prisma = new client_1.PrismaClient();
// Setup Nodemailer Transporter lazily so backend startup does not depend on SMTP/DNS.
let transporter = null;
async function setupTransporter() {
    if (transporter)
        return transporter;
    const host = process.env.SMTP_HOST || 'smtp.ethereal.email';
    const port = parseInt(process.env.SMTP_PORT || '587');
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (user && pass) {
        transporter = nodemailer_1.default.createTransport({
            host,
            port,
            secure: port === 465,
            auth: { user, pass }
        });
    }
    else {
        // Generate test account
        const testAccount = await nodemailer_1.default.createTestAccount();
        transporter = nodemailer_1.default.createTransport({
            host: 'smtp.ethereal.email',
            port: 587,
            secure: false, // true for 465, false for other ports
            auth: {
                user: testAccount.user, // generated ethereal user
                pass: testAccount.pass, // generated ethereal password
            },
        });
        console.log(`Ethereal Test Account generated: ${testAccount.user}`);
    }
    return transporter;
}
const inviteUser = async (req, res) => {
    try {
        const { name, email, role, team, supervisorId, bypassSmtp, manualPassword } = req.body;
        // Check if email exist
        const exist = await prisma.user.findUnique({ where: { email } });
        if (exist)
            return res.status(400).json({ error: 'Email already exists' });
        if (bypassSmtp) {
            // BYPASS SMTP: Generate customized / default password
            const passToHash = manualPassword || 'password123';
            const hashedPassword = await bcryptjs_1.default.hash(passToHash, 10);
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
            await (0, auditTrail_1.writeAudit)(req, {
                action: 'invite.create',
                entityType: 'user',
                entityId: user.id,
                after: { email, name, role, team, supervisorId, status: 'active', bypassSmtp: true },
            });
            return res.status(200).json({ message: 'Aktivasi langsung berhasil. Member aktif.' });
        }
        else {
            // NORMAL SMTP FLOW
            const mailTransporter = await setupTransporter();
            const rawToken = crypto_1.default.randomBytes(32).toString('hex');
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
            await (0, auditTrail_1.writeAudit)(req, {
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
                from: '"EngineerLog Admin" <admin@seraphim.id>',
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
            console.log("Preview URL: %s", nodemailer_1.default.getTestMessageUrl(info));
            return res.status(200).json({ message: 'Invitation sent', previewUrl: nodemailer_1.default.getTestMessageUrl(info) });
        }
    }
    catch (error) {
        if (req.log)
            req.log.error(error, 'Invite user fail');
        res.status(500).json({ error: 'Terjadi kesalahan server saat mengundang' });
    }
};
exports.inviteUser = inviteUser;

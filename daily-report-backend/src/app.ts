import express from 'express';
import pinoHttp from 'pino-http';
import userRoutes from './routes/userRoutes';
import authRoutes from './routes/authRoutes';
import inviteRoutes from './routes/inviteRoutes';
import activationRoutes from './routes/activationRoutes';
import activityRoutes from './routes/activityRoutes';
import dashboardRoutes from './routes/dashboardRoutes';
import telegramRoutes from './routes/telegramRoutes';
import taxonomyRoutes from './routes/taxonomyRoutes';
import jiraRoutes from './routes/jiraRoutes';
import kpiRoutes from './routes/kpiRoutes';
import auditRoutes from './routes/auditRoutes';
import path from 'path';

const app = express();

const allowedOrigins = new Set(
  [process.env.FRONTEND_URL, 'http://localhost:5173', 'http://127.0.0.1:5173', 'http://[::1]:5173'].filter(Boolean) as string[]
);
const isLocalDevOrigin = (origin: string) =>
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(origin);

const securityHeaders = {
  'X-Frame-Options': 'SAMEORIGIN',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'self'",
    "object-src 'none'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
  ].join('; '),
} as const;

app.use((req, res, next) => {
  Object.entries(securityHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  const origin = req.headers.origin;
  if (typeof origin === 'string' && (allowedOrigins.has(origin) || isLocalDevOrigin(origin))) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});
app.use(express.json({
  verify: (req, _res, buf) => {
    (req as any).rawBody = buf.toString('utf8');
  }
}));
app.use(pinoHttp());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

// Serve static files for attachments
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/invite', inviteRoutes);
app.use('/api/activate', activationRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/telegram', telegramRoutes);
app.use('/api/taxonomy', taxonomyRoutes);
app.use('/api/jira', jiraRoutes);
app.use('/api/kpi', kpiRoutes);
app.use('/api/audit', auditRoutes);

export default app;

import express from 'express';
import cors from 'cors';
import pinoHttp from 'pino-http';
import userRoutes from './routes/userRoutes';
import authRoutes from './routes/authRoutes';
import inviteRoutes from './routes/inviteRoutes';
import activationRoutes from './routes/activationRoutes';
import activityRoutes from './routes/activityRoutes';
import dashboardRoutes from './routes/dashboardRoutes';
import path from 'path';

const app = express();

app.use(cors());
app.use(express.json());
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

export default app;

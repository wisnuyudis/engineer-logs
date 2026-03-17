import request from 'supertest';
import app from '../app';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

// Mock PrismaClient globally
jest.mock('@prisma/client', () => {
  const mPrismaClient = {
    user: {
      findUnique: jest.fn(),
    },
  };
  return { PrismaClient: jest.fn(() => mPrismaClient) };
});

const prisma = new PrismaClient();

describe('Auth API Endpoints', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/auth/login', () => {
    it('should return 400 if email or password is empty', async () => {
      const res = await request(app).post('/api/auth/login').send({ email: '', password: '' });
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty('error', 'Email dan password harus diisi');
    });

    it('should return 401 if user not found', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      const res = await request(app).post('/api/auth/login').send({ email: 'test@notfound.com', password: 'password123' });
      expect(res.statusCode).toEqual(401);
      expect(res.body).toHaveProperty('error', 'Email atau password salah');
    });

    it('should return 403 if account is suspended', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user1', email: 'test@suspend.com', passwordHash: 'hash', status: 'suspended', role: 'pm'
      });

      const res = await request(app).post('/api/auth/login').send({ email: 'test@suspend.com', password: 'password123' });
      expect(res.statusCode).toEqual(403);
      expect(res.body).toHaveProperty('error', 'Akun kamu sedang disuspend. Hubungi Administrator.');
    });

    it('should return 200 and token on successful login', async () => {
      const hash = await bcrypt.hash('password123', 10);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user1', email: 'valid@test.com', passwordHash: hash, status: 'active', role: 'admin', team: 'all', name: 'Admin Test'
      });

      const res = await request(app).post('/api/auth/login').send({ email: 'valid@test.com', password: 'password123' });
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user).toHaveProperty('email', 'valid@test.com');
      expect(res.body.user).toHaveProperty('role', 'admin');
    });
  });
});

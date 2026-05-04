import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { writeAudit } from '../utils/auditTrail';

const prisma = new PrismaClient();

export const getUsers = async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        avatarUrl: true,
        team: true,
        supervisorId: true,
      }
    });
    res.json(users);
  } catch (error) {
    if (req.log) req.log.error(error, 'Error fetching users');
    else console.error(error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

export const createUser = async (req: Request, res: Response) => {
  try {
    const { email, password, name, role, team } = req.body;
    
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        role,
        team,
        status: 'active'
      },
      select: { id: true, email: true, name: true, role: true }
    });

    await writeAudit(req as any, {
      action: 'user.create',
      entityType: 'user',
      entityId: user.id,
      after: user,
    });

    res.status(201).json(user);
  } catch (error) {
    if (req.log) req.log.error(error, 'Error creating user');
    else console.error(error);
    res.status(500).json({ error: 'Failed to create user' });
  }
};

export const updateUser = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const id = req.params.id;
    const { name, role, team, status } = req.body;
    
    const user = await prisma.user.update({
      where: { id: String(id) },
      data: { name, role, team, status },
      select: { id: true, email: true, name: true, role: true, status: true }
    });

    await writeAudit(req as any, {
      action: 'user.update',
      entityType: 'user',
      entityId: user.id,
      after: user,
    });

    res.json(user);
  } catch (error) {
    if (req.log) req.log.error(error, 'Error updating user');
    else console.error(error);
    res.status(500).json({ error: 'Failed to update user' });
  }
};

export const deleteUser = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const id = String(req.params.id);
    const authUserId = (req as any).user?.userId ? String((req as any).user.userId) : null;

    const existingUser = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true }
    });

    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (authUserId && authUserId === id) {
      return res.status(400).json({ error: 'Tidak bisa menghapus akun yang sedang dipakai login' });
    }

    const activityIds = await prisma.activity.findMany({
      where: { userId: id },
      select: { id: true }
    });

    const idsToDelete = activityIds.map((activity) => activity.id);

    await prisma.$transaction(async (tx) => {
      if (idsToDelete.length) {
        await tx.attachment.deleteMany({
          where: { activityId: { in: idsToDelete } }
        });
      }

      await tx.activity.deleteMany({
        where: { userId: id }
      });

      await tx.kpiScorecard.deleteMany({
        where: { userId: id }
      });

      await tx.kpiScorecard.updateMany({
        where: { enteredById: id },
        data: { enteredById: null }
      });

      await tx.user.updateMany({
        where: { supervisorId: id },
        data: { supervisorId: null }
      });

      await tx.user.delete({
        where: { id }
      });
    });

    await writeAudit(req as any, {
      action: 'user.delete',
      entityType: 'user',
      entityId: id,
      before: existingUser,
      metadata: { name: existingUser.name },
    });

    res.json({
      success: true,
      deletedUserId: id,
      name: existingUser.name
    });
  } catch (error) {
    if (req.log) req.log.error(error, 'Error deleting user');
    else console.error(error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
};

export const resetUserPassword = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const id = String(req.params.id);
    const { newPassword } = req.body as { newPassword?: string };

    if (!newPassword || newPassword.trim().length < 6) {
      return res.status(400).json({ error: 'Password baru minimal 6 karakter' });
    }

    const existingUser = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true, status: true }
    });

    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const passwordHash = await bcrypt.hash(newPassword.trim(), 10);

    await prisma.user.update({
      where: { id },
      data: { passwordHash }
    });

    await writeAudit(req as any, {
      action: 'user.password_reset',
      entityType: 'user',
      entityId: id,
      metadata: {
        email: existingUser.email,
        name: existingUser.name,
        status: existingUser.status,
      },
    });

    res.json({
      message: `Password ${existingUser.name} berhasil direset`
    });
  } catch (error) {
    if (req.log) req.log.error(error, 'Error resetting user password');
    else console.error(error);
    res.status(500).json({ error: 'Failed to reset user password' });
  }
};

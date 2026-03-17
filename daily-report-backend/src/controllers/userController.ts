import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

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
    res.json(user);
  } catch (error) {
    if (req.log) req.log.error(error, 'Error updating user');
    else console.error(error);
    res.status(500).json({ error: 'Failed to update user' });
  }
};

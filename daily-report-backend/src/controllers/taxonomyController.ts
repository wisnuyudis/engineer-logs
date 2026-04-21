import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Get all taxonomies
export const getAllTaxonomies = async (req: Request, res: Response) => {
  try {
    const data = await prisma.masterActivity.findMany({
      orderBy: { createdAt: 'asc' }
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

// Toggle Active/Inactive
export const toggleTaxonomy = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { isActive } = req.body;
    const data = await prisma.masterActivity.update({
      where: { id },
      data: { isActive }
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update taxonomy state' });
  }
};

// Create new taxonomy
export const createTaxonomy = async (req: Request, res: Response) => {
  try {
    const { actKey, ...rest } = req.body;
    const exists = await prisma.masterActivity.findUnique({ where: { actKey } });
    if (exists) return res.status(400).json({ error: 'Activity key (actKey) sudah terdaftar' });

    const created = await prisma.masterActivity.create({
      data: { actKey, ...rest }
    });
    res.json(created);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create taxonomy' });
  }
};

// Update taxonomy
export const updateTaxonomy = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const updated = await prisma.masterActivity.update({
      where: { id },
      data: req.body
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update taxonomy' });
  }
};

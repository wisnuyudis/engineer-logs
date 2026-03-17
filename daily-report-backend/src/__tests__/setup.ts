import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

beforeAll(async () => {
  // Any global setup
});

afterAll(async () => {
  await prisma.$disconnect();
});

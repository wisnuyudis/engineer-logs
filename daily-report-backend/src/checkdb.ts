import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const t = await prisma.masterActivity.findMany();
  console.log(t.length, 'records found');
}
main().catch(console.error).finally(() => prisma.$disconnect());

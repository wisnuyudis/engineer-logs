import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const users = await prisma.user.findMany({ select: { email: true, name: true, role: true, team: true }});
  console.log(users);
}
main().catch(console.error).finally(() => prisma.$disconnect());

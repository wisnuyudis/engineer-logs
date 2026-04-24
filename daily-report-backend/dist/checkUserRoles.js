"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    const users = await prisma.user.findMany({ select: { email: true, name: true, role: true, team: true } });
    console.log(users);
}
main().catch(console.error).finally(() => prisma.$disconnect());

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    const t = await prisma.masterActivity.findMany();
    console.log(t.length, 'records found');
}
main().catch(console.error).finally(() => prisma.$disconnect());

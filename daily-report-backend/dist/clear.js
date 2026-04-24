"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    // Delete all activities
    await prisma.activity.deleteMany({});
    const admin = await prisma.user.findFirst({
        where: { email: 'admin@seraphim.id' }
    });
    if (admin) {
        // Drop foreign key constraints by setting supervisorId to null first
        await prisma.user.updateMany({
            data: { supervisorId: null }
        });
        // NOW delete all others
        await prisma.user.deleteMany({
            where: {
                id: { not: admin.id }
            }
        });
        console.log("Wiped all data successfully leaving only Admin (admin@seraphim.id)");
    }
    else {
        console.log("Could not find admin, aborted user wipe.");
    }
}
main().catch(console.error).finally(() => prisma.$disconnect());

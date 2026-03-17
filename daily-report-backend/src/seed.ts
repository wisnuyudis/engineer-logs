import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Cleaning up existing data...');
  await prisma.attachment.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.user.deleteMany();

  console.log('Seeding users...');
  const usersToCreate = [
    { email: 'admin@seraphim.id', name: 'Super Admin', rp: 'admin123', role: 'admin', team: 'Admin', position: 'System Administrator' },
    { email: 'rizky@seraphim.id', name: 'Rizky Pratama', rp: 'rizky123', role: 'mgr_dl', team: 'delivery', position: 'Delivery Manager' },
    { email: 'staff@seraphim.id', name: 'Budi Santoso', rp: 'staff123', role: 'service_engineer', team: 'delivery', position: 'Senior Service Engineer' },
    { email: 'doni@seraphim.id', name: 'Doni Prasetyo', rp: 'doni123', role: 'pm', team: 'delivery', position: 'Project Manager' },
    { email: 'hendra@seraphim.id', name: 'Hendra Wijaya', rp: 'hendra123', role: 'mgr_ps', team: 'presales', position: 'Pre-Sales Manager' },
    { email: 'nina@seraphim.id', name: 'Nina Kartika', rp: 'nina123', role: 'presales', team: 'presales', position: 'Senior Sales Engineer' }
  ];

  const createdUsers: Record<string, string> = {};

  for (const u of usersToCreate) {
    const passwordHash = await bcrypt.hash(u.rp, 10);
    const user = await prisma.user.create({
      data: {
        email: u.email,
        name: u.name,
        passwordHash,
        role: u.role,
        status: 'active',
        team: u.team,
        // Using team as "position" for simplicity or could be omitted since it's an app-level thing
      },
    });
    createdUsers[u.email] = user.id;
  }

  // Set Supervisors
  await prisma.user.update({
    where: { id: createdUsers['staff@seraphim.id'] },
    data: { supervisorId: createdUsers['rizky@seraphim.id'] }
  });
  await prisma.user.update({
    where: { id: createdUsers['doni@seraphim.id'] },
    data: { supervisorId: createdUsers['rizky@seraphim.id'] }
  });
  await prisma.user.update({
    where: { id: createdUsers['nina@seraphim.id'] },
    data: { supervisorId: createdUsers['hendra@seraphim.id'] }
  });

  console.log('Seeding sample activities...');
  const todayDate = new Date().toISOString().split('T')[0];
  
  await prisma.activity.createMany({
    data: [
      {
        userId: createdUsers['staff@seraphim.id'], actKey: 'jira_impl', topic: 'Endpoint Payment', dur: 180, date: todayDate, status: 'completed', source: 'jira',
        ticketId: 'PROJ-101', ticketTitle: 'API Gateway', customerName: 'PT. Tokobagus', nps: 4
      },
      {
        userId: createdUsers['staff@seraphim.id'], actKey: 'learning', topic: 'CISSP Module 4', dur: 90, date: todayDate, status: 'completed', source: 'app'
      },
      {
        userId: createdUsers['doni@seraphim.id'], actKey: 'jira_pm', topic: 'Kick-off Project B', dur: 240, date: todayDate, status: 'completed', source: 'jira',
        ticketId: 'PM-22', ticketTitle: 'Koordinasi Klien', customerName: 'PT. Bank Rakyat', nps: 5
      },
      {
        userId: createdUsers['nina@seraphim.id'], actKey: 'demo', topic: 'Demo HRMS App', dur: 120, date: todayDate, status: 'completed', source: 'app',
        prospectValue: 1200000000, prName: 'PT. Kalbe Farma', leadId: 'LEAD-185'
      }
    ]
  });

  console.log('Seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  console.log('Prisma Client loaded');
  const model = prisma.client.modelMeta.modelMap.Client;
  console.log('Fields:', Object.keys(model.fields));
  await prisma.$disconnect();
}

test().catch(console.error);

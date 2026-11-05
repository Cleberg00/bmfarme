const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  const clients = await prisma.client.findMany({ take: 1 });
  console.log('Clientes:', clients.length);
  
  const client = clients[0];
  console.log('Cliente:', client.razaoSocial);
  console.log('WhatsApp:', client.whatsapp || 'não existe');
  
  await prisma.$disconnect();
}

test().catch(console.error);

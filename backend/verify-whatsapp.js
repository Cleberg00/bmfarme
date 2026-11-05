const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verify() {
  const clients = await prisma.client.findMany({
    take: 5,
    select: {
      razaoSocial: true,
      whatsapp: true,
    },
  });
  console.log('Exemplos de empresas com WhatsApp:');
  clients.forEach(c => console.log(`${c.razaoSocial} - ${c.whatsapp || 'sem whatsapp'}`));
  process.exit(0);
}

verify();

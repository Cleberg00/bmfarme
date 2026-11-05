/**
 * Extrai WhatsApp das empresas do banco de dados
 * Formata número para WhatsApp (55DDDNUMERO) e salva
 */

const prisma = require('../src/lib/prisma');

async function extractWhatsApp() {
  console.log('🚀 Iniciando extração de WhatsApp...');

  const companies = await prisma.client.findMany({
    where: {
      telefone: { not: null },
      telefone: { not: '' },
    },
    select: {
      id: true,
      cnpj: true,
      razaoSocial: true,
      telefone: true,
      email: true,
    },
  });

  console.log(`🏢 Total empresas com telefone: ${companies.length}`);

  let updatedCount = 0;

  for (const company of companies) {
    const digits = String(company.telefone).replace(/\D/g, '');
    
    let whatsapp = '';
    if (digits.length === 10) {
      whatsapp = `55${digits}`;
    } else if (digits.length === 11) {
      whatsapp = `55${digits}`;
    } else if (digits.length === 12 && digits.startsWith('55')) {
      whatsapp = digits;
    }

    if (whatsapp) {
      await prisma.client.update({
        where: { id: company.id },
        data: { whatsapp },
      });
      
      updatedCount++;
      console.log(`✅ ${company.razaoSocial}`);
      console.log(`   WhatsApp: ${whatsapp}`);
    }
  }

  console.log(`\n✅ Total: ${updatedCount} empresas com WhatsApp salvo!`);
  await prisma.$disconnect();
  console.log('\n✅ Extração concluída!');
}

extractWhatsApp().catch(err => {
  console.error('Erro:', err.message);
  process.exit(1);
});

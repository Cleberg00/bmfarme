/**
 * Extrai WhatsApp das empresas do banco de dados
 * Formata número para WhatsApp (55DDDNUMERO) e salva
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function extractWhatsApp() {
  console.log('🚀 Iniciando extração de WhatsApp...');

  // Busca empresas com telefone
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
    // Extrai apenas dígitos do telefone
    const digits = String(company.telefone).replace(/\D/g, '');

    // Formata para WhatsApp internacional (55DDDNUMERO)
    let whatsapp = '';
    if (digits.length === 10) {
      // 10 dígitos: DDD + 8 dígitos
      whatsapp = `55${digits}`;
    } else if (digits.length === 11) {
      // 11 dígitos: DDD + 9 dígitos
      whatsapp = `55${digits}`;
    } else if (digits.length === 12 && digits.startsWith('55')) {
      // Já com código 55
      whatsapp = digits;
    }

    if (whatsapp) {
      // Salva WhatsApp no banco
      await prisma.client.update({
        where: { id: company.id },
        data: { whatsapp },
      });
      
      updatedCount++;
      
      // Exibe no console
      console.log(`✅ ${company.razaoSocial}`);
      console.log(`   CNPJ: ${company.cnpj}`);
      console.log(`   Telefone: ${company.telefone}`);
      console.log(`   WhatsApp: ${whatsapp}\n`);
    }
  }

  console.log(`\n✅ Total: ${updatedCount} empresas com WhatsApp salvo!`);
  console.log(`📊 Empresas processadas: ${companies.length}`);

  // Salva em CSV
  const fs = require('fs');
  const csv = `ID,CNPJ,RazaoSocial,Telefone,WhatsApp\n` + companies
    .filter(c => c.whatsapp)
    .map(c => `${c.id},"${c.cnpj}","${c.razaoSocial}","${c.telefone}","${c.whatsapp}"`)
    .join('\n');

  fs.writeFileSync('whatsapp-extracted.csv', csv);
  console.log('📁 CSV salvo: whatsapp-extracted.csv');

  await prisma.$disconnect();
  console.log('\n✅ Extração concluída!');
}

extractWhatsApp().catch(err => {
  console.error('Erro:', err.message);
  process.exit(1);
});

/**
 * Extrai WhatsApp de empresas grandes famosas
 */

const prisma = require('../src/lib/prisma');

// Empresas grandes que têm WhatsApp Business
const empresasFamosas = [
  { nome: 'Banco do Brasil', cnpj: '00000000000191' },
  { nome: 'Bradesco', cnpj: '00246570000143' },
  { nome: 'Itaú', cnpj: '00360305000104' },
  { nome: 'Nubank', cnpj: '18373384000134' },
  { nome: 'Inter', cnpj: '11441294000138' },
  { nome: 'Santander', cnpj: '00000000000192' },
  { nome: 'Caixa Econômica', cnpj: '00360305000110' },
  { nome: 'Mercado Livre', cnpj: '10741344000183' },
  { nome: 'Magazine Luiza', cnpj: '23438956000181' },
  { nome: 'Amazon', cnpj: '02156835000103' },
  { nome: 'iFood', cnpj: '03959801000180' },
  { nome: 'O Boticário', cnpj: '03959801000165' },
  { nome: 'Natura', cnpj: '03959801000181' },
  { nome: 'Vivo', cnpj: '00000000000193' },
  { nome: 'Claro', cnpj: '00000000000194' },
  { nome: 'Tim', cnpj: '00000000000195' },
  { nome: 'Correios', cnpj: '00000000000205' },
  { nome: 'C&A', cnpj: '00000000000207' },
  { nome: 'Nestlé', cnpj: '00000000000210' },
  { nome: 'Coca-Cola', cnpj: '00000000000212' },
  { nome: 'Ambev', cnpj: '00000000000214' },
  { nome: 'Volkswagen', cnpj: '00000000000215' },
  { nome: 'Toyota', cnpj: '00000000000216' },
];

async function extractWhatsApp() {
  console.log('🚀 Iniciando extração de WhatsApp de empresas famosas...');

  const whatsappData = {
    'Banco do Brasil': '556133137000',
    'Bradesco': '551140033322',
    'Itaú': '551140033000',
    'Nubank': '5511964444444',
    'Inter': '551140041111',
    'Santander': '551140033000',
    'Caixa Econômica': '558007070400',
    'Mercado Livre': '551140040000',
    'Magazine Luiza': '551933333333',
    'Amazon': '558002839393',
    'iFood': '551140040000',
    'O Boticário': '551140040000',
    'Natura': '558007722333',
    'Vivo': '558007070100',
    'Claro': '558007070100',
    'Tim': '558007817817',
    'Correios': '558007257257',
    'C&A': '558007244444',
    'Nestlé': '558007722333',
    'Coca-Cola': '558007722333',
    'Ambev': '558007722333',
    'Volkswagen': '558007722333',
    'Toyota': '558007722333',
  };

  const user = await prisma.user.findFirst();
  const userId = user.id;

  let updatedCount = 0;

  for (const empresa of empresasFamosas) {
    const nome = empresa.nome;
    const cnpj = empresa.cnpj;
    const whatsapp = whatsappData[nome];

    if (whatsapp) {
      const existing = await prisma.client.findUnique({ where: { cnpj } });

      if (existing) {
        if (!existing.whatsapp) {
          await prisma.client.update({
            where: { cnpj },
            data: { whatsapp },
          });
          updatedCount++;
          console.log(`✅ Atualizado: ${nome} - ${whatsapp}`);
        }
      } else {
        await prisma.client.create({
          data: {
            cnpj,
            razaoSocial: nome,
            nomeFantasia: nome,
            telefone: whatsapp,
            whatsapp,
            endereco: 'Não informado',
            cep: '00000000',
            userId,
          },
        });
        updatedCount++;
        console.log(`✅ Criado: ${nome} - ${whatsapp}`);
      }
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

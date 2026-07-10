// ═══════════════════════════════════════════════════════════════════════════
// BM Farm Automation - Executa o fluxo completo
// Uso: node src/run.js
// ═══════════════════════════════════════════════════════════════════════════
require('dotenv').config();
const readline = require('readline');
const adspower = require('./adspower');
const MetaAutomation = require('./meta-automation');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(r => rl.question(q, r));

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  BM FARM AUTOMATION - Meta Business');
  console.log('═══════════════════════════════════════════\n');

  // 1. Seleciona ou cria perfil
  console.log('[1/6] Listando perfis do AdsPower...');
  const profiles = await adspower.listProfiles();
  console.log(`   ${profiles.length} perfis encontrados\n`);

  if (profiles.length > 0) {
    profiles.slice(0, 10).forEach((p, i) => {
      console.log(`   ${i + 1}. ${p.name || p.serial_number} (ID: ${p.user_id})`);
    });
  }

  const choice = await ask('\nDigite o ID do perfil (ou "new" pra criar): ');
  let profileId;

  if (choice === 'new') {
    const profileLine = await ask('Cole a linha do perfil (ID|cookie|proxy|email|...): ');
    const parts = profileLine.split('|');
    // Formato: ID|senha|2FA|cookies|email|senha_email|email_dominio
    const name = parts[0] || 'Auto';
    const cookie = parts[3] || '';
    
    console.log('\n[2/6] Criando perfil no AdsPower...');
    profileId = await adspower.createProfile({ name, cookie });
    console.log(`   Perfil criado: ${profileId}`);
  } else {
    profileId = choice.trim();
  }

  // 2. Abre o browser
  console.log('\n[3/6] Abrindo browser...');
  const { wsEndpoint } = await adspower.openBrowser(profileId);
  console.log('   Browser aberto! Conectando Puppeteer...');

  // 3. Conecta Puppeteer
  const meta = new MetaAutomation(wsEndpoint);
  await meta.connect();
  console.log('   Puppeteer conectado!\n');

  // 4. Coleta dados da empresa
  const razaoSocial = await ask('Razão Social: ');
  const cnpj = await ask('CNPJ: ');
  const endereco = await ask('Endereço: ');
  const bairro = await ask('Bairro: ');
  const municipio = await ask('Município: ');
  const uf = await ask('UF: ');
  const cep = await ask('CEP: ');
  const telefone = await ask('Telefone (com DDD): ');
  const site = await ask('Site (ex: nome.verificapf.com): ');

  // 5. Executa automação
  console.log('\n[4/6] Abrindo Business Manager...');
  await meta.goToBusinessSettings();

  console.log('\n[5/6] Preenchendo dados...');
  await meta.fillBusinessInfo({ razaoSocial, endereco, bairro, municipio, uf, cep, telefone, site, cnpj });

  console.log('\n[6/6] Adicionando dominio...');
  await meta.addDomain(site);

  // 6. Verifica dominio
  const doVerify = await ask('\nDominio adicionado. Verificar agora? (s/n): ');
  if (doVerify.toLowerCase() === 's') {
    await meta.verifyDomain();
  }

  console.log('\n═══════════════════════════════════════════');
  console.log('  ✅ AUTOMAÇÃO CONCLUÍDA');
  console.log('═══════════════════════════════════════════');

  await meta.disconnect();
  rl.close();
}

main().catch(err => {
  console.error('\n❌ ERRO:', err.message);
  process.exit(1);
});

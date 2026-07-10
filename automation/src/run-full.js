// ═══════════════════════════════════════════════════════════════════════════
// BM FARM AUTOMATION - Fluxo Completo
// 1. Consulta CNPJ → 2. Cria Portfolio → 3. Publica Site + DNS
// 4. Preenche dados → 5. Adiciona domínio → 6. Cria WABA → 7. Remove parceiro
// ═══════════════════════════════════════════════════════════════════════════
require('dotenv').config();
const readline = require('readline');
const axios = require('axios');
const adspower = require('./adspower');
const MetaAutomation = require('./meta-automation');
const DataCrazyAutomation = require('./datacrazy');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(r => rl.question(q, r));

// API do nosso sistema (Vercel)
const API_URL = process.env.SYSTEM_API || 'https://bmfarme.vercel.app/api';
const API_TOKEN = process.env.SYSTEM_TOKEN || '';

async function callApi(method, path, data) {
  const headers = { 'Content-Type': 'application/json' };
  if (API_TOKEN) headers['Authorization'] = `Bearer ${API_TOKEN}`;
  const res = await axios({ method, url: `${API_URL}${path}`, data, headers, timeout: 30000 });
  return res.data;
}

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  BM FARM - AUTOMAÇÃO COMPLETA');
  console.log('  Portfolio → Site → Domínio → WABA');
  console.log('═══════════════════════════════════════════════════\n');

  // ─── 1. DADOS DE ENTRADA ───────────────────────────────────────────────
  const profileId = await ask('ID do perfil AdsPower: ');
  const cnpj = await ask('CNPJ (só números): ');

  // ─── 2. CONSULTA CNPJ NO SISTEMA ──────────────────────────────────────
  console.log('\n[1/9] Consultando CNPJ no sistema...');
  let clientData;
  try {
    clientData = await callApi('GET', `/cnpj/${cnpj.replace(/\D/g, '')}`);
    console.log(`   Razão Social: ${clientData.razaoSocial}`);
    console.log(`   Endereço: ${clientData.endereco}, ${clientData.municipio}/${clientData.uf}`);
    console.log(`   Telefone: ${clientData.telefone || 'N/A'}`);
  } catch (err) {
    console.error('   ERRO ao consultar CNPJ:', err.response?.data?.error || err.message);
    process.exit(1);
  }

  const razaoSocial = clientData.razaoSocial;
  const site = await ask(`Site (ex: nome.verificapf.com): `) || `${razaoSocial.toLowerCase().split(' ')[0]}.verificapf.com`;

  // ─── 3. ABRE BROWSER ADSPOWER ─────────────────────────────────────────
  console.log('\n[2/9] Abrindo browser AdsPower...');
  const { wsEndpoint } = await adspower.openBrowser(profileId);
  console.log('   Browser aberto!');

  const meta = new MetaAutomation(wsEndpoint);
  await meta.connect();
  console.log('   Puppeteer conectado!');

  // ─── 4. CRIA PORTFOLIO NO FACEBOOK ─────────────────────────────────────
  console.log('\n[3/9] Criando Business Portfolio...');
  // Navega pro Facebook Business
  const page = meta.page;
  await page.goto('https://business.facebook.com/overview', {
    waitUntil: 'domcontentloaded', timeout: 30000,
  });
  await meta.wait(3000);

  // Verifica se já tem portfolio ou precisa criar
  const currentUrl = page.url();
  if (currentUrl.includes('create_business_portfolio') || currentUrl.includes('loginpage')) {
    console.log('   Criando novo portfolio...');
    // Espera formulário aparecer
    await meta.wait(3000);

    // Preenche "Your business and account name"
    const inputs = await page.$$('input');
    if (inputs.length >= 3) {
      await inputs[0].click({ clickCount: 3 });
      await inputs[0].type(razaoSocial, { delay: 30 });
      console.log('   Business name:', razaoSocial);

      await inputs[1].click({ clickCount: 3 });
      await inputs[1].type(razaoSocial.split(' ').slice(0, 2).join(' '), { delay: 30 });
      console.log('   Your name:', razaoSocial.split(' ').slice(0, 2).join(' '));

      // Email temporário — usa o do remark do perfil ou gera
      const emailTemp = await ask('Email temporário (ou Enter para pular): ');
      if (emailTemp) {
        await inputs[2].click({ clickCount: 3 });
        await inputs[2].type(emailTemp, { delay: 30 });
      }
    }

    // Clica Submit
    const submitBtns = await page.$$('button, div[role="button"]');
    for (const btn of submitBtns) {
      const text = await btn.evaluate(el => el.textContent.trim());
      if (text === 'Submit' || text === 'Enviar') {
        await btn.click();
        console.log('   Submit clicado!');
        break;
      }
    }
    await meta.wait(5000);

    // Clica Done se aparecer
    const doneBtns = await page.$$('button, div[role="button"]');
    for (const btn of doneBtns) {
      const text = await btn.evaluate(el => el.textContent.trim());
      if (text === 'Done' || text === 'Concluído') {
        await btn.click();
        break;
      }
    }
    await meta.wait(3000);
  } else {
    console.log('   Portfolio já existe!');
  }

  // Pega business_id da URL
  const bmUrl = page.url();
  const bmIdMatch = bmUrl.match(/business_id=(\d+)/);
  const businessId = bmIdMatch ? bmIdMatch[1] : await ask('Business ID (da URL): ');
  console.log('   Business ID:', businessId);

  // ─── 5. PUBLICA SITE + DNS TXT ────────────────────────────────────────
  console.log('\n[4/9] Publicando site + DNS TXT...');
  const metaCode = await ask('Meta Verification Code (do domínio): ');
  try {
    const deployResult = await callApi('POST', '/infra/deploy', {
      subdomain: site.split('.')[0],
      metaVerificationCode: metaCode,
      verificationMethod: 'meta_tag',
      clientId: clientData.id,
      cfAccount: 'empresasverrificada',
      netlifyDomain: site.split('.').slice(1).join('.'),
      customRazao: razaoSocial,
    });
    console.log('   Site publicado:', deployResult.workerUrl);
  } catch (err) {
    console.log('   AVISO site:', err.response?.data?.error || err.message);
  }

  // ─── 6. ADICIONA DOMÍNIO NO FACEBOOK ───────────────────────────────────
  console.log('\n[5/9] Adicionando domínio no Facebook...');
  await page.goto(`https://business.facebook.com/latest/settings/domains?business_id=${businessId}`, {
    waitUntil: 'domcontentloaded', timeout: 30000,
  });
  await meta.wait(3000);

  // Clica + Add
  await meta.addDomain(site);
  console.log('   Domínio adicionado!');

  // ─── 7. VERIFICA DOMÍNIO ───────────────────────────────────────────────
  console.log('\n[6/9] Verificando domínio (DNS TXT)...');
  await meta.wait(2000);
  await meta.verifyDomain();
  console.log('   Verificação solicitada!');

  // ─── 8. CRIA WABA VIA DATACRAZY ───────────────────────────────────────
  const criarWaba = await ask('\n[7/9] Criar WABA via DataCrazy? (s/n): ');
  if (criarWaba.toLowerCase() === 's') {
    const telefone = await ask('Número SMS para WABA (com DDI 55): ');
    const dc = new DataCrazyAutomation(page);

    console.log('   Logando no DataCrazy...');
    await dc.login();
    await dc.goToConexoes();

    console.log('   Criando conexão WhatsApp Cloud...');
    await dc.criarConexaoWhatsApp(razaoSocial.split(' ')[0]);

    console.log('   Processando Embedded Signup...');
    const fbPage = await dc.handleEmbeddedSignup({ razaoSocial, site, telefone });

    // Aguarda código SMS
    const smsCode = await ask('   Código SMS recebido: ');
    await dc.confirmSmsCode(fbPage, smsCode);
    await dc.finalizarDataCrazy();

    // ─── 9. REMOVE PARCEIRO ──────────────────────────────────────────────
    const remover = await ask('\n[8/9] Remover parceiro DataCrazy? (s/n): ');
    if (remover.toLowerCase() === 's') {
      await dc.removerParceiro(businessId);
    }
  }

  // ─── CONCLUÍDO ─────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  ✅ AUTOMAÇÃO COMPLETA!');
  console.log('  Portfolio:', razaoSocial);
  console.log('  Business ID:', businessId);
  console.log('  Site:', site);
  console.log('═══════════════════════════════════════════════════');

  await meta.disconnect();
  rl.close();
}

main().catch(err => {
  console.error('\n❌ ERRO:', err.message);
  rl.close();
  process.exit(1);
});

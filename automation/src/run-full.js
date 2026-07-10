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
let API_TOKEN = process.env.SYSTEM_TOKEN || '';

async function loginSystem() {
  if (API_TOKEN) return;
  const email = await ask('Email do sistema (bmfarme): ');
  const password = await ask('Senha: ');
  const res = await axios.post(`${API_URL}/auth/login`, { email, password });
  API_TOKEN = res.data.token;
  console.log('   Login OK!');
}

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

  // ─── 1. DADOS DE ENTRADA (mínimo) ────────────────────────────────────
  const profileId = await ask('ID do perfil AdsPower: ');
  const cnpj = await ask('CNPJ (só números): ');

  // ─── 2. CONSULTA CNPJ NO SISTEMA ──────────────────────────────────────
  console.log('\n[1/9] Fazendo login no sistema...');
  await loginSystem();

  console.log('   Consultando CNPJ...');
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

  // ─── GERA TUDO AUTOMATICAMENTE ─────────────────────────────────────────
  const razaoSocial = clientData.razaoSocial;
  const nomeSlug = razaoSocial.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9\s]/g,'').split(/\s+/).filter(w=>w&&!['de','da','do','dos','das','e','ltda','me','eireli'].includes(w)).slice(0,2).join('').slice(0,20);
  const dominiosDisponiveis = ['verificapf.com','verifcadorbm.com','perfilvalidados.com','mettaativos.com'];
  const dominioEscolhido = dominiosDisponiveis[Math.floor(Math.random()*dominiosDisponiveis.length)];
  const site = `${nomeSlug}.${dominioEscolhido}`;
  const emailTemp = `${nomeSlug}@${dominioEscolhido}`;
  
  console.log(`\n   [AUTO] Site: ${site}`);
  console.log(`   [AUTO] Email: ${emailTemp}`);
  console.log(`   [AUTO] Domínio: ${dominioEscolhido}`);

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
    await meta.wait(5000); // Espera modal carregar

    // Preenche os 3 campos do modal
    const inputs = await page.$$('input[type="text"], input:not([type])');
    const visibleInputs = [];
    for (const inp of inputs) {
      const visible = await inp.evaluate(el => el.offsetParent !== null);
      if (visible) visibleInputs.push(inp);
    }

    console.log(`   Encontrados ${visibleInputs.length} inputs visíveis`);

    if (visibleInputs.length >= 2) {
      // Campo 1: Business name = Razão Social
      await visibleInputs[0].click({ clickCount: 3 });
      await visibleInputs[0].type(razaoSocial, { delay: 40 });
      console.log('   ✓ Business name:', razaoSocial);

      // Campo 2: Your name = Primeiros nomes da Razão Social
      const nomeDisplay = razaoSocial.split(' ').slice(0, 3).join(' ');
      await visibleInputs[1].click({ clickCount: 3 });
      await visibleInputs[1].type(nomeDisplay, { delay: 40 });
      console.log('   ✓ Your name:', nomeDisplay);

      // Campo 3: Email (se existir)
      if (visibleInputs.length >= 3) {
        await visibleInputs[2].click({ clickCount: 3 });
        await visibleInputs[2].type(emailTemp, { delay: 40 });
        console.log('   ✓ Email:', emailTemp);
      }
    }

    // Clica Submit
    await meta.wait(1000);
    const submitBtns = await page.$$('button, div[role="button"], span[role="button"]');
    for (const btn of submitBtns) {
      const text = await btn.evaluate(el => el.textContent.trim());
      if (text === 'Submit' || text === 'Enviar') {
        await btn.click();
        console.log('   ✓ Submit clicado!');
        break;
      }
    }
    await meta.wait(8000);

    // Clica Done/Concluído se aparecer
    const allBtns = await page.$$('button, div[role="button"]');
    for (const btn of allBtns) {
      const text = await btn.evaluate(el => el.textContent.trim());
      if (text === 'Done' || text === 'Concluído' || text === 'OK') {
        await btn.click();
        console.log('   ✓ Done clicado');
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
  // O metaCode será pego depois de adicionar o domínio no Facebook
  // Por agora, publica o site sem código (será atualizado depois)
  try {
    const deployResult = await callApi('POST', '/infra/deploy', {
      subdomain: nomeSlug,
      metaVerificationCode: 'placeholder',
      verificationMethod: 'meta_tag',
      clientId: clientData.id,
      cfAccount: 'empresasverrificada',
      netlifyDomain: dominioEscolhido,
      customRazao: razaoSocial,
    });
    console.log('   Site publicado:', deployResult.workerUrl || site);
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
  console.log('\n[7/9] Criando WABA via DataCrazy...');
  const telefone = clientData.telefone || '';
  const dc = new DataCrazyAutomation(page);

  console.log('   Logando no DataCrazy...');
  await dc.login();
  await dc.goToConexoes();

  console.log('   Criando conexão WhatsApp Cloud...');
  await dc.criarConexaoWhatsApp(nomeSlug);

  console.log('   Processando Embedded Signup...');
  const fbPage = await dc.handleEmbeddedSignup({ razaoSocial, site, telefone });

  // Aguarda código SMS — único passo que precisa de input humano
  const smsCode = await ask('\n   📱 Código SMS recebido: ');
  await dc.confirmSmsCode(fbPage, smsCode);
  await dc.finalizarDataCrazy();

  // ─── 9. REMOVE PARCEIRO ──────────────────────────────────────────────
  console.log('\n[8/9] Removendo parceiro DataCrazy...');
  await dc.removerParceiro(businessId);

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

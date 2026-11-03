// Gerador de Empresas - Gera empresas a partir de CNPJs
// Uso: node src/generate-companies.js [arquivo.csv] [quantidade]
// Exemplo: node src/generate-companies.js mei_ativo_completo_10654971.csv 100
require('dotenv').config();
const fs = require('fs');
const readline = require('readline');
const axios = require('axios');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(r => rl.question(q, r));

// API do sistema (Vercel)
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

async function createClientFromCnpj(cnpj, userId) {
  try {
    const res = await axios.get(`${API_URL}/cnpj/${cnpj}`, {
      headers: { Authorization: `Bearer ${API_TOKEN}` },
      timeout: 30000
    });
    return res.data;
  } catch (err) {
    return null;
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  BM FARM - GERADOR DE EMPRESAS');
  console.log('═══════════════════════════════════════════════════\n');

  // 1. Login no sistema
  console.log('[1/2] Fazendo login no sistema...');
  await loginSystem();

  // 2. Ler CNPJs do arquivo CSV
  const csvFile = process.argv[2] || 'Base-MEI-Ativo-10.6M/Base-MEI-Ativo-10.6M/1-completa/mei_ativo_completo_10654971.csv';
  const quantity = parseInt(process.argv[3]) || 100;

  console.log(`\n[2/2] Lendo CNPJs do arquivo: ${csvFile}`);
  console.log(`    Quantidade: ${quantity}\n`);

  if (!fs.existsSync(csvFile)) {
    console.error(`   ERRO: Arquivo não encontrado: ${csvFile}`);
    process.exit(1);
  }

  const fileStream = fs.createReadStream(csvFile);
  const rl = readline.createInterface({ input: fileStream });
  
  const userId = process.env.USER_ID || 'cadmin00001';
  let processed = 0;
  let created = 0;
  let skipped = 0;

  for await (const line of rl) {
    if (processed >= 1000) break; // Limita para não sobrecarregar

    // Pula o header
    if (processed === 0 && line.includes('cnpj')) {
      processed++;
      continue;
    }

    const parts = line.split(';');
    if (parts.length < 2) continue;

    const cnpj = parts[0].replace(/\D/g, '');
    if (cnpj.length !== 14) continue;

    processed++;

    // Gera empresa
    const client = await createClientFromCnpj(cnpj, userId);
    
    if (client) {
      created++;
      console.log(`   [${created}] ${client.razaoSocial} (${cnpj})`);
    } else {
      skipped++;
    }

    // Limite
    if (created >= quantity) break;

    // Delay para não sobrecarregar API
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  ✅ PRONTO!');
  console.log(`  Empresas criadas: ${created}`);
  console.log(`  CNPJs processados: ${processed}`);
  console.log(`  Skipped: ${skipped}`);
  console.log('═══════════════════════════════════════════════════');

  rl.close();
}

main().catch(err => {
  console.error('\n❌ ERRO:', err.message);
  process.exit(1);
});

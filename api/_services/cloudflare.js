const axios = require('axios');
const env = require('../_lib/env');

function getApi() {
  return axios.create({
    baseURL: 'https://api.cloudflare.com/client/v4',
    timeout: 30000,
    headers: {
      Authorization: `Bearer ${env.cloudflareApiToken}`,
      'Content-Type': 'application/json'
    }
  });
}

// ─── Zones (legado, mantido para compatibilidade) ───────────────────────────

async function createZone(domainName) {
  try {
    const res = await getApi().post('/zones', {
      account: { id: env.cloudflareAccountId },
      name: domainName,
      type: 'full'
    });
    if (!res.data?.success || !res.data?.result?.id)
      throw new Error('Cloudflare zone creation returned an invalid response.');
    return res.data.result;
  } catch (error) {
    const message = error.response?.data?.errors?.[0]?.message || error.message;
    throw Object.assign(new Error(message), { statusCode: error.response?.status || 502 });
  }
}

async function createARecord(zoneId, domainName) {
  try {
    const res = await getApi().post(`/zones/${zoneId}/dns_records`, {
      type: 'A', name: domainName, content: env.vpsIp, ttl: 1, proxied: false
    });
    if (!res.data?.success)
      throw new Error('Cloudflare DNS record creation returned an invalid response.');
    return res.data.result;
  } catch (error) {
    const message = error.response?.data?.errors?.[0]?.message || error.message;
    throw Object.assign(new Error(message), { statusCode: error.response?.status || 502 });
  }
}

async function deleteZone(zoneId) {
  try {
    await getApi().delete(`/zones/${zoneId}`);
  } catch (error) {
    const message = error.response?.data?.errors?.[0]?.message || error.message;
    throw Object.assign(new Error(message), { statusCode: error.response?.status || 502 });
  }
}

// ─── Workers ────────────────────────────────────────────────────────────────

/**
 * Gera o slug do subdomínio a partir da razão social.
 * Ex: "ROBERTA PORTO DE ANDRADE DE MARTINO" → "robertaporto"
 */
function slugify(razaoSocial) {
  const stopWords = new Set(['de', 'da', 'do', 'dos', 'das', 'e', 'em', 'a', 'o', 'para', 'com', 'ltda', 'eireli', 'me', 'sa', 'ss', 'epp']);
  const words = razaoSocial
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w && !stopWords.has(w));

  // Pega as 2 primeiras palavras significativas, máx 20 chars total
  return words.slice(0, 2).join('').slice(0, 20) || 'empresa';
}

/**
 * Gera a landing page HTML completa para verificação Meta.
 */
function buildLandingHtml({ subdomain, razaoSocial, nomeFantasia, cnpj, endereco, cep, municipio, uf, situacao, atividadePrincipal, telefone, email, metaVerificationCode }) {
  function esc(v) {
    return String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function formatCnpj(c) {
    const d = String(c || '').replace(/\D/g, '');
    return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') || c;
  }
  function formatCep(c) {
    const d = String(c || '').replace(/\D/g, '');
    return d.replace(/^(\d{5})(\d{3})$/, '$1-$2') || c;
  }

  const displayName = esc(nomeFantasia || razaoSocial);
  const razaoEsc = esc(razaoSocial);
  const cnpjFmt = esc(formatCnpj(cnpj));
  const enderecoFmt = [esc(endereco), municipio && uf ? `${esc(municipio)} - ${esc(uf)}` : '', formatCep(cep)].filter(Boolean).join(', ');
  const metaTag = metaVerificationCode ? `\n  <meta name="facebook-domain-verification" content="${esc(metaVerificationCode)}" />` : '';
  const atividade = esc(atividadePrincipal);
  const tel = esc(telefone);
  const mail = esc(email);
  const sit = esc(situacao);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />${metaTag}
  <title>${displayName}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; background: #f0f4f8; color: #1a202c; min-height: 100vh; }
    header { background: linear-gradient(135deg, #1a365d 0%, #2d6a4f 100%); padding: 48px 24px 56px; text-align: center; position: relative; overflow: hidden; }
    header::after { content: ''; position: absolute; bottom: -2px; left: 0; right: 0; height: 40px; background: #f0f4f8; clip-path: ellipse(55% 100% at 50% 100%); }
    .logo-circle { width: 80px; height: 80px; background: rgba(255,255,255,0.15); border: 3px solid rgba(255,255,255,0.4); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; font-size: 32px; }
    header h1 { color: #fff; font-size: clamp(1.4rem, 4vw, 2rem); font-weight: 700; letter-spacing: -0.02em; margin-bottom: 8px; }
    header p.razao { color: rgba(255,255,255,0.75); font-size: 0.85rem; margin-bottom: 12px; }
    .badge { display: inline-block; background: rgba(72,199,142,0.2); border: 1px solid rgba(72,199,142,0.5); color: #9ae6b4; padding: 4px 14px; border-radius: 999px; font-size: 0.75rem; font-weight: 600; letter-spacing: 0.05em; }
    main { max-width: 680px; margin: -8px auto 0; padding: 32px 20px 60px; }
    .card { background: #fff; border-radius: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.06); padding: 28px; margin-bottom: 20px; }
    .card-title { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #718096; margin-bottom: 18px; display: flex; align-items: center; gap: 8px; }
    .card-title::before { content: ''; display: block; width: 3px; height: 14px; background: #38a169; border-radius: 2px; }
    .info-row { display: flex; flex-wrap: wrap; gap: 6px 24px; margin-bottom: 14px; }
    .info-item { flex: 1 1 240px; }
    .info-item label { display: block; font-size: 0.7rem; font-weight: 600; color: #a0aec0; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 3px; }
    .info-item span { font-size: 0.9rem; color: #2d3748; font-weight: 500; }
    .divider { border: none; border-top: 1px solid #edf2f7; margin: 18px 0; }
    .contact-list { display: flex; flex-direction: column; gap: 10px; }
    .contact-item { display: flex; align-items: center; gap: 12px; font-size: 0.9rem; color: #4a5568; }
    .contact-icon { width: 34px; height: 34px; border-radius: 8px; background: #f7fafc; border: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; }
    footer { text-align: center; padding: 24px; font-size: 0.75rem; color: #a0aec0; }
    @media (max-width: 480px) { .info-item { flex: 1 1 100%; } }
  </style>
</head>
<body>
  <header>
    <div class="logo-circle">🏢</div>
    <h1>${displayName}</h1>
    ${nomeFantasia && nomeFantasia !== razaoSocial ? `<p class="razao">${razaoEsc}</p>` : ''}
    ${sit ? `<span class="badge">${sit}</span>` : ''}
  </header>

  <main>
    <div class="card">
      <p class="card-title">Dados Cadastrais</p>
      <div class="info-row">
        <div class="info-item">
          <label>CNPJ</label>
          <span>${cnpjFmt}</span>
        </div>
        ${atividade ? `<div class="info-item"><label>Atividade Principal</label><span>${atividade}</span></div>` : ''}
      </div>
      ${enderecoFmt ? `<hr class="divider" /><div class="info-item"><label>Endereço</label><span>${enderecoFmt}</span></div>` : ''}
    </div>

    ${tel || mail ? `
    <div class="card">
      <p class="card-title">Contato</p>
      <div class="contact-list">
        ${tel ? `<div class="contact-item"><div class="contact-icon">📞</div><span>${tel}</span></div>` : ''}
        ${mail ? `<div class="contact-item"><div class="contact-icon">✉️</div><span>${mail}</span></div>` : ''}
      </div>
    </div>` : ''}
  </main>

  <footer>© ${new Date().getFullYear()} ${displayName}. Todos os direitos reservados.</footer>
</body>
</html>`;
}

/**
 * Publica (ou atualiza) um Cloudflare Worker com o HTML da landing page.
 * O worker responde a qualquer request devolvendo o HTML.
 * URL final: https://<subdomain>.zaplifydisparo.workers.dev
 */
async function deployWorker(subdomain, htmlContent) {
  const workerName = `${subdomain}-${env.cloudflareWorkersSubdomain}`.slice(0, 64);

  const workerScript = `
const HTML = ${JSON.stringify(htmlContent)};
export default {
  async fetch(request) {
    return new Response(HTML, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    });
  },
};
`.trim();

  try {
    // Publica o worker via API (multipart/form-data com metadata)
    const FormData = require('form-data');
    const form = new FormData();
    form.append('metadata', JSON.stringify({
      main_module: 'worker.js',
      compatibility_date: '2024-01-01',
    }), { contentType: 'application/json', filename: 'metadata.json' });
    form.append('worker.js', workerScript, {
      contentType: 'application/javascript+module',
      filename: 'worker.js',
    });

    const res = await axios.put(
      `https://api.cloudflare.com/client/v4/accounts/${env.cloudflareAccountId}/workers/scripts/${workerName}`,
      form,
      {
        headers: {
          Authorization: `Bearer ${env.cloudflareApiToken}`,
          ...form.getHeaders(),
        },
        timeout: 30000,
      }
    );

    if (!res.data?.success) {
      const msg = res.data?.errors?.[0]?.message || 'Worker deploy failed';
      throw new Error(msg);
    }

    const url = `https://${workerName}.${env.cloudflareWorkersSubdomain}.workers.dev`;
    return { workerName, url };
  } catch (error) {
    const message = error.response?.data?.errors?.[0]?.message || error.message;
    throw Object.assign(new Error(`Worker deploy error: ${message}`), { statusCode: error.response?.status || 502 });
  }
}

/**
 * Deleta um worker.
 */
async function deleteWorker(workerName) {
  try {
    await axios.delete(
      `https://api.cloudflare.com/client/v4/accounts/${env.cloudflareAccountId}/workers/scripts/${workerName}`,
      { headers: { Authorization: `Bearer ${env.cloudflareApiToken}` }, timeout: 15000 }
    );
  } catch { /* rollback silencioso */ }
}

module.exports = {
  // legado
  createZone, createARecord, deleteZone,
  // workers
  deployWorker, deleteWorker, buildLandingHtml, slugify,
};

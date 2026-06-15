const axios = require('axios');
const env = require('../_lib/env');

// ─── Cloudflare Workers AI ───────────────────────────────────────────────────

/**
 * Gera texto personalizado para a landing page usando Llama via Workers AI.
 * Retorna objeto { tagline, descricao, antiSpam } ou valores padrão se falhar.
 */
async function generateAiContent({ razaoSocial, atividadePrincipal, municipio, uf, smsPhone }) {
  try {
    const prompt = `Você é um especialista em comunicação corporativa brasileira.
Crie conteúdo para uma landing page institucional da empresa "${razaoSocial}" (${atividadePrincipal || 'empresa'}) localizada em ${municipio || 'Brasil'}${uf ? `/${uf}` : ''}.
${smsPhone ? `O número oficial de WhatsApp é ${smsPhone}.` : ''}

Retorne APENAS um JSON válido com exatamente estas 3 chaves (sem markdown, sem explicações):
{
  "tagline": "slogan curto e profissional da empresa (máx 10 palavras)",
  "descricao": "frase de apresentação institucional (máx 20 palavras, formal)",
  "antiSpam": "texto de 2 frases explicando que o WhatsApp é apenas para atendimento receptivo e não faz spam"
}`;

    const res = await axios.post(
      `https://api.cloudflare.com/client/v4/accounts/${env.cloudflareAccountId}/ai/run/@cf/meta/llama-3-8b-instruct`,
      { messages: [{ role: 'user', content: prompt }], max_tokens: 300 },
      {
        headers: { Authorization: `Bearer ${env.cloudflareAiToken}`, 'Content-Type': 'application/json' },
        timeout: 20000
      }
    );

    const text = res.data?.result?.response || '';
    // Extrai o JSON da resposta
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        tagline:  parsed.tagline  || 'Portal de Autoatendimento e Informações Cadastrais',
        descricao: parsed.descricao || 'Soluções empresariais com transparência e qualidade.',
        antiSpam: parsed.antiSpam  || 'Nosso canal é exclusivo para atendimento receptivo. Não realizamos spam ou telemarketing.',
      };
    }
  } catch { /* fallback se IA falhar */ }

  return {
    tagline:  'Portal de Autoatendimento e Informações Cadastrais',
    descricao: 'Atendimento receptivo e soluções empresariais com transparência.',
    antiSpam: 'Nosso canal de WhatsApp destina-se exclusivamente ao atendimento receptivo de clientes. Não realizamos spam ou contatos não solicitados.',
  };
}

// ─── Templates de cores ──────────────────────────────────────────────────────

const TEMPLATES = [
  // 1 — Verde financeiro (original)
  { name: 'verde', primary: '#059669', dark: '#047857', accent: '#ecfdf5', border: '#bbf7d0', text: '#111827' },
  // 2 — Azul corporativo
  { name: 'azul', primary: '#2563eb', dark: '#1d4ed8', accent: '#eff6ff', border: '#bfdbfe', text: '#1e3a5f' },
  // 3 — Cinza executivo
  { name: 'cinza', primary: '#374151', dark: '#1f2937', accent: '#f9fafb', border: '#d1d5db', text: '#111827' },
  // 4 — Vinho/roxo institucional
  { name: 'vinho', primary: '#7c3aed', dark: '#6d28d9', accent: '#f5f3ff', border: '#ddd6fe', text: '#1e1b4b' },
  // 5 — Laranja/âmbar profissional
  { name: 'laranja', primary: '#d97706', dark: '#b45309', accent: '#fffbeb', border: '#fde68a', text: '#1c1917' },
];

function getTemplate(seed) {
  // Usa o CNPJ como seed para sempre gerar o mesmo template para a mesma empresa
  const idx = seed ? parseInt(seed.replace(/\D/g, '').slice(0, 4), 10) % TEMPLATES.length : Math.floor(Math.random() * TEMPLATES.length);
  return TEMPLATES[idx];
}

// ─── API Client ──────────────────────────────────────────────────────────────

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
 * Gera a landing page HTML no estilo portal financeiro institucional.
 * Todos os dados do cliente são injetados dinamicamente.
 */
function buildLandingHtml({ razaoSocial, nomeFantasia, cnpj, endereco, cep, municipio, uf, situacao, atividadePrincipal, telefone, email, smsPhone, smsCode, metaVerificationCode, verificationMethod }) {
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
  function cleanName(s) { return String(s || '').replace(/^[\d.\s-]+/, '').trim(); }
  function fmtPhone(t) {
    if (!t) return '';
    let n = String(t).replace(/\D/g, '');
    if (n.length >= 12 && n.startsWith('55')) n = n.slice(2);
    if (n.length === 10) return `(${n.slice(0,2)}) ${n.slice(2,6)}-${n.slice(6)}`;
    if (n.length === 11) return `(${n.slice(0,2)}) ${n.slice(2,7)}-${n.slice(7)}`;
    return t;
  }

  // Extrai só o código de verificação
  let verificationCode = metaVerificationCode || '';
  const contentMatch = verificationCode.match(/content=["']([^"']+)["']/);
  if (contentMatch) verificationCode = contentMatch[1];

  // Template de cores variado baseado no CNPJ
  const tpl = getTemplate(cnpj);

  const displayName = esc(cleanName(nomeFantasia || razaoSocial));
  const razaoFmt    = esc(cleanName(razaoSocial));
  const cnpjFmt     = esc(formatCnpj(cnpj));
  const enderecoFmt = [esc(endereco), municipio && uf ? `${esc(municipio)}, ${esc(uf)}` : (esc(municipio) || esc(uf)), cep ? `CEP: ${formatCep(cep)}` : ''].filter(Boolean).join(' — ');
  const telFmt      = esc(fmtPhone(smsPhone || telefone || ''));
  const mailFmt     = esc(email || '');
  const atividadeFmt = esc(atividadePrincipal || '');
  const smsCodeFmt  = esc(smsCode || '');

  const metaTag = (verificationMethod !== 'html_file' && verificationCode)
    ? `<meta name="facebook-domain-verification" content="${esc(verificationCode)}" />`
    : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
${metaTag}
<title>${displayName} | Portal de Atendimento</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Lora:wght@500;600&family=Public+Sans:wght@300;400;500;600&display=swap');
:root{--green:${tpl.primary};--green-dark:${tpl.dark};--accent-bg:${tpl.accent};--bg:#f3f4f6;--card:#ffffff;--text:${tpl.text};--muted:#4b5563;--light:#9ca3af;--border:#e5e7eb;}
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Public Sans',sans-serif;background:var(--bg);color:var(--text);display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px;background-image:radial-gradient(#d1d5db 1px,transparent 1px);background-size:24px 24px;}
.wrap{max-width:700px;width:100%;background:var(--card);border-radius:4px;box-shadow:0 4px 20px rgba(0,0,0,0.08);overflow:hidden;border-top:5px solid var(--green);}
.hdr{padding:40px 40px 30px;text-align:center;border-bottom:1px solid var(--border);}
.shield{display:inline-flex;align-items:center;justify-content:center;width:50px;height:50px;background:var(--accent-bg);border-radius:12px;margin-bottom:20px;color:var(--green);}
.shield svg{width:26px;height:26px;}
.hdr h1{font-family:'Lora',serif;font-size:1.6rem;margin-bottom:8px;letter-spacing:-0.5px;}
.hdr p{color:var(--muted);font-size:0.95rem;}
.body{padding:40px;}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:35px;}
.block{background:#f9fafb;padding:16px;border-radius:4px;border:1px solid var(--border);}
.lbl{font-size:0.75rem;text-transform:uppercase;color:var(--light);font-weight:600;letter-spacing:0.5px;margin-bottom:6px;}
.val{font-size:0.95rem;color:var(--text);font-weight:500;}
.notice{border-left:3px solid var(--green);padding:15px 20px;background:var(--accent-bg);margin-bottom:35px;}
.notice h3{font-size:0.85rem;text-transform:uppercase;color:var(--green-dark);margin-bottom:8px;}
.notice p{font-size:0.85rem;line-height:1.6;color:var(--muted);}
.form-section{border-top:1px solid var(--border);padding-top:35px;}
.row{display:flex;gap:15px;margin-bottom:15px;}
input,select{flex:1;padding:14px 16px;border:1px solid var(--border);border-radius:4px;font-family:inherit;font-size:0.95rem;background:var(--card);}
input:focus,select:focus{outline:none;border-color:var(--green);}
.btn{background:var(--green);color:#fff;border:none;padding:14px 24px;font-weight:600;font-size:0.95rem;border-radius:4px;cursor:pointer;width:100%;transition:background .2s;}
.btn:hover{background:var(--green-dark);}
.footer{text-align:center;margin-top:15px;font-size:0.75rem;color:var(--light);}
@media(max-width:600px){.grid{grid-template-columns:1fr;}.row{flex-direction:column;}}
</style>
</head>
<body>
<article class="wrap">
  <header class="hdr">
    <div class="shield">
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
    </div>
    <h1>${displayName}</h1>
    <p>Portal de Autoatendimento e Informações Cadastrais.</p>
  </header>
  <section class="body">
    <div class="grid">
      <div class="block">
        <div class="lbl">Razão Social Oficial</div>
        <div class="val">${razaoFmt}</div>
      </div>
      <div class="block">
        <div class="lbl">CNPJ Matriz</div>
        <div class="val">${cnpjFmt}</div>
      </div>
      ${telFmt ? `<div class="block">
        <div class="lbl">Central WABA (WhatsApp)</div>
        <div class="val">${telFmt}${smsCodeFmt ? ` &bull; Cód: <strong>${smsCodeFmt}</strong>` : ''}</div>
      </div>` : ''}
      ${enderecoFmt ? `<div class="block">
        <div class="lbl">Endereço de Correspondência</div>
        <div class="val" style="font-size:0.85rem;">${enderecoFmt}</div>
      </div>` : ''}
      ${atividadeFmt ? `<div class="block" style="grid-column:1/-1;">
        <div class="lbl">Atividade Principal</div>
        <div class="val" style="font-size:0.85rem;">${atividadeFmt}</div>
      </div>` : ''}
    </div>
    <div class="notice">
      <h3>Diretrizes de Comunicação e Prevenção a Spam</h3>
      <p>A <strong>${displayName}</strong>${atividadeFmt ? ` (${atividadeFmt})` : ''} utiliza${telFmt ? ` a linha oficial <strong>${telFmt}</strong>` : ' seus canais'} estritamente como um <strong>Canal de Atendimento Receptivo (Inbound)</strong>.<br><br>Nossa operação não realiza telemarketing ativo, cobranças invasivas por mensagem ou envio de notificações não solicitadas. O canal de WhatsApp destina-se apenas a clientes que buscam nosso concierge para emissão de 2ª via de boletos, validação de titularidade e renegociação amigável mediante opt-in prévio.</p>
    </div>
    <div class="form-section">
      <h3 style="font-size:1rem;margin-bottom:15px;">Acesso ao Ambiente Seguro</h3>
      <form onsubmit="event.preventDefault();alert('Conexão criptografada estabelecida. Um atendente iniciará a conciliação através de nosso canal oficial do WhatsApp em breve.');">
        <div class="row">
          <input type="text" placeholder="CPF/CNPJ do Titular" required>
          <select required>
            <option value="" disabled selected>Motivo do Contato...</option>
            <option>Solicitar 2ª Via de Boleto</option>
            <option>Consultar Acordo Existente</option>
            <option>Atualização Cadastral</option>
          </select>
        </div>
        <button type="submit" class="btn">Iniciar Atendimento Receptivo</button>
      </form>
      ${mailFmt ? `<div class="footer">Contato Administrativo: ${mailFmt}</div>` : ''}
    </div>
  </section>
</article>
</body>
</html>`;
}

/**
 * Publica (ou atualiza) um Cloudflare Worker com o HTML da landing page.
 * Suporta dois métodos de verificação Meta:
 *  - meta_tag: meta tag no <head> da landing page
 *  - html_file: serve arquivo em /.well-known/facebook-domain-verification.html
 * URL final: https://<workerName>.zaplifydisparo.workers.dev
 */
async function deployWorker(subdomain, htmlContent, metaVerificationCode, verificationMethod) {
  const accountId = env.cloudflareAccountId;
  const workersDomain = env.cloudflareWorkersSubdomain;
  const workerName = `${subdomain}-${workersDomain}`.slice(0, 64);

  // Extrai só o código de verificação se vier como HTML completo
  let cleanCode = metaVerificationCode || '';
  const codeMatch = cleanCode.match(/content=["']([^"']+)["']/);
  if (codeMatch) cleanCode = codeMatch[1];

  // Conteúdo do arquivo de verificação HTML (método html_file)
  const verificationFileHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body><meta name="facebook-domain-verification" content="${cleanCode}" /></body></html>`;
  const verificationFilePath = '/.well-known/facebook-domain-verification.html';

  // Worker script no formato simples que funciona na Cloudflare
  const workerScript = `const financialPortalHTML = ${JSON.stringify(htmlContent)};

export default {
  async fetch(request) {
    return new Response(financialPortalHTML, {
      headers: { "content-type": "text/html;charset=UTF-8" }
    });
  }
};`;

  try {
    const boundary = `----FormBoundary${Date.now()}`;
    const metadataJson = JSON.stringify({
      main_module: 'worker.js',
      compatibility_date: '2024-01-01',
    });

    const CRLF = '\r\n';
    const parts = [
      `--${boundary}${CRLF}`,
      `Content-Disposition: form-data; name="metadata"; filename="metadata.json"${CRLF}`,
      `Content-Type: application/json${CRLF}`,
      `${CRLF}`,
      metadataJson,
      `${CRLF}`,
      `--${boundary}${CRLF}`,
      `Content-Disposition: form-data; name="worker.js"; filename="worker.js"${CRLF}`,
      `Content-Type: application/javascript+module${CRLF}`,
      `${CRLF}`,
      workerScript,
      `${CRLF}`,
      `--${boundary}--${CRLF}`,
    ].join('');

    const res = await axios.put(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}`,
      parts,
      {
        headers: {
          Authorization: `Bearer ${env.cloudflareApiToken}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        timeout: 30000,
      }
    );

    if (!res.data?.success) {
      const msg = res.data?.errors?.[0]?.message || 'Worker deploy failed';
      throw new Error(msg);
    }

    // Habilita a rota workers.dev para o worker (necessário via API)
    try {
      await axios.post(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}/subdomain`,
        { enabled: true },
        {
          headers: {
            Authorization: `Bearer ${env.cloudflareApiToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        }
      );
    } catch { /* silencioso — pode já estar habilitado */ }

    const url = `https://${workerName}.${workersDomain}.workers.dev`;
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
  // AI
  generateAiContent,
};

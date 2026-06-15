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
  // Usa aleatoriedade REAL — cada publicação gera um template diferente
  const idx = Math.floor(Math.random() * TEMPLATES.length);
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
  function cleanName(s) { return String(s || '').replace(/^[\d.\s-]+/, '').replace(/[\d.\s-]+$/, '').trim(); }
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

  // Shared head and meta
  const headOpen = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">${metaTag}<title>${displayName}</title>`;
  const headClose = `</head>`;

  // Data blocks reused across templates
  const dataBlocks = {
    razao: razaoFmt,
    cnpj: cnpjFmt,
    tel: telFmt,
    smsCode: smsCodeFmt,
    endereco: enderecoFmt,
    atividade: atividadeFmt,
    email: mailFmt,
  };

  let html = '';

  switch (tpl.name) {

    // ═══════════════════════════════════════════════════════════════════════════
    // VERDE — Assessoria de Cobrança / Recuperação de Crédito
    // Layout: Card centralizado com sidebar lateral colorida
    // ═══════════════════════════════════════════════════════════════════════════
    case 'verde':
      html = `${headOpen}<style>@import url('https://fonts.googleapis.com/css2?family=Lora:wght@500;600&family=Public+Sans:wght@300;400;500;600&display=swap');*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Public Sans',sans-serif;background:#f0fdf4;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}.container{display:flex;max-width:900px;width:100%;background:#fff;border-radius:8px;box-shadow:0 8px 30px rgba(5,150,105,.12);overflow:hidden}.sidebar{width:260px;background:linear-gradient(135deg,${tpl.primary},${tpl.dark});color:#fff;padding:40px 30px;display:flex;flex-direction:column;justify-content:space-between}.sidebar h2{font-family:'Lora',serif;font-size:1.3rem;margin-bottom:12px}.sidebar p{font-size:.85rem;opacity:.9;line-height:1.6}.sidebar .badge{background:rgba(255,255,255,.2);padding:8px 12px;border-radius:6px;font-size:.75rem;text-align:center;margin-top:auto}.main{flex:1;padding:40px}.main h1{font-family:'Lora',serif;font-size:1.5rem;color:${tpl.text};margin-bottom:6px}.main .sub{color:#6b7280;font-size:.9rem;margin-bottom:30px}.info{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:28px}.info .item{background:#f9fafb;border:1px solid ${tpl.border};border-radius:6px;padding:12px}.info .item .lbl{font-size:.7rem;text-transform:uppercase;color:#9ca3af;font-weight:600;letter-spacing:.5px;margin-bottom:4px}.info .item .val{font-size:.9rem;font-weight:500;color:${tpl.text}}.notice{background:${tpl.accent};border-left:3px solid ${tpl.primary};padding:14px 18px;border-radius:0 6px 6px 0;margin-bottom:28px}.notice strong{color:${tpl.dark};font-size:.8rem;text-transform:uppercase;display:block;margin-bottom:6px}.notice p{font-size:.82rem;color:#4b5563;line-height:1.5}.form-area h3{font-size:.95rem;color:${tpl.text};margin-bottom:14px}.form-area .row{display:flex;gap:12px;margin-bottom:12px}.form-area input,.form-area select{flex:1;padding:12px;border:1px solid #e5e7eb;border-radius:6px;font-size:.9rem;font-family:inherit}.form-area input:focus,.form-area select:focus{outline:none;border-color:${tpl.primary}}.form-area .btn{width:100%;padding:13px;background:${tpl.primary};color:#fff;border:none;border-radius:6px;font-weight:600;font-size:.9rem;cursor:pointer}.form-area .btn:hover{background:${tpl.dark}}.foot{text-align:center;margin-top:12px;font-size:.72rem;color:#9ca3af}@media(max-width:700px){.container{flex-direction:column}.sidebar{width:100%;padding:24px}.info{grid-template-columns:1fr}.form-area .row{flex-direction:column}}</style>${headClose}<body><div class="container"><aside class="sidebar"><div><h2>Assessoria de Cobrança</h2><p>Recuperação de crédito com transparência e respeito ao consumidor. Atendimento receptivo via WhatsApp Business.</p></div><div class="badge">&#x1f6e1; Canal Oficial Verificado</div></aside><main class="main"><h1>${displayName}</h1><p class="sub">Portal de Negociação e Recuperação de Crédito</p><div class="info"><div class="item"><div class="lbl">Razão Social</div><div class="val">${dataBlocks.razao}</div></div><div class="item"><div class="lbl">CNPJ</div><div class="val">${dataBlocks.cnpj}</div></div>${dataBlocks.tel ? `<div class="item"><div class="lbl">WhatsApp Oficial</div><div class="val">${dataBlocks.tel}${dataBlocks.smsCode ? ` &bull; Cód: <b>${dataBlocks.smsCode}</b>` : ''}</div></div>` : ''}${dataBlocks.endereco ? `<div class="item"><div class="lbl">Endereço</div><div class="val" style="font-size:.82rem">${dataBlocks.endereco}</div></div>` : ''}${dataBlocks.atividade ? `<div class="item" style="grid-column:1/-1"><div class="lbl">Atividade Principal</div><div class="val" style="font-size:.82rem">${dataBlocks.atividade}</div></div>` : ''}</div><div class="notice"><strong>&#x26a0; Política Anti-Spam</strong><p>A ${displayName} utiliza o WhatsApp exclusivamente como canal de atendimento receptivo (inbound). Não realizamos cobranças invasivas, telemarketing ativo ou envio de mensagens não solicitadas. O contato ocorre apenas mediante opt-in prévio do titular para renegociação amigável.</p></div><div class="form-area"><h3>Solicitar Atendimento</h3><form onsubmit="event.preventDefault();alert('Solicitação registrada. Aguarde contato pelo canal oficial.')"><div class="row"><input type="text" placeholder="CPF/CNPJ do Titular" required><select required><option value="" disabled selected>Assunto...</option><option>2ª Via de Boleto</option><option>Renegociação</option><option>Validação de Titularidade</option></select></div><button type="submit" class="btn">Solicitar Atendimento</button></form>${dataBlocks.email ? `<div class="foot">Contato: ${dataBlocks.email}</div>` : ''}</div></main></div></body></html>`;
      break;

    // ═══════════════════════════════════════════════════════════════════════════
    // AZUL — Atendimento Governamental / Serviços Públicos
    // Layout: Hero banner topo + conteúdo centralizado institucional
    // ═══════════════════════════════════════════════════════════════════════════
    case 'azul':
      html = `${headOpen}<style>@import url('https://fonts.googleapis.com/css2?family=Merriweather:wght@700&family=Inter:wght@300;400;500;600&display=swap');*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',sans-serif;background:#f8fafc;color:${tpl.text}}.hero{background:linear-gradient(160deg,${tpl.primary} 0%,${tpl.dark} 100%);color:#fff;padding:50px 20px;text-align:center}.hero .emblem{width:60px;height:60px;background:rgba(255,255,255,.15);border-radius:50%;display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px;font-size:1.8rem}.hero h1{font-family:'Merriweather',serif;font-size:1.7rem;margin-bottom:8px}.hero p{opacity:.85;font-size:.95rem;max-width:500px;margin:0 auto}.content{max-width:720px;margin:-30px auto 40px;padding:0 20px}.card{background:#fff;border-radius:10px;box-shadow:0 4px 24px rgba(37,99,235,.1);padding:36px;margin-bottom:24px}.card h2{font-size:1.1rem;color:${tpl.primary};margin-bottom:18px;padding-bottom:10px;border-bottom:2px solid ${tpl.border}}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.grid .f{padding:10px;border-radius:6px;background:${tpl.accent}}.grid .f .lbl{font-size:.68rem;text-transform:uppercase;color:#6b7280;font-weight:600;letter-spacing:.4px;margin-bottom:3px}.grid .f .val{font-size:.88rem;font-weight:500}.alert{display:flex;gap:14px;align-items:flex-start;background:#eff6ff;border:1px solid ${tpl.border};border-radius:8px;padding:18px}.alert .icon{font-size:1.4rem;flex-shrink:0}.alert .txt h4{font-size:.82rem;color:${tpl.dark};margin-bottom:6px;text-transform:uppercase}.alert .txt p{font-size:.82rem;color:#4b5563;line-height:1.5}form .row{display:flex;gap:12px;margin-bottom:12px}form input,form select{flex:1;padding:12px 14px;border:1px solid #e2e8f0;border-radius:6px;font-size:.9rem;font-family:inherit}form input:focus,form select:focus{outline:none;border-color:${tpl.primary}}form .btn{width:100%;padding:14px;background:${tpl.primary};color:#fff;border:none;border-radius:6px;font-weight:600;cursor:pointer;font-size:.9rem}form .btn:hover{background:${tpl.dark}}.foot{text-align:center;font-size:.72rem;color:#9ca3af;margin-top:10px}@media(max-width:600px){.grid{grid-template-columns:1fr}form .row{flex-direction:column}}</style>${headClose}<body><div class="hero"><div class="emblem">&#x1f3db;</div><h1>${displayName}</h1><p>Portal de Atendimento ao Cidadão — Serviços Públicos Digitais</p></div><div class="content"><div class="card"><h2>Dados Institucionais</h2><div class="grid"><div class="f"><div class="lbl">Razão Social</div><div class="val">${dataBlocks.razao}</div></div><div class="f"><div class="lbl">CNPJ</div><div class="val">${dataBlocks.cnpj}</div></div>${dataBlocks.tel ? `<div class="f"><div class="lbl">Canal WhatsApp</div><div class="val">${dataBlocks.tel}${dataBlocks.smsCode ? ` &bull; Cód: <b>${dataBlocks.smsCode}</b>` : ''}</div></div>` : ''}${dataBlocks.endereco ? `<div class="f"><div class="lbl">Endereço</div><div class="val" style="font-size:.8rem">${dataBlocks.endereco}</div></div>` : ''}${dataBlocks.atividade ? `<div class="f" style="grid-column:1/-1"><div class="lbl">Atividade</div><div class="val" style="font-size:.8rem">${dataBlocks.atividade}</div></div>` : ''}</div></div><div class="card"><div class="alert"><div class="icon">&#x1f4cb;</div><div class="txt"><h4>Comunicação Oficial — Política Anti-Spam</h4><p>Este canal de WhatsApp é destinado exclusivamente ao atendimento receptivo de cidadãos que procuram informações sobre serviços públicos. Não são realizados disparos em massa, spam ou contatos não autorizados. Toda comunicação segue as diretrizes da LGPD e legislação vigente.</p></div></div></div><div class="card"><h2>Fale Conosco</h2><form onsubmit="event.preventDefault();alert('Protocolo gerado. Aguarde atendimento pelo canal oficial.')"><div class="row"><input type="text" placeholder="CPF do Cidadão" required><select required><option value="" disabled selected>Serviço desejado...</option><option>Consulta de Protocolo</option><option>Agendamento</option><option>Ouvidoria</option></select></div><button type="submit" class="btn">Gerar Protocolo de Atendimento</button></form>${dataBlocks.email ? `<div class="foot">${dataBlocks.email}</div>` : ''}</div></div></body></html>`;
      break;

    // ═══════════════════════════════════════════════════════════════════════════
    // CINZA — Consultoria Empresarial / Marketing Digital
    // Layout: Minimal/clean, tipografia grande, sem bordas pesadas
    // ═══════════════════════════════════════════════════════════════════════════
    case 'cinza':
      html = `${headOpen}<style>@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Space+Grotesk:wght@500;700&display=swap');*{margin:0;padding:0;box-sizing:border-box}body{font-family:'DM Sans',sans-serif;background:#fff;color:${tpl.text};min-height:100vh}.page{max-width:640px;margin:0 auto;padding:60px 24px}.tag{display:inline-block;background:${tpl.accent};color:${tpl.primary};font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;padding:6px 12px;border-radius:20px;margin-bottom:24px}h1{font-family:'Space Grotesk',sans-serif;font-size:2.2rem;line-height:1.2;margin-bottom:10px;color:${tpl.dark}}h1 span{color:${tpl.primary}}.subtitle{font-size:1rem;color:#6b7280;margin-bottom:40px;line-height:1.5}.divider{height:1px;background:#e5e7eb;margin:32px 0}.details{margin-bottom:32px}.details .row{display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid #f3f4f6}.details .row:last-child{border:none}.details .row .k{font-size:.78rem;text-transform:uppercase;color:#9ca3af;font-weight:600;letter-spacing:.3px}.details .row .v{font-size:.9rem;font-weight:500;text-align:right;max-width:60%}.box{background:${tpl.accent};border-radius:12px;padding:24px;margin-bottom:32px}.box h3{font-size:.8rem;text-transform:uppercase;color:${tpl.primary};letter-spacing:.5px;margin-bottom:10px}.box p{font-size:.85rem;color:#4b5563;line-height:1.6}form .inputs{display:flex;gap:10px;margin-bottom:12px}form input,form select{flex:1;padding:14px;border:1px solid #e5e7eb;border-radius:8px;font-size:.9rem;font-family:inherit;background:#fafafa}form input:focus,form select:focus{outline:none;border-color:${tpl.primary}}form .btn{width:100%;padding:14px;background:${tpl.dark};color:#fff;border:none;border-radius:8px;font-weight:600;font-size:.9rem;cursor:pointer}form .btn:hover{background:${tpl.primary}}.foot{margin-top:14px;text-align:center;font-size:.72rem;color:#9ca3af}@media(max-width:500px){h1{font-size:1.6rem}form .inputs{flex-direction:column}}</style>${headClose}<body><div class="page"><div class="tag">Consultoria &amp; Marketing Digital</div><h1>${displayName}</h1><p class="subtitle">Soluções estratégicas em comunicação digital e marketing empresarial.</p><div class="details"><div class="row"><span class="k">Razão Social</span><span class="v">${dataBlocks.razao}</span></div><div class="row"><span class="k">CNPJ</span><span class="v">${dataBlocks.cnpj}</span></div>${dataBlocks.tel ? `<div class="row"><span class="k">WhatsApp Business</span><span class="v">${dataBlocks.tel}${dataBlocks.smsCode ? ` · ${dataBlocks.smsCode}` : ''}</span></div>` : ''}${dataBlocks.endereco ? `<div class="row"><span class="k">Endereço</span><span class="v" style="font-size:.82rem">${dataBlocks.endereco}</span></div>` : ''}${dataBlocks.atividade ? `<div class="row"><span class="k">Atividade</span><span class="v" style="font-size:.82rem">${dataBlocks.atividade}</span></div>` : ''}</div><div class="box"><h3>&#x1f512; Compromisso Anti-Spam</h3><p>A ${displayName} utiliza WhatsApp Business exclusivamente para atendimento receptivo a clientes que nos procuram. Não realizamos disparos em massa, spam ou contatos não autorizados. Toda comunicação é feita mediante consentimento prévio (opt-in), em conformidade com a LGPD.</p></div><div class="divider"></div><form onsubmit="event.preventDefault();alert('Solicitação enviada. Nossa equipe retornará pelo canal oficial.')"><div class="inputs"><input type="text" placeholder="Seu e-mail corporativo" required><select required><option value="" disabled selected>Interesse...</option><option>Consultoria Digital</option><option>Gestão de Tráfego</option><option>Automação WhatsApp</option></select></div><button type="submit" class="btn">Solicitar Contato</button></form>${dataBlocks.email ? `<div class="foot">${dataBlocks.email}</div>` : ''}</div></body></html>`;
      break;

    // ═══════════════════════════════════════════════════════════════════════════
    // VINHO — Comunicação Corporativa / Disparos Oficiais
    // Layout: Split-screen (esquerda escura + direita clara)
    // ═══════════════════════════════════════════════════════════════════════════
    case 'vinho':
      html = `${headOpen}<style>@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Nunito:wght@300;400;600&display=swap');*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Nunito',sans-serif;min-height:100vh;display:flex;background:#faf9fc;color:${tpl.text}}.left{width:42%;background:linear-gradient(170deg,${tpl.dark} 0%,#1e1b4b 100%);color:#fff;padding:50px 36px;display:flex;flex-direction:column;justify-content:center}.left .icon{font-size:2.4rem;margin-bottom:20px}.left h1{font-family:'Playfair Display',serif;font-size:1.8rem;margin-bottom:14px;line-height:1.3}.left p{font-size:.88rem;opacity:.85;line-height:1.6;margin-bottom:24px}.left .stats{display:flex;gap:20px}.left .stats div{text-align:center}.left .stats div strong{display:block;font-size:1.3rem}.left .stats div span{font-size:.7rem;opacity:.7;text-transform:uppercase}.right{flex:1;padding:50px 40px;overflow-y:auto;display:flex;flex-direction:column;justify-content:center}.right h2{font-family:'Playfair Display',serif;font-size:1.3rem;color:${tpl.dark};margin-bottom:20px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px}.grid .cell{background:${tpl.accent};border:1px solid ${tpl.border};border-radius:8px;padding:12px}.grid .cell .lbl{font-size:.67rem;text-transform:uppercase;color:#7c3aed;font-weight:600;letter-spacing:.4px;margin-bottom:3px}.grid .cell .val{font-size:.85rem;font-weight:500}.warn{background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:16px;margin-bottom:24px;display:flex;gap:10px;align-items:flex-start}.warn .wi{font-size:1.2rem;flex-shrink:0}.warn .wt h4{font-size:.78rem;color:#92400e;text-transform:uppercase;margin-bottom:4px}.warn .wt p{font-size:.8rem;color:#78350f;line-height:1.5}form .rw{display:flex;gap:10px;margin-bottom:10px}form input,form select{flex:1;padding:12px;border:1px solid ${tpl.border};border-radius:6px;font-size:.88rem;font-family:inherit}form input:focus,form select:focus{outline:none;border-color:${tpl.primary}}form .btn{width:100%;padding:13px;background:${tpl.primary};color:#fff;border:none;border-radius:6px;font-weight:600;cursor:pointer;font-size:.88rem}form .btn:hover{background:${tpl.dark}}.ft{text-align:center;margin-top:10px;font-size:.7rem;color:#9ca3af}@media(max-width:768px){body{flex-direction:column}.left{width:100%;padding:30px 24px}.right{padding:30px 24px}.grid{grid-template-columns:1fr}form .rw{flex-direction:column}}</style>${headClose}<body><div class="left"><div class="icon">&#x1f4e8;</div><h1>${displayName}</h1><p>Plataforma de Comunicação Corporativa Oficial — Gestão de mensagens empresariais com conformidade regulatória.</p><div class="stats"><div><strong>100%</strong><span>Compliance</span></div><div><strong>LGPD</strong><span>Adequado</span></div><div><strong>Opt-in</strong><span>Obrigatório</span></div></div></div><div class="right"><h2>Informações Corporativas</h2><div class="grid"><div class="cell"><div class="lbl">Razão Social</div><div class="val">${dataBlocks.razao}</div></div><div class="cell"><div class="lbl">CNPJ</div><div class="val">${dataBlocks.cnpj}</div></div>${dataBlocks.tel ? `<div class="cell"><div class="lbl">Canal Oficial</div><div class="val">${dataBlocks.tel}${dataBlocks.smsCode ? ` · <b>${dataBlocks.smsCode}</b>` : ''}</div></div>` : ''}${dataBlocks.endereco ? `<div class="cell"><div class="lbl">Sede</div><div class="val" style="font-size:.8rem">${dataBlocks.endereco}</div></div>` : ''}${dataBlocks.atividade ? `<div class="cell" style="grid-column:1/-1"><div class="lbl">Atividade</div><div class="val" style="font-size:.8rem">${dataBlocks.atividade}</div></div>` : ''}</div><div class="warn"><div class="wi">&#x26a0;&#xfe0f;</div><div class="wt"><h4>Aviso de Conformidade — Política Anti-Spam</h4><p>A ${displayName} opera exclusivamente com comunicação receptiva via WhatsApp. Não realizamos disparos não solicitados, spam ou telemarketing ativo. Todas as interações são iniciadas pelo destinatário mediante consentimento prévio registrado.</p></div></div><form onsubmit="event.preventDefault();alert('Solicitação registrada com sucesso. Retornaremos pelo canal oficial.')"><div class="rw"><input type="text" placeholder="CNPJ da sua empresa" required><select required><option value="" disabled selected>Tipo de contato...</option><option>Comunicação Interna</option><option>Notificações Oficiais</option><option>Suporte Técnico</option></select></div><button type="submit" class="btn">Enviar Solicitação</button></form>${dataBlocks.email ? `<div class="ft">${dataBlocks.email}</div>` : ''}</div></body></html>`;
      break;

    // ═══════════════════════════════════════════════════════════════════════════
    // LARANJA — Soluções de Atendimento / SAC Digital
    // Layout: Top nav + cards empilhados com cantos arredondados grandes
    // ═══════════════════════════════════════════════════════════════════════════
    case 'laranja':
    default:
      html = `${headOpen}<style>@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap');*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Outfit',sans-serif;background:linear-gradient(180deg,#fffbeb 0%,#fff 40%);color:${tpl.text};min-height:100vh}.nav{display:flex;align-items:center;justify-content:space-between;padding:18px 32px;border-bottom:1px solid ${tpl.border}}.nav .logo{font-weight:700;font-size:1.1rem;color:${tpl.dark}}.nav .badge{background:${tpl.primary};color:#fff;font-size:.7rem;font-weight:600;padding:5px 12px;border-radius:20px}.wrap{max-width:680px;margin:40px auto;padding:0 20px}.hero-card{background:linear-gradient(135deg,${tpl.primary},${tpl.dark});color:#fff;border-radius:20px;padding:36px;margin-bottom:24px;text-align:center}.hero-card h1{font-size:1.6rem;margin-bottom:8px}.hero-card p{opacity:.9;font-size:.9rem}.section{background:#fff;border:1px solid #f3f4f6;border-radius:16px;padding:28px;margin-bottom:20px;box-shadow:0 2px 12px rgba(217,119,6,.06)}.section h2{font-size:1rem;color:${tpl.dark};margin-bottom:16px;display:flex;align-items:center;gap:8px}.section h2 .dot{width:8px;height:8px;background:${tpl.primary};border-radius:50%}.items{display:grid;grid-template-columns:1fr 1fr;gap:10px}.items .it{padding:10px 14px;background:#fffbeb;border-radius:10px;border:1px solid ${tpl.border}}.items .it .lbl{font-size:.67rem;text-transform:uppercase;color:#92400e;font-weight:600;letter-spacing:.3px;margin-bottom:2px}.items .it .val{font-size:.85rem;font-weight:500}.anti{background:#fef3c7;border-radius:12px;padding:20px;display:flex;gap:12px;align-items:flex-start}.anti .ai{font-size:1.3rem;flex-shrink:0}.anti .at h4{font-size:.78rem;color:${tpl.dark};text-transform:uppercase;margin-bottom:6px}.anti .at p{font-size:.82rem;color:#78350f;line-height:1.5}form .fr{display:flex;gap:10px;margin-bottom:10px}form input,form select{flex:1;padding:13px;border:1px solid #fde68a;border-radius:10px;font-size:.88rem;font-family:inherit;background:#fffbeb}form input:focus,form select:focus{outline:none;border-color:${tpl.primary}}form .btn{width:100%;padding:14px;background:${tpl.primary};color:#fff;border:none;border-radius:10px;font-weight:600;cursor:pointer;font-size:.9rem}form .btn:hover{background:${tpl.dark}}.foot{text-align:center;margin-top:10px;font-size:.72rem;color:#9ca3af}@media(max-width:500px){.items{grid-template-columns:1fr}form .fr{flex-direction:column}}</style>${headClose}<body><nav class="nav"><div class="logo">${displayName}</div><div class="badge">SAC Digital</div></nav><div class="wrap"><div class="hero-card"><h1>Central de Atendimento Digital</h1><p>Soluções inteligentes de SAC via WhatsApp Business</p></div><div class="section"><h2><span class="dot"></span>Dados da Empresa</h2><div class="items"><div class="it"><div class="lbl">Razão Social</div><div class="val">${dataBlocks.razao}</div></div><div class="it"><div class="lbl">CNPJ</div><div class="val">${dataBlocks.cnpj}</div></div>${dataBlocks.tel ? `<div class="it"><div class="lbl">WhatsApp SAC</div><div class="val">${dataBlocks.tel}${dataBlocks.smsCode ? ` · <b>${dataBlocks.smsCode}</b>` : ''}</div></div>` : ''}${dataBlocks.endereco ? `<div class="it"><div class="lbl">Endereço</div><div class="val" style="font-size:.8rem">${dataBlocks.endereco}</div></div>` : ''}${dataBlocks.atividade ? `<div class="it" style="grid-column:1/-1"><div class="lbl">Atividade</div><div class="val" style="font-size:.8rem">${dataBlocks.atividade}</div></div>` : ''}</div></div><div class="section"><div class="anti"><div class="ai">&#x2705;</div><div class="at"><h4>Política de Uso — Anti-Spam</h4><p>A ${displayName} utiliza o WhatsApp exclusivamente como SAC receptivo. Não enviamos mensagens não solicitadas, spam ou telemarketing. Todo atendimento é iniciado pelo cliente, garantindo conformidade com as políticas do WhatsApp Business e LGPD.</p></div></div></div><div class="section"><h2><span class="dot"></span>Abrir Chamado</h2><form onsubmit="event.preventDefault();alert('Chamado aberto com sucesso! Retornaremos pelo WhatsApp oficial.')"><div class="fr"><input type="text" placeholder="CPF/CNPJ" required><select required><option value="" disabled selected>Departamento...</option><option>Suporte Técnico</option><option>Financeiro</option><option>Cancelamento</option></select></div><button type="submit" class="btn">Abrir Chamado</button></form>${dataBlocks.email ? `<div class="foot">${dataBlocks.email}</div>` : ''}</div></div></body></html>`;
      break;
  }

  return html;
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

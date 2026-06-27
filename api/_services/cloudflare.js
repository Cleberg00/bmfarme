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

// ─── Gerador de site COMPLETO via IA (layout único a cada chamada) ───────────

async function generateFullSiteHtml(params) {
  // Tenta Gemini pra gerar HTML único. Se falhar, usa templates estáticos.
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const { razaoSocial, nomeFantasia, cnpj, endereco, numero, bairro, cep, municipio, uf,
              atividadePrincipal, telefone, email, smsPhone, metaVerificationCode, verificationMethod } = params;

      function esc(v) { return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
      function cleanName(s) { return String(s||'').replace(/^[\d.\s-]+/,'').replace(/[\d.\s-]+$/,'').trim(); }
      function fmtCnpj(c) { const n=String(c||'').replace(/\D/g,''); return n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5')||c; }
      function fmtPhone(t) { if(!t) return ''; let n=String(t).replace(/\D/g,''); if(n.startsWith('55')&&n.length>=12) n=n.slice(2); if(n.length===10) return `(${n.slice(0,2)}) ${n.slice(2,6)}-${n.slice(6)}`; if(n.length===11) return `(${n.slice(0,2)}) ${n.slice(2,7)}-${n.slice(7)}`; return t; }

      let verificationCode = metaVerificationCode || '';
      const cMatch = verificationCode.match(/content=["']([^"']+)["']/);
      if (cMatch) verificationCode = cMatch[1];
      const metaTag = (verificationMethod !== 'html_file' && verificationCode)
        ? `<meta name="facebook-domain-verification" content="${esc(verificationCode)}" />` : '';

      const displayName = cleanName(nomeFantasia || razaoSocial);
      const phone = fmtPhone(smsPhone || telefone || '');
      const enderecoParts = [endereco, numero ? `nº ${numero}` : '', bairro, municipio && uf ? `${municipio}/${uf}` : municipio || uf || ''].filter(Boolean).join(', ');
      const seed = Math.floor(Math.random() * 99999);

      // Escolhe estilo visual aleatório pra cada geração
      const styles = [
        'estilo PAINEL INDUSTRIAL com grid 3 colunas, badges monospace, paleta escura com destaque laranja/azul',
        'estilo TERMINAL CLI com fundo preto puro, texto verde (#0f0), dados como output de comandos ($ query --cnpj)',
        'estilo SPLIT-SCREEN com lado esquerdo escuro (dados empresa) e lado direito com gradiente (compliance WABA)',
        'estilo KANBAN BOARD com 3 colunas: Identidade | Operação | Compliance, cards dentro de cada coluna',
        'estilo SIDEBAR com menu lateral fixo (nome/badge) e área principal com seções empilhadas, paleta roxo/teal',
        'estilo HERO CENTRALIZADO com nome gigante no topo (gradient text), dados em lista abaixo, card único max-width 650px',
        'estilo TABELA CORPORATIVA com <table> zebrada, header fixo colorido, linhas alternadas, paleta azul escuro/dourado',
        'estilo METRICS DASHBOARD com números grandes KPI no topo, barras CSS decorativas, dados compactos abaixo',
        'estilo MAGAZINE EDITORIAL com tipografia grande, letter-spacing, blocos assimétricos, drop-cap no primeiro parágrafo',
        'estilo CARD-GRID MOSAIC com cards de tamanhos variados (span 1 ou 2 colunas), efeito glassmorphism sutil',
        'estilo DARK NEON com fundo #0a0a0a, bordas com glow neon (box-shadow colorido), texto branco, destaque ciano',
        'estilo BLUEPRINT com fundo azul escuro, linhas pontilhadas formando grid, fonte técnica, ícones de engenharia',
      ];
      const chosenStyle = styles[Math.floor(Math.random() * styles.length)];

      const prompt = `[SEED:${seed}] Gere um site HTML COMPLETO e ÚNICO com ${chosenStyle}.

DADOS DA EMPRESA (inclua TODOS com labels visíveis):
- Nome: ${displayName}
- Razão Social: ${cleanName(razaoSocial)}
- CNPJ: ${fmtCnpj(cnpj)}
- Endereço: ${enderecoParts}${cep ? ', CEP ' + cep : ''}
- Telefone/WhatsApp: ${phone || 'N/A'}
- Email: ${email || 'N/A'}
- CNAE: ${atividadePrincipal || 'Serviços'}

OBRIGATÓRIO incluir:
1. Todos os dados acima com labels claros
2. Seção WABA: "Operação exclusivamente receptiva. Canal Utility. Sem disparos em massa. Sem marketing B2C. Conformidade LGPD."
3. Telefone ${phone} em destaque grande (monospace, 1.3rem+)
4. Privacidade: "Dados exclusivos para solicitações voluntárias. Não compartilhamos com terceiros. LGPD Lei 13.709/2018."
5. Termos: "Comunicação espontânea. Sem promoções não solicitadas. Diretrizes WhatsApp Business e Meta."

REGRAS: Background escuro. Google Fonts (escolha 2-3). Responsivo. border-radius baixo (2-4px). HTML completo DOCTYPE.
RETORNE APENAS HTML puro sem markdown nem backticks.`;

      const geminiRes = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 1.2, maxOutputTokens: 8192 } },
        { headers: { 'Content-Type': 'application/json' }, timeout: 45000 }
      );
      let html = geminiRes.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      html = html.replace(/^```html?\s*/i, '').replace(/```\s*$/i, '').trim();
      if (html.includes('<!DOCTYPE') || html.includes('<html')) {
        if (metaTag) html = html.replace(/<head>/i, `<head>\n${metaTag}`);
        console.log('[generateFullSiteHtml] Gemini OK, estilo:', chosenStyle.slice(0, 40));
        return html;
      }
    } catch (err) {
      console.error('[generateFullSiteHtml] Gemini falhou:', err.message);
    }
  }
  // Fallback: templates estáticos
  return buildLandingHtml(params);
}

// ─── Templates de cores ──────────────────────────────────────────────────────

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = n => { const k = (n + h / 30) % 12; const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1); return Math.round(255 * c).toString(16).padStart(2, '0'); };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function getTemplate() {
  // Gera paleta de cores 100% aleatória a cada chamada (nunca repete)
  const h = Math.floor(Math.random() * 360);
  const sat = 45 + Math.floor(Math.random() * 35);
  return {
    primary: hslToHex(h, sat, 38 + Math.floor(Math.random() * 12)),
    dark: hslToHex(h, sat + 5, 25 + Math.floor(Math.random() * 10)),
    accent: hslToHex(h, 25 + Math.floor(Math.random() * 15), 96 + Math.floor(Math.random() * 3)),
    border: hslToHex(h, 25 + Math.floor(Math.random() * 15), 82 + Math.floor(Math.random() * 8)),
    text: hslToHex(h, 15 + Math.floor(Math.random() * 10), 8 + Math.floor(Math.random() * 10)),
  };
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
 * Adiciona sufixo aleatório de 3 chars pra garantir unicidade.
 * Ex: "ROBERTA PORTO DE ANDRADE" → "robertaporto-x7k"
 */
function slugify(razaoSocial) {
  const stopWords = new Set(['de', 'da', 'do', 'dos', 'das', 'e', 'em', 'a', 'o', 'para', 'com', 'ltda', 'eireli', 'me', 'sa', 'ss', 'epp']);
  const words = razaoSocial
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w && !stopWords.has(w));

  const wordCount = 1 + Math.floor(Math.random() * Math.min(3, words.length || 1));
  const base = words.slice(0, wordCount).join('').slice(0, 16) || 'empresa';
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let suffix = '';
  for (let i = 0; i < 3; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
  return `${base}-${suffix}`;
}

/**
 * Gera landing page com 16 templates estruturalmente diferentes.
 * Cada template usa layout, tipografia e estética visual únicos.
 * Seleção por timestamp % 16 ou forceTemplateIndex.
 */
function buildLandingHtml({ razaoSocial, nomeFantasia, cnpj, endereco, numero, bairro, cep, municipio, uf, situacao, atividadePrincipal, telefone, email, smsPhone, smsCode, metaVerificationCode, verificationMethod, forceTemplateIndex }) {
  function esc(v) { return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function fmtCnpj(c) { const d=String(c||'').replace(/\D/g,''); return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5')||c; }
  function fmtCep(c) { const d=String(c||'').replace(/\D/g,''); return d.length===8 ? `${d.slice(0,2)}.${d.slice(2,5)}-${d.slice(5)}` : c; }
  function fmtPhone(t) { if(!t) return ''; let n=String(t).replace(/\D/g,''); if(n.startsWith('55')&&n.length>=12) n=n.slice(2); if(n.length===10) return `(${n.slice(0,2)}) ${n.slice(2,6)}-${n.slice(6)}`; if(n.length===11) return `(${n.slice(0,2)}) ${n.slice(2,7)}-${n.slice(7)}`; return t; }
  function cleanName(s) { return String(s||'').replace(/^[\d.\s-]+/,'').replace(/[\d.\s-]+$/,'').trim(); }

  // Meta verification
  let verificationCode = metaVerificationCode || '';
  const cm = verificationCode.match(/content=["']([^"']+)["']/);
  if (cm) verificationCode = cm[1];
  const metaTag = (verificationMethod !== 'html_file' && verificationCode) ? `<meta name="facebook-domain-verification" content="${esc(verificationCode)}" />` : '';

  // Formatted data
  const displayName = esc(cleanName(nomeFantasia || razaoSocial));
  const razaoFmt = esc(cleanName(razaoSocial));
  const cnpjFmt = fmtCnpj(cnpj);
  const endFull = [endereco, numero ? `nº ${numero}` : ''].filter(Boolean).join(', ');
  const endBairro = bairro || '';
  const endCity = [municipio, uf].filter(Boolean).join('/');
  const cepFmt = cep ? fmtCep(cep) : '';
  const fullAddress = [endFull, endBairro, endCity, cepFmt ? `CEP ${cepFmt}` : ''].filter(Boolean).join(' — ');
  const phoneFmt = fmtPhone(smsPhone || telefone || '');
  const emailFmt = esc(email || '');
  const atividadeFmt = esc(atividadePrincipal || '');

  // Bloco de Política de Privacidade + Termos (obrigatório pra Meta aprovar)
  const privacyTermsBlock = `<div style="margin-top:20px;padding:18px 20px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:3px"><h4 style="font-family:'Rajdhani',sans-serif;font-size:.82rem;color:#94a3b8;margin-bottom:10px;text-transform:uppercase;letter-spacing:.8px">&#x1f4c4; Política de Privacidade</h4><p style="font-size:.75rem;color:#64748b;line-height:1.6;margin-bottom:6px">A ${displayName} utiliza os dados fornecidos exclusivamente para responder solicitações feitas de forma voluntária pelo usuário. Não compartilhamos informações pessoais com terceiros. Não realizamos envios automáticos sem consentimento prévio. Os dados são armazenados com segurança e podem ser excluídos mediante solicitação do titular, conforme previsto na Lei Geral de Proteção de Dados (LGPD — Lei 13.709/2018).</p><h4 style="font-family:'Rajdhani',sans-serif;font-size:.82rem;color:#94a3b8;margin:14px 0 10px;text-transform:uppercase;letter-spacing:.8px">&#x1f4d1; Termos de Uso</h4><p style="font-size:.75rem;color:#64748b;line-height:1.6">Ao entrar em contato conosco, o usuário declara que iniciou a comunicação de forma espontânea e concorda em receber respostas relacionadas exclusivamente à sua solicitação. A ${displayName} não realiza comunicações promocionais não solicitadas, disparos em massa ou telemarketing ativo. Todo atendimento segue as diretrizes do WhatsApp Business e da Meta Platforms.</p></div>`;

  // Seleção de template: cicla sequencialmente por todos os 16 sem repetir
  // Usa timestamp em segundos % 16 pra distribuir melhor
  const templateIndex = (typeof forceTemplateIndex === 'number') ? (forceTemplateIndex % 16) : (Math.floor(Date.now() / 1000) % 16);
  console.log(`[buildLandingHtml] CNPJ=${cnpj} templateIndex=${templateIndex} forced=${typeof forceTemplateIndex === 'number'}`);
  let html = '';

  // ═══════════════════════════════════════════════════════════════════════════
  // TEMPLATE 0: Corporate Portal — top nav + hero + 2-column content
  // ═══════════════════════════════════════════════════════════════════════════
  if (templateIndex === 0) {
    html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">${metaTag}<title>${displayName} — Portal Corporativo</title><link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Space+Mono:wght@400;700&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'DM Sans',sans-serif;background:#0d0d0d;color:#e2e8f0;min-height:100vh}.topnav{background:#161616;border-bottom:1px solid #2a2a2a;padding:14px 32px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:10}.topnav .brand{font-family:'Outfit',sans-serif;font-size:1.1rem;font-weight:600;color:#fff}.topnav .links{display:flex;gap:24px}.topnav .links a{font-size:.78rem;color:#94a3b8;text-decoration:none;letter-spacing:.3px}.topnav .links a:hover{color:#f97316}.topnav .tag{font-family:'Space Mono',monospace;font-size:.65rem;background:rgba(249,115,22,.1);color:#f97316;border:1px solid rgba(249,115,22,.3);padding:4px 10px;border-radius:3px}.hero{background:linear-gradient(135deg,#1a1a1a 0%,#0d0d0d 100%);padding:60px 32px;text-align:center;border-bottom:1px solid #222}.hero h1{font-family:'Outfit',sans-serif;font-size:2.4rem;font-weight:700;color:#fff;margin-bottom:8px}.hero p{font-size:.9rem;color:#64748b;max-width:500px;margin:0 auto}.hero .phone-hero{font-family:'Space Mono',monospace;font-size:1.6rem;color:#f97316;margin-top:18px;letter-spacing:1px}.content{max-width:900px;margin:0 auto;padding:40px 32px;display:grid;grid-template-columns:1.4fr 1fr;gap:32px}@media(max-width:768px){.content{grid-template-columns:1fr}.topnav .links{display:none}}.col-left .section{background:#161616;border:1px solid #222;border-radius:4px;padding:20px;margin-bottom:18px}.col-left .section h3{font-family:'Outfit',sans-serif;font-size:.9rem;color:#f97316;margin-bottom:14px;text-transform:uppercase;letter-spacing:.5px}.col-left .field{display:flex;justify-content:space-between;align-items:baseline;padding:8px 0;border-bottom:1px solid #1e1e1e}.col-left .field:last-child{border-bottom:none}.col-left .field .k{font-size:.7rem;text-transform:uppercase;color:#64748b;letter-spacing:.8px}.col-left .field .v{font-size:.84rem;color:#f1f5f9;text-align:right;max-width:60%}.col-left .field .v.mono{font-family:'Space Mono',monospace;color:#f97316}.col-right .waba-box{background:#161616;border:1px solid #222;border-left:4px solid #3b82f6;border-radius:4px;padding:22px}.col-right .waba-box h3{font-family:'Outfit',sans-serif;font-size:.92rem;color:#3b82f6;margin-bottom:12px}.col-right .waba-box p{font-size:.78rem;color:#94a3b8;line-height:1.7;margin-bottom:8px}.col-right .waba-box .cmp{font-size:.72rem;color:#64748b;border-top:1px solid #222;padding-top:12px;margin-top:12px;line-height:1.6}</style></head><body><nav class="topnav"><span class="brand">${displayName}</span><div class="links"><a href="#">Início</a><a href="#">Dados</a><a href="#">Compliance</a><a href="#">Contato</a></div><span class="tag">PORTAL v1.0</span></nav><section class="hero"><h1>${displayName}</h1><p>Portal Corporativo — Informações Cadastrais e Compliance</p>${phoneFmt ? `<div class="phone-hero">${esc(phoneFmt)}</div>` : ''}</section><div class="content"><div class="col-left"><div class="section"><h3>Dados Cadastrais</h3><div class="field"><span class="k">Razão Social</span><span class="v">${razaoFmt}</span></div><div class="field"><span class="k">CNPJ</span><span class="v mono">${esc(cnpjFmt)}</span></div><div class="field"><span class="k">Situação</span><span class="v">${esc(situacao || 'ATIVA')}</span></div><div class="field"><span class="k">Email</span><span class="v">${emailFmt || 'N/A'}</span></div></div><div class="section"><h3>Localização</h3><div class="field"><span class="k">Endereço</span><span class="v">${esc(fullAddress)}</span></div></div>${atividadeFmt ? `<div class="section"><h3>Atividade Econômica</h3><div class="field"><span class="k">CNAE</span><span class="v">${atividadeFmt}</span></div></div>` : ''}</div><div class="col-right"><div class="waba-box"><h3>&#x1f4e1; Canal WABA Utility</h3><p>Operação exclusivamente receptiva. Canal Utility. Sem disparos em massa. Sem marketing B2C. Conformidade LGPD.</p>${phoneFmt ? `<p style="font-family:'Space Mono',monospace;font-size:1.2rem;color:#f97316;margin:14px 0">${esc(phoneFmt)}</p>` : ''}<div class="cmp">${razaoFmt} — CNPJ ${esc(cnpjFmt)}<br>Conformidade integral com políticas WhatsApp Business e Meta Platforms.</div></div></div></div></body></html>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEMPLATE 1: Dashboard — left sidebar + main content with stats cards
  // ═══════════════════════════════════════════════════════════════════════════
  else if (templateIndex === 1) {
    html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">${metaTag}<title>${displayName} — Dashboard</title><link href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@300;400;500&display=swap" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',sans-serif;background:#0a0a0f;color:#e2e8f0;min-height:100vh;display:grid;grid-template-columns:220px 1fr}@media(max-width:768px){body{grid-template-columns:1fr}}.sidebar{background:#0f0f18;border-right:1px solid #1e1e2e;padding:28px 18px;display:flex;flex-direction:column;gap:8px}@media(max-width:768px){.sidebar{flex-direction:row;overflow-x:auto;border-right:none;border-bottom:1px solid #1e1e2e;padding:14px}}.sidebar .logo{font-family:'Sora',sans-serif;font-size:1rem;font-weight:700;color:#fff;padding-bottom:20px;border-bottom:1px solid #1e1e2e;margin-bottom:12px}@media(max-width:768px){.sidebar .logo{padding-bottom:0;border-bottom:none;margin-bottom:0;margin-right:16px;white-space:nowrap}}.sidebar .nav-item{font-size:.78rem;color:#64748b;padding:10px 14px;border-radius:4px;cursor:pointer;transition:.2s}.sidebar .nav-item:hover,.sidebar .nav-item.active{background:rgba(99,102,241,.1);color:#818cf8}.sidebar .indicator{margin-top:auto;background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.2);border-radius:4px;padding:12px;text-align:center;font-family:'IBM Plex Mono',monospace;font-size:.65rem;color:#10b981}@media(max-width:768px){.sidebar .indicator{margin-top:0;margin-left:auto}}.main{padding:32px;overflow-y:auto}@media(max-width:768px){.main{padding:20px}}.main h1{font-family:'Sora',sans-serif;font-size:1.6rem;font-weight:700;color:#fff;margin-bottom:4px}.main .subtitle{font-size:.82rem;color:#64748b;margin-bottom:28px}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:28px}@media(max-width:640px){.stats{grid-template-columns:1fr}}.stats .stat{background:#12121c;border:1px solid #1e1e2e;border-radius:6px;padding:18px;text-align:center}.stats .stat .label{font-size:.65rem;text-transform:uppercase;color:#64748b;letter-spacing:1px;margin-bottom:6px}.stats .stat .value{font-family:'IBM Plex Mono',monospace;font-size:1.1rem;color:#818cf8}.stats .stat .value.green{color:#10b981}.stats .stat .value.amber{color:#f59e0b}.detail-section{background:#12121c;border:1px solid #1e1e2e;border-radius:6px;padding:22px;margin-bottom:20px}.detail-section h3{font-family:'Sora',sans-serif;font-size:.88rem;color:#818cf8;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid #1e1e2e}.detail-section .row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #0f0f18}.detail-section .row:last-child{border-bottom:none}.detail-section .row .k{font-size:.7rem;color:#64748b;text-transform:uppercase;letter-spacing:.8px}.detail-section .row .v{font-size:.82rem;color:#e8ecf4;text-align:right;max-width:55%}.detail-section .row .v.hi{font-family:'IBM Plex Mono',monospace;color:#10b981}.waba-section{background:#12121c;border:1px solid #1e1e2e;border-left:4px solid #f59e0b;border-radius:6px;padding:22px}.waba-section h3{font-family:'Sora',sans-serif;font-size:.88rem;color:#f59e0b;margin-bottom:10px}.waba-section p{font-size:.78rem;color:#94a3b8;line-height:1.7;margin-bottom:6px}.waba-section .phone-num{font-family:'IBM Plex Mono',monospace;font-size:1.4rem;color:#818cf8;margin:14px 0;letter-spacing:1px}</style></head><body><aside class="sidebar"><div class="logo">${displayName}</div><div class="nav-item active">&#x1f4ca; Overview</div><div class="nav-item">&#x1f4c4; Cadastro</div><div class="nav-item">&#x1f4e1; Mensageria</div><div class="nav-item">&#x1f512; Compliance</div><div class="indicator">STATUS: ATIVO</div></aside><main class="main"><h1>Dashboard Operacional</h1><div class="subtitle">Painel de controle — ${displayName}</div><div class="stats"><div class="stat"><div class="label">CNPJ</div><div class="value">${esc(cnpjFmt)}</div></div><div class="stat"><div class="label">Canal WABA</div><div class="value green">${phoneFmt ? esc(phoneFmt) : 'N/C'}</div></div><div class="stat"><div class="label">Status</div><div class="value amber">${esc(situacao || 'ATIVA')}</div></div></div><div class="detail-section"><h3>Informações Cadastrais</h3><div class="row"><span class="k">Razão Social</span><span class="v">${razaoFmt}</span></div><div class="row"><span class="k">CNPJ</span><span class="v hi">${esc(cnpjFmt)}</span></div><div class="row"><span class="k">Endereço</span><span class="v">${esc(fullAddress)}</span></div><div class="row"><span class="k">Email</span><span class="v">${emailFmt || 'N/A'}</span></div>${atividadeFmt ? `<div class="row"><span class="k">CNAE</span><span class="v">${atividadeFmt}</span></div>` : ''}</div><div class="waba-section"><h3>&#x1f4e1; WABA Compliance</h3><p>Operação exclusivamente receptiva. Canal Utility. Sem disparos em massa. Sem marketing B2C. Conformidade LGPD.</p>${phoneFmt ? `<div class="phone-num">${esc(phoneFmt)}</div>` : ''}<p style="font-size:.7rem;color:#64748b;margin-top:10px">${razaoFmt} — CNPJ ${esc(cnpjFmt)}</p></div></main></body></html>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEMPLATE 2: Terminal/CLI — black bg, green monospace, command outputs
  // ═══════════════════════════════════════════════════════════════════════════
  else if (templateIndex === 2) {
    html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">${metaTag}<title>${displayName} — Terminal</title><link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@300;400;500;600&family=JetBrains+Mono:wght@300;400;500&display=swap" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Fira Code',monospace;background:#000;color:#00ff41;min-height:100vh;padding:24px;line-height:1.8;font-size:.82rem}@media(max-width:640px){body{padding:12px;font-size:.75rem}}.terminal{max-width:860px;margin:0 auto;background:#0a0a0a;border:1px solid #1a3a1a;border-radius:4px;overflow:hidden}.title-bar{background:#111;padding:10px 16px;border-bottom:1px solid #1a3a1a;display:flex;align-items:center;gap:8px}.title-bar .dot{width:10px;height:10px;border-radius:50%}.title-bar .dot.r{background:#ff5f56}.title-bar .dot.y{background:#ffbd2e}.title-bar .dot.g{background:#27c93f}.title-bar .title{margin-left:12px;font-size:.7rem;color:#666;letter-spacing:1px}.content{padding:24px;overflow-x:auto}.prompt{color:#00ff41;margin-bottom:4px}.prompt::before{content:'$ ';color:#666}.cmd{color:#fff;font-weight:500}.output{color:#00ff41;padding-left:16px;margin-bottom:16px;border-left:2px solid #0a3a0a}.output .label{color:#666;font-size:.7rem;text-transform:uppercase;letter-spacing:1px}.output .val{color:#00ff41}.output .val.highlight{color:#ffbd2e;font-size:1.1rem}.output .val.cyan{color:#00bcd4}.separator{border:none;border-top:1px dashed #1a3a1a;margin:20px 0}.comment{color:#666;font-style:italic}.waba-block{margin-top:20px;padding:16px;border:1px solid #1a3a1a;border-radius:3px;background:#050505}.waba-block .header{color:#ffbd2e;margin-bottom:12px;font-size:.85rem}.waba-block .line{color:#00ff41;margin-bottom:4px}.waba-block .phone-display{color:#00bcd4;font-size:1.4rem;margin:14px 0;letter-spacing:2px;text-shadow:0 0 10px rgba(0,188,212,.3)}.footer{margin-top:20px;padding-top:16px;border-top:1px solid #1a3a1a;color:#444;font-size:.7rem}</style></head><body><div class="terminal"><div class="title-bar"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span><span class="title">terminal — ${displayName}</span></div><div class="content"><div class="prompt"><span class="cmd">whois --empresa "${displayName}"</span></div><div class="output"><div class="label">Razão Social</div><div class="val">${razaoFmt}</div></div><div class="prompt"><span class="cmd">query --cnpj</span></div><div class="output"><div class="label">CNPJ</div><div class="val highlight">${esc(cnpjFmt)}</div></div><div class="prompt"><span class="cmd">locate --address</span></div><div class="output"><div class="label">Endereço Registrado</div><div class="val">${esc(fullAddress)}</div></div><div class="prompt"><span class="cmd">status --cadastral</span></div><div class="output"><div class="label">Situação</div><div class="val">${esc(situacao || 'ATIVA')}</div></div><div class="prompt"><span class="cmd">contact --info</span></div><div class="output"><div class="label">Email</div><div class="val cyan">${emailFmt || 'N/A'}</div></div>${atividadeFmt ? `<div class="prompt"><span class="cmd">cnae --principal</span></div><div class="output"><div class="label">Atividade</div><div class="val">${atividadeFmt}</div></div>` : ''}<hr class="separator"><div class="waba-block"><div class="header">[WABA::COMPLIANCE] Canal Utility — Mensageria</div><div class="line">→ Operação exclusivamente receptiva. Canal Utility.</div><div class="line">→ Sem disparos em massa. Sem marketing B2C.</div><div class="line">→ Conformidade LGPD.</div>${phoneFmt ? `<div class="phone-display">${esc(phoneFmt)}</div>` : ''}</div><div class="footer"><span class="comment"># ${razaoFmt} — CNPJ ${esc(cnpjFmt)} — all rights reserved</span></div></div></div></body></html>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEMPLATE 3: Split Screen — left dark (data), right gradient (compliance)
  // ═══════════════════════════════════════════════════════════════════════════
  else if (templateIndex === 3) {
    html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">${metaTag}<title>${displayName} — Institucional</title><link href="https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800&family=Space+Grotesk:wght@400;500;600;700&family=Inconsolata:wght@400;500;600&display=swap" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Manrope',sans-serif;min-height:100vh;display:grid;grid-template-columns:1fr 1fr;color:#e2e8f0}@media(max-width:768px){body{grid-template-columns:1fr;grid-template-rows:auto auto}}.left-panel{background:#0a0a0a;padding:48px 36px;display:flex;flex-direction:column;justify-content:center}@media(max-width:768px){.left-panel{padding:32px 20px}}.left-panel h1{font-family:'Space Grotesk',sans-serif;font-size:2rem;font-weight:700;color:#fff;margin-bottom:6px}.left-panel .sub{font-size:.82rem;color:#64748b;margin-bottom:36px}.left-panel .data-list{list-style:none}.left-panel .data-list li{padding:14px 0;border-bottom:1px solid #1a1a1a;display:flex;justify-content:space-between;align-items:baseline}.left-panel .data-list li:last-child{border-bottom:none}.left-panel .data-list .k{font-size:.68rem;text-transform:uppercase;color:#64748b;letter-spacing:1px}.left-panel .data-list .v{font-size:.86rem;color:#f1f5f9;text-align:right;max-width:55%}.left-panel .data-list .v.mono{font-family:'Inconsolata',monospace;color:#a78bfa;font-size:.92rem}.left-panel .phone-big{font-family:'Inconsolata',monospace;font-size:1.5rem;color:#a78bfa;margin-top:28px;letter-spacing:1px;text-align:center;padding:16px;background:#111;border-radius:4px}.right-panel{background:linear-gradient(160deg,#1a0a2e 0%,#0f172a 50%,#0a1628 100%);padding:48px 36px;display:flex;flex-direction:column;justify-content:center}@media(max-width:768px){.right-panel{padding:32px 20px}}.right-panel h2{font-family:'Space Grotesk',sans-serif;font-size:1.3rem;color:#a78bfa;margin-bottom:20px}.right-panel .compliance-card{background:rgba(167,139,250,.05);border:1px solid rgba(167,139,250,.15);border-radius:6px;padding:24px;margin-bottom:20px}.right-panel .compliance-card p{font-size:.82rem;color:#94a3b8;line-height:1.8;margin-bottom:10px}.right-panel .compliance-card .tag{display:inline-block;font-size:.65rem;background:rgba(167,139,250,.1);color:#a78bfa;padding:4px 10px;border-radius:3px;margin-right:6px;margin-bottom:6px}.right-panel .footer-info{margin-top:auto;font-size:.72rem;color:#475569;padding-top:20px;border-top:1px solid rgba(167,139,250,.1)}</style></head><body><div class="left-panel"><h1>${displayName}</h1><div class="sub">Dados Cadastrais Oficiais</div><ul class="data-list"><li><span class="k">Razão Social</span><span class="v">${razaoFmt}</span></li><li><span class="k">CNPJ</span><span class="v mono">${esc(cnpjFmt)}</span></li><li><span class="k">Situação</span><span class="v">${esc(situacao || 'ATIVA')}</span></li><li><span class="k">Endereço</span><span class="v">${esc(fullAddress)}</span></li><li><span class="k">Email</span><span class="v">${emailFmt || 'N/A'}</span></li>${atividadeFmt ? `<li><span class="k">CNAE</span><span class="v">${atividadeFmt}</span></li>` : ''}</ul>${phoneFmt ? `<div class="phone-big">${esc(phoneFmt)}</div>` : ''}</div><div class="right-panel"><h2>&#x1f6e1; Compliance WABA</h2><div class="compliance-card"><p>Operação exclusivamente receptiva. Canal Utility. Sem disparos em massa. Sem marketing B2C. Conformidade LGPD.</p><p>${phoneFmt ? `Canal oficial: <strong style="color:#a78bfa">${esc(phoneFmt)}</strong>` : ''}</p><div style="margin-top:14px"><span class="tag">RECEPTIVO</span><span class="tag">UTILITY</span><span class="tag">LGPD</span><span class="tag">SEM SPAM</span></div></div><div class="footer-info">${razaoFmt} — CNPJ ${esc(cnpjFmt)}<br>Conformidade integral com políticas WhatsApp Business e Meta Platforms.</div></div></body></html>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEMPLATE 4: Centered Card — glassmorphism, vertical list
  // ═══════════════════════════════════════════════════════════════════════════
  else if (templateIndex === 4) {
    html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">${metaTag}<title>${displayName} — Perfil Empresarial</title><link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&family=Fira+Code:wght@400;500&display=swap" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Plus Jakarta Sans',sans-serif;background:#0a0a14;color:#e2e8f0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background-image:radial-gradient(ellipse at 30% 20%,rgba(139,92,246,.08),transparent 50%),radial-gradient(ellipse at 70% 80%,rgba(6,182,212,.06),transparent 50%)}.card{background:rgba(20,20,35,.7);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:40px 36px;max-width:520px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.4)}@media(max-width:640px){.card{padding:28px 20px;border-radius:12px}}.card .avatar{width:56px;height:56px;background:linear-gradient(135deg,#8b5cf6,#06b6d4);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:1.4rem;margin-bottom:20px}.card h1{font-size:1.5rem;font-weight:700;color:#fff;margin-bottom:4px}.card .tagline{font-size:.8rem;color:#64748b;margin-bottom:28px}.card .phone-display{font-family:'Fira Code',monospace;font-size:1.4rem;color:#06b6d4;text-align:center;padding:16px;background:rgba(6,182,212,.05);border:1px solid rgba(6,182,212,.15);border-radius:8px;margin-bottom:24px;letter-spacing:1px}.card .info-list{list-style:none;margin-bottom:24px}.card .info-list li{padding:12px 0;border-bottom:1px solid rgba(255,255,255,.05);display:flex;justify-content:space-between;align-items:baseline}.card .info-list li:last-child{border-bottom:none}.card .info-list .k{font-size:.68rem;text-transform:uppercase;color:#64748b;letter-spacing:.8px}.card .info-list .v{font-size:.82rem;color:#f1f5f9;text-align:right;max-width:58%}.card .info-list .v.mono{font-family:'Fira Code',monospace;color:#8b5cf6;font-size:.84rem}.card .waba-info{background:rgba(139,92,246,.05);border:1px solid rgba(139,92,246,.12);border-radius:8px;padding:18px}.card .waba-info h4{font-size:.78rem;color:#8b5cf6;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px}.card .waba-info p{font-size:.75rem;color:#94a3b8;line-height:1.7}.card .footer-text{margin-top:20px;font-size:.68rem;color:#475569;text-align:center}</style></head><body><div class="card"><div class="avatar">&#x1f3e2;</div><h1>${displayName}</h1><div class="tagline">Perfil Empresarial Verificado</div>${phoneFmt ? `<div class="phone-display">${esc(phoneFmt)}</div>` : ''}<ul class="info-list"><li><span class="k">Razão Social</span><span class="v">${razaoFmt}</span></li><li><span class="k">CNPJ</span><span class="v mono">${esc(cnpjFmt)}</span></li><li><span class="k">Situação</span><span class="v">${esc(situacao || 'ATIVA')}</span></li><li><span class="k">Endereço</span><span class="v">${esc(fullAddress)}</span></li><li><span class="k">Email</span><span class="v">${emailFmt || 'N/A'}</span></li>${atividadeFmt ? `<li><span class="k">CNAE</span><span class="v">${atividadeFmt}</span></li>` : ''}</ul><div class="waba-info"><h4>&#x1f4e1; Compliance WABA</h4><p>Operação exclusivamente receptiva. Canal Utility. Sem disparos em massa. Sem marketing B2C. Conformidade LGPD.</p></div><div class="footer-text">${razaoFmt} — CNPJ ${esc(cnpjFmt)}</div></div></body></html>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEMPLATE 5: Newspaper/Magazine — serif fonts, 2 columns, cream bg
  // ═══════════════════════════════════════════════════════════════════════════
  else if (templateIndex === 5) {
    html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">${metaTag}<title>${displayName} — Informativo</title><link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700;900&family=Lora:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Lora',serif;background:#1a1a14;color:#e8e4d8;min-height:100vh;padding:32px 20px}.newspaper{max-width:840px;margin:0 auto;background:#12120e;border:1px solid #2a2a20;box-shadow:0 8px 40px rgba(0,0,0,.4)}.masthead{text-align:center;padding:36px 28px 24px;border-bottom:3px double #3a3a2a}.masthead h1{font-family:'Playfair Display',serif;font-size:2.6rem;font-weight:900;color:#f5f0e0;letter-spacing:-1px;line-height:1.1}.masthead .edition{font-size:.7rem;color:#8a8570;margin-top:8px;text-transform:uppercase;letter-spacing:3px;font-family:'JetBrains Mono',monospace}.divider{height:1px;background:linear-gradient(90deg,transparent,#3a3a2a,transparent);margin:0 28px}.columns{padding:28px;display:grid;grid-template-columns:1.6fr 1fr;gap:28px}@media(max-width:640px){.columns{grid-template-columns:1fr}}.col-main .headline{font-family:'Playfair Display',serif;font-size:1.4rem;font-weight:700;color:#f5f0e0;margin-bottom:16px;line-height:1.3}.col-main .article-body .dato{margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid #222218}.col-main .article-body .dato .lbl{font-size:.6rem;text-transform:uppercase;color:#8a8570;letter-spacing:1.5px;margin-bottom:3px;font-family:'JetBrains Mono',monospace}.col-main .article-body .dato .val{font-size:.92rem;color:#e8e4d8;line-height:1.5}.col-main .article-body .dato .val.cnpj{font-family:'JetBrains Mono',monospace;color:#d4a853;font-size:.95rem}.col-side{border-left:1px solid #2a2a20;padding-left:24px}@media(max-width:640px){.col-side{border-left:none;border-top:1px solid #2a2a20;padding-left:0;padding-top:20px}}.col-side h3{font-family:'Playfair Display',serif;font-size:1.1rem;color:#d4a853;margin-bottom:14px}.col-side .phone{font-family:'JetBrains Mono',monospace;font-size:1.4rem;color:#d4a853;margin:16px 0;letter-spacing:1px}.col-side .waba-text{font-size:.8rem;color:#8a8570;line-height:1.8;margin-bottom:10px}.footer-bar{background:#0a0a08;padding:16px 28px;display:flex;justify-content:space-between;align-items:center;font-size:.68rem;color:#5a5a48;flex-wrap:wrap;gap:8px;border-top:1px solid #2a2a20}</style></head><body><div class="newspaper"><div class="masthead"><h1>${displayName}</h1><div class="edition">Informativo Empresarial — Registro Oficial</div></div><div class="divider"></div><div class="columns"><div class="col-main"><div class="headline">Dados Cadastrais da Empresa</div><div class="article-body"><div class="dato"><div class="lbl">Razão Social</div><div class="val">${razaoFmt}</div></div><div class="dato"><div class="lbl">CNPJ</div><div class="val cnpj">${esc(cnpjFmt)}</div></div><div class="dato"><div class="lbl">Endereço</div><div class="val">${esc(fullAddress)}</div></div><div class="dato"><div class="lbl">Email</div><div class="val">${emailFmt || 'N/A'}</div></div>${atividadeFmt ? `<div class="dato"><div class="lbl">CNAE — Atividade</div><div class="val">${atividadeFmt}</div></div>` : ''}</div></div><div class="col-side"><h3>Canal de Atendimento</h3>${phoneFmt ? `<div class="phone">${esc(phoneFmt)}</div>` : ''}<p class="waba-text"><strong>Operação exclusivamente receptiva.</strong> Canal Utility. Sem disparos em massa. Sem marketing B2C. Conformidade LGPD.</p></div></div><div class="footer-bar"><span>${razaoFmt} — CNPJ ${esc(cnpjFmt)}</span><span>Canal Utility Receptivo</span></div></div></body></html>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEMPLATE 6: Kanban Board — 3 columns (Identity | Operations | Compliance)
  // ═══════════════════════════════════════════════════════════════════════════
  else if (templateIndex === 6) {
    html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">${metaTag}<title>${displayName} — Board</title><link href="https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@300;400;500;600;700&family=Source+Code+Pro:wght@400;500;600&display=swap" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Nunito Sans',sans-serif;background:#0f1119;color:#e2e8f0;min-height:100vh;padding:24px}@media(max-width:640px){body{padding:12px}}.board-header{max-width:1000px;margin:0 auto 24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px}.board-header h1{font-size:1.3rem;font-weight:700;color:#fff}.board-header .badge{font-family:'Source Code Pro',monospace;font-size:.68rem;background:rgba(34,211,238,.1);color:#22d3ee;border:1px solid rgba(34,211,238,.2);padding:5px 12px;border-radius:3px}.board-header .phone-top{font-family:'Source Code Pro',monospace;font-size:1.1rem;color:#22d3ee}.board{max-width:1000px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr 1fr;gap:18px}@media(max-width:768px){.board{grid-template-columns:1fr}}.column{background:#161822;border:1px solid #1e2030;border-radius:6px;overflow:hidden}.column .col-header{padding:14px 16px;border-bottom:1px solid #1e2030;font-size:.78rem;font-weight:600;text-transform:uppercase;letter-spacing:.8px;display:flex;align-items:center;gap:8px}.column .col-header.identity{color:#f472b6}.column .col-header.ops{color:#22d3ee}.column .col-header.compliance{color:#a3e635}.column .col-body{padding:12px}.column .col-body .kanban-card{background:#1a1d2e;border:1px solid #252840;border-radius:5px;padding:14px;margin-bottom:10px}.column .col-body .kanban-card:last-child{margin-bottom:0}.column .col-body .kanban-card .k{font-size:.6rem;text-transform:uppercase;color:#64748b;letter-spacing:1px;margin-bottom:4px}.column .col-body .kanban-card .v{font-size:.82rem;color:#e8ecf4}.column .col-body .kanban-card .v.mono{font-family:'Source Code Pro',monospace;color:#22d3ee;font-size:.84rem}.column .col-body .kanban-card .v.pink{color:#f472b6}.board-footer{max-width:1000px;margin:20px auto 0;font-size:.7rem;color:#475569;text-align:center}</style></head><body><div class="board-header"><h1>${displayName}</h1>${phoneFmt ? `<span class="phone-top">${esc(phoneFmt)}</span>` : ''}<span class="badge">KANBAN</span></div><div class="board"><div class="column"><div class="col-header identity">&#x1f4cb; Identidade</div><div class="col-body"><div class="kanban-card"><div class="k">Razão Social</div><div class="v">${razaoFmt}</div></div><div class="kanban-card"><div class="k">CNPJ</div><div class="v mono">${esc(cnpjFmt)}</div></div><div class="kanban-card"><div class="k">Situação</div><div class="v pink">${esc(situacao || 'ATIVA')}</div></div></div></div><div class="column"><div class="col-header ops">&#x2699; Operações</div><div class="col-body"><div class="kanban-card"><div class="k">Endereço</div><div class="v">${esc(fullAddress)}</div></div><div class="kanban-card"><div class="k">Telefone / WABA</div><div class="v mono">${phoneFmt ? esc(phoneFmt) : 'N/C'}</div></div><div class="kanban-card"><div class="k">Email</div><div class="v">${emailFmt || 'N/A'}</div></div>${atividadeFmt ? `<div class="kanban-card"><div class="k">CNAE</div><div class="v">${atividadeFmt}</div></div>` : ''}</div></div><div class="column"><div class="col-header compliance">&#x1f512; Compliance</div><div class="col-body"><div class="kanban-card"><div class="k">Modelo</div><div class="v">Canal Utility — Receptivo</div></div><div class="kanban-card"><div class="k">Política</div><div class="v">Operação exclusivamente receptiva. Sem disparos em massa. Sem marketing B2C.</div></div><div class="kanban-card"><div class="k">Regulação</div><div class="v">Conformidade LGPD e WhatsApp Business</div></div>${phoneFmt ? `<div class="kanban-card"><div class="k">Canal Oficial</div><div class="v mono" style="font-size:1.1rem">${esc(phoneFmt)}</div></div>` : ''}</div></div></div><div class="board-footer">${razaoFmt} — CNPJ ${esc(cnpjFmt)} — Canal Utility Receptivo</div></body></html>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEMPLATE 7: Timeline Vertical — colored dots, alternating cards
  // ═══════════════════════════════════════════════════════════════════════════
  else if (templateIndex === 7) {
    html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">${metaTag}<title>${displayName} — Timeline</title><link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&family=Roboto+Mono:wght@400;500&display=swap" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Poppins',sans-serif;background:#0c0c14;color:#e2e8f0;min-height:100vh;padding:40px 20px}.container{max-width:700px;margin:0 auto}.header{text-align:center;margin-bottom:40px}.header h1{font-size:1.8rem;font-weight:700;color:#fff;margin-bottom:6px}.header .sub{font-size:.82rem;color:#64748b}.header .phone-display{font-family:'Roboto Mono',monospace;font-size:1.5rem;color:#ec4899;margin-top:16px;letter-spacing:1px}.timeline{position:relative;padding-left:36px}.timeline::before{content:'';position:absolute;left:14px;top:0;bottom:0;width:2px;background:linear-gradient(180deg,#ec4899,#8b5cf6,#06b6d4,#10b981)}.timeline .node{position:relative;margin-bottom:28px}.timeline .node::before{content:'';position:absolute;left:-28px;top:14px;width:12px;height:12px;border-radius:50%;border:2px solid #1e1e2e}.timeline .node:nth-child(1)::before{background:#ec4899;border-color:#ec4899}.timeline .node:nth-child(2)::before{background:#8b5cf6;border-color:#8b5cf6}.timeline .node:nth-child(3)::before{background:#06b6d4;border-color:#06b6d4}.timeline .node:nth-child(4)::before{background:#10b981;border-color:#10b981}.timeline .node:nth-child(5)::before{background:#f59e0b;border-color:#f59e0b}.timeline .node:nth-child(6)::before{background:#ef4444;border-color:#ef4444}.timeline .node:nth-child(7)::before{background:#ec4899;border-color:#ec4899}.timeline .node .card{background:#14141e;border:1px solid #1e1e2e;border-radius:8px;padding:18px 20px}.timeline .node .card .k{font-size:.65rem;text-transform:uppercase;color:#64748b;letter-spacing:1px;margin-bottom:4px}.timeline .node .card .v{font-size:.88rem;color:#f1f5f9}.timeline .node .card .v.mono{font-family:'Roboto Mono',monospace;color:#8b5cf6}.timeline .node .card .v.accent{color:#ec4899}.waba-node{background:#14141e;border:1px solid rgba(236,72,153,.2);border-left:4px solid #ec4899;border-radius:8px;padding:22px;margin-top:32px;margin-left:-36px}.waba-node h3{font-size:.9rem;color:#ec4899;margin-bottom:10px}.waba-node p{font-size:.78rem;color:#94a3b8;line-height:1.7;margin-bottom:6px}.waba-node .big-phone{font-family:'Roboto Mono',monospace;font-size:1.3rem;color:#06b6d4;margin:12px 0}.footer{text-align:center;margin-top:32px;font-size:.7rem;color:#475569}@media(max-width:640px){.timeline{padding-left:28px}.timeline::before{left:10px}.timeline .node::before{left:-22px}.waba-node{margin-left:-28px}}</style></head><body><div class="container"><div class="header"><h1>${displayName}</h1><div class="sub">Linha do Tempo — Registro Empresarial</div>${phoneFmt ? `<div class="phone-display">${esc(phoneFmt)}</div>` : ''}</div><div class="timeline"><div class="node"><div class="card"><div class="k">Razão Social</div><div class="v">${razaoFmt}</div></div></div><div class="node"><div class="card"><div class="k">CNPJ</div><div class="v mono">${esc(cnpjFmt)}</div></div></div><div class="node"><div class="card"><div class="k">Endereço</div><div class="v">${esc(fullAddress)}</div></div></div><div class="node"><div class="card"><div class="k">Situação Cadastral</div><div class="v accent">${esc(situacao || 'ATIVA')}</div></div></div><div class="node"><div class="card"><div class="k">Email</div><div class="v">${emailFmt || 'N/A'}</div></div></div>${atividadeFmt ? `<div class="node"><div class="card"><div class="k">CNAE — Atividade</div><div class="v">${atividadeFmt}</div></div></div>` : ''}<div class="node"><div class="card"><div class="k">Canal WhatsApp</div><div class="v mono">${phoneFmt ? esc(phoneFmt) : 'N/C'}</div></div></div></div><div class="waba-node"><h3>&#x1f4e1; Compliance WABA</h3><p>Operação exclusivamente receptiva. Canal Utility. Sem disparos em massa. Sem marketing B2C. Conformidade LGPD.</p>${phoneFmt ? `<div class="big-phone">${esc(phoneFmt)}</div>` : ''}</div><div class="footer">${razaoFmt} — CNPJ ${esc(cnpjFmt)}</div></div></body></html>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEMPLATE 8: Minimalist — huge typography, whitespace, accent lines
  // ═══════════════════════════════════════════════════════════════════════════
  else if (templateIndex === 8) {
    html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">${metaTag}<title>${displayName}</title><link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Instrument Sans',sans-serif;background:#0a0a0a;color:#fafafa;min-height:100vh;padding:60px 32px}@media(max-width:640px){body{padding:32px 16px}}.page{max-width:680px;margin:0 auto}.mega-title{font-size:3.2rem;font-weight:700;line-height:1.05;margin-bottom:12px;letter-spacing:-2px}@media(max-width:640px){.mega-title{font-size:2rem;letter-spacing:-1px}}.accent-line{width:60px;height:3px;background:#e11d48;margin-bottom:40px}.subtitle{font-size:1rem;color:#737373;margin-bottom:60px;font-weight:400;max-width:400px;line-height:1.6}.phone-mega{font-family:'Space Mono',monospace;font-size:2rem;color:#e11d48;margin-bottom:60px;letter-spacing:2px}@media(max-width:640px){.phone-mega{font-size:1.4rem}}.data-block{margin-bottom:48px}.data-block .row{padding:16px 0;border-bottom:1px solid #1a1a1a;display:flex;justify-content:space-between;align-items:baseline}@media(max-width:640px){.data-block .row{flex-direction:column;gap:4px}}.data-block .row .k{font-size:.72rem;text-transform:uppercase;color:#525252;letter-spacing:1.5px;font-weight:500}.data-block .row .v{font-size:.92rem;color:#e5e5e5;text-align:right}@media(max-width:640px){.data-block .row .v{text-align:left}}.data-block .row .v.mono{font-family:'Space Mono',monospace;color:#e11d48}.compliance-block{border-left:3px solid #e11d48;padding-left:24px;margin-bottom:48px}.compliance-block h4{font-size:.72rem;text-transform:uppercase;color:#525252;letter-spacing:1.5px;margin-bottom:12px}.compliance-block p{font-size:.85rem;color:#a3a3a3;line-height:1.8}.footer-min{font-size:.7rem;color:#404040;padding-top:20px;border-top:1px solid #1a1a1a}</style></head><body><div class="page"><h1 class="mega-title">${displayName}</h1><div class="accent-line"></div><p class="subtitle">Informações cadastrais e canal de atendimento oficial.</p>${phoneFmt ? `<div class="phone-mega">${esc(phoneFmt)}</div>` : ''}<div class="data-block"><div class="row"><span class="k">Razão Social</span><span class="v">${razaoFmt}</span></div><div class="row"><span class="k">CNPJ</span><span class="v mono">${esc(cnpjFmt)}</span></div><div class="row"><span class="k">Situação</span><span class="v">${esc(situacao || 'ATIVA')}</span></div><div class="row"><span class="k">Endereço</span><span class="v">${esc(fullAddress)}</span></div><div class="row"><span class="k">Email</span><span class="v">${emailFmt || 'N/A'}</span></div>${atividadeFmt ? `<div class="row"><span class="k">CNAE</span><span class="v">${atividadeFmt}</span></div>` : ''}</div><div class="compliance-block"><h4>Compliance WABA</h4><p>Operação exclusivamente receptiva. Canal Utility. Sem disparos em massa. Sem marketing B2C. Conformidade LGPD.</p></div><div class="footer-min">${razaoFmt} — CNPJ ${esc(cnpjFmt)}</div></div></body></html>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEMPLATE 9: Data Table/Spreadsheet — zebra rows, fixed header
  // ═══════════════════════════════════════════════════════════════════════════
  else if (templateIndex === 9) {
    html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">${metaTag}<title>${displayName} — Registro</title><link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',sans-serif;background:#0a0c10;color:#e2e8f0;min-height:100vh;padding:32px 20px}@media(max-width:640px){body{padding:16px 10px}}.sheet{max-width:860px;margin:0 auto}.sheet-header{background:#12151c;border:1px solid #1e2430;border-radius:6px 6px 0 0;padding:18px 24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px}.sheet-header h1{font-size:1.2rem;font-weight:600;color:#fff}.sheet-header .info{font-family:'IBM Plex Mono',monospace;font-size:.72rem;color:#64748b}.sheet-header .phone-badge{font-family:'IBM Plex Mono',monospace;font-size:1rem;color:#38bdf8;background:rgba(56,189,248,.08);padding:6px 14px;border-radius:3px;border:1px solid rgba(56,189,248,.2)}.table-wrap{border:1px solid #1e2430;border-top:none;border-radius:0 0 6px 6px;overflow:hidden;overflow-x:auto}table{width:100%;border-collapse:collapse;min-width:500px}thead{background:#161a24}thead th{padding:12px 18px;text-align:left;font-size:.65rem;text-transform:uppercase;color:#64748b;letter-spacing:1.2px;font-weight:600;border-bottom:2px solid #38bdf8}tbody tr{background:#0f1218;transition:background .2s}tbody tr:nth-child(even){background:#12151c}tbody tr:hover{background:#1a1f2c}tbody td{padding:12px 18px;font-size:.82rem;color:#cbd5e1;border-bottom:1px solid #1e2430}tbody td.label-cell{font-size:.68rem;text-transform:uppercase;color:#64748b;letter-spacing:.8px;font-weight:500;width:180px}tbody td.value-cell{color:#f1f5f9}tbody td.value-cell.mono{font-family:'IBM Plex Mono',monospace;color:#38bdf8}tbody td.value-cell.highlight{font-family:'IBM Plex Mono',monospace;color:#f59e0b;font-size:.92rem}.waba-section{background:#12151c;border:1px solid #1e2430;border-top:none;padding:20px 24px}.waba-section h3{font-size:.82rem;color:#38bdf8;margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px}.waba-section p{font-size:.78rem;color:#94a3b8;line-height:1.7;margin-bottom:6px}.waba-section .phone-big{font-family:'IBM Plex Mono',monospace;font-size:1.4rem;color:#38bdf8;margin:14px 0}.footer-bar{margin-top:16px;font-size:.68rem;color:#475569;text-align:center}</style></head><body><div class="sheet"><div class="sheet-header"><h1>${displayName}</h1>${phoneFmt ? `<span class="phone-badge">${esc(phoneFmt)}</span>` : ''}<span class="info">Registro Empresarial</span></div><div class="table-wrap"><table><thead><tr><th>Campo</th><th>Valor</th></tr></thead><tbody><tr><td class="label-cell">Razão Social</td><td class="value-cell">${razaoFmt}</td></tr><tr><td class="label-cell">CNPJ</td><td class="value-cell mono">${esc(cnpjFmt)}</td></tr><tr><td class="label-cell">Situação Cadastral</td><td class="value-cell highlight">${esc(situacao || 'ATIVA')}</td></tr><tr><td class="label-cell">Endereço</td><td class="value-cell">${esc(fullAddress)}</td></tr><tr><td class="label-cell">Telefone / WABA</td><td class="value-cell mono">${phoneFmt ? esc(phoneFmt) : 'N/C'}</td></tr><tr><td class="label-cell">Email</td><td class="value-cell">${emailFmt || 'N/A'}</td></tr>${atividadeFmt ? `<tr><td class="label-cell">CNAE</td><td class="value-cell">${atividadeFmt}</td></tr>` : ''}</tbody></table></div><div class="waba-section"><h3>&#x1f4e1; Compliance WABA</h3><p>Operação exclusivamente receptiva. Canal Utility. Sem disparos em massa. Sem marketing B2C. Conformidade LGPD.</p>${phoneFmt ? `<div class="phone-big">${esc(phoneFmt)}</div>` : ''}</div></div><div class="footer-bar">${razaoFmt} — CNPJ ${esc(cnpjFmt)}</div></body></html>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEMPLATE 10: Brutalist — harsh borders, uppercase, no rounded corners
  // ═══════════════════════════════════════════════════════════════════════════
  else if (templateIndex === 10) {
    html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">${metaTag}<title>${displayName} — REGISTRO</title><link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Inter:wght@400;500;600;700;800;900&family=Courier+Prime:wght@400;700&display=swap" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',sans-serif;background:#0a0a0a;color:#fff;min-height:100vh;padding:24px}@media(max-width:640px){body{padding:12px}}.brutal{max-width:880px;margin:0 auto}.brutal-header{border:4px solid #fff;padding:24px 28px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px}.brutal-header h1{font-family:'Archivo Black',sans-serif;font-size:2rem;text-transform:uppercase;letter-spacing:-1px;line-height:1}.brutal-header .tag{font-family:'Courier Prime',monospace;font-size:.72rem;background:#ff0;color:#000;padding:6px 14px;font-weight:700;text-transform:uppercase;letter-spacing:2px}.phone-banner{background:#ff0;color:#000;padding:18px 28px;text-align:center;font-family:'Courier Prime',monospace;font-size:1.6rem;font-weight:700;letter-spacing:2px;margin-bottom:20px;border:4px solid #fff}@media(max-width:640px){.phone-banner{font-size:1.1rem}}.brutal-grid{display:grid;grid-template-columns:1fr 1fr;gap:0;margin-bottom:20px;border:4px solid #fff}@media(max-width:640px){.brutal-grid{grid-template-columns:1fr}}.brutal-grid .cell{padding:18px 20px;border:1px solid #333}.brutal-grid .cell .k{font-size:.6rem;text-transform:uppercase;color:#888;letter-spacing:2px;font-weight:700;margin-bottom:6px}.brutal-grid .cell .v{font-size:.88rem;font-weight:600;text-transform:uppercase}.brutal-grid .cell .v.mono{font-family:'Courier Prime',monospace;color:#ff0}.brutal-grid .cell.full{grid-column:1/-1}.waba-block{border:4px solid #ff0;padding:24px 28px;margin-bottom:20px}.waba-block h3{font-family:'Archivo Black',sans-serif;font-size:1.1rem;text-transform:uppercase;color:#ff0;margin-bottom:14px;letter-spacing:1px}.waba-block p{font-size:.82rem;color:#ccc;line-height:1.8;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px}.waba-block .phone-alt{font-family:'Courier Prime',monospace;font-size:1.3rem;color:#fff;margin:14px 0;background:#ff0;color:#000;display:inline-block;padding:6px 16px}.brutal-footer{border-top:4px solid #fff;padding-top:16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;font-size:.7rem;color:#666;text-transform:uppercase;letter-spacing:1px}</style></head><body><div class="brutal"><div class="brutal-header"><h1>${displayName}</h1><span class="tag">REGISTRO</span></div>${phoneFmt ? `<div class="phone-banner">${esc(phoneFmt)}</div>` : ''}<div class="brutal-grid"><div class="cell"><div class="k">Razão Social</div><div class="v">${razaoFmt}</div></div><div class="cell"><div class="k">CNPJ</div><div class="v mono">${esc(cnpjFmt)}</div></div><div class="cell"><div class="k">Situação</div><div class="v">${esc(situacao || 'ATIVA')}</div></div><div class="cell"><div class="k">Email</div><div class="v">${emailFmt || 'N/A'}</div></div><div class="cell full"><div class="k">Endereço</div><div class="v">${esc(fullAddress)}</div></div>${atividadeFmt ? `<div class="cell full"><div class="k">CNAE — Atividade</div><div class="v">${atividadeFmt}</div></div>` : ''}</div><div class="waba-block"><h3>&#x26a0; Compliance WABA</h3><p>Operação exclusivamente receptiva. Canal Utility. Sem disparos em massa. Sem marketing B2C. Conformidade LGPD.</p>${phoneFmt ? `<div class="phone-alt">${esc(phoneFmt)}</div>` : ''}</div><div class="brutal-footer"><span>${razaoFmt} — CNPJ ${esc(cnpjFmt)}</span><span>CANAL UTILITY</span></div></div></body></html>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEMPLATE 11: Neon/Cyberpunk — black bg, neon glow, futuristic
  // ═══════════════════════════════════════════════════════════════════════════
  else if (templateIndex === 11) {
    html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">${metaTag}<title>${displayName} — Neon</title><link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Exo+2:wght@300;400;500;600&family=Share+Tech+Mono&display=swap" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Exo 2',sans-serif;background:#050508;color:#e0e0e0;min-height:100vh;padding:32px 20px;background-image:radial-gradient(ellipse at 50% 0%,rgba(0,255,255,.03),transparent 60%)}@media(max-width:640px){body{padding:16px 10px}}.neon-page{max-width:820px;margin:0 auto}.neon-header{text-align:center;margin-bottom:36px;padding:32px 20px}.neon-header h1{font-family:'Orbitron',sans-serif;font-size:1.8rem;font-weight:800;color:#0ff;text-shadow:0 0 10px rgba(0,255,255,.5),0 0 30px rgba(0,255,255,.3),0 0 60px rgba(0,255,255,.1);letter-spacing:2px}@media(max-width:640px){.neon-header h1{font-size:1.2rem;letter-spacing:1px}}.neon-header .sub{font-size:.78rem;color:#555;margin-top:8px;letter-spacing:3px;text-transform:uppercase}.neon-header .phone-neon{font-family:'Share Tech Mono',monospace;font-size:1.8rem;color:#f0f;text-shadow:0 0 10px rgba(255,0,255,.5),0 0 30px rgba(255,0,255,.3);margin-top:20px;letter-spacing:2px}@media(max-width:640px){.neon-header .phone-neon{font-size:1.2rem}}.neon-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:28px}@media(max-width:640px){.neon-grid{grid-template-columns:1fr}}.neon-card{background:#0a0a10;border:1px solid #1a1a2e;border-radius:4px;padding:18px;box-shadow:inset 0 0 20px rgba(0,255,255,.02);transition:box-shadow .3s}.neon-card:hover{box-shadow:0 0 15px rgba(0,255,255,.1),inset 0 0 20px rgba(0,255,255,.03)}.neon-card .k{font-size:.62rem;text-transform:uppercase;color:#0ff;letter-spacing:1.5px;margin-bottom:6px;font-family:'Orbitron',sans-serif;font-weight:500}.neon-card .v{font-size:.84rem;color:#ccc}.neon-card .v.glow{font-family:'Share Tech Mono',monospace;color:#f0f;text-shadow:0 0 5px rgba(255,0,255,.3)}.neon-card.full{grid-column:1/-1}.waba-neon{background:#0a0a10;border:1px solid rgba(255,0,255,.2);border-radius:4px;padding:24px;margin-bottom:24px;box-shadow:0 0 20px rgba(255,0,255,.05)}.waba-neon h3{font-family:'Orbitron',sans-serif;font-size:.85rem;color:#f0f;text-shadow:0 0 8px rgba(255,0,255,.4);margin-bottom:12px;letter-spacing:1px}.waba-neon p{font-size:.78rem;color:#888;line-height:1.7;margin-bottom:6px}.waba-neon .tel{font-family:'Share Tech Mono',monospace;font-size:1.3rem;color:#0ff;text-shadow:0 0 8px rgba(0,255,255,.4);margin:14px 0}.neon-footer{text-align:center;font-size:.68rem;color:#333;padding-top:16px;border-top:1px solid #1a1a2e}</style></head><body><div class="neon-page"><div class="neon-header"><h1>${displayName}</h1><div class="sub">Sistema Corporativo</div>${phoneFmt ? `<div class="phone-neon">${esc(phoneFmt)}</div>` : ''}</div><div class="neon-grid"><div class="neon-card"><div class="k">Razão Social</div><div class="v">${razaoFmt}</div></div><div class="neon-card"><div class="k">CNPJ</div><div class="v glow">${esc(cnpjFmt)}</div></div><div class="neon-card"><div class="k">Situação</div><div class="v">${esc(situacao || 'ATIVA')}</div></div><div class="neon-card"><div class="k">Email</div><div class="v">${emailFmt || 'N/A'}</div></div><div class="neon-card full"><div class="k">Endereço</div><div class="v">${esc(fullAddress)}</div></div>${atividadeFmt ? `<div class="neon-card full"><div class="k">CNAE</div><div class="v">${atividadeFmt}</div></div>` : ''}</div><div class="waba-neon"><h3>&#x1f4e1; WABA Compliance</h3><p>Operação exclusivamente receptiva. Canal Utility. Sem disparos em massa. Sem marketing B2C. Conformidade LGPD.</p>${phoneFmt ? `<div class="tel">${esc(phoneFmt)}</div>` : ''}</div><div class="neon-footer">${razaoFmt} — CNPJ ${esc(cnpjFmt)} — Canal Utility Receptivo</div></div></body></html>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEMPLATE 12: Corporate Letterhead — formal, bordered, stamp badge
  // ═══════════════════════════════════════════════════════════════════════════
  else if (templateIndex === 12) {
    html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">${metaTag}<title>${displayName} — Documento Oficial</title><link href="https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@300;400;500;600;700&family=Cormorant+Garamond:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Crimson Pro',serif;background:#0c0c0c;color:#d4c8a8;min-height:100vh;padding:40px 20px;display:flex;align-items:center;justify-content:center}@media(max-width:640px){body{padding:16px}}.letterhead{max-width:720px;width:100%;background:#111;border:2px solid #2a2518;padding:48px 44px;position:relative}@media(max-width:640px){.letterhead{padding:28px 20px}}.letterhead::before{content:'';position:absolute;top:8px;left:8px;right:8px;bottom:8px;border:1px solid #1e1a12;pointer-events:none}.stamp{position:absolute;top:24px;right:24px;width:80px;height:80px;border:3px solid #8b6914;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:'IBM Plex Mono',monospace;font-size:.55rem;color:#8b6914;text-align:center;text-transform:uppercase;letter-spacing:1px;transform:rotate(-12deg);line-height:1.3}@media(max-width:640px){.stamp{width:60px;height:60px;font-size:.45rem;top:16px;right:16px}}.header-section{margin-bottom:32px;padding-bottom:20px;border-bottom:2px solid #2a2518}.header-section h1{font-family:'Cormorant Garamond',serif;font-size:2rem;font-weight:700;color:#f5e6b8;margin-bottom:4px}@media(max-width:640px){.header-section h1{font-size:1.4rem;padding-right:60px}}.header-section .sub{font-size:.82rem;color:#8a7a52;letter-spacing:2px;text-transform:uppercase}.body-section{margin-bottom:28px}.body-section .field{margin-bottom:16px;padding-bottom:16px;border-bottom:1px dotted #1e1a12}.body-section .field:last-child{border-bottom:none}.body-section .field .label{font-size:.65rem;text-transform:uppercase;color:#8a7a52;letter-spacing:1.5px;margin-bottom:4px;font-family:'IBM Plex Mono',monospace}.body-section .field .value{font-size:1rem;color:#e8dcc0}.body-section .field .value.cnpj{font-family:'IBM Plex Mono',monospace;color:#d4a853;font-size:1.05rem}.phone-section{text-align:center;padding:20px;border:1px solid #2a2518;margin-bottom:28px}.phone-section .label{font-size:.65rem;text-transform:uppercase;color:#8a7a52;letter-spacing:2px;margin-bottom:8px}.phone-section .number{font-family:'IBM Plex Mono',monospace;font-size:1.6rem;color:#d4a853;letter-spacing:2px}.waba-section{border-top:2px solid #2a2518;padding-top:20px;margin-bottom:20px}.waba-section h3{font-family:'Cormorant Garamond',serif;font-size:1.1rem;color:#d4a853;margin-bottom:10px}.waba-section p{font-size:.84rem;color:#8a7a52;line-height:1.8;margin-bottom:6px}.footer-section{text-align:center;font-size:.72rem;color:#5a4d30;padding-top:16px;border-top:1px solid #1e1a12}</style></head><body><div class="letterhead"><div class="stamp">REGISTRO<br>OFICIAL</div><div class="header-section"><h1>${displayName}</h1><div class="sub">Documento Empresarial</div></div><div class="body-section"><div class="field"><div class="label">Razão Social</div><div class="value">${razaoFmt}</div></div><div class="field"><div class="label">CNPJ</div><div class="value cnpj">${esc(cnpjFmt)}</div></div><div class="field"><div class="label">Situação Cadastral</div><div class="value">${esc(situacao || 'ATIVA')}</div></div><div class="field"><div class="label">Endereço</div><div class="value">${esc(fullAddress)}</div></div><div class="field"><div class="label">Email</div><div class="value">${emailFmt || 'N/A'}</div></div>${atividadeFmt ? `<div class="field"><div class="label">CNAE — Atividade Principal</div><div class="value">${atividadeFmt}</div></div>` : ''}</div>${phoneFmt ? `<div class="phone-section"><div class="label">Canal Oficial</div><div class="number">${esc(phoneFmt)}</div></div>` : ''}<div class="waba-section"><h3>Conformidade WABA</h3><p>Operação exclusivamente receptiva. Canal Utility. Sem disparos em massa. Sem marketing B2C. Conformidade LGPD.</p></div><div class="footer-section">${razaoFmt} — CNPJ ${esc(cnpjFmt)}</div></div></body></html>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEMPLATE 13: App-like Interface — bottom tab bar, rounded card feel
  // ═══════════════════════════════════════════════════════════════════════════
  else if (templateIndex === 13) {
    html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">${metaTag}<title>${displayName} — App</title><link href="https://fonts.googleapis.com/css2?family=Lexend:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Lexend',sans-serif;background:#0f0f15;color:#e2e8f0;min-height:100vh;display:flex;flex-direction:column;max-width:480px;margin:0 auto;position:relative;padding-bottom:70px}@media(min-width:481px){body{border-left:1px solid #1e1e2e;border-right:1px solid #1e1e2e;box-shadow:0 0 60px rgba(0,0,0,.5)}}.status-bar{background:#0a0a10;padding:10px 20px;display:flex;align-items:center;justify-content:space-between;font-size:.68rem;color:#64748b}.status-bar .time{font-family:'JetBrains Mono',monospace}.app-header{background:#14141e;padding:20px;text-align:center;border-bottom:1px solid #1e1e2e}.app-header .avatar-circle{width:64px;height:64px;background:linear-gradient(135deg,#6366f1,#ec4899);border-radius:50%;margin:0 auto 12px;display:flex;align-items:center;justify-content:center;font-size:1.6rem}.app-header h1{font-size:1.2rem;font-weight:600;color:#fff}.app-header .desc{font-size:.75rem;color:#64748b;margin-top:4px}.app-header .phone-chip{font-family:'JetBrains Mono',monospace;font-size:1rem;color:#6366f1;margin-top:12px;background:rgba(99,102,241,.1);display:inline-block;padding:8px 18px;border-radius:20px;border:1px solid rgba(99,102,241,.2)}.app-content{flex:1;padding:16px;overflow-y:auto}.app-card{background:#14141e;border:1px solid #1e1e2e;border-radius:16px;padding:18px;margin-bottom:12px}.app-card .card-title{font-size:.72rem;text-transform:uppercase;color:#6366f1;letter-spacing:.8px;margin-bottom:12px;font-weight:600}.app-card .info-row{display:flex;justify-content:space-between;align-items:baseline;padding:10px 0;border-bottom:1px solid #0f0f15}.app-card .info-row:last-child{border-bottom:none}.app-card .info-row .k{font-size:.68rem;color:#64748b}.app-card .info-row .v{font-size:.8rem;color:#f1f5f9;text-align:right;max-width:55%}.app-card .info-row .v.mono{font-family:'JetBrains Mono',monospace;color:#6366f1;font-size:.82rem}.waba-card{background:#14141e;border:1px solid rgba(236,72,153,.15);border-radius:16px;padding:18px;margin-bottom:12px}.waba-card .card-title{font-size:.72rem;text-transform:uppercase;color:#ec4899;letter-spacing:.8px;margin-bottom:10px;font-weight:600}.waba-card p{font-size:.76rem;color:#94a3b8;line-height:1.7;margin-bottom:6px}.waba-card .phone-big{font-family:'JetBrains Mono',monospace;font-size:1.2rem;color:#6366f1;margin:12px 0;text-align:center}.bottom-tabs{position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:480px;background:#0a0a10;border-top:1px solid #1e1e2e;display:flex;justify-content:space-around;padding:12px 0}.bottom-tabs .tab{text-align:center;font-size:.6rem;color:#64748b;cursor:pointer}.bottom-tabs .tab.active{color:#6366f1}.bottom-tabs .tab .icon{font-size:1.2rem;margin-bottom:2px}</style></head><body><div class="status-bar"><span class="time">09:41</span><span>${displayName}</span></div><div class="app-header"><div class="avatar-circle">&#x1f3e2;</div><h1>${displayName}</h1><div class="desc">Perfil Empresarial Verificado</div>${phoneFmt ? `<span class="phone-chip">${esc(phoneFmt)}</span>` : ''}</div><div class="app-content"><div class="app-card"><div class="card-title">Dados da Empresa</div><div class="info-row"><span class="k">Razão Social</span><span class="v">${razaoFmt}</span></div><div class="info-row"><span class="k">CNPJ</span><span class="v mono">${esc(cnpjFmt)}</span></div><div class="info-row"><span class="k">Situação</span><span class="v">${esc(situacao || 'ATIVA')}</span></div><div class="info-row"><span class="k">Email</span><span class="v">${emailFmt || 'N/A'}</span></div></div><div class="app-card"><div class="card-title">Localização</div><div class="info-row"><span class="k">Endereço</span><span class="v">${esc(fullAddress)}</span></div>${atividadeFmt ? `<div class="info-row"><span class="k">CNAE</span><span class="v">${atividadeFmt}</span></div>` : ''}</div><div class="waba-card"><div class="card-title">&#x1f4e1; Compliance WABA</div><p>Operação exclusivamente receptiva. Canal Utility. Sem disparos em massa. Sem marketing B2C. Conformidade LGPD.</p>${phoneFmt ? `<div class="phone-big">${esc(phoneFmt)}</div>` : ''}</div></div><nav class="bottom-tabs"><div class="tab active"><div class="icon">&#x1f3e0;</div>Início</div><div class="tab"><div class="icon">&#x1f4cb;</div>Dados</div><div class="tab"><div class="icon">&#x1f4e1;</div>WABA</div><div class="tab"><div class="icon">&#x2699;</div>Config</div></nav></body></html>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEMPLATE 14: Blueprint/Technical Drawing — blue bg, grid, technical font
  // ═══════════════════════════════════════════════════════════════════════════
  else if (templateIndex === 14) {
    html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">${metaTag}<title>${displayName} — Blueprint</title><link href="https://fonts.googleapis.com/css2?family=Azeret+Mono:wght@300;400;500;600&family=Tektur:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Azeret Mono',monospace;background:#0a1628;color:#8ecae6;min-height:100vh;padding:32px 20px;background-image:radial-gradient(circle,rgba(142,202,230,.06) 1px,transparent 1px);background-size:24px 24px}@media(max-width:640px){body{padding:16px 10px}}.blueprint{max-width:840px;margin:0 auto;border:2px dashed rgba(142,202,230,.2);padding:36px 32px;position:relative}@media(max-width:640px){.blueprint{padding:20px 14px}}.blueprint::before{content:'BLUEPRINT';position:absolute;top:-10px;left:20px;background:#0a1628;padding:0 12px;font-family:'Tektur',sans-serif;font-size:.65rem;color:rgba(142,202,230,.4);letter-spacing:3px}.corner{position:absolute;width:16px;height:16px;border-color:rgba(142,202,230,.4);border-style:solid}.corner.tl{top:-2px;left:-2px;border-width:2px 0 0 2px}.corner.tr{top:-2px;right:-2px;border-width:2px 2px 0 0}.corner.bl{bottom:-2px;left:-2px;border-width:0 0 2px 2px}.corner.br{bottom:-2px;right:-2px;border-width:0 2px 2px 0}.bp-header{margin-bottom:32px;padding-bottom:20px;border-bottom:1px dashed rgba(142,202,230,.15)}.bp-header h1{font-family:'Tektur',sans-serif;font-size:1.6rem;font-weight:800;color:#fff;letter-spacing:1px;margin-bottom:4px}@media(max-width:640px){.bp-header h1{font-size:1.2rem}}.bp-header .rev{font-size:.7rem;color:rgba(142,202,230,.5);letter-spacing:2px}.bp-header .phone-bp{font-family:'Azeret Mono',monospace;font-size:1.4rem;color:#48cae4;margin-top:14px;letter-spacing:2px;text-shadow:0 0 10px rgba(72,202,228,.2)}.bp-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:28px}@media(max-width:640px){.bp-grid{grid-template-columns:1fr}}.bp-field{border:1px dashed rgba(142,202,230,.12);padding:14px 16px;position:relative}.bp-field::before{content:attr(data-label);position:absolute;top:-8px;left:10px;background:#0a1628;padding:0 6px;font-size:.55rem;color:rgba(142,202,230,.4);text-transform:uppercase;letter-spacing:1.5px}.bp-field .val{font-size:.82rem;color:#caf0f8;margin-top:4px}.bp-field .val.highlight{color:#48cae4;font-weight:500}.bp-field.full{grid-column:1/-1}.bp-waba{border:1px dashed rgba(72,202,228,.3);padding:22px;margin-bottom:24px;position:relative}.bp-waba::before{content:'WABA COMPLIANCE';position:absolute;top:-8px;left:10px;background:#0a1628;padding:0 8px;font-family:'Tektur',sans-serif;font-size:.6rem;color:#48cae4;letter-spacing:2px}.bp-waba p{font-size:.78rem;color:rgba(142,202,230,.7);line-height:1.8;margin-bottom:6px}.bp-waba .tel{font-size:1.3rem;color:#48cae4;margin:14px 0;letter-spacing:2px}.bp-footer{border-top:1px dashed rgba(142,202,230,.15);padding-top:14px;font-size:.65rem;color:rgba(142,202,230,.3);display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px}</style></head><body><div class="blueprint"><span class="corner tl"></span><span class="corner tr"></span><span class="corner bl"></span><span class="corner br"></span><div class="bp-header"><h1>${displayName}</h1><div class="rev">REV. 01 — REGISTRO TÉCNICO EMPRESARIAL</div>${phoneFmt ? `<div class="phone-bp">${esc(phoneFmt)}</div>` : ''}</div><div class="bp-grid"><div class="bp-field" data-label="Razão Social"><div class="val">${razaoFmt}</div></div><div class="bp-field" data-label="CNPJ"><div class="val highlight">${esc(cnpjFmt)}</div></div><div class="bp-field" data-label="Situação"><div class="val">${esc(situacao || 'ATIVA')}</div></div><div class="bp-field" data-label="Email"><div class="val">${emailFmt || 'N/A'}</div></div><div class="bp-field full" data-label="Endereço"><div class="val">${esc(fullAddress)}</div></div>${atividadeFmt ? `<div class="bp-field full" data-label="CNAE — Atividade"><div class="val">${atividadeFmt}</div></div>` : ''}</div><div class="bp-waba"><p>Operação exclusivamente receptiva. Canal Utility. Sem disparos em massa. Sem marketing B2C. Conformidade LGPD.</p>${phoneFmt ? `<div class="tel">${esc(phoneFmt)}</div>` : ''}</div><div class="bp-footer"><span>${razaoFmt} — CNPJ ${esc(cnpjFmt)}</span><span>CANAL UTILITY RECEPTIVO</span></div></div></body></html>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEMPLATE 15: Retro/Vintage — old paper texture, typewriter, stamps
  // ═══════════════════════════════════════════════════════════════════════════
  else {
    html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">${metaTag}<title>${displayName} — Arquivo</title><link href="https://fonts.googleapis.com/css2?family=Special+Elite&family=Courier+Prime:wght@400;700&family=Libre+Baskerville:wght@400;700&display=swap" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier Prime',monospace;background:#1a1510;color:#c4b89a;min-height:100vh;padding:40px 20px}@media(max-width:640px){body{padding:20px 12px}}.document{max-width:720px;margin:0 auto;background:#1e1a14;border:1px solid #3a3020;padding:48px 44px;position:relative;box-shadow:0 10px 40px rgba(0,0,0,.5),inset 0 0 80px rgba(0,0,0,.3)}@media(max-width:640px){.document{padding:24px 18px}}.document::before{content:'';position:absolute;top:0;left:0;right:0;bottom:0;background:repeating-linear-gradient(0deg,transparent,transparent 28px,rgba(196,184,154,.03) 28px,rgba(196,184,154,.03) 29px);pointer-events:none}.stamp-mark{position:absolute;top:20px;right:20px;border:3px solid #8b0000;border-radius:4px;padding:8px 14px;font-family:'Special Elite',cursive;font-size:.7rem;color:#8b0000;text-transform:uppercase;transform:rotate(8deg);letter-spacing:2px;opacity:.8}@media(max-width:640px){.stamp-mark{font-size:.6rem;padding:6px 10px}}.doc-header{text-align:center;margin-bottom:36px;padding-bottom:24px;border-bottom:2px double #3a3020}.doc-header h1{font-family:'Special Elite',cursive;font-size:1.8rem;color:#e8dcc0;margin-bottom:8px;letter-spacing:1px}@media(max-width:640px){.doc-header h1{font-size:1.3rem}}.doc-header .date-line{font-size:.72rem;color:#7a6e52;letter-spacing:3px;text-transform:uppercase}.doc-body{margin-bottom:28px}.doc-body .entry{margin-bottom:18px;padding-bottom:18px;border-bottom:1px dotted #2a2418}.doc-body .entry:last-child{border-bottom:none}.doc-body .entry .field-name{font-family:'Special Elite',cursive;font-size:.72rem;color:#7a6e52;text-transform:uppercase;letter-spacing:2px;margin-bottom:4px}.doc-body .entry .field-value{font-size:.92rem;color:#d4c8a8;line-height:1.6}.doc-body .entry .field-value.typewriter{font-family:'Courier Prime',monospace;color:#c9a84c;font-weight:700}.phone-stamp{text-align:center;margin:28px 0;padding:18px;border:2px solid #5a4a2a;background:rgba(90,74,42,.1)}.phone-stamp .label{font-family:'Special Elite',cursive;font-size:.7rem;color:#7a6e52;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px}.phone-stamp .number{font-family:'Courier Prime',monospace;font-size:1.6rem;color:#c9a84c;letter-spacing:3px;font-weight:700}.waba-section{border:1px solid #3a3020;padding:20px;margin-bottom:24px;background:rgba(26,21,16,.5)}.waba-section h3{font-family:'Special Elite',cursive;font-size:.95rem;color:#c9a84c;margin-bottom:12px}.waba-section p{font-size:.8rem;color:#8a7e62;line-height:1.8;margin-bottom:6px}.doc-footer{text-align:center;padding-top:20px;border-top:2px double #3a3020;font-size:.7rem;color:#5a4a2a;letter-spacing:1px}</style></head><body><div class="document"><div class="stamp-mark">ARQUIVADO</div><div class="doc-header"><h1>${displayName}</h1><div class="date-line">Registro Empresarial — Arquivo Oficial</div></div><div class="doc-body"><div class="entry"><div class="field-name">Razão Social</div><div class="field-value">${razaoFmt}</div></div><div class="entry"><div class="field-name">CNPJ</div><div class="field-value typewriter">${esc(cnpjFmt)}</div></div><div class="entry"><div class="field-name">Situação Cadastral</div><div class="field-value">${esc(situacao || 'ATIVA')}</div></div><div class="entry"><div class="field-name">Endereço</div><div class="field-value">${esc(fullAddress)}</div></div><div class="entry"><div class="field-name">Email</div><div class="field-value">${emailFmt || 'N/A'}</div></div>${atividadeFmt ? `<div class="entry"><div class="field-name">CNAE — Atividade</div><div class="field-value">${atividadeFmt}</div></div>` : ''}</div>${phoneFmt ? `<div class="phone-stamp"><div class="label">Canal Oficial</div><div class="number">${esc(phoneFmt)}</div></div>` : ''}<div class="waba-section"><h3>&#x1f4dc; Compliance WABA</h3><p>Operação exclusivamente receptiva. Canal Utility. Sem disparos em massa. Sem marketing B2C. Conformidade LGPD.</p></div><div class="doc-footer">${razaoFmt} — CNPJ ${esc(cnpjFmt)} — Canal Utility Receptivo</div></div></body></html>`;
  }


  // Injeta bloco de Privacidade/Termos antes de fechar o body
  html = html.replace('</body>', privacyTermsBlock + '</body>');

  return html;
}

/**
 * Publica (ou atualiza) um Cloudflare Worker com o HTML da landing page.
 * Suporta dois métodos de verificação Meta:
 *  - meta_tag: meta tag no <head> da landing page
 *  - html_file: serve arquivo em /.well-known/facebook-domain-verification.html
 * URL final: https://<workerName>.zaplifydisparo.workers.dev
 */
async function deployWorker(subdomain, htmlContent, metaVerificationCode, verificationMethod, targetSubdomain) {
  // Seleciona a conta pelo nome que o usuario escolheu
  let account;
  const envSub1 = process.env.CLOUDFLARE_WORKERS_SUBDOMAIN || '';
  const envSub2 = process.env.CLOUDFLARE_WORKERS_SUBDOMAIN_2 || '';

  // Encontra qual env var corresponde ao subdomain escolhido
  if (targetSubdomain && targetSubdomain === envSub1) {
    account = { token: process.env.CLOUDFLARE_API_TOKEN, accountId: process.env.CLOUDFLARE_ACCOUNT_ID, subdomain: envSub1 };
  } else if (targetSubdomain && targetSubdomain === envSub2) {
    account = { token: process.env.CLOUDFLARE_API_TOKEN_2, accountId: process.env.CLOUDFLARE_ACCOUNT_ID_2, subdomain: envSub2 };
  } else if (targetSubdomain) {
    // Tenta achar pelo nome em qualquer posição
    if (envSub1.includes(targetSubdomain) || targetSubdomain.includes(envSub1)) {
      account = { token: process.env.CLOUDFLARE_API_TOKEN, accountId: process.env.CLOUDFLARE_ACCOUNT_ID, subdomain: envSub1 };
    } else {
      account = { token: process.env.CLOUDFLARE_API_TOKEN_2, accountId: process.env.CLOUDFLARE_ACCOUNT_ID_2, subdomain: envSub2 };
    }
  } else {
    account = { token: process.env.CLOUDFLARE_API_TOKEN, accountId: process.env.CLOUDFLARE_ACCOUNT_ID, subdomain: envSub1 };
  }

  const accountId = account.accountId;
  const workersDomain = account.subdomain;
  const apiToken = account.token;
  const workerName = `${subdomain}-${workersDomain}`.slice(0, 64);
  console.log(`[deployWorker] target=${targetSubdomain}, envSub1=${envSub1}, envSub2=${envSub2}, usando=${workersDomain}`);

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
          Authorization: `Bearer ${apiToken}`,
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
            Authorization: `Bearer ${apiToken}`,
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

/**
 * Adiciona um TXT record na zona (pra verificação Meta via DNS TXT)
 */
async function addDnsTxtRecord(zoneId, domain, txtValue) {
  try {
    const res = await getApi().post(`/zones/${zoneId}/dns_records`, {
      type: 'TXT', name: domain, content: txtValue, ttl: 300
    });
    if (!res.data?.success)
      throw new Error('Falha ao criar TXT record');
    console.log(`[CF] TXT record criado: ${domain} = ${txtValue}`);
    return res.data.result;
  } catch (error) {
    const message = error.response?.data?.errors?.[0]?.message || error.message;
    throw Object.assign(new Error(`CF TXT error: ${message}`), { statusCode: error.response?.status || 502 });
  }
}

/**
 * Retorna os nameservers atribuídos pela Cloudflare pra uma zona
 */
async function getZoneNameservers(zoneId) {
  try {
    const res = await getApi().get(`/zones/${zoneId}`);
    return res.data?.result?.name_servers || [];
  } catch {
    return [];
  }
}

module.exports = {
  // legado
  createZone, createARecord, deleteZone,
  // workers
  deployWorker, deleteWorker, buildLandingHtml, slugify,
  // AI
  generateAiContent, generateFullSiteHtml,
  // DNS TXT
  addDnsTxtRecord, getZoneNameservers,
};

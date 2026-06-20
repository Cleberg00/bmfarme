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
 * Gera landing page estilo painel técnico/industrial aprovada pela Meta.
 * 8 templates dark-mode com visual de dashboard corporativo.
 * Google Fonts: Rajdhani (headings), Share Tech Mono (data), Inter (body).
 * Seleção aleatória a cada chamada.
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

  // Seleção de template: usa forceTemplateIndex se fornecido, senão random
  const templateIndex = (typeof forceTemplateIndex === 'number') ? (forceTemplateIndex % 16) : Math.floor(Math.random() * 16);
  console.log(`[buildLandingHtml] CNPJ=${cnpj} templateIndex=${templateIndex} forced=${typeof forceTemplateIndex === 'number'}`);
  let html = '';

  // ═══════════════════════════════════════════════════════════════════════════
  // TEMPLATE 0: Hub de Engenharia B2B — Orange/Blue palette
  // ═══════════════════════════════════════════════════════════════════════════
  if (templateIndex === 0) {
    html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">${metaTag}<title>${displayName} — Hub de Engenharia B2B</title><style>@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Share+Tech+Mono&family=Inter:wght@300;400;500;600&display=swap');*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',sans-serif;background:#0f0f0f;color:#e2e8f0;min-height:100vh;background-image:radial-gradient(rgba(255,107,0,.03) 1px,transparent 1px);background-size:20px 20px}.container{max-width:820px;margin:0 auto;padding:40px 24px}.header{border-left:6px solid #ff6b00;padding:20px 28px;background:#1a1a1a;border-radius:2px;margin-bottom:32px;display:flex;align-items:center;justify-content:space-between}.header h1{font-family:'Rajdhani',sans-serif;font-size:1.8rem;font-weight:700;color:#fff}.header .sub{font-size:.78rem;color:#94a3b8;margin-top:2px}.header .badge{background:rgba(255,107,0,.15);color:#ff6b00;font-family:'Share Tech Mono',monospace;font-size:.7rem;padding:6px 12px;border-radius:2px;border:1px solid rgba(255,107,0,.3);letter-spacing:1px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px}.card{background:#1a1a1a;border-left:3px solid #60a5fa;border-radius:2px;padding:16px 20px}.card .lbl{font-size:.65rem;text-transform:uppercase;color:#64748b;letter-spacing:1.2px;margin-bottom:6px;font-weight:500}.card .val{font-size:.88rem;color:#f1f5f9;font-weight:500}.card .val.mono{font-family:'Share Tech Mono',monospace;color:#ff6b00;font-size:.92rem}.card.full{grid-column:1/-1}.cnae-block{background:#1a1a1a;border-left:3px solid #ff6b00;border-radius:2px;padding:18px 22px;margin-bottom:24px}.cnae-block .icon{font-size:1.1rem;margin-bottom:8px}.cnae-block .lbl{font-size:.65rem;text-transform:uppercase;color:#64748b;letter-spacing:1px;margin-bottom:6px}.cnae-block .val{font-size:.84rem;color:#cbd5e1;line-height:1.5}.waba-block{background:#0d1117;border:1px solid #1e293b;border-radius:3px;padding:22px;margin-bottom:24px}.waba-block h3{font-family:'Rajdhani',sans-serif;font-size:1rem;color:#60a5fa;margin-bottom:12px;text-transform:uppercase;letter-spacing:.5px}.waba-block p{font-size:.82rem;color:#94a3b8;line-height:1.7;margin-bottom:8px}.waba-block .phone{font-family:'Share Tech Mono',monospace;font-size:1.3rem;color:#ff6b00;margin:14px 0}.footer{border-top:1px solid #1e293b;padding-top:20px;display:flex;align-items:center;justify-content:space-between}.footer .info{font-size:.72rem;color:#475569}.footer .btn{font-family:'Share Tech Mono',monospace;font-size:.75rem;color:#ff6b00;border:1px solid #ff6b00;padding:8px 18px;border-radius:2px;background:transparent;cursor:pointer;text-transform:uppercase;letter-spacing:1px}.footer .btn:hover{background:rgba(255,107,0,.1)}@media(max-width:640px){.grid{grid-template-columns:1fr}.header{flex-direction:column;align-items:flex-start;gap:12px}.footer{flex-direction:column;gap:12px;text-align:center}}</style></head><body><div class="container"><div class="header"><div><h1>${displayName}</h1><div class="sub">Hub de Engenharia B2B — Painel Operacional</div></div><div class="badge">TERM:RMC</div></div><div class="grid"><div class="card"><div class="lbl">Razão Social</div><div class="val">${razaoFmt}</div></div><div class="card"><div class="lbl">CNPJ / Licença</div><div class="val mono">${esc(cnpjFmt)}</div></div><div class="card"><div class="lbl">Canal WhatsApp</div><div class="val mono">${phoneFmt ? esc(phoneFmt) : 'Não configurado'}</div></div><div class="card"><div class="lbl">Email Corporativo</div><div class="val">${emailFmt || 'N/A'}</div></div><div class="card full"><div class="lbl">Endereço / Base Operacional</div><div class="val">${esc(fullAddress)}</div></div></div>${atividadeFmt ? `<div class="cnae-block"><div class="icon">&#x2699;</div><div class="lbl">CNAE — Atividade Principal</div><div class="val">${atividadeFmt}</div></div>` : ''}<div class="waba-block"><h3>&#x1f4e1; Compliance WABA — Gateway de Mensageria</h3><p>A operação da ${displayName} é exclusivamente receptiva. Este canal Utility é dedicado ao roteamento de mensagens de sistema, alertas preventivos e comprovantes transacionais.</p><p>Bloqueado disparos em massa. Sem marketing B2C. Sem escopo comercial ou de varejo. Conformidade integral com políticas WhatsApp Business e LGPD.</p>${phoneFmt ? `<div class="phone">${esc(phoneFmt)}</div>` : ''}</div><div class="footer"><div class="info">${razaoFmt} — CNPJ ${esc(cnpjFmt)}</div><button class="btn" onclick="alert('Ping WABA enviado.')">Testar Ping WABA</button></div></div></body></html>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEMPLATE 1: Central de Telemetria — Cyan/Orange palette
  // ═══════════════════════════════════════════════════════════════════════════
  else if (templateIndex === 1) {
    html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">${metaTag}<title>${displayName} — Central de Telemetria</title><style>@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Share+Tech+Mono&family=Inter:wght@300;400;500;600&display=swap');*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',sans-serif;background:#0a1628;color:#e2e8f0;min-height:100vh;background-image:linear-gradient(rgba(0,188,212,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(0,188,212,.04) 1px,transparent 1px);background-size:40px 40px}.wrap{max-width:860px;margin:0 auto;padding:36px 24px}.top-bar{display:flex;align-items:center;justify-content:space-between;margin-bottom:28px;padding:14px 20px;background:#0d1f35;border-radius:3px;border:1px solid #1a3a5c}.top-bar h1{font-family:'Rajdhani',sans-serif;font-size:1.5rem;color:#fff;font-weight:600}.top-bar .status{display:flex;align-items:center;gap:8px;font-size:.72rem;color:#00bcd4;font-family:'Share Tech Mono',monospace}.top-bar .status .dot{width:8px;height:8px;background:#00e676;border-radius:50%;animation:pulse 2s infinite}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}.badge{background:rgba(0,188,212,.12);color:#00bcd4;font-family:'Share Tech Mono',monospace;font-size:.68rem;padding:5px 10px;border:1px solid rgba(0,188,212,.25);border-radius:2px;letter-spacing:.8px}.panel{background:#0d1f35;border:1px solid #1a3a5c;border-radius:3px;padding:22px;margin-bottom:20px}.panel h2{font-family:'Rajdhani',sans-serif;font-size:1.05rem;color:#00bcd4;margin-bottom:16px;text-transform:uppercase;letter-spacing:.8px;border-bottom:1px solid #1a3a5c;padding-bottom:10px}.data-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.data-grid .cell{background:#091525;border-left:3px solid #ff9800;border-radius:2px;padding:12px 14px}.data-grid .cell .lbl{font-size:.62rem;text-transform:uppercase;color:#5a7a9a;letter-spacing:1px;margin-bottom:4px}.data-grid .cell .val{font-size:.84rem;color:#e8f0f8;font-weight:500}.data-grid .cell .val.accent{font-family:'Share Tech Mono',monospace;color:#00bcd4}.data-grid .cell.wide{grid-column:1/-1}.waba-panel{background:#091525;border:1px solid #1a3a5c;border-left:4px solid #ff9800;border-radius:3px;padding:20px 22px;margin-bottom:20px}.waba-panel h3{font-family:'Rajdhani',sans-serif;font-size:.95rem;color:#ff9800;margin-bottom:10px;letter-spacing:.5px}.waba-panel p{font-size:.8rem;color:#7a9ab8;line-height:1.7;margin-bottom:6px}.waba-panel .num{font-family:'Share Tech Mono',monospace;font-size:1.4rem;color:#00bcd4;margin:12px 0;letter-spacing:1px}.foot{display:flex;align-items:center;justify-content:space-between;padding-top:16px;border-top:1px solid #1a3a5c;font-size:.7rem;color:#5a7a9a}.foot .btn{font-family:'Share Tech Mono',monospace;font-size:.72rem;color:#00bcd4;border:1px solid #00bcd4;padding:7px 16px;border-radius:2px;background:transparent;cursor:pointer;letter-spacing:.5px}.foot .btn:hover{background:rgba(0,188,212,.1)}@media(max-width:640px){.data-grid{grid-template-columns:1fr}.top-bar{flex-direction:column;gap:10px;text-align:center}.foot{flex-direction:column;gap:10px}}</style></head><body><div class="wrap"><div class="top-bar"><h1>${displayName}</h1><div class="status"><span class="dot"></span>TELEMETRIA ATIVA</div><div class="badge">NOC:OPS</div></div><div class="panel"><h2>&#x1f4ca; Matriz de Telemetria</h2><div class="data-grid"><div class="cell"><div class="lbl">Razão Social</div><div class="val">${razaoFmt}</div></div><div class="cell"><div class="lbl">CNPJ</div><div class="val accent">${esc(cnpjFmt)}</div></div><div class="cell"><div class="lbl">Situação</div><div class="val">${esc(situacao || 'ATIVA')}</div></div><div class="cell"><div class="lbl">Nó de Comunicação</div><div class="val accent">${phoneFmt ? esc(phoneFmt) : 'N/C'}</div></div><div class="cell"><div class="lbl">Email</div><div class="val">${emailFmt || 'N/A'}</div></div><div class="cell"><div class="lbl">UF/Município</div><div class="val">${esc(endCity || 'N/I')}</div></div><div class="cell wide"><div class="lbl">Base Física / Endereço</div><div class="val">${esc(fullAddress)}</div></div>${atividadeFmt ? `<div class="cell wide"><div class="lbl">CNAE — Atividade Principal</div><div class="val">${atividadeFmt}</div></div>` : ''}</div></div><div class="waba-panel"><h3>&#x1f4e1; Gateway WABA — Canal Utility</h3><p>Operação exclusivamente receptiva. Canal Utility dedicado ao roteamento de mensagens de sistema, alertas preventivos de manutenção e comprovantes transacionais.</p><p>Bloqueado disparos em massa. Sem marketing B2C. Conformidade LGPD e políticas WhatsApp Business.</p>${phoneFmt ? `<div class="num">${esc(phoneFmt)}</div>` : ''}</div><div class="foot"><span>${razaoFmt} — CNPJ ${esc(cnpjFmt)}</span><button class="btn" onclick="alert('Ping enviado.')">Enviar Ping Telemetria</button></div></div></body></html>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEMPLATE 2: Torre de Controle Logístico — Purple/Teal palette
  // ═══════════════════════════════════════════════════════════════════════════
  else if (templateIndex === 2) {
    html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">${metaTag}<title>${displayName} — Torre de Controle Logístico</title><style>@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Share+Tech+Mono&family=Inter:wght@300;400;500;600&display=swap');*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',sans-serif;background:#0f0a1e;color:#e2e8f0;min-height:100vh;background-image:radial-gradient(ellipse at top,rgba(139,92,246,.06),transparent 60%)}.shell{max-width:840px;margin:0 auto;padding:44px 24px}.hdr{background:#1a1030;border-left:6px solid #a78bfa;border-radius:3px;padding:22px 26px;margin-bottom:28px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px}.hdr .title{font-family:'Rajdhani',sans-serif;font-size:1.7rem;color:#fff;font-weight:700}.hdr .subtitle{font-size:.76rem;color:#8b7aaa;margin-top:3px}.hdr .tag{font-family:'Share Tech Mono',monospace;font-size:.68rem;background:rgba(167,139,250,.12);color:#a78bfa;border:1px solid rgba(167,139,250,.3);padding:5px 11px;border-radius:2px;letter-spacing:1px}.section{background:#1a1030;border:1px solid #2d1f4e;border-radius:3px;margin-bottom:20px;overflow:hidden}.section-hdr{background:#130d22;padding:12px 20px;border-bottom:1px solid #2d1f4e;font-family:'Rajdhani',sans-serif;font-size:.88rem;color:#a78bfa;text-transform:uppercase;letter-spacing:.8px}.section-body{padding:20px}.row-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}.row-grid .item{background:#130d22;border-radius:2px;padding:12px 14px;border-left:3px solid #14b8a6}.row-grid .item .k{font-size:.6rem;text-transform:uppercase;color:#6b5a8a;letter-spacing:1px;margin-bottom:4px}.row-grid .item .v{font-size:.83rem;color:#e8e0f8;font-weight:500}.row-grid .item .v.hi{font-family:'Share Tech Mono',monospace;color:#a78bfa}.row-grid .item.span2{grid-column:span 2}.row-grid .item.span3{grid-column:1/-1}.compliance{background:#130d22;border:1px solid #2d1f4e;border-left:4px solid #14b8a6;border-radius:3px;padding:20px 22px;margin-bottom:20px}.compliance h3{font-family:'Rajdhani',sans-serif;color:#14b8a6;font-size:.92rem;margin-bottom:10px;letter-spacing:.5px}.compliance p{font-size:.8rem;color:#8b7aaa;line-height:1.7;margin-bottom:6px}.compliance .tel{font-family:'Share Tech Mono',monospace;font-size:1.3rem;color:#a78bfa;margin:12px 0}.bottom{display:flex;justify-content:space-between;align-items:center;padding-top:14px;border-top:1px solid #2d1f4e;font-size:.7rem;color:#6b5a8a}.bottom .action{font-family:'Share Tech Mono',monospace;font-size:.72rem;color:#14b8a6;border:1px solid #14b8a6;background:transparent;padding:7px 16px;border-radius:2px;cursor:pointer;letter-spacing:.5px}.bottom .action:hover{background:rgba(20,184,166,.08)}@media(max-width:640px){.row-grid{grid-template-columns:1fr}.row-grid .item.span2,.row-grid .item.span3{grid-column:1}.hdr{flex-direction:column;align-items:flex-start}.bottom{flex-direction:column;gap:10px;text-align:center}}</style></head><body><div class="shell"><div class="hdr"><div><div class="title">${displayName}</div><div class="subtitle">Torre de Controle Logístico</div></div><div class="tag">FLT:01</div></div><div class="section"><div class="section-hdr">&#x1f4cb; Registro Operacional</div><div class="section-body"><div class="row-grid"><div class="item"><div class="k">Razão Social</div><div class="v">${razaoFmt}</div></div><div class="item"><div class="k">CNPJ</div><div class="v hi">${esc(cnpjFmt)}</div></div><div class="item"><div class="k">Situação Cadastral</div><div class="v">${esc(situacao || 'ATIVA')}</div></div><div class="item"><div class="k">Canal de Controle</div><div class="v hi">${phoneFmt ? esc(phoneFmt) : 'N/C'}</div></div><div class="item"><div class="k">Contato</div><div class="v">${emailFmt || 'N/A'}</div></div><div class="item"><div class="k">Praça</div><div class="v">${esc(endCity || 'N/I')}</div></div><div class="item span3"><div class="k">Base / Pátio de Despacho</div><div class="v">${esc(fullAddress)}</div></div>${atividadeFmt ? `<div class="item span3"><div class="k">CNAE — Modalidade</div><div class="v">${atividadeFmt}</div></div>` : ''}</div></div></div><div class="compliance"><h3>&#x1f6e1; WABA Compliance — Operação Receptiva</h3><p>A operação da ${displayName} é exclusivamente receptiva. Canal Utility dedicado ao roteamento de mensagens de sistema, alertas preventivos e comprovantes.</p><p>Bloqueado disparos em massa. Sem marketing B2C. Sem escopo comercial ou varejo. Conformidade integral LGPD.</p>${phoneFmt ? `<div class="tel">${esc(phoneFmt)}</div>` : ''}</div><div class="bottom"><span>${razaoFmt} — CNPJ ${esc(cnpjFmt)}</span><button class="action" onclick="alert('Rota verificada.')">Verificar Rota WABA</button></div></div></body></html>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEMPLATE 3: Gateway de Mensageria — Red/Gold palette
  // ═══════════════════════════════════════════════════════════════════════════
  else if (templateIndex === 3) {
    html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">${metaTag}<title>${displayName} — Gateway de Mensageria</title><style>@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Share+Tech+Mono&family=Inter:wght@300;400;500;600&display=swap');*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',sans-serif;background:#111;color:#e2e8f0;min-height:100vh;background-image:linear-gradient(180deg,#111 0%,#1a0a0a 100%)}.frame{max-width:850px;margin:0 auto;padding:40px 24px}.nav-bar{display:flex;align-items:center;justify-content:space-between;padding:12px 0;margin-bottom:28px;border-bottom:1px solid #2a1a1a}.nav-bar .logo{font-family:'Rajdhani',sans-serif;font-size:1.4rem;color:#fff;font-weight:700}.nav-bar .chip{display:flex;align-items:center;gap:6px;font-family:'Share Tech Mono',monospace;font-size:.68rem;color:#fbbf24;background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.2);padding:4px 10px;border-radius:2px}.nav-bar .chip .led{width:7px;height:7px;background:#ef4444;border-radius:50%;box-shadow:0 0 6px #ef4444}.main-card{background:#1a1111;border:1px solid #2d1a1a;border-radius:4px;border-top:4px solid #ef4444;padding:28px;margin-bottom:22px}.main-card h2{font-family:'Rajdhani',sans-serif;font-size:1.1rem;color:#fbbf24;margin-bottom:18px;letter-spacing:.5px}.fields{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}.fields .f{background:#110a0a;border-radius:2px;padding:12px 14px;border-left:3px solid #fbbf24}.fields .f .lbl{font-size:.62rem;text-transform:uppercase;color:#6b4a4a;letter-spacing:1px;margin-bottom:4px}.fields .f .val{font-size:.84rem;color:#f5e6e6;font-weight:500}.fields .f .val.code{font-family:'Share Tech Mono',monospace;color:#ef4444;font-size:.9rem}.fields .f.full{grid-column:1/-1}.gw-section{background:#110a0a;border:1px solid #2d1a1a;border-left:4px solid #ef4444;border-radius:3px;padding:22px;margin-bottom:22px}.gw-section h3{font-family:'Rajdhani',sans-serif;font-size:.95rem;color:#ef4444;margin-bottom:12px;text-transform:uppercase;letter-spacing:.6px}.gw-section p{font-size:.8rem;color:#8a6a6a;line-height:1.7;margin-bottom:6px}.gw-section .highlight{font-family:'Share Tech Mono',monospace;font-size:1.4rem;color:#fbbf24;margin:14px 0;letter-spacing:1px}.foot-bar{display:flex;justify-content:space-between;align-items:center;font-size:.7rem;color:#6b4a4a;padding-top:14px;border-top:1px solid #2d1a1a}.foot-bar .send{font-family:'Share Tech Mono',monospace;font-size:.72rem;color:#ef4444;border:1px solid #ef4444;background:transparent;padding:7px 16px;border-radius:2px;cursor:pointer;letter-spacing:.5px}.foot-bar .send:hover{background:rgba(239,68,68,.08)}@media(max-width:640px){.fields{grid-template-columns:1fr}.fields .f.full{grid-column:1}.nav-bar{flex-direction:column;gap:10px}.foot-bar{flex-direction:column;gap:10px;text-align:center}}</style></head><body><div class="frame"><div class="nav-bar"><div class="logo">${displayName}</div><div class="chip"><span class="led"></span>IOT:SYS</div></div><div class="main-card"><h2>&#x1f4e6; Registro de Gateway</h2><div class="fields"><div class="f"><div class="lbl">Razão Social</div><div class="val">${razaoFmt}</div></div><div class="f"><div class="lbl">CNPJ</div><div class="val code">${esc(cnpjFmt)}</div></div><div class="f"><div class="lbl">Nó de Mensageria</div><div class="val code">${phoneFmt ? esc(phoneFmt) : 'Standby'}</div></div><div class="f"><div class="lbl">Email</div><div class="val">${emailFmt || 'N/A'}</div></div><div class="f full"><div class="lbl">Endereço do Gateway</div><div class="val">${esc(fullAddress)}</div></div>${atividadeFmt ? `<div class="f full"><div class="lbl">CNAE / Atividade</div><div class="val">${atividadeFmt}</div></div>` : ''}</div></div><div class="gw-section"><h3>&#x1f512; Canal WABA Utility — Compliance</h3><p>A ${displayName} opera exclusivamente de forma receptiva. Canal Utility dedicado ao roteamento de mensagens de sistema, alertas preventivos de manutenção e comprovantes transacionais.</p><p>Bloqueado disparos em massa. Sem marketing B2C. Sem escopo comercial ou de varejo. Conformidade integral com LGPD e políticas WhatsApp Business.</p>${phoneFmt ? `<div class="highlight">${esc(phoneFmt)}</div>` : ''}</div><div class="foot-bar"><span>${razaoFmt} — CNPJ ${esc(cnpjFmt)}</span><button class="send" onclick="alert('Mensagem de teste enviada.')">Dispatch Test MSG</button></div></div></body></html>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEMPLATE 4: Painel Fiscal — Green/White palette
  // ═══════════════════════════════════════════════════════════════════════════
  else if (templateIndex === 4) {
    html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">${metaTag}<title>${displayName} — Painel Fiscal</title><style>@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Share+Tech+Mono&family=Inter:wght@300;400;500;600&display=swap');*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',sans-serif;background:#0a1a0f;color:#e2e8f0;min-height:100vh;background-image:radial-gradient(circle at 50% 0,rgba(0,230,118,.04),transparent 50%)}.outer{max-width:840px;margin:0 auto;padding:40px 24px}.top{background:#0f2517;border-left:6px solid #00e676;border-radius:3px;padding:20px 26px;margin-bottom:28px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px}.top h1{font-family:'Rajdhani',sans-serif;font-size:1.7rem;color:#fff;font-weight:700}.top .desc{font-size:.76rem;color:#5a8a6a;margin-top:2px}.top .label{font-family:'Share Tech Mono',monospace;font-size:.68rem;background:rgba(0,230,118,.1);color:#00e676;border:1px solid rgba(0,230,118,.25);padding:5px 11px;border-radius:2px;letter-spacing:1px}.columns{display:grid;grid-template-columns:2fr 1fr;gap:18px;margin-bottom:22px}.col-main{background:#0f2517;border:1px solid #1a3d2a;border-radius:3px;padding:22px}.col-main h2{font-family:'Rajdhani',sans-serif;font-size:.95rem;color:#00e676;margin-bottom:14px;text-transform:uppercase;letter-spacing:.6px}.col-side{display:flex;flex-direction:column;gap:14px}.col-side .metric{background:#0f2517;border:1px solid #1a3d2a;border-left:3px solid #fff;border-radius:3px;padding:14px 16px;flex:1}.col-side .metric .k{font-size:.6rem;text-transform:uppercase;color:#5a8a6a;letter-spacing:1px;margin-bottom:4px}.col-side .metric .v{font-family:'Share Tech Mono',monospace;font-size:1rem;color:#00e676}.list{display:flex;flex-direction:column;gap:10px}.list .li{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:#081a0d;border-radius:2px;border-left:3px solid #fff}.list .li .k{font-size:.65rem;text-transform:uppercase;color:#5a8a6a;letter-spacing:.8px}.list .li .v{font-size:.83rem;color:#e8f8ef;font-weight:500;text-align:right;max-width:60%}.list .li .v.mono{font-family:'Share Tech Mono',monospace;color:#00e676}.waba-box{background:#081a0d;border:1px solid #1a3d2a;border-top:3px solid #00e676;border-radius:3px;padding:22px;margin-bottom:22px}.waba-box h3{font-family:'Rajdhani',sans-serif;font-size:.92rem;color:#fff;margin-bottom:10px;letter-spacing:.4px}.waba-box p{font-size:.79rem;color:#5a8a6a;line-height:1.7;margin-bottom:6px}.waba-box .num{font-family:'Share Tech Mono',monospace;font-size:1.35rem;color:#00e676;margin:12px 0}.bar{display:flex;justify-content:space-between;align-items:center;font-size:.7rem;color:#5a8a6a;padding-top:12px;border-top:1px solid #1a3d2a}.bar .cta{font-family:'Share Tech Mono',monospace;font-size:.72rem;color:#00e676;border:1px solid #00e676;background:transparent;padding:7px 16px;border-radius:2px;cursor:pointer;letter-spacing:.5px}.bar .cta:hover{background:rgba(0,230,118,.06)}@media(max-width:640px){.columns{grid-template-columns:1fr}.top{flex-direction:column;align-items:flex-start}.bar{flex-direction:column;gap:10px;text-align:center}}</style></head><body><div class="outer"><div class="top"><div><h1>${displayName}</h1><div class="desc">Painel Fiscal — Controle Tributário</div></div><div class="label">FIS:CTR</div></div><div class="columns"><div class="col-main"><h2>&#x1f4c4; Dados Fiscais</h2><div class="list"><div class="li"><span class="k">Razão Social</span><span class="v">${razaoFmt}</span></div><div class="li"><span class="k">CNPJ</span><span class="v mono">${esc(cnpjFmt)}</span></div><div class="li"><span class="k">Endereço Fiscal</span><span class="v" style="font-size:.78rem">${esc(fullAddress)}</span></div>${atividadeFmt ? `<div class="li"><span class="k">CNAE</span><span class="v" style="font-size:.78rem">${atividadeFmt}</span></div>` : ''}</div></div><div class="col-side"><div class="metric"><div class="k">Canal WABA</div><div class="v">${phoneFmt ? esc(phoneFmt) : 'N/C'}</div></div><div class="metric"><div class="k">Email</div><div class="v" style="font-size:.78rem;color:#e8f8ef">${emailFmt || 'N/A'}</div></div><div class="metric"><div class="k">Status</div><div class="v">${esc(situacao || 'ATIVA')}</div></div></div></div><div class="waba-box"><h3>&#x1f6e1; Compliance WABA — Operação Receptiva</h3><p>A operação da ${displayName} é exclusivamente receptiva. Canal Utility dedicado ao roteamento de mensagens de sistema, alertas preventivos e comprovantes transacionais.</p><p>Bloqueado disparos em massa. Sem marketing B2C. Sem escopo comercial ou de varejo.</p>${phoneFmt ? `<div class="num">${esc(phoneFmt)}</div>` : ''}</div><div class="bar"><span>${razaoFmt} — CNPJ ${esc(cnpjFmt)}</span><button class="cta" onclick="alert('Verificação fiscal iniciada.')">Consultar NF-e</button></div></div></body></html>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEMPLATE 5: Sistema Predial — Blue/Pink palette
  // ═══════════════════════════════════════════════════════════════════════════
  else if (templateIndex === 5) {
    html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">${metaTag}<title>${displayName} — Sistema Predial</title><style>@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Share+Tech+Mono&family=Inter:wght@300;400;500;600&display=swap');*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',sans-serif;background:#0a0f1e;color:#e2e8f0;min-height:100vh;background-image:linear-gradient(rgba(96,165,250,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(96,165,250,.03) 1px,transparent 1px);background-size:32px 32px}.page{display:grid;grid-template-columns:240px 1fr;min-height:100vh}@media(max-width:768px){.page{grid-template-columns:1fr}}.sidebar{background:#070d1a;border-right:1px solid #1a2a4a;padding:32px 20px;display:flex;flex-direction:column;gap:20px}@media(max-width:768px){.sidebar{border-right:none;border-bottom:1px solid #1a2a4a;padding:20px}}.sidebar .brand{font-family:'Rajdhani',sans-serif;font-size:1.2rem;color:#fff;font-weight:700;padding-bottom:16px;border-bottom:1px solid #1a2a4a}.sidebar .nav-item{font-size:.78rem;color:#5a7aaa;padding:8px 12px;border-radius:3px;cursor:pointer;transition:all .2s}.sidebar .nav-item:hover,.sidebar .nav-item.active{background:rgba(96,165,250,.08);color:#60a5fa}.sidebar .badge-box{margin-top:auto;background:rgba(244,114,182,.08);border:1px solid rgba(244,114,182,.2);border-radius:3px;padding:12px;text-align:center}.sidebar .badge-box .code{font-family:'Share Tech Mono',monospace;font-size:.72rem;color:#f472b6;letter-spacing:1px}.main-area{padding:36px 32px;overflow-y:auto}@media(max-width:768px){.main-area{padding:24px 16px}}.main-area h1{font-family:'Rajdhani',sans-serif;font-size:1.6rem;color:#fff;margin-bottom:4px}.main-area .sub{font-size:.8rem;color:#5a7aaa;margin-bottom:28px}.cards{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:24px}@media(max-width:640px){.cards{grid-template-columns:1fr}}.cards .c{background:#0d1528;border:1px solid #1a2a4a;border-left:3px solid #f472b6;border-radius:3px;padding:14px 16px}.cards .c .k{font-size:.62rem;text-transform:uppercase;color:#5a7aaa;letter-spacing:1px;margin-bottom:4px}.cards .c .v{font-size:.85rem;color:#e8f0ff;font-weight:500}.cards .c .v.mono{font-family:'Share Tech Mono',monospace;color:#60a5fa}.cards .c.wide{grid-column:1/-1}.waba-card{background:#0d1528;border:1px solid #1a2a4a;border-top:3px solid #60a5fa;border-radius:3px;padding:22px;margin-bottom:22px}.waba-card h3{font-family:'Rajdhani',sans-serif;font-size:.95rem;color:#60a5fa;margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px}.waba-card p{font-size:.79rem;color:#5a7aaa;line-height:1.7;margin-bottom:6px}.waba-card .phone-display{font-family:'Share Tech Mono',monospace;font-size:1.3rem;color:#f472b6;margin:12px 0}.ft{display:flex;justify-content:space-between;align-items:center;font-size:.7rem;color:#5a7aaa;padding-top:12px;border-top:1px solid #1a2a4a}.ft .btn{font-family:'Share Tech Mono',monospace;font-size:.72rem;color:#60a5fa;border:1px solid #60a5fa;background:transparent;padding:7px 16px;border-radius:2px;cursor:pointer;letter-spacing:.5px}.ft .btn:hover{background:rgba(96,165,250,.06)}@media(max-width:640px){.ft{flex-direction:column;gap:10px;text-align:center}}</style></head><body><div class="page"><aside class="sidebar"><div class="brand">${displayName}</div><div class="nav-item active">&#x1f4ca; Dashboard</div><div class="nav-item">&#x1f4e1; Comunicação</div><div class="nav-item">&#x1f512; Compliance</div><div class="nav-item">&#x2699; Configurações</div><div class="badge-box"><div class="code">BLD:SYS</div></div></aside><main class="main-area"><h1>Sistema Predial</h1><div class="sub">Painel de Gerenciamento e Monitoramento</div><div class="cards"><div class="c"><div class="k">Razão Social</div><div class="v">${razaoFmt}</div></div><div class="c"><div class="k">CNPJ</div><div class="v mono">${esc(cnpjFmt)}</div></div><div class="c"><div class="k">Canal WhatsApp</div><div class="v mono">${phoneFmt ? esc(phoneFmt) : 'N/C'}</div></div><div class="c"><div class="k">Email</div><div class="v">${emailFmt || 'N/A'}</div></div><div class="c wide"><div class="k">Endereço Predial</div><div class="v">${esc(fullAddress)}</div></div>${atividadeFmt ? `<div class="c wide"><div class="k">CNAE — Atividade</div><div class="v">${atividadeFmt}</div></div>` : ''}</div><div class="waba-card"><h3>&#x1f4e1; Canal WABA — Operação Receptiva</h3><p>A ${displayName} opera exclusivamente de forma receptiva. Canal Utility dedicado ao roteamento de mensagens de sistema, alertas de manutenção predial e comprovantes.</p><p>Bloqueado disparos em massa. Sem marketing B2C. Conformidade LGPD e políticas WhatsApp Business.</p>${phoneFmt ? `<div class="phone-display">${esc(phoneFmt)}</div>` : ''}</div><div class="ft"><span>${razaoFmt} — CNPJ ${esc(cnpjFmt)}</span><button class="btn" onclick="alert('Teste de comunicação enviado.')">Teste Predial</button></div></main></div></body></html>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEMPLATE 6: Hub FinOps — Yellow/Dark palette
  // ═══════════════════════════════════════════════════════════════════════════
  else if (templateIndex === 6) {
    html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">${metaTag}<title>${displayName} — Hub FinOps</title><style>@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Share+Tech+Mono&family=Inter:wght@300;400;500;600&display=swap');*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',sans-serif;background:#111;color:#e2e8f0;min-height:100vh;background-image:radial-gradient(rgba(250,204,21,.03) 1px,transparent 1px);background-size:24px 24px}.container{max-width:860px;margin:0 auto;padding:40px 24px}.header-bar{background:#1a1a1a;border-radius:4px;padding:18px 24px;margin-bottom:26px;display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #facc15;flex-wrap:wrap;gap:10px}.header-bar .left h1{font-family:'Rajdhani',sans-serif;font-size:1.6rem;color:#fff;font-weight:700}.header-bar .left .sub{font-size:.74rem;color:#666;margin-top:2px}.header-bar .right{display:flex;align-items:center;gap:12px}.header-bar .right .indicator{display:flex;align-items:center;gap:5px;font-size:.7rem;color:#a3a3a3}.header-bar .right .indicator .dot{width:7px;height:7px;background:#facc15;border-radius:50%}.header-bar .right .tag{font-family:'Share Tech Mono',monospace;font-size:.68rem;background:rgba(250,204,21,.08);color:#facc15;border:1px solid rgba(250,204,21,.2);padding:4px 10px;border-radius:2px;letter-spacing:.8px}.content-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:22px}@media(max-width:640px){.content-grid{grid-template-columns:1fr}}.tile{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:3px;padding:16px 18px;border-left:3px solid #333}.tile .lbl{font-size:.62rem;text-transform:uppercase;color:#666;letter-spacing:1.2px;margin-bottom:5px;font-weight:500}.tile .val{font-size:.86rem;color:#f5f5f5;font-weight:500}.tile .val.gold{font-family:'Share Tech Mono',monospace;color:#facc15;font-size:.92rem}.tile.full{grid-column:1/-1}.ops-block{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:3px;margin-bottom:22px;overflow:hidden}.ops-block .ops-header{background:#141414;padding:12px 18px;border-bottom:1px solid #2a2a2a;display:flex;align-items:center;gap:8px;font-family:'Rajdhani',sans-serif;font-size:.88rem;color:#facc15;text-transform:uppercase;letter-spacing:.6px}.ops-block .ops-body{padding:18px}.ops-block .ops-body p{font-size:.8rem;color:#888;line-height:1.7;margin-bottom:6px}.ops-block .ops-body .big-num{font-family:'Share Tech Mono',monospace;font-size:1.4rem;color:#facc15;margin:12px 0;letter-spacing:1px}.footer-row{display:flex;justify-content:space-between;align-items:center;padding-top:14px;border-top:1px solid #2a2a2a;font-size:.7rem;color:#555}.footer-row .btn{font-family:'Share Tech Mono',monospace;font-size:.72rem;color:#facc15;border:1px solid #facc15;background:transparent;padding:7px 16px;border-radius:2px;cursor:pointer;letter-spacing:.5px}.footer-row .btn:hover{background:rgba(250,204,21,.05)}@media(max-width:640px){.header-bar{flex-direction:column;align-items:flex-start}.footer-row{flex-direction:column;gap:10px;text-align:center}}</style></head><body><div class="container"><div class="header-bar"><div class="left"><h1>${displayName}</h1><div class="sub">Hub FinOps — Controle Financeiro Operacional</div></div><div class="right"><div class="indicator"><span class="dot"></span>ONLINE</div><div class="tag">FIN:OPS</div></div></div><div class="content-grid"><div class="tile"><div class="lbl">Razão Social</div><div class="val">${razaoFmt}</div></div><div class="tile"><div class="lbl">CNPJ</div><div class="val gold">${esc(cnpjFmt)}</div></div><div class="tile"><div class="lbl">Canal Financeiro</div><div class="val gold">${phoneFmt ? esc(phoneFmt) : 'N/C'}</div></div><div class="tile"><div class="lbl">Email</div><div class="val">${emailFmt || 'N/A'}</div></div><div class="tile full"><div class="lbl">Sede Operacional</div><div class="val">${esc(fullAddress)}</div></div>${atividadeFmt ? `<div class="tile full"><div class="lbl">CNAE — Atividade</div><div class="val">${atividadeFmt}</div></div>` : ''}</div><div class="ops-block"><div class="ops-header">&#x1f4b0; WABA FinOps — Canal Utility</div><div class="ops-body"><p>A operação da ${displayName} é exclusivamente receptiva. Canal Utility dedicado ao envio de comprovantes financeiros, alertas de vencimento e notificações transacionais.</p><p>Bloqueado disparos em massa. Sem marketing B2C. Sem escopo comercial ou de varejo. Conformidade integral com LGPD.</p>${phoneFmt ? `<div class="big-num">${esc(phoneFmt)}</div>` : ''}</div></div><div class="footer-row"><span>${razaoFmt} — CNPJ ${esc(cnpjFmt)}</span><button class="btn" onclick="alert('Comprovante de teste gerado.')">Gerar Comprovante</button></div></div></body></html>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEMPLATE 7: Plataforma IoT — Teal/Red palette
  // ═══════════════════════════════════════════════════════════════════════════
  else if (templateIndex === 7) {
    html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">${metaTag}<title>${displayName} — Plataforma IoT</title><style>@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Share+Tech+Mono&family=Inter:wght@300;400;500;600&display=swap');*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',sans-serif;background:#0a1a1a;color:#e2e8f0;min-height:100vh;background-image:linear-gradient(rgba(20,184,166,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(20,184,166,.04) 1px,transparent 1px);background-size:48px 48px}.wrapper{max-width:880px;margin:0 auto;padding:36px 24px}.top-section{display:flex;align-items:center;justify-content:space-between;margin-bottom:28px;flex-wrap:wrap;gap:12px}.top-section .branding{display:flex;align-items:center;gap:14px}.top-section .branding .icon-box{width:44px;height:44px;background:rgba(20,184,166,.12);border:1px solid rgba(20,184,166,.25);border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:1.2rem}.top-section .branding h1{font-family:'Rajdhani',sans-serif;font-size:1.5rem;color:#fff;font-weight:700}.top-section .branding .sub{font-size:.72rem;color:#5a9a8a;margin-top:1px}.top-section .meta{display:flex;align-items:center;gap:10px}.top-section .meta .status{font-size:.7rem;color:#14b8a6;display:flex;align-items:center;gap:5px}.top-section .meta .status .pulse{width:8px;height:8px;background:#14b8a6;border-radius:50%;animation:blink 1.5s infinite}@keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}.top-section .meta .badge{font-family:'Share Tech Mono',monospace;font-size:.66rem;background:rgba(239,68,68,.1);color:#ef4444;border:1px solid rgba(239,68,68,.25);padding:4px 10px;border-radius:2px;letter-spacing:1px}.panels{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:22px}@media(max-width:768px){.panels{grid-template-columns:1fr 1fr}}@media(max-width:500px){.panels{grid-template-columns:1fr}}.panels .p{background:#0d2626;border:1px solid #1a4040;border-radius:3px;padding:14px 16px;border-top:3px solid #ef4444}.panels .p .k{font-size:.6rem;text-transform:uppercase;color:#5a9a8a;letter-spacing:1.2px;margin-bottom:5px}.panels .p .v{font-size:.84rem;color:#e8fff8;font-weight:500}.panels .p .v.accent{font-family:'Share Tech Mono',monospace;color:#14b8a6;font-size:.9rem}.panels .p.wide{grid-column:1/-1}.iot-card{background:#0d2626;border:1px solid #1a4040;border-radius:4px;overflow:hidden;margin-bottom:22px}.iot-card .iot-hdr{background:#081c1c;padding:14px 20px;border-bottom:1px solid #1a4040;display:flex;align-items:center;gap:10px}.iot-card .iot-hdr .ic{font-size:1rem}.iot-card .iot-hdr span{font-family:'Rajdhani',sans-serif;font-size:.9rem;color:#14b8a6;text-transform:uppercase;letter-spacing:.6px}.iot-card .iot-body{padding:20px}.iot-card .iot-body p{font-size:.8rem;color:#5a9a8a;line-height:1.7;margin-bottom:8px}.iot-card .iot-body .device-num{font-family:'Share Tech Mono',monospace;font-size:1.4rem;color:#ef4444;margin:14px 0;letter-spacing:1px}.end-bar{display:flex;justify-content:space-between;align-items:center;padding-top:14px;border-top:1px solid #1a4040;font-size:.7rem;color:#5a9a8a}.end-bar .trigger{font-family:'Share Tech Mono',monospace;font-size:.72rem;color:#14b8a6;border:1px solid #14b8a6;background:transparent;padding:7px 16px;border-radius:2px;cursor:pointer;letter-spacing:.5px}.end-bar .trigger:hover{background:rgba(20,184,166,.06)}@media(max-width:640px){.top-section{flex-direction:column;align-items:flex-start}.end-bar{flex-direction:column;gap:10px;text-align:center}}</style></head><body><div class="wrapper"><div class="top-section"><div class="branding"><div class="icon-box">&#x1f4e1;</div><div><h1>${displayName}</h1><div class="sub">Plataforma IoT — Dispositivos Conectados</div></div></div><div class="meta"><div class="status"><span class="pulse"></span>OPERANTE</div><div class="badge">IOT:NET</div></div></div><div class="panels"><div class="p"><div class="k">Razão Social</div><div class="v">${razaoFmt}</div></div><div class="p"><div class="k">CNPJ</div><div class="v accent">${esc(cnpjFmt)}</div></div><div class="p"><div class="k">Dispositivo WABA</div><div class="v accent">${phoneFmt ? esc(phoneFmt) : 'Standby'}</div></div><div class="p"><div class="k">Email</div><div class="v">${emailFmt || 'N/A'}</div></div><div class="p"><div class="k">Região</div><div class="v">${esc(endCity || 'N/I')}</div></div><div class="p"><div class="k">Status</div><div class="v">${esc(situacao || 'ATIVA')}</div></div><div class="p wide"><div class="k">Localização Base / Endereço</div><div class="v">${esc(fullAddress)}</div></div>${atividadeFmt ? `<div class="p wide"><div class="k">CNAE — Atividade</div><div class="v">${atividadeFmt}</div></div>` : ''}</div><div class="iot-card"><div class="iot-hdr"><span class="ic">&#x1f512;</span><span>WABA IoT — Canal Utility Receptivo</span></div><div class="iot-body"><p>A operação da ${displayName} é exclusivamente receptiva. Este dispositivo WABA é dedicado ao roteamento de mensagens de sistema, alertas de sensores IoT e comprovantes transacionais.</p><p>Bloqueado disparos em massa. Sem marketing B2C. Sem escopo comercial ou de varejo. Conformidade integral com LGPD e políticas WhatsApp Business.</p>${phoneFmt ? `<div class="device-num">${esc(phoneFmt)}</div>` : ''}</div></div><div class="end-bar"><span>${razaoFmt} — CNPJ ${esc(cnpjFmt)}</span><button class="trigger" onclick="alert('Heartbeat IoT enviado.')">Enviar Heartbeat</button></div></div></body></html>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEMPLATE 8: Central SCADA — Indigo/Amber palette
  // ═══════════════════════════════════════════════════════════════════════════
  else if (templateIndex === 8) {
    html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">${metaTag}<title>${displayName} — Central SCADA</title><style>@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Share+Tech+Mono&family=Inter:wght@300;400;500;600&display=swap');*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',sans-serif;background:#0c0c1e;color:#e2e8f0;min-height:100vh;background-image:radial-gradient(rgba(99,102,241,.05) 1px,transparent 1px);background-size:22px 22px}.shell{max-width:860px;margin:0 auto;padding:40px 24px}.hdr{background:#12122a;border-bottom:3px solid #6366f1;border-radius:4px 4px 0 0;padding:20px 26px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px}.hdr h1{font-family:'Rajdhani',sans-serif;font-size:1.7rem;color:#fff;font-weight:700}.hdr .sub{font-size:.74rem;color:#6366f1;margin-top:2px}.hdr .tag{font-family:'Share Tech Mono',monospace;font-size:.68rem;background:rgba(245,158,11,.1);color:#f59e0b;border:1px solid rgba(245,158,11,.25);padding:5px 11px;border-radius:2px;letter-spacing:1px}.body-panel{background:#12122a;border:1px solid #1e1e3a;border-top:none;border-radius:0 0 4px 4px;padding:24px;margin-bottom:22px}.grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}.grid .cell{background:#0c0c1e;border-left:3px solid #f59e0b;border-radius:2px;padding:12px 14px}.grid .cell .lbl{font-size:.62rem;text-transform:uppercase;color:#4a4a7a;letter-spacing:1.2px;margin-bottom:4px}.grid .cell .val{font-size:.84rem;color:#e8e8ff;font-weight:500}.grid .cell .val.hi{font-family:'Share Tech Mono',monospace;color:#6366f1}.grid .cell.wide{grid-column:1/-1}.scada-block{background:#0c0c1e;border:1px solid #1e1e3a;border-left:4px solid #6366f1;border-radius:3px;padding:20px 22px;margin-top:20px}.scada-block h3{font-family:'Rajdhani',sans-serif;font-size:.95rem;color:#f59e0b;margin-bottom:10px;letter-spacing:.5px}.scada-block p{font-size:.8rem;color:#6a6a9a;line-height:1.7;margin-bottom:6px}.scada-block .num{font-family:'Share Tech Mono',monospace;font-size:1.35rem;color:#6366f1;margin:12px 0}.foot{display:flex;justify-content:space-between;align-items:center;padding-top:16px;border-top:1px solid #1e1e3a;font-size:.7rem;color:#4a4a7a;margin-top:22px}.foot .btn{font-family:'Share Tech Mono',monospace;font-size:.72rem;color:#6366f1;border:1px solid #6366f1;background:transparent;padding:7px 16px;border-radius:2px;cursor:pointer;letter-spacing:.5px}.foot .btn:hover{background:rgba(99,102,241,.08)}@media(max-width:640px){.grid{grid-template-columns:1fr}.hdr{flex-direction:column;align-items:flex-start}.foot{flex-direction:column;gap:10px;text-align:center}}</style></head><body><div class="shell"><div class="hdr"><div><h1>${displayName}</h1><div class="sub">Central SCADA — Supervisório Industrial</div></div><div class="tag">SCADA:01</div></div><div class="body-panel"><div class="grid"><div class="cell"><div class="lbl">Razão Social</div><div class="val">${razaoFmt}</div></div><div class="cell"><div class="lbl">CNPJ</div><div class="val hi">${esc(cnpjFmt)}</div></div><div class="cell"><div class="lbl">Situação</div><div class="val">${esc(situacao || 'ATIVA')}</div></div><div class="cell"><div class="lbl">Nó de Comando</div><div class="val hi">${phoneFmt ? esc(phoneFmt) : 'N/C'}</div></div><div class="cell"><div class="lbl">Email</div><div class="val">${emailFmt || 'N/A'}</div></div><div class="cell"><div class="lbl">UF</div><div class="val">${esc(endCity || 'N/I')}</div></div><div class="cell wide"><div class="lbl">Planta Industrial / Endereço</div><div class="val">${esc(fullAddress)}</div></div>${atividadeFmt ? `<div class="cell wide"><div class="lbl">CNAE</div><div class="val">${atividadeFmt}</div></div>` : ''}</div><div class="scada-block"><h3>&#x1f6e0; WABA SCADA — Canal Utility</h3><p>A operação da ${displayName} é exclusivamente receptiva. Canal Utility dedicado ao envio de alertas SCADA, notificações de manutenção preditiva e comprovantes transacionais.</p><p>Bloqueado disparos em massa. Sem marketing B2C. Conformidade integral LGPD.</p>${phoneFmt ? `<div class="num">${esc(phoneFmt)}</div>` : ''}</div></div><div class="foot"><span>${razaoFmt} — CNPJ ${esc(cnpjFmt)}</span><button class="btn" onclick="alert('Ping SCADA enviado.')">Ping SCADA</button></div></div></body></html>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEMPLATE 9: Núcleo de Automação — Emerald/Slate palette
  // ═══════════════════════════════════════════════════════════════════════════
  else if (templateIndex === 9) {
    html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">${metaTag}<title>${displayName} — Núcleo de Automação</title><style>@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Share+Tech+Mono&family=Inter:wght@300;400;500;600&display=swap');*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',sans-serif;background:#0a1610;color:#e2e8f0;min-height:100vh;background-image:linear-gradient(rgba(16,185,129,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(16,185,129,.03) 1px,transparent 1px);background-size:36px 36px}.core{max-width:850px;margin:0 auto;padding:38px 24px}.banner{background:#0f2318;border:1px solid #1a3d2a;border-radius:4px;padding:22px 26px;margin-bottom:26px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px}.banner h1{font-family:'Rajdhani',sans-serif;font-size:1.6rem;color:#fff;font-weight:700}.banner .sub{font-size:.74rem;color:#10b981;margin-top:3px}.banner .chip{font-family:'Share Tech Mono',monospace;font-size:.68rem;background:rgba(100,116,139,.12);color:#94a3b8;border:1px solid rgba(100,116,139,.25);padding:5px 11px;border-radius:2px;letter-spacing:1px}.info-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin-bottom:22px}.info-grid .box{background:#0f2318;border:1px solid #1a3d2a;border-radius:3px;padding:14px 16px;border-top:3px solid #10b981}.info-grid .box .k{font-size:.62rem;text-transform:uppercase;color:#4a7a5a;letter-spacing:1.2px;margin-bottom:4px}.info-grid .box .v{font-size:.85rem;color:#e8fff0;font-weight:500}.info-grid .box .v.mono{font-family:'Share Tech Mono',monospace;color:#10b981}.info-grid .box.full{grid-column:1/-1}.auto-section{background:#0f2318;border:1px solid #1a3d2a;border-left:4px solid #94a3b8;border-radius:3px;padding:20px 22px;margin-bottom:22px}.auto-section h3{font-family:'Rajdhani',sans-serif;font-size:.95rem;color:#10b981;margin-bottom:10px;letter-spacing:.5px}.auto-section p{font-size:.8rem;color:#4a7a5a;line-height:1.7;margin-bottom:6px}.auto-section .num{font-family:'Share Tech Mono',monospace;font-size:1.35rem;color:#10b981;margin:12px 0}.bottom{display:flex;justify-content:space-between;align-items:center;padding-top:14px;border-top:1px solid #1a3d2a;font-size:.7rem;color:#4a7a5a}.bottom .btn{font-family:'Share Tech Mono',monospace;font-size:.72rem;color:#10b981;border:1px solid #10b981;background:transparent;padding:7px 16px;border-radius:2px;cursor:pointer;letter-spacing:.5px}.bottom .btn:hover{background:rgba(16,185,129,.06)}@media(max-width:640px){.info-grid{grid-template-columns:1fr}.banner{flex-direction:column;align-items:flex-start}.bottom{flex-direction:column;gap:10px;text-align:center}}</style></head><body><div class="core"><div class="banner"><div><h1>${displayName}</h1><div class="sub">Núcleo de Automação Industrial</div></div><div class="chip">AUTO:IND</div></div><div class="info-grid"><div class="box"><div class="k">Razão Social</div><div class="v">${razaoFmt}</div></div><div class="box"><div class="k">CNPJ</div><div class="v mono">${esc(cnpjFmt)}</div></div><div class="box"><div class="k">Canal Automação</div><div class="v mono">${phoneFmt ? esc(phoneFmt) : 'N/C'}</div></div><div class="box"><div class="k">Email</div><div class="v">${emailFmt || 'N/A'}</div></div><div class="box full"><div class="k">Endereço da Planta</div><div class="v">${esc(fullAddress)}</div></div>${atividadeFmt ? `<div class="box full"><div class="k">CNAE — Atividade</div><div class="v">${atividadeFmt}</div></div>` : ''}</div><div class="auto-section"><h3>&#x2699; WABA Automação — Canal Utility Receptivo</h3><p>A operação da ${displayName} é exclusivamente receptiva. Canal Utility dedicado a alertas de automação, notificações de processo e comprovantes transacionais.</p><p>Bloqueado disparos em massa. Sem marketing B2C. Sem escopo comercial. Conformidade LGPD.</p>${phoneFmt ? `<div class="num">${esc(phoneFmt)}</div>` : ''}</div><div class="bottom"><span>${razaoFmt} — CNPJ ${esc(cnpjFmt)}</span><button class="btn" onclick="alert('Ciclo de automação verificado.')">Verificar Ciclo</button></div></div></body></html>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEMPLATE 10: Módulo ERP Industrial — Rose/Zinc palette
  // ═══════════════════════════════════════════════════════════════════════════
  else if (templateIndex === 10) {
    html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">${metaTag}<title>${displayName} — Módulo ERP Industrial</title><style>@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Share+Tech+Mono&family=Inter:wght@300;400;500;600&display=swap');*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',sans-serif;background:#18181b;color:#e2e8f0;min-height:100vh;background-image:radial-gradient(rgba(244,63,94,.04) 1px,transparent 1px);background-size:20px 20px}.wrap{max-width:850px;margin:0 auto;padding:40px 24px}.top-bar{background:#27272a;border-left:5px solid #f43f5e;border-radius:3px;padding:20px 26px;margin-bottom:26px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px}.top-bar h1{font-family:'Rajdhani',sans-serif;font-size:1.65rem;color:#fff;font-weight:700}.top-bar .sub{font-size:.74rem;color:#a1a1aa;margin-top:2px}.top-bar .badge{font-family:'Share Tech Mono',monospace;font-size:.68rem;background:rgba(244,63,94,.1);color:#f43f5e;border:1px solid rgba(244,63,94,.25);padding:5px 11px;border-radius:2px;letter-spacing:1px}.content{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:22px}.content .tile{background:#27272a;border:1px solid #3f3f46;border-radius:3px;padding:14px 16px;border-left:3px solid #a1a1aa}.content .tile .k{font-size:.62rem;text-transform:uppercase;color:#71717a;letter-spacing:1.2px;margin-bottom:4px}.content .tile .v{font-size:.85rem;color:#fafafa;font-weight:500}.content .tile .v.accent{font-family:'Share Tech Mono',monospace;color:#f43f5e}.content .tile.full{grid-column:1/-1}.erp-block{background:#27272a;border:1px solid #3f3f46;border-top:3px solid #f43f5e;border-radius:3px;padding:22px;margin-bottom:22px}.erp-block h3{font-family:'Rajdhani',sans-serif;font-size:.95rem;color:#f43f5e;margin-bottom:12px;letter-spacing:.5px}.erp-block p{font-size:.8rem;color:#a1a1aa;line-height:1.7;margin-bottom:6px}.erp-block .num{font-family:'Share Tech Mono',monospace;font-size:1.35rem;color:#f43f5e;margin:12px 0}.foot{display:flex;justify-content:space-between;align-items:center;padding-top:14px;border-top:1px solid #3f3f46;font-size:.7rem;color:#71717a}.foot .btn{font-family:'Share Tech Mono',monospace;font-size:.72rem;color:#f43f5e;border:1px solid #f43f5e;background:transparent;padding:7px 16px;border-radius:2px;cursor:pointer;letter-spacing:.5px}.foot .btn:hover{background:rgba(244,63,94,.06)}@media(max-width:640px){.content{grid-template-columns:1fr}.top-bar{flex-direction:column;align-items:flex-start}.foot{flex-direction:column;gap:10px;text-align:center}}</style></head><body><div class="wrap"><div class="top-bar"><div><h1>${displayName}</h1><div class="sub">Módulo ERP — Gestão Industrial Integrada</div></div><div class="badge">ERP:IND</div></div><div class="content"><div class="tile"><div class="k">Razão Social</div><div class="v">${razaoFmt}</div></div><div class="tile"><div class="k">CNPJ</div><div class="v accent">${esc(cnpjFmt)}</div></div><div class="tile"><div class="k">Canal ERP</div><div class="v accent">${phoneFmt ? esc(phoneFmt) : 'N/C'}</div></div><div class="tile"><div class="k">Email</div><div class="v">${emailFmt || 'N/A'}</div></div><div class="tile full"><div class="k">Unidade Fabril</div><div class="v">${esc(fullAddress)}</div></div>${atividadeFmt ? `<div class="tile full"><div class="k">CNAE — Atividade</div><div class="v">${atividadeFmt}</div></div>` : ''}</div><div class="erp-block"><h3>&#x1f4ca; WABA ERP — Canal Utility Receptivo</h3><p>A operação da ${displayName} é exclusivamente receptiva. Canal Utility dedicado a notificações ERP, alertas de produção e comprovantes transacionais.</p><p>Bloqueado disparos em massa. Sem marketing B2C. Conformidade integral LGPD.</p>${phoneFmt ? `<div class="num">${esc(phoneFmt)}</div>` : ''}</div><div class="foot"><span>${razaoFmt} — CNPJ ${esc(cnpjFmt)}</span><button class="btn" onclick="alert('Módulo ERP sincronizado.')">Sync ERP</button></div></div></body></html>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEMPLATE 11: Painel de Qualidade — Sky/Orange palette
  // ═══════════════════════════════════════════════════════════════════════════
  else if (templateIndex === 11) {
    html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">${metaTag}<title>${displayName} — Painel de Qualidade</title><style>@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Share+Tech+Mono&family=Inter:wght@300;400;500;600&display=swap');*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',sans-serif;background:#0c1929;color:#e2e8f0;min-height:100vh;background-image:radial-gradient(rgba(56,189,248,.04) 1px,transparent 1px);background-size:26px 26px}.container{max-width:860px;margin:0 auto;padding:40px 24px}.header{background:#0f2440;border:1px solid #1a3a5c;border-radius:4px;padding:22px 26px;margin-bottom:26px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;border-left:5px solid #38bdf8}.header h1{font-family:'Rajdhani',sans-serif;font-size:1.65rem;color:#fff;font-weight:700}.header .sub{font-size:.74rem;color:#38bdf8;margin-top:2px}.header .tag{font-family:'Share Tech Mono',monospace;font-size:.68rem;background:rgba(251,146,60,.1);color:#fb923c;border:1px solid rgba(251,146,60,.25);padding:5px 11px;border-radius:2px;letter-spacing:1px}.panels{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:22px}.panels .p{background:#0f2440;border:1px solid #1a3a5c;border-radius:3px;padding:14px 16px;border-top:3px solid #fb923c}.panels .p .k{font-size:.62rem;text-transform:uppercase;color:#4a7a9a;letter-spacing:1.2px;margin-bottom:4px}.panels .p .v{font-size:.84rem;color:#e8f4ff;font-weight:500}.panels .p .v.hi{font-family:'Share Tech Mono',monospace;color:#38bdf8}.panels .p.wide{grid-column:1/-1}.qa-block{background:#0f2440;border:1px solid #1a3a5c;border-left:4px solid #38bdf8;border-radius:3px;padding:22px;margin-bottom:22px}.qa-block h3{font-family:'Rajdhani',sans-serif;font-size:.95rem;color:#fb923c;margin-bottom:12px;letter-spacing:.5px}.qa-block p{font-size:.8rem;color:#4a7a9a;line-height:1.7;margin-bottom:6px}.qa-block .num{font-family:'Share Tech Mono',monospace;font-size:1.35rem;color:#38bdf8;margin:12px 0}.foot{display:flex;justify-content:space-between;align-items:center;padding-top:14px;border-top:1px solid #1a3a5c;font-size:.7rem;color:#4a7a9a}.foot .btn{font-family:'Share Tech Mono',monospace;font-size:.72rem;color:#38bdf8;border:1px solid #38bdf8;background:transparent;padding:7px 16px;border-radius:2px;cursor:pointer;letter-spacing:.5px}.foot .btn:hover{background:rgba(56,189,248,.06)}@media(max-width:640px){.panels{grid-template-columns:1fr}.header{flex-direction:column;align-items:flex-start}.foot{flex-direction:column;gap:10px;text-align:center}}</style></head><body><div class="container"><div class="header"><div><h1>${displayName}</h1><div class="sub">Painel de Qualidade — ISO 9001</div></div><div class="tag">QA:ISO</div></div><div class="panels"><div class="p"><div class="k">Razão Social</div><div class="v">${razaoFmt}</div></div><div class="p"><div class="k">CNPJ</div><div class="v hi">${esc(cnpjFmt)}</div></div><div class="p"><div class="k">Status</div><div class="v">${esc(situacao || 'ATIVA')}</div></div><div class="p"><div class="k">Canal QA</div><div class="v hi">${phoneFmt ? esc(phoneFmt) : 'N/C'}</div></div><div class="p"><div class="k">Email</div><div class="v">${emailFmt || 'N/A'}</div></div><div class="p"><div class="k">Praça</div><div class="v">${esc(endCity || 'N/I')}</div></div><div class="p wide"><div class="k">Unidade de Inspeção</div><div class="v">${esc(fullAddress)}</div></div>${atividadeFmt ? `<div class="p wide"><div class="k">CNAE — Atividade</div><div class="v">${atividadeFmt}</div></div>` : ''}</div><div class="qa-block"><h3>&#x1f3af; WABA Qualidade — Canal Utility</h3><p>A operação da ${displayName} é exclusivamente receptiva. Canal Utility dedicado a alertas de não-conformidade, laudos de inspeção e comprovantes transacionais.</p><p>Bloqueado disparos em massa. Sem marketing B2C. Conformidade integral LGPD.</p>${phoneFmt ? `<div class="num">${esc(phoneFmt)}</div>` : ''}</div><div class="foot"><span>${razaoFmt} — CNPJ ${esc(cnpjFmt)}</span><button class="btn" onclick="alert('Inspeção QA iniciada.')">Iniciar Inspeção</button></div></div></body></html>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEMPLATE 12: Central de Manutenção Preditiva — Violet/Lime palette
  // ═══════════════════════════════════════════════════════════════════════════
  else if (templateIndex === 12) {
    html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">${metaTag}<title>${displayName} — Manutenção Preditiva</title><style>@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Share+Tech+Mono&family=Inter:wght@300;400;500;600&display=swap');*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',sans-serif;background:#1a0f2e;color:#e2e8f0;min-height:100vh;background-image:linear-gradient(rgba(139,92,246,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(139,92,246,.04) 1px,transparent 1px);background-size:30px 30px}.outer{max-width:860px;margin:0 auto;padding:38px 24px}.head{background:#221540;border:1px solid #2d1f5e;border-radius:4px;padding:22px 26px;margin-bottom:26px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;border-bottom:3px solid #8b5cf6}.head h1{font-family:'Rajdhani',sans-serif;font-size:1.65rem;color:#fff;font-weight:700}.head .sub{font-size:.74rem;color:#8b5cf6;margin-top:2px}.head .chip{font-family:'Share Tech Mono',monospace;font-size:.68rem;background:rgba(132,204,22,.1);color:#84cc16;border:1px solid rgba(132,204,22,.25);padding:5px 11px;border-radius:2px;letter-spacing:1px}.data{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-bottom:22px}.data .item{background:#221540;border:1px solid #2d1f5e;border-radius:3px;padding:14px 16px;border-left:3px solid #84cc16}.data .item .k{font-size:.62rem;text-transform:uppercase;color:#6b5a9a;letter-spacing:1.2px;margin-bottom:4px}.data .item .v{font-size:.84rem;color:#ede8ff;font-weight:500}.data .item .v.hi{font-family:'Share Tech Mono',monospace;color:#8b5cf6}.data .item.wide{grid-column:1/-1}.maint-block{background:#221540;border:1px solid #2d1f5e;border-left:4px solid #8b5cf6;border-radius:3px;padding:22px;margin-bottom:22px}.maint-block h3{font-family:'Rajdhani',sans-serif;font-size:.95rem;color:#84cc16;margin-bottom:12px;letter-spacing:.5px}.maint-block p{font-size:.8rem;color:#6b5a9a;line-height:1.7;margin-bottom:6px}.maint-block .num{font-family:'Share Tech Mono',monospace;font-size:1.35rem;color:#8b5cf6;margin:12px 0}.foot{display:flex;justify-content:space-between;align-items:center;padding-top:14px;border-top:1px solid #2d1f5e;font-size:.7rem;color:#6b5a9a}.foot .btn{font-family:'Share Tech Mono',monospace;font-size:.72rem;color:#84cc16;border:1px solid #84cc16;background:transparent;padding:7px 16px;border-radius:2px;cursor:pointer;letter-spacing:.5px}.foot .btn:hover{background:rgba(132,204,22,.06)}@media(max-width:640px){.data{grid-template-columns:1fr}.head{flex-direction:column;align-items:flex-start}.foot{flex-direction:column;gap:10px;text-align:center}}</style></head><body><div class="outer"><div class="head"><div><h1>${displayName}</h1><div class="sub">Central de Manutenção Preditiva</div></div><div class="chip">MNT:PRD</div></div><div class="data"><div class="item"><div class="k">Razão Social</div><div class="v">${razaoFmt}</div></div><div class="item"><div class="k">CNPJ</div><div class="v hi">${esc(cnpjFmt)}</div></div><div class="item"><div class="k">Status</div><div class="v">${esc(situacao || 'ATIVA')}</div></div><div class="item"><div class="k">Canal Manutenção</div><div class="v hi">${phoneFmt ? esc(phoneFmt) : 'N/C'}</div></div><div class="item"><div class="k">Email</div><div class="v">${emailFmt || 'N/A'}</div></div><div class="item"><div class="k">Região</div><div class="v">${esc(endCity || 'N/I')}</div></div><div class="item wide"><div class="k">Base de Manutenção</div><div class="v">${esc(fullAddress)}</div></div>${atividadeFmt ? `<div class="item wide"><div class="k">CNAE — Atividade</div><div class="v">${atividadeFmt}</div></div>` : ''}</div><div class="maint-block"><h3>&#x1f527; WABA Manutenção — Canal Utility</h3><p>A operação da ${displayName} é exclusivamente receptiva. Canal Utility dedicado a alertas de manutenção preditiva, ordens de serviço e comprovantes transacionais.</p><p>Bloqueado disparos em massa. Sem marketing B2C. Conformidade integral LGPD.</p>${phoneFmt ? `<div class="num">${esc(phoneFmt)}</div>` : ''}</div><div class="foot"><span>${razaoFmt} — CNPJ ${esc(cnpjFmt)}</span><button class="btn" onclick="alert('Diagnóstico preditivo iniciado.')">Diagnóstico</button></div></div></body></html>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEMPLATE 13: Gestão de Frota — Slate/Cyan palette
  // ═══════════════════════════════════════════════════════════════════════════
  else if (templateIndex === 13) {
    html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">${metaTag}<title>${displayName} — Gestão de Frota</title><style>@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Share+Tech+Mono&family=Inter:wght@300;400;500;600&display=swap');*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;background-image:radial-gradient(rgba(34,211,238,.03) 1px,transparent 1px);background-size:24px 24px}.page{max-width:860px;margin:0 auto;padding:40px 24px}.nav{background:#1e293b;border:1px solid #334155;border-radius:4px;padding:20px 26px;margin-bottom:26px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;border-right:5px solid #22d3ee}.nav h1{font-family:'Rajdhani',sans-serif;font-size:1.65rem;color:#fff;font-weight:700}.nav .sub{font-size:.74rem;color:#64748b;margin-top:2px}.nav .tag{font-family:'Share Tech Mono',monospace;font-size:.68rem;background:rgba(34,211,238,.1);color:#22d3ee;border:1px solid rgba(34,211,238,.25);padding:5px 11px;border-radius:2px;letter-spacing:1px}.fleet-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin-bottom:22px}.fleet-grid .card{background:#1e293b;border:1px solid #334155;border-radius:3px;padding:14px 16px;border-left:3px solid #22d3ee}.fleet-grid .card .k{font-size:.62rem;text-transform:uppercase;color:#64748b;letter-spacing:1.2px;margin-bottom:4px}.fleet-grid .card .v{font-size:.85rem;color:#f1f5f9;font-weight:500}.fleet-grid .card .v.hi{font-family:'Share Tech Mono',monospace;color:#22d3ee}.fleet-grid .card.full{grid-column:1/-1}.fleet-section{background:#1e293b;border:1px solid #334155;border-top:3px solid #22d3ee;border-radius:3px;padding:22px;margin-bottom:22px}.fleet-section h3{font-family:'Rajdhani',sans-serif;font-size:.95rem;color:#22d3ee;margin-bottom:12px;letter-spacing:.5px}.fleet-section p{font-size:.8rem;color:#64748b;line-height:1.7;margin-bottom:6px}.fleet-section .num{font-family:'Share Tech Mono',monospace;font-size:1.35rem;color:#22d3ee;margin:12px 0}.foot{display:flex;justify-content:space-between;align-items:center;padding-top:14px;border-top:1px solid #334155;font-size:.7rem;color:#64748b}.foot .btn{font-family:'Share Tech Mono',monospace;font-size:.72rem;color:#22d3ee;border:1px solid #22d3ee;background:transparent;padding:7px 16px;border-radius:2px;cursor:pointer;letter-spacing:.5px}.foot .btn:hover{background:rgba(34,211,238,.06)}@media(max-width:640px){.fleet-grid{grid-template-columns:1fr}.nav{flex-direction:column;align-items:flex-start}.foot{flex-direction:column;gap:10px;text-align:center}}</style></head><body><div class="page"><div class="nav"><div><h1>${displayName}</h1><div class="sub">Gestão de Frota — Rastreamento e Despacho</div></div><div class="tag">FLT:TRK</div></div><div class="fleet-grid"><div class="card"><div class="k">Razão Social</div><div class="v">${razaoFmt}</div></div><div class="card"><div class="k">CNPJ</div><div class="v hi">${esc(cnpjFmt)}</div></div><div class="card"><div class="k">Canal Frota</div><div class="v hi">${phoneFmt ? esc(phoneFmt) : 'N/C'}</div></div><div class="card"><div class="k">Email</div><div class="v">${emailFmt || 'N/A'}</div></div><div class="card full"><div class="k">Base de Despacho</div><div class="v">${esc(fullAddress)}</div></div>${atividadeFmt ? `<div class="card full"><div class="k">CNAE — Atividade</div><div class="v">${atividadeFmt}</div></div>` : ''}</div><div class="fleet-section"><h3>&#x1f69a; WABA Frota — Canal Utility Receptivo</h3><p>A operação da ${displayName} é exclusivamente receptiva. Canal Utility dedicado a alertas de rastreamento, notificações de despacho e comprovantes transacionais.</p><p>Bloqueado disparos em massa. Sem marketing B2C. Conformidade integral LGPD.</p>${phoneFmt ? `<div class="num">${esc(phoneFmt)}</div>` : ''}</div><div class="foot"><span>${razaoFmt} — CNPJ ${esc(cnpjFmt)}</span><button class="btn" onclick="alert('Tracking ativo.')">Rastrear Frota</button></div></div></body></html>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEMPLATE 14: Segurança Patrimonial — Dark/Red palette
  // ═══════════════════════════════════════════════════════════════════════════
  else if (templateIndex === 14) {
    html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">${metaTag}<title>${displayName} — Segurança Patrimonial</title><style>@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Share+Tech+Mono&family=Inter:wght@300;400;500;600&display=swap');*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',sans-serif;background:#0a0a0a;color:#e2e8f0;min-height:100vh;background-image:linear-gradient(rgba(220,38,38,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(220,38,38,.03) 1px,transparent 1px);background-size:40px 40px}.frame{max-width:850px;margin:0 auto;padding:40px 24px}.top{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:4px;padding:22px 26px;margin-bottom:26px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;border-top:4px solid #dc2626}.top h1{font-family:'Rajdhani',sans-serif;font-size:1.65rem;color:#fff;font-weight:700}.top .sub{font-size:.74rem;color:#666;margin-top:2px}.top .badge{font-family:'Share Tech Mono',monospace;font-size:.68rem;background:rgba(220,38,38,.12);color:#dc2626;border:1px solid rgba(220,38,38,.3);padding:5px 11px;border-radius:2px;letter-spacing:1px;display:flex;align-items:center;gap:6px}.top .badge .dot{width:7px;height:7px;background:#dc2626;border-radius:50%;animation:blink 1.5s infinite}@keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:22px}.grid .cell{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:3px;padding:14px 16px;border-left:3px solid #dc2626}.grid .cell .k{font-size:.62rem;text-transform:uppercase;color:#555;letter-spacing:1.2px;margin-bottom:4px}.grid .cell .v{font-size:.85rem;color:#f5f5f5;font-weight:500}.grid .cell .v.hi{font-family:'Share Tech Mono',monospace;color:#dc2626}.grid .cell.full{grid-column:1/-1}.sec-block{background:#1a1a1a;border:1px solid #2a2a2a;border-left:4px solid #dc2626;border-radius:3px;padding:22px;margin-bottom:22px}.sec-block h3{font-family:'Rajdhani',sans-serif;font-size:.95rem;color:#dc2626;margin-bottom:12px;text-transform:uppercase;letter-spacing:.6px}.sec-block p{font-size:.8rem;color:#666;line-height:1.7;margin-bottom:6px}.sec-block .num{font-family:'Share Tech Mono',monospace;font-size:1.35rem;color:#dc2626;margin:12px 0}.foot{display:flex;justify-content:space-between;align-items:center;padding-top:14px;border-top:1px solid #2a2a2a;font-size:.7rem;color:#555}.foot .btn{font-family:'Share Tech Mono',monospace;font-size:.72rem;color:#dc2626;border:1px solid #dc2626;background:transparent;padding:7px 16px;border-radius:2px;cursor:pointer;letter-spacing:.5px}.foot .btn:hover{background:rgba(220,38,38,.06)}@media(max-width:640px){.grid{grid-template-columns:1fr}.top{flex-direction:column;align-items:flex-start}.foot{flex-direction:column;gap:10px;text-align:center}}</style></head><body><div class="frame"><div class="top"><div><h1>${displayName}</h1><div class="sub">Segurança Patrimonial — Monitoramento 24h</div></div><div class="badge"><span class="dot"></span>SEC:24H</div></div><div class="grid"><div class="cell"><div class="k">Razão Social</div><div class="v">${razaoFmt}</div></div><div class="cell"><div class="k">CNPJ</div><div class="v hi">${esc(cnpjFmt)}</div></div><div class="cell"><div class="k">Canal Segurança</div><div class="v hi">${phoneFmt ? esc(phoneFmt) : 'N/C'}</div></div><div class="cell"><div class="k">Email</div><div class="v">${emailFmt || 'N/A'}</div></div><div class="cell full"><div class="k">Perímetro Monitorado</div><div class="v">${esc(fullAddress)}</div></div>${atividadeFmt ? `<div class="cell full"><div class="k">CNAE — Atividade</div><div class="v">${atividadeFmt}</div></div>` : ''}</div><div class="sec-block"><h3>&#x1f6a8; WABA Segurança — Canal Utility</h3><p>A operação da ${displayName} é exclusivamente receptiva. Canal Utility dedicado a alertas de segurança patrimonial, notificações de intrusão e comprovantes transacionais.</p><p>Bloqueado disparos em massa. Sem marketing B2C. Conformidade integral LGPD.</p>${phoneFmt ? `<div class="num">${esc(phoneFmt)}</div>` : ''}</div><div class="foot"><span>${razaoFmt} — CNPJ ${esc(cnpjFmt)}</span><button class="btn" onclick="alert('Alarme de perímetro verificado.')">Verificar Perímetro</button></div></div></body></html>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEMPLATE 15: Centro de Distribuição — Warm/Steel palette
  // ═══════════════════════════════════════════════════════════════════════════
  else {
    html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">${metaTag}<title>${displayName} — Centro de Distribuição</title><style>@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Share+Tech+Mono&family=Inter:wght@300;400;500;600&display=swap');*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',sans-serif;background:#171717;color:#e2e8f0;min-height:100vh;background-image:radial-gradient(rgba(234,179,8,.03) 1px,transparent 1px);background-size:28px 28px}.shell{max-width:860px;margin:0 auto;padding:40px 24px}.header{background:#262626;border:1px solid #404040;border-radius:4px;padding:22px 26px;margin-bottom:26px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;border-left:5px solid #eab308}.header h1{font-family:'Rajdhani',sans-serif;font-size:1.65rem;color:#fff;font-weight:700}.header .sub{font-size:.74rem;color:#a3a3a3;margin-top:2px}.header .tag{font-family:'Share Tech Mono',monospace;font-size:.68rem;background:rgba(234,179,8,.1);color:#eab308;border:1px solid rgba(234,179,8,.25);padding:5px 11px;border-radius:2px;letter-spacing:1px}.dist-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:22px}.dist-grid .box{background:#262626;border:1px solid #404040;border-radius:3px;padding:14px 16px;border-top:3px solid #eab308}.dist-grid .box .k{font-size:.62rem;text-transform:uppercase;color:#737373;letter-spacing:1.2px;margin-bottom:4px}.dist-grid .box .v{font-size:.84rem;color:#fafafa;font-weight:500}.dist-grid .box .v.hi{font-family:'Share Tech Mono',monospace;color:#eab308}.dist-grid .box.wide{grid-column:1/-1}.dist-section{background:#262626;border:1px solid #404040;border-left:4px solid #eab308;border-radius:3px;padding:22px;margin-bottom:22px}.dist-section h3{font-family:'Rajdhani',sans-serif;font-size:.95rem;color:#eab308;margin-bottom:12px;letter-spacing:.5px}.dist-section p{font-size:.8rem;color:#a3a3a3;line-height:1.7;margin-bottom:6px}.dist-section .num{font-family:'Share Tech Mono',monospace;font-size:1.35rem;color:#eab308;margin:12px 0}.foot{display:flex;justify-content:space-between;align-items:center;padding-top:14px;border-top:1px solid #404040;font-size:.7rem;color:#737373}.foot .btn{font-family:'Share Tech Mono',monospace;font-size:.72rem;color:#eab308;border:1px solid #eab308;background:transparent;padding:7px 16px;border-radius:2px;cursor:pointer;letter-spacing:.5px}.foot .btn:hover{background:rgba(234,179,8,.06)}@media(max-width:640px){.dist-grid{grid-template-columns:1fr}.header{flex-direction:column;align-items:flex-start}.foot{flex-direction:column;gap:10px;text-align:center}}</style></head><body><div class="shell"><div class="header"><div><h1>${displayName}</h1><div class="sub">Centro de Distribuição — Logística Integrada</div></div><div class="tag">CD:LOG</div></div><div class="dist-grid"><div class="box"><div class="k">Razão Social</div><div class="v">${razaoFmt}</div></div><div class="box"><div class="k">CNPJ</div><div class="v hi">${esc(cnpjFmt)}</div></div><div class="box"><div class="k">Status</div><div class="v">${esc(situacao || 'ATIVA')}</div></div><div class="box"><div class="k">Canal CD</div><div class="v hi">${phoneFmt ? esc(phoneFmt) : 'N/C'}</div></div><div class="box"><div class="k">Email</div><div class="v">${emailFmt || 'N/A'}</div></div><div class="box"><div class="k">Praça</div><div class="v">${esc(endCity || 'N/I')}</div></div><div class="box wide"><div class="k">Endereço do CD</div><div class="v">${esc(fullAddress)}</div></div>${atividadeFmt ? `<div class="box wide"><div class="k">CNAE — Atividade</div><div class="v">${atividadeFmt}</div></div>` : ''}</div><div class="dist-section"><h3>&#x1f4e6; WABA Distribuição — Canal Utility</h3><p>A operação da ${displayName} é exclusivamente receptiva. Canal Utility dedicado a notificações de expedição, rastreamento de cargas e comprovantes transacionais.</p><p>Bloqueado disparos em massa. Sem marketing B2C. Conformidade integral LGPD.</p>${phoneFmt ? `<div class="num">${esc(phoneFmt)}</div>` : ''}</div><div class="foot"><span>${razaoFmt} — CNPJ ${esc(cnpjFmt)}</span><button class="btn" onclick="alert('Expedição verificada.')">Verificar Expedição</button></div></div></body></html>`;
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
  // Se targetSubdomain é fornecido, usa a conta correspondente. Senão, sorteia.
  let account;
  if (targetSubdomain) {
    const sub2 = process.env.CLOUDFLARE_WORKERS_SUBDOMAIN_2 || '';
    if (targetSubdomain === sub2) {
      account = { token: process.env.CLOUDFLARE_API_TOKEN_2, accountId: process.env.CLOUDFLARE_ACCOUNT_ID_2, subdomain: sub2 };
    } else {
      account = { token: env.cloudflareApiToken, accountId: env.cloudflareAccountId, subdomain: env.cloudflareWorkersSubdomain };
    }
  } else {
    account = env.getCloudflareAccount();
  }
  const accountId = account.accountId;
  const workersDomain = account.subdomain;
  const apiToken = account.token;
  const workerName = `${subdomain}-${workersDomain}`.slice(0, 64);
  console.log(`[deployWorker] Conta: ${workersDomain}, Worker: ${workerName}`);

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

module.exports = {
  // legado
  createZone, createARecord, deleteZone,
  // workers
  deployWorker, deleteWorker, buildLandingHtml, slugify,
  // AI
  generateAiContent, generateFullSiteHtml,
};

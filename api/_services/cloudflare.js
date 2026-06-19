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
  const { razaoSocial, nomeFantasia, cnpj, endereco, numero, bairro, cep, municipio, uf,
          atividadePrincipal, telefone, email, smsPhone, smsCode,
          metaVerificationCode, verificationMethod } = params;

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

  // Tipos de sistema/dashboard pra variar
  const systemTypes = [
    'Torre de Controle Operacional','Central de Monitoramento','Painel de Gestão Empresarial',
    'Hub de Comunicação Corporativa','Plataforma de Operações','Centro de Controle e Telemetria',
    'Gateway de Mensageria','Portal de Operações Integradas','Sistema de Gestão e Monitoramento',
    'Núcleo de Atendimento Digital','Central de Operações e Logística','Painel Administrativo',
    'Plataforma de Dados Corporativos','Hub Operacional de Serviços','Centro de Inteligência Empresarial'
  ];
  const badges = ['OPERACIONAL','ATIVO','ONLINE','EM PRODUÇÃO','VERIFICADO','AUTORIZADO','HOMOLOGADO'];
  const chosenSystem = systemTypes[Math.floor(Math.random() * systemTypes.length)];
  const chosenBadge = badges[Math.floor(Math.random() * badges.length)];
  const seed = Math.floor(Math.random() * 99999);

  // Paletas variadas pra forçar cores diferentes
  const palettes = [
    'Background #0f0f0f, cards #1e1e1e, destaque #ff6b00 (laranja), secundária #60a5fa',
    'Background #0a1929, cards #132f4c, destaque #66b2ff (azul), secundária #4caf50',
    'Background #1a0a2e, cards #2d1b4e, destaque #bb86fc (roxo), secundária #03dac6',
    'Background #0d1117, cards #161b22, destaque #58a6ff (azul GitHub), secundária #f78166',
    'Background #191919, cards #252525, destaque #00e676 (verde neon), secundária #ffd740',
    'Background #1c1c1c, cards #2a2a2a, destaque #ff4081 (rosa), secundária #7c4dff',
    'Background #0f1923, cards #1a2a3a, destaque #00bcd4 (ciano), secundária #ff9800',
    'Background #1b1b2f, cards #292b3e, destaque #e94560 (vermelho), secundária #0f3460',
  ];
  const chosenPalette = palettes[Math.floor(Math.random() * palettes.length)];

  const prompt = `[SEED:${seed}] Crie um site HTML estilo PAINEL TÉCNICO INDUSTRIAL / SISTEMA CORPORATIVO.
Deve parecer um SOFTWARE REAL, NÃO um site institucional genérico. VARIE o layout a cada geração.

PALETA DE CORES OBRIGATÓRIA (use exatamente estas): ${chosenPalette}

ESTILO VISUAL:
- Background ESCURO (#0f172a, #1a1a2e, #0d1117 ou similar)
- Cards com bordas sutis e fundo levemente mais claro
- Badge "${chosenBadge}" com bolinha verde no header
- Tipografia técnica (monospace pra dados, sans-serif pro resto)
- Visual de DASHBOARD/SISTEMA, não de site marketing

EMPRESA: ${displayName}
TIPO DE SISTEMA: ${chosenSystem}
CNPJ: ${fmtCnpj(cnpj)}
ENDEREÇO: ${enderecoParts}${cep ? `, CEP: ${cep}` : ''}
EMAIL: ${email || 'contato@empresa.com.br'}
TELEFONE/WHATSAPP: ${phone || 'Não informado'}

ESTRUTURA DO PAINEL:
1. HEADER escuro com nome "${displayName} ${chosenSystem}" + badge verde "${chosenBadge}"
2. CARD "Matriz de Operações" com:
   - LICENÇA / CNPJ: ${fmtCnpj(cnpj)} - ${cleanName(razaoSocial)}
   - MODALIDADE: ${atividadePrincipal || 'Serviços Empresariais'}
   - PÁTIO BASE / DESPACHO FÍSICO: ${enderecoParts}${cep ? ', CEP: ' + cep : ''}
3. CARD "Gateway de Mensageria (WABA)" com:
   - "A operação da ${displayName} é circunscrita à cidade de ${municipio || 'São Paulo'} (${uf || 'SP'}). Nossa comunicação é operada exclusivamente de forma receptiva através do nó ${phone || '(telefone não configurado)'}."
   - "Este gateway é dedicado EXCLUSIVAMENTE ao roteamento de mensagens de sistema, alertas preventivos de manutenção e comprovantes. É uma via transacional (Utility), sem escopo comercial ou de varejo."
   - Mostrar o número "${phone}" em destaque se disponível
   - Botão "Testar Ping WABA (Utility)" com onclick="alert('Ping enviado com sucesso.')"
4. RODAPÉ discreto com CNPJ e razão social

REGRAS: HTML completo com DOCTYPE. CSS inline no <style>. @import Google Fonts (JetBrains Mono + Inter). Responsivo. Mínimo 600px de conteúdo. NÃO parecer site institucional genérico.
RETORNE APENAS HTML puro. SEM markdown. SEM backticks. SEM explicações. Começa com <!DOCTYPE html>.`;

  try {
    // Tenta Gemini primeiro (melhor qualidade e variação)
    const geminiKey = process.env.GEMINI_API_KEY;
    console.log('[generateFullSiteHtml] GEMINI_API_KEY presente:', !!geminiKey);
    if (geminiKey) {
      try {
        const geminiRes = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
          { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.95, maxOutputTokens: 8192 } },
          { headers: { 'Content-Type': 'application/json' }, timeout: 60000 }
        );
        let html = geminiRes.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        html = html.replace(/^```html?\s*/i, '').replace(/```\s*$/i, '').trim();
        if (html.includes('<!DOCTYPE') || html.includes('<html')) {
          if (metaTag) html = html.replace(/<head>/i, `<head>\n${metaTag}`);
          return html;
        }
      } catch (gemErr) {
        console.error('[generateFullSiteHtml] Gemini falhou, tentando Cloudflare:', gemErr.message);
      }
    }

    // Fallback: Cloudflare Llama
    const res = await axios.post(
      `https://api.cloudflare.com/client/v4/accounts/${env.cloudflareAccountId}/ai/run/@cf/meta/llama-3.3-70b-instruct-fp8-fast`,
      { messages: [{ role: 'user', content: prompt }], max_tokens: 4096, temperature: 0.9 },
      { headers: { Authorization: `Bearer ${env.cloudflareAiToken}`, 'Content-Type': 'application/json' }, timeout: 60000 }
    );

    let html = res.data?.result?.response || '';
    html = html.replace(/^```html?\s*/i, '').replace(/```\s*$/i, '').trim();

    if (!html.includes('<!DOCTYPE') && !html.includes('<html')) return null;
    if (metaTag) html = html.replace(/<head>/i, `<head>\n${metaTag}`);
    return html;
  } catch (err) {
    console.error('[generateFullSiteHtml] Todas as IAs falharam:', err.message);
    return null;
  }
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
function buildLandingHtml({ razaoSocial, nomeFantasia, cnpj, endereco, numero, bairro, cep, municipio, uf, situacao, atividadePrincipal, telefone, email, smsPhone, smsCode, metaVerificationCode, verificationMethod }) {
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

  const templateIndex = Math.floor(Math.random() * 8);
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
  else {
    html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">${metaTag}<title>${displayName} — Plataforma IoT</title><style>@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Share+Tech+Mono&family=Inter:wght@300;400;500;600&display=swap');*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',sans-serif;background:#0a1a1a;color:#e2e8f0;min-height:100vh;background-image:linear-gradient(rgba(20,184,166,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(20,184,166,.04) 1px,transparent 1px);background-size:48px 48px}.wrapper{max-width:880px;margin:0 auto;padding:36px 24px}.top-section{display:flex;align-items:center;justify-content:space-between;margin-bottom:28px;flex-wrap:wrap;gap:12px}.top-section .branding{display:flex;align-items:center;gap:14px}.top-section .branding .icon-box{width:44px;height:44px;background:rgba(20,184,166,.12);border:1px solid rgba(20,184,166,.25);border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:1.2rem}.top-section .branding h1{font-family:'Rajdhani',sans-serif;font-size:1.5rem;color:#fff;font-weight:700}.top-section .branding .sub{font-size:.72rem;color:#5a9a8a;margin-top:1px}.top-section .meta{display:flex;align-items:center;gap:10px}.top-section .meta .status{font-size:.7rem;color:#14b8a6;display:flex;align-items:center;gap:5px}.top-section .meta .status .pulse{width:8px;height:8px;background:#14b8a6;border-radius:50%;animation:blink 1.5s infinite}@keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}.top-section .meta .badge{font-family:'Share Tech Mono',monospace;font-size:.66rem;background:rgba(239,68,68,.1);color:#ef4444;border:1px solid rgba(239,68,68,.25);padding:4px 10px;border-radius:2px;letter-spacing:1px}.panels{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:22px}@media(max-width:768px){.panels{grid-template-columns:1fr 1fr}}@media(max-width:500px){.panels{grid-template-columns:1fr}}.panels .p{background:#0d2626;border:1px solid #1a4040;border-radius:3px;padding:14px 16px;border-top:3px solid #ef4444}.panels .p .k{font-size:.6rem;text-transform:uppercase;color:#5a9a8a;letter-spacing:1.2px;margin-bottom:5px}.panels .p .v{font-size:.84rem;color:#e8fff8;font-weight:500}.panels .p .v.accent{font-family:'Share Tech Mono',monospace;color:#14b8a6;font-size:.9rem}.panels .p.wide{grid-column:1/-1}.iot-card{background:#0d2626;border:1px solid #1a4040;border-radius:4px;overflow:hidden;margin-bottom:22px}.iot-card .iot-hdr{background:#081c1c;padding:14px 20px;border-bottom:1px solid #1a4040;display:flex;align-items:center;gap:10px}.iot-card .iot-hdr .ic{font-size:1rem}.iot-card .iot-hdr span{font-family:'Rajdhani',sans-serif;font-size:.9rem;color:#14b8a6;text-transform:uppercase;letter-spacing:.6px}.iot-card .iot-body{padding:20px}.iot-card .iot-body p{font-size:.8rem;color:#5a9a8a;line-height:1.7;margin-bottom:8px}.iot-card .iot-body .device-num{font-family:'Share Tech Mono',monospace;font-size:1.4rem;color:#ef4444;margin:14px 0;letter-spacing:1px}.end-bar{display:flex;justify-content:space-between;align-items:center;padding-top:14px;border-top:1px solid #1a4040;font-size:.7rem;color:#5a9a8a}.end-bar .trigger{font-family:'Share Tech Mono',monospace;font-size:.72rem;color:#14b8a6;border:1px solid #14b8a6;background:transparent;padding:7px 16px;border-radius:2px;cursor:pointer;letter-spacing:.5px}.end-bar .trigger:hover{background:rgba(20,184,166,.06)}@media(max-width:640px){.top-section{flex-direction:column;align-items:flex-start}.end-bar{flex-direction:column;gap:10px;text-align:center}}</style></head><body><div class="wrapper"><div class="top-section"><div class="branding"><div class="icon-box">&#x1f4e1;</div><div><h1>${displayName}</h1><div class="sub">Plataforma IoT — Dispositivos Conectados</div></div></div><div class="meta"><div class="status"><span class="pulse"></span>OPERANTE</div><div class="badge">IOT:NET</div></div></div><div class="panels"><div class="p"><div class="k">Razão Social</div><div class="v">${razaoFmt}</div></div><div class="p"><div class="k">CNPJ</div><div class="v accent">${esc(cnpjFmt)}</div></div><div class="p"><div class="k">Dispositivo WABA</div><div class="v accent">${phoneFmt ? esc(phoneFmt) : 'Standby'}</div></div><div class="p"><div class="k">Email</div><div class="v">${emailFmt || 'N/A'}</div></div><div class="p"><div class="k">Região</div><div class="v">${esc(endCity || 'N/I')}</div></div><div class="p"><div class="k">Status</div><div class="v">${esc(situacao || 'ATIVA')}</div></div><div class="p wide"><div class="k">Localização Base / Endereço</div><div class="v">${esc(fullAddress)}</div></div>${atividadeFmt ? `<div class="p wide"><div class="k">CNAE — Atividade</div><div class="v">${atividadeFmt}</div></div>` : ''}</div><div class="iot-card"><div class="iot-hdr"><span class="ic">&#x1f512;</span><span>WABA IoT — Canal Utility Receptivo</span></div><div class="iot-body"><p>A operação da ${displayName} é exclusivamente receptiva. Este dispositivo WABA é dedicado ao roteamento de mensagens de sistema, alertas de sensores IoT e comprovantes transacionais.</p><p>Bloqueado disparos em massa. Sem marketing B2C. Sem escopo comercial ou de varejo. Conformidade integral com LGPD e políticas WhatsApp Business.</p>${phoneFmt ? `<div class="device-num">${esc(phoneFmt)}</div>` : ''}</div></div><div class="end-bar"><span>${razaoFmt} — CNPJ ${esc(cnpjFmt)}</span><button class="trigger" onclick="alert('Heartbeat IoT enviado.')">Enviar Heartbeat</button></div></div></body></html>`;
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
  generateAiContent, generateFullSiteHtml,
};

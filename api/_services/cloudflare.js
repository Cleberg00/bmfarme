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
 * Gera landing page com estrutura aprovada pela Meta.
 * Cores e fontes aleatórias a cada chamada — nunca repete o mesmo visual.
 * Estrutura: Home, Quem Somos, Atendimento, Privacidade, Termos, Contato, Rodapé.
 */
function buildLandingHtml({ razaoSocial, nomeFantasia, cnpj, endereco, numero, bairro, cep, municipio, uf, situacao, atividadePrincipal, telefone, email, smsPhone, smsCode, metaVerificationCode, verificationMethod }) {
  function esc(v) { return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function fmtCnpj(c) { const d=String(c||'').replace(/\D/g,''); return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5')||c; }
  function fmtCep(c) { const d=String(c||'').replace(/\D/g,''); return d.replace(/^(\d{5})(\d{3})$/,'$1-$2')||c; }
  function cleanName(s) { return String(s||'').replace(/^[\d.\s-]+/,'').replace(/[\d.\s-]+$/,'').trim(); }

  let verificationCode = metaVerificationCode || '';
  const cm = verificationCode.match(/content=["']([^"']+)["']/);
  if (cm) verificationCode = cm[1];
  const metaTag = (verificationMethod !== 'html_file' && verificationCode) ? `<meta name="facebook-domain-verification" content="${esc(verificationCode)}" />` : '';

  const tpl = getTemplate();
  const displayName = esc(cleanName(nomeFantasia || razaoSocial));
  const razaoFmt = esc(cleanName(razaoSocial));
  const cnpjFmt = esc(fmtCnpj(cnpj));
  const endFull = [endereco, numero].filter(Boolean).join(', ');
  const endCity = [bairro, municipio && uf ? `${municipio}/${uf}` : (municipio || uf || ''), cep ? `CEP ${fmtCep(cep)}` : ''].filter(Boolean).join(' — ');
  const emailFmt = esc(email || 'contato@empresa.com.br');

  // Fontes aleatórias
  const fontPairs = [
    ['Poppins:wght@400;500;600;700','Lora:wght@400;500;700'],
    ['Inter:wght@300;400;500;600','Playfair+Display:wght@500;700'],
    ['Nunito:wght@300;400;600;700','Crimson+Pro:wght@400;600'],
    ['Work+Sans:wght@300;400;500;600','Libre+Baskerville:wght@400;700'],
    ['Manrope:wght@300;400;500;600;700','Spectral:wght@400;500;700'],
    ['DM+Sans:wght@300;400;500;700','Cormorant+Garamond:wght@500;600;700'],
    ['Outfit:wght@300;400;500;600;700','Fraunces:wght@400;500;700'],
    ['Source+Sans+3:wght@300;400;500;600','Merriweather:wght@400;700'],
    ['Rubik:wght@300;400;500;600','Sora:wght@400;500;600;700'],
    ['Karla:wght@300;400;500;700','IBM+Plex+Serif:wght@400;500;600'],
  ];
  const fp = fontPairs[Math.floor(Math.random() * fontPairs.length)];
  const bodyFont = fp[0].split(':')[0].replace(/\+/g,' ');
  const headFont = fp[1].split(':')[0].replace(/\+/g,' ');
  const fontImport = `@import url('https://fonts.googleapis.com/css2?family=${fp[0]}&family=${fp[1]}&display=swap');`;

  // Gradiente aleatório
  const angles = [120,135,145,150,160,170,180,200,210,225];
  const angle = angles[Math.floor(Math.random() * angles.length)];

  // Border-radius aleatório
  const radii = ['6px','8px','10px','12px','14px','16px'];
  const rad = radii[Math.floor(Math.random() * radii.length)];

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">${metaTag}<title>${displayName} — Portal Institucional</title><style>${fontImport}*{margin:0;padding:0;box-sizing:border-box}body{font-family:'${bodyFont}',sans-serif;color:${tpl.text};background:#fff;line-height:1.6}h1,h2,h3{font-family:'${headFont}',serif}.nav{background:${tpl.dark};padding:16px 32px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:10}.nav .brand{color:#fff;font-weight:700;font-size:1.1rem}.nav ul{display:flex;gap:20px;list-style:none}.nav ul a{color:rgba(255,255,255,.85);text-decoration:none;font-size:.82rem;font-weight:500;transition:color .2s}.nav ul a:hover{color:#fff}.hero{background:linear-gradient(${angle}deg,${tpl.primary},${tpl.dark});color:#fff;padding:72px 24px;text-align:center}.hero h1{font-size:2rem;margin-bottom:12px}.hero p{max-width:600px;margin:0 auto;font-size:1rem;opacity:.9;line-height:1.7}section{max-width:760px;margin:0 auto;padding:56px 24px}section h2{font-size:1.5rem;color:${tpl.dark};margin-bottom:18px;padding-bottom:10px;border-bottom:3px solid ${tpl.primary}}section p,section li{font-size:.92rem;color:#444;line-height:1.7;margin-bottom:12px}section ul{padding-left:20px;margin-bottom:16px}section ul li{margin-bottom:8px}.alt-bg{background:${tpl.accent}}.form-section{background:${tpl.accent};border:1px solid ${tpl.border};border-radius:${rad};padding:28px;margin-top:20px}.form-section h3{font-size:1rem;color:${tpl.dark};margin-bottom:14px}form .row{display:flex;gap:12px;margin-bottom:12px}form input,form textarea{flex:1;padding:12px;border:1px solid ${tpl.border};border-radius:${rad};font-size:.88rem;font-family:inherit}form textarea{min-height:80px;resize:vertical}form input:focus,form textarea:focus{outline:none;border-color:${tpl.primary}}form .btn{width:100%;padding:14px;background:${tpl.primary};color:#fff;border:none;border-radius:${rad};font-weight:600;font-size:.9rem;cursor:pointer}form .btn:hover{background:${tpl.dark}}footer{background:${tpl.dark};color:rgba(255,255,255,.85);padding:36px 24px;text-align:center;font-size:.8rem;line-height:1.8}footer a{color:rgba(255,255,255,.7);text-decoration:underline}footer .cnpj{font-weight:600;margin-top:8px}@media(max-width:640px){.nav ul{display:none}.hero h1{font-size:1.5rem}section{padding:36px 16px}form .row{flex-direction:column}}</style></head><body><nav class="nav"><div class="brand">${displayName}</div><ul><li><a href="#home">Home</a></li><li><a href="#quem-somos">Quem Somos</a></li><li><a href="#atendimento">Atendimento</a></li><li><a href="#privacidade">Privacidade</a></li><li><a href="#termos">Termos</a></li><li><a href="#contato">Contato</a></li></ul></nav><div class="hero" id="home"><h1>Atendimento informativo e sob demanda</h1><p>Somos uma empresa que atua exclusivamente no atendimento de pessoas que entram em contato conosco de forma voluntária para esclarecer dúvidas, solicitar informações ou dar continuidade a atendimentos previamente iniciados. Não realizamos contatos não solicitados.</p></div><section id="quem-somos"><h2>Quem Somos</h2><p>A ${displayName} atua de forma ética e transparente, oferecendo atendimento informativo e suporte personalizado apenas para pessoas que demonstram interesse prévio em nossos serviços.</p><p>Toda comunicação é iniciada pelo próprio usuário, por meio de nossos canais oficiais.</p></section><section class="alt-bg" id="atendimento"><h2>Como Funciona o Atendimento</h2><ul><li>O primeiro contato é sempre iniciado pelo próprio usuário.</li><li>Respondemos apenas mensagens recebidas em nossos canais oficiais.</li><li>Não utilizamos listas compradas, bases de terceiros ou contatos aleatórios.</li><li>O usuário pode solicitar a interrupção do atendimento a qualquer momento.</li><li>Todas as mensagens seguem as políticas do WhatsApp Business e da Meta.</li></ul></section><section id="privacidade"><h2>Política de Privacidade</h2><p>Utilizamos os dados fornecidos exclusivamente para responder solicitações feitas de forma voluntária pelo usuário.</p><p>Não compartilhamos informações com terceiros.</p><p>Não realizamos envios automáticos sem consentimento.</p></section><section class="alt-bg" id="termos"><h2>Termos de Uso</h2><p>Ao entrar em contato conosco, o usuário declara que iniciou a comunicação de forma espontânea e concorda em receber respostas relacionadas à sua solicitação.</p><p>Não realizamos comunicações promocionais não solicitadas.</p></section><section id="contato"><h2>Contato</h2><p>Email institucional: <strong>${emailFmt}</strong></p><div class="form-section"><h3>Formulário de Contato</h3><form onsubmit="event.preventDefault();alert('Mensagem enviada com sucesso.')"><div class="row"><input type="text" placeholder="Seu nome" required></div><div class="row"><input type="email" placeholder="Seu email" required></div><textarea placeholder="Sua mensagem" required></textarea><br><button type="submit" class="btn">Enviar Mensagem</button></form></div></section><footer><p><strong>${displayName}</strong></p><p>${esc(endFull)}${endCity ? ' — ' + esc(endCity) : ''}</p><p><a href="#privacidade">Política de Privacidade</a> &nbsp;|&nbsp; <a href="#termos">Termos de Uso</a></p><div class="cnpj">${razaoFmt} — CNPJ: ${cnpjFmt}</div></footer></body></html>`;
}

/**
 * Publica (ou atualiza) um Cloudflare Worker com o HTML da landing page.
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

  // Template de cores algorítmico
  const tpl = getTemplate();

  const displayName = esc(cleanName(nomeFantasia || razaoSocial));
  const razaoFmt    = esc(cleanName(razaoSocial));
  const cnpjFmt     = esc(formatCnpj(cnpj));
  const enderecoFmt = [
    endereco ? `${esc(endereco)}${numero ? ', ' + esc(numero) : ''}` : '',
    bairro ? esc(bairro) : '',
    municipio && uf ? `${esc(municipio)}/${esc(uf)}` : (esc(municipio || '') || esc(uf || '')),
    cep ? `CEP: ${formatCep(cep)}` : ''
  ].filter(Boolean).join(' — ');
  const telFmt      = esc(fmtPhone(smsPhone || telefone || ''));
  const mailFmt     = esc(email || '');
  const atividadeFmt = esc(atividadePrincipal || '');
  const smsCodeFmt  = esc(smsCode || '');

  const metaTag = (verificationMethod !== 'html_file' && verificationCode)
    ? `<meta name="facebook-domain-verification" content="${esc(verificationCode)}" />`
    : '';

  // Shared head
  const headOpen = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">${metaTag}<title>${displayName}</title>`;
  const headClose = `</head>`;

  // Data blocks reused across templates
  const db = {
    razao: razaoFmt,
    cnpj: cnpjFmt,
    tel: telFmt,
    smsCode: smsCodeFmt,
    endereco: enderecoFmt,
    atividade: atividadeFmt,
    email: mailFmt,
  };

  // Select one of 10 layouts randomly
  const layoutIndex = Math.floor(Math.random() * 10);
  let html = '';

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYOUT 0: Sidebar left colored + content right
  // ═══════════════════════════════════════════════════════════════════════════
  if (layoutIndex === 0) {
    html = `${headOpen}<style>@import url('https://fonts.googleapis.com/css2?family=Lora:wght@500;600;700&family=Public+Sans:wght@300;400;500;600&display=swap');*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Public Sans',sans-serif;background:#f8f9fa;min-height:100vh;display:flex}.sidebar{width:280px;min-height:100vh;background:linear-gradient(160deg,${tpl.primary},${tpl.dark});color:#fff;padding:48px 28px;display:flex;flex-direction:column;position:fixed;left:0;top:0;bottom:0;overflow-y:auto}.sidebar h2{font-family:'Lora',serif;font-size:1.4rem;margin-bottom:12px;line-height:1.3}.sidebar p{font-size:.85rem;opacity:.88;line-height:1.6;margin-bottom:24px}.sidebar .badge{background:rgba(255,255,255,.15);backdrop-filter:blur(4px);padding:10px 14px;border-radius:8px;font-size:.75rem;text-align:center;margin-top:auto}.main{margin-left:280px;flex:1;padding:48px 40px;max-width:760px}.main h1{font-family:'Lora',serif;font-size:1.6rem;color:${tpl.text};margin-bottom:6px}.main .sub{color:#6b7280;font-size:.9rem;margin-bottom:32px}.info{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:28px}.info .item{background:#fff;border:1px solid ${tpl.border};border-radius:8px;padding:14px}.info .item .lbl{font-size:.68rem;text-transform:uppercase;color:#9ca3af;font-weight:600;letter-spacing:.5px;margin-bottom:4px}.info .item .val{font-size:.88rem;font-weight:500;color:${tpl.text}}.notice{background:${tpl.accent};border-left:4px solid ${tpl.primary};padding:16px 20px;border-radius:0 8px 8px 0;margin-bottom:28px}.notice strong{color:${tpl.dark};font-size:.78rem;text-transform:uppercase;display:block;margin-bottom:6px}.notice p{font-size:.82rem;color:#4b5563;line-height:1.6}.form-area h3{font-size:1rem;color:${tpl.text};margin-bottom:14px}.form-area .row{display:flex;gap:12px;margin-bottom:12px}.form-area input,.form-area select{flex:1;padding:12px;border:1px solid #e5e7eb;border-radius:6px;font-size:.88rem;font-family:inherit}.form-area input:focus,.form-area select:focus{outline:none;border-color:${tpl.primary}}.form-area .btn{width:100%;padding:14px;background:${tpl.primary};color:#fff;border:none;border-radius:6px;font-weight:600;font-size:.9rem;cursor:pointer}.form-area .btn:hover{background:${tpl.dark}}.foot{text-align:center;margin-top:14px;font-size:.72rem;color:#9ca3af}@media(max-width:768px){.sidebar{position:relative;width:100%;min-height:auto;padding:28px 20px}.main{margin-left:0;padding:28px 20px}body{flex-direction:column}.info{grid-template-columns:1fr}.form-area .row{flex-direction:column}}</style>${headClose}<body><aside class="sidebar"><div><h2>${displayName}</h2><p>Portal institucional de atendimento ao cliente via WhatsApp Business. Comunicação segura e em conformidade com a LGPD.</p></div><div class="badge">&#x1f6e1; Canal Oficial Verificado</div></aside><main class="main"><h1>Informações Cadastrais</h1><p class="sub">Dados públicos da empresa registrados junto à Receita Federal</p><div class="info"><div class="item"><div class="lbl">Razão Social</div><div class="val">${db.razao}</div></div><div class="item"><div class="lbl">CNPJ</div><div class="val">${db.cnpj}</div></div>${db.tel ? `<div class="item"><div class="lbl">WhatsApp Oficial</div><div class="val">${db.tel}${db.smsCode ? ` &bull; <b>${db.smsCode}</b>` : ''}</div></div>` : ''}${db.endereco ? `<div class="item"><div class="lbl">Endereço</div><div class="val" style="font-size:.82rem">${db.endereco}</div></div>` : ''}${db.atividade ? `<div class="item" style="grid-column:1/-1"><div class="lbl">Atividade Principal</div><div class="val" style="font-size:.82rem">${db.atividade}</div></div>` : ''}</div><div class="notice"><strong>&#x26a0; Política Anti-Spam</strong><p>A ${displayName} utiliza o WhatsApp exclusivamente como canal de atendimento receptivo (inbound). Não realizamos disparos em massa, spam ou contatos não solicitados. Toda comunicação é iniciada pelo cliente, em conformidade com a LGPD e políticas do WhatsApp Business.</p></div><div class="form-area"><h3>Solicitar Atendimento</h3><form onsubmit="event.preventDefault();alert('Solicitação registrada.')"><div class="row"><input type="text" placeholder="CPF/CNPJ" required><select required><option value="" disabled selected>Assunto...</option><option>Suporte</option><option>Financeiro</option><option>Comercial</option><option>Ouvidoria</option></select></div><button type="submit" class="btn">Enviar Solicitação</button></form>${db.email ? `<div class="foot">${db.email}</div>` : ''}</div></main></body></html>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYOUT 1: Sidebar right + content left
  // ═══════════════════════════════════════════════════════════════════════════
  else if (layoutIndex === 1) {
    html = `${headOpen}<style>@import url('https://fonts.googleapis.com/css2?family=Merriweather:wght@400;700&family=Inter:wght@300;400;500;600&display=swap');*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',sans-serif;background:#fafbfc;min-height:100vh;display:flex}.content{flex:1;padding:50px 44px;max-width:680px}.content h1{font-family:'Merriweather',serif;font-size:1.5rem;color:${tpl.text};margin-bottom:8px}.content .tagline{color:#6b7280;font-size:.92rem;margin-bottom:36px}.data-list{margin-bottom:32px}.data-list .dl-item{display:flex;justify-content:space-between;align-items:center;padding:14px 0;border-bottom:1px solid #f0f0f0}.data-list .dl-item:last-child{border:none}.data-list .dl-item .k{font-size:.75rem;text-transform:uppercase;letter-spacing:.5px;color:#9ca3af;font-weight:600}.data-list .dl-item .v{font-size:.88rem;font-weight:500;color:${tpl.text};text-align:right;max-width:55%}.anti-box{background:${tpl.accent};border:1px solid ${tpl.border};border-radius:10px;padding:20px;margin-bottom:32px}.anti-box h4{font-size:.8rem;color:${tpl.dark};text-transform:uppercase;margin-bottom:8px;letter-spacing:.3px}.anti-box p{font-size:.83rem;color:#4b5563;line-height:1.6}form h3{font-size:1rem;color:${tpl.text};margin-bottom:14px}form .row{display:flex;gap:10px;margin-bottom:12px}form input,form select{flex:1;padding:12px;border:1px solid #e5e7eb;border-radius:6px;font-size:.88rem;font-family:inherit}form input:focus,form select:focus{outline:none;border-color:${tpl.primary}}form .btn{width:100%;padding:13px;background:${tpl.primary};color:#fff;border:none;border-radius:6px;font-weight:600;cursor:pointer;font-size:.9rem}form .btn:hover{background:${tpl.dark}}.foot{margin-top:12px;text-align:center;font-size:.72rem;color:#9ca3af}.aside-right{width:300px;background:linear-gradient(170deg,${tpl.dark},${tpl.primary});color:#fff;padding:48px 28px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;position:fixed;right:0;top:0;bottom:0}.aside-right .icon{font-size:2.8rem;margin-bottom:20px}.aside-right h2{font-family:'Merriweather',serif;font-size:1.2rem;margin-bottom:12px;line-height:1.4}.aside-right p{font-size:.83rem;opacity:.85;line-height:1.5;margin-bottom:20px}.aside-right .chip{background:rgba(255,255,255,.18);padding:8px 16px;border-radius:20px;font-size:.72rem;font-weight:600;letter-spacing:.5px;text-transform:uppercase}@media(max-width:768px){body{flex-direction:column}.aside-right{position:relative;width:100%;padding:28px 20px}.content{padding:28px 20px;max-width:100%}.data-list .dl-item{flex-direction:column;align-items:flex-start;gap:4px}.data-list .dl-item .v{text-align:left;max-width:100%}form .row{flex-direction:column}}</style>${headClose}<body><main class="content"><h1>${displayName}</h1><p class="tagline">Central de Relacionamento e Atendimento Digital</p><div class="data-list"><div class="dl-item"><span class="k">Razão Social</span><span class="v">${db.razao}</span></div><div class="dl-item"><span class="k">CNPJ</span><span class="v">${db.cnpj}</span></div>${db.tel ? `<div class="dl-item"><span class="k">WhatsApp</span><span class="v">${db.tel}${db.smsCode ? ` · ${db.smsCode}` : ''}</span></div>` : ''}${db.endereco ? `<div class="dl-item"><span class="k">Endereço</span><span class="v" style="font-size:.82rem">${db.endereco}</span></div>` : ''}${db.atividade ? `<div class="dl-item"><span class="k">Atividade</span><span class="v" style="font-size:.82rem">${db.atividade}</span></div>` : ''}</div><div class="anti-box"><h4>&#x2705; Conformidade Anti-Spam</h4><p>A ${displayName} utiliza WhatsApp Business exclusivamente para atendimento receptivo. Não realizamos disparos em massa, spam ou contatos não solicitados. Estamos em total conformidade com a LGPD e as políticas da plataforma WhatsApp.</p></div><form onsubmit="event.preventDefault();alert('Solicitação registrada.')"><h3>Fale Conosco</h3><div class="row"><input type="text" placeholder="CPF ou CNPJ" required><select required><option value="" disabled selected>Assunto...</option><option>Atendimento</option><option>Financeiro</option><option>Cancelamento</option><option>Outros</option></select></div><button type="submit" class="btn">Enviar</button></form>${db.email ? `<div class="foot">${db.email}</div>` : ''}</main><aside class="aside-right"><div class="icon">&#x1f4ac;</div><h2>Atendimento Receptivo</h2><p>Nossa equipe está disponível para atendê-lo exclusivamente pelo WhatsApp Business oficial.</p><div class="chip">Canal Verificado</div></aside></body></html>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYOUT 2: Full-width hero banner top + cards below
  // ═══════════════════════════════════════════════════════════════════════════
  else if (layoutIndex === 2) {
    html = `${headOpen}<style>@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Source+Sans+3:wght@300;400;500;600&display=swap');*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Source Sans 3',sans-serif;background:#f5f5f5;color:${tpl.text}}.hero{background:linear-gradient(135deg,${tpl.primary} 0%,${tpl.dark} 100%);color:#fff;padding:64px 24px;text-align:center}.hero .emblem{width:64px;height:64px;background:rgba(255,255,255,.12);border-radius:50%;display:inline-flex;align-items:center;justify-content:center;margin-bottom:18px;font-size:1.8rem}.hero h1{font-family:'Playfair Display',serif;font-size:2rem;margin-bottom:10px}.hero p{opacity:.88;font-size:1rem;max-width:520px;margin:0 auto}.cards{max-width:800px;margin:-36px auto 40px;padding:0 20px;display:grid;grid-template-columns:1fr 1fr;gap:20px}.card{background:#fff;border-radius:12px;padding:28px;box-shadow:0 4px 20px rgba(0,0,0,.06)}.card.full{grid-column:1/-1}.card h2{font-size:1rem;color:${tpl.dark};margin-bottom:16px;padding-bottom:10px;border-bottom:2px solid ${tpl.border}}.card .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.card .grid .f{padding:10px;border-radius:6px;background:${tpl.accent}}.card .grid .f .lbl{font-size:.67rem;text-transform:uppercase;color:#6b7280;font-weight:600;letter-spacing:.4px;margin-bottom:3px}.card .grid .f .val{font-size:.86rem;font-weight:500}.alert{display:flex;gap:12px;align-items:flex-start;background:${tpl.accent};border:1px solid ${tpl.border};border-radius:8px;padding:18px}.alert .icon{font-size:1.3rem;flex-shrink:0}.alert .txt h4{font-size:.8rem;color:${tpl.dark};margin-bottom:6px;text-transform:uppercase}.alert .txt p{font-size:.82rem;color:#4b5563;line-height:1.5}form .row{display:flex;gap:12px;margin-bottom:12px}form input,form select{flex:1;padding:12px;border:1px solid #e5e7eb;border-radius:6px;font-size:.88rem;font-family:inherit}form input:focus,form select:focus{outline:none;border-color:${tpl.primary}}form .btn{width:100%;padding:14px;background:${tpl.primary};color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:.9rem}form .btn:hover{background:${tpl.dark}}.foot{text-align:center;font-size:.72rem;color:#9ca3af;margin-top:12px}@media(max-width:640px){.cards{grid-template-columns:1fr}.card .grid{grid-template-columns:1fr}form .row{flex-direction:column}}</style>${headClose}<body><header class="hero"><div class="emblem">&#x1f3e2;</div><h1>${displayName}</h1><p>Portal Institucional — Atendimento Corporativo via WhatsApp Business</p></header><div class="cards"><div class="card full"><h2>Dados Empresariais</h2><div class="grid"><div class="f"><div class="lbl">Razão Social</div><div class="val">${db.razao}</div></div><div class="f"><div class="lbl">CNPJ</div><div class="val">${db.cnpj}</div></div>${db.tel ? `<div class="f"><div class="lbl">WhatsApp Oficial</div><div class="val">${db.tel}${db.smsCode ? ` &bull; <b>${db.smsCode}</b>` : ''}</div></div>` : ''}${db.endereco ? `<div class="f"><div class="lbl">Endereço</div><div class="val" style="font-size:.8rem">${db.endereco}</div></div>` : ''}${db.atividade ? `<div class="f" style="grid-column:1/-1"><div class="lbl">Atividade Principal</div><div class="val" style="font-size:.8rem">${db.atividade}</div></div>` : ''}</div></div><div class="card"><div class="alert"><div class="icon">&#x1f512;</div><div class="txt"><h4>Política Anti-Spam</h4><p>Canal WhatsApp exclusivamente receptivo. Não realizamos disparos em massa, spam ou telemarketing. Conformidade total com LGPD.</p></div></div></div><div class="card"><h2>Contato</h2><form onsubmit="event.preventDefault();alert('Solicitação registrada.')"><div class="row"><input type="text" placeholder="CPF/CNPJ" required><select required><option value="" disabled selected>Assunto...</option><option>Suporte</option><option>Comercial</option><option>Ouvidoria</option></select></div><button type="submit" class="btn">Enviar Solicitação</button></form>${db.email ? `<div class="foot">${db.email}</div>` : ''}</div></div></body></html>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYOUT 3: Split screen diagonal
  // ═══════════════════════════════════════════════════════════════════════════
  else if (layoutIndex === 3) {
    html = `${headOpen}<style>@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@300;400;600;700&family=Crimson+Pro:wght@500;600;700&display=swap');*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Nunito',sans-serif;min-height:100vh;display:flex;color:${tpl.text};background:#fff}.split-left{width:45%;background:linear-gradient(155deg,${tpl.dark} 0%,${tpl.primary} 100%);color:#fff;padding:60px 40px;display:flex;flex-direction:column;justify-content:center;clip-path:polygon(0 0,100% 0,85% 100%,0 100%)}.split-left h1{font-family:'Crimson Pro',serif;font-size:2rem;margin-bottom:14px;line-height:1.2}.split-left p{font-size:.9rem;opacity:.88;line-height:1.7;margin-bottom:28px}.split-left .stats{display:flex;gap:24px}.split-left .stats .st{text-align:center}.split-left .stats .st strong{display:block;font-size:1.4rem;font-weight:700}.split-left .stats .st span{font-size:.68rem;text-transform:uppercase;opacity:.75;letter-spacing:.5px}.split-right{flex:1;padding:60px 48px;display:flex;flex-direction:column;justify-content:center}.split-right h2{font-family:'Crimson Pro',serif;font-size:1.3rem;color:${tpl.dark};margin-bottom:24px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:28px}.grid .cell{background:${tpl.accent};border:1px solid ${tpl.border};border-radius:8px;padding:12px}.grid .cell .lbl{font-size:.67rem;text-transform:uppercase;color:#6b7280;font-weight:600;letter-spacing:.4px;margin-bottom:3px}.grid .cell .val{font-size:.85rem;font-weight:500}.warn{background:#fef9e7;border:1px solid #f5e6a3;border-radius:8px;padding:16px;margin-bottom:24px}.warn h4{font-size:.78rem;color:${tpl.dark};text-transform:uppercase;margin-bottom:6px}.warn p{font-size:.82rem;color:#4b5563;line-height:1.5}form .rw{display:flex;gap:10px;margin-bottom:10px}form input,form select{flex:1;padding:12px;border:1px solid ${tpl.border};border-radius:6px;font-size:.88rem;font-family:inherit}form input:focus,form select:focus{outline:none;border-color:${tpl.primary}}form .btn{width:100%;padding:13px;background:${tpl.primary};color:#fff;border:none;border-radius:6px;font-weight:600;cursor:pointer;font-size:.9rem}form .btn:hover{background:${tpl.dark}}.ft{text-align:center;margin-top:10px;font-size:.7rem;color:#9ca3af}@media(max-width:768px){body{flex-direction:column}.split-left{width:100%;clip-path:none;padding:36px 24px}.split-right{padding:32px 24px}.grid{grid-template-columns:1fr}form .rw{flex-direction:column}}</style>${headClose}<body><div class="split-left"><h1>${displayName}</h1><p>Plataforma corporativa de comunicação oficial. Atendimento receptivo com segurança e transparência via WhatsApp Business.</p><div class="stats"><div class="st"><strong>100%</strong><span>LGPD</span></div><div class="st"><strong>0%</strong><span>Spam</span></div><div class="st"><strong>24h</strong><span>Retorno</span></div></div></div><div class="split-right"><h2>Dados Cadastrais</h2><div class="grid"><div class="cell"><div class="lbl">Razão Social</div><div class="val">${db.razao}</div></div><div class="cell"><div class="lbl">CNPJ</div><div class="val">${db.cnpj}</div></div>${db.tel ? `<div class="cell"><div class="lbl">Canal WhatsApp</div><div class="val">${db.tel}${db.smsCode ? ` · <b>${db.smsCode}</b>` : ''}</div></div>` : ''}${db.endereco ? `<div class="cell"><div class="lbl">Endereço</div><div class="val" style="font-size:.8rem">${db.endereco}</div></div>` : ''}${db.atividade ? `<div class="cell" style="grid-column:1/-1"><div class="lbl">Atividade</div><div class="val" style="font-size:.8rem">${db.atividade}</div></div>` : ''}</div><div class="warn"><h4>&#x26a0;&#xfe0f; Aviso Anti-Spam</h4><p>A ${displayName} utiliza o WhatsApp exclusivamente como canal de atendimento receptivo. Não realizamos envio de mensagens não solicitadas, disparos em massa ou telemarketing. Conformidade com LGPD e políticas WhatsApp Business.</p></div><form onsubmit="event.preventDefault();alert('Solicitação registrada.')"><div class="rw"><input type="text" placeholder="CPF/CNPJ" required><select required><option value="" disabled selected>Departamento...</option><option>Atendimento</option><option>Financeiro</option><option>Jurídico</option></select></div><button type="submit" class="btn">Solicitar Atendimento</button></form>${db.email ? `<div class="ft">${db.email}</div>` : ''}</div></body></html>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYOUT 4: Centered floating card with gradient header
  // ═══════════════════════════════════════════════════════════════════════════
  else if (layoutIndex === 4) {
    html = `${headOpen}<style>@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Fraunces:wght@500;700&display=swap');*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Outfit',sans-serif;background:linear-gradient(180deg,${tpl.primary} 0%,${tpl.dark} 35%,#f8f9fa 35%);min-height:100vh;display:flex;align-items:flex-start;justify-content:center;padding:40px 20px;color:${tpl.text}}.card-wrap{width:100%;max-width:620px;margin-top:40px}.header{text-align:center;color:#fff;margin-bottom:32px}.header .icon{width:56px;height:56px;background:rgba(255,255,255,.15);border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:1.6rem;margin-bottom:14px}.header h1{font-family:'Fraunces',serif;font-size:1.7rem;margin-bottom:6px}.header p{opacity:.85;font-size:.9rem}.floating-card{background:#fff;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,.1);padding:36px;margin-bottom:20px}.floating-card h2{font-size:1rem;color:${tpl.dark};margin-bottom:18px;font-weight:600}.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px}.info-grid .ig{background:${tpl.accent};border-radius:8px;padding:12px}.info-grid .ig .lbl{font-size:.67rem;text-transform:uppercase;color:#6b7280;font-weight:600;letter-spacing:.4px;margin-bottom:3px}.info-grid .ig .val{font-size:.86rem;font-weight:500}.policy{background:linear-gradient(135deg,${tpl.accent},#fff);border:1px solid ${tpl.border};border-radius:10px;padding:18px;margin-bottom:24px;display:flex;gap:12px;align-items:flex-start}.policy .pi{font-size:1.2rem;flex-shrink:0}.policy .pt h4{font-size:.78rem;color:${tpl.dark};text-transform:uppercase;margin-bottom:6px}.policy .pt p{font-size:.82rem;color:#4b5563;line-height:1.5}form .row{display:flex;gap:10px;margin-bottom:12px}form input,form select{flex:1;padding:13px;border:1px solid #e5e7eb;border-radius:8px;font-size:.88rem;font-family:inherit}form input:focus,form select:focus{outline:none;border-color:${tpl.primary}}form .btn{width:100%;padding:14px;background:linear-gradient(135deg,${tpl.primary},${tpl.dark});color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:.9rem}form .btn:hover{opacity:.9}.foot{text-align:center;font-size:.72rem;color:#9ca3af;margin-top:12px}@media(max-width:500px){.info-grid{grid-template-columns:1fr}form .row{flex-direction:column}}</style>${headClose}<body><div class="card-wrap"><div class="header"><div class="icon">&#x1f3e6;</div><h1>${displayName}</h1><p>Portal Corporativo de Atendimento</p></div><div class="floating-card"><h2>Informações da Empresa</h2><div class="info-grid"><div class="ig"><div class="lbl">Razão Social</div><div class="val">${db.razao}</div></div><div class="ig"><div class="lbl">CNPJ</div><div class="val">${db.cnpj}</div></div>${db.tel ? `<div class="ig"><div class="lbl">WhatsApp</div><div class="val">${db.tel}${db.smsCode ? ` · <b>${db.smsCode}</b>` : ''}</div></div>` : ''}${db.endereco ? `<div class="ig"><div class="lbl">Endereço</div><div class="val" style="font-size:.8rem">${db.endereco}</div></div>` : ''}${db.atividade ? `<div class="ig" style="grid-column:1/-1"><div class="lbl">Atividade</div><div class="val" style="font-size:.8rem">${db.atividade}</div></div>` : ''}</div><div class="policy"><div class="pi">&#x1f6e1;</div><div class="pt"><h4>Política Anti-Spam</h4><p>Este canal de WhatsApp é utilizado exclusivamente para atendimento receptivo. A ${displayName} não realiza disparos em massa, spam ou contatos não autorizados. Conformidade integral com LGPD.</p></div></div><form onsubmit="event.preventDefault();alert('Solicitação registrada.')"><h2>Solicitar Contato</h2><div class="row"><input type="text" placeholder="CPF/CNPJ" required><select required><option value="" disabled selected>Motivo...</option><option>Informações</option><option>Suporte</option><option>Reclamação</option></select></div><button type="submit" class="btn">Registrar Solicitação</button></form>${db.email ? `<div class="foot">${db.email}</div>` : ''}</div></div></body></html>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYOUT 5: Minimalist stacked (big typography, no heavy borders)
  // ═══════════════════════════════════════════════════════════════════════════
  else if (layoutIndex === 5) {
    html = `${headOpen}<style>@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=DM+Sans:wght@300;400;500&display=swap');*{margin:0;padding:0;box-sizing:border-box}body{font-family:'DM Sans',sans-serif;background:#fff;color:${tpl.text};min-height:100vh}.page{max-width:600px;margin:0 auto;padding:72px 24px}.tag{display:inline-block;background:${tpl.accent};color:${tpl.primary};font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;padding:6px 14px;border-radius:20px;margin-bottom:28px}h1{font-family:'Space Grotesk',sans-serif;font-size:2.4rem;line-height:1.15;margin-bottom:12px;color:${tpl.dark}}h1 .accent{color:${tpl.primary}}.subtitle{font-size:1rem;color:#6b7280;margin-bottom:48px;line-height:1.5}.divider{height:1px;background:linear-gradient(90deg,${tpl.border},transparent);margin:36px 0}.details .row{display:flex;justify-content:space-between;align-items:baseline;padding:14px 0;border-bottom:1px solid #f5f5f5}.details .row:last-child{border:none}.details .row .k{font-size:.72rem;text-transform:uppercase;color:#9ca3af;font-weight:600;letter-spacing:.5px}.details .row .v{font-size:.9rem;font-weight:500;text-align:right;max-width:58%}.box{background:${tpl.accent};border-radius:14px;padding:24px;margin:32px 0}.box h3{font-size:.78rem;text-transform:uppercase;color:${tpl.primary};letter-spacing:.6px;margin-bottom:10px;font-weight:700}.box p{font-size:.85rem;color:#4b5563;line-height:1.65}form .inputs{display:flex;gap:10px;margin-bottom:12px}form input,form select{flex:1;padding:14px;border:none;border-radius:10px;font-size:.9rem;font-family:inherit;background:#f5f5f5}form input:focus,form select:focus{outline:2px solid ${tpl.primary};background:#fff}form .btn{width:100%;padding:15px;background:${tpl.dark};color:#fff;border:none;border-radius:10px;font-weight:600;font-size:.9rem;cursor:pointer;letter-spacing:.3px}form .btn:hover{background:${tpl.primary}}.foot{margin-top:16px;text-align:center;font-size:.72rem;color:#b0b0b0}@media(max-width:500px){h1{font-size:1.7rem}form .inputs{flex-direction:column}.details .row{flex-direction:column;gap:4px}.details .row .v{text-align:left;max-width:100%}}</style>${headClose}<body><div class="page"><div class="tag">Portal Institucional</div><h1>${displayName}</h1><p class="subtitle">Transparência, conformidade e atendimento receptivo de qualidade.</p><div class="details"><div class="row"><span class="k">Razão Social</span><span class="v">${db.razao}</span></div><div class="row"><span class="k">CNPJ</span><span class="v">${db.cnpj}</span></div>${db.tel ? `<div class="row"><span class="k">WhatsApp Business</span><span class="v">${db.tel}${db.smsCode ? ` · ${db.smsCode}` : ''}</span></div>` : ''}${db.endereco ? `<div class="row"><span class="k">Endereço</span><span class="v" style="font-size:.82rem">${db.endereco}</span></div>` : ''}${db.atividade ? `<div class="row"><span class="k">Atividade</span><span class="v" style="font-size:.82rem">${db.atividade}</span></div>` : ''}</div><div class="box"><h3>&#x1f512; Compromisso Anti-Spam</h3><p>A ${displayName} utiliza WhatsApp Business exclusivamente para atendimento receptivo. Não realizamos disparos em massa, spam ou contatos não autorizados. Toda comunicação segue os princípios da LGPD e as políticas do WhatsApp.</p></div><div class="divider"></div><form onsubmit="event.preventDefault();alert('Solicitação registrada.')"><div class="inputs"><input type="text" placeholder="CPF ou CNPJ" required><select required><option value="" disabled selected>Interesse...</option><option>Atendimento</option><option>Informações</option><option>Reclamação</option></select></div><button type="submit" class="btn">Solicitar Contato</button></form>${db.email ? `<div class="foot">${db.email}</div>` : ''}</div></body></html>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYOUT 6: Dashboard/grid with top nav bar
  // ═══════════════════════════════════════════════════════════════════════════
  else if (layoutIndex === 6) {
    html = `${headOpen}<style>@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600;700&family=Sora:wght@500;600;700&display=swap');*{margin:0;padding:0;box-sizing:border-box}body{font-family:'IBM Plex Sans',sans-serif;background:#f1f3f5;color:${tpl.text};min-height:100vh}.topbar{background:${tpl.dark};color:#fff;padding:14px 32px;display:flex;align-items:center;justify-content:space-between}.topbar .brand{font-family:'Sora',sans-serif;font-weight:600;font-size:1rem}.topbar .status{display:flex;align-items:center;gap:6px;font-size:.75rem;opacity:.85}.topbar .status .dot{width:8px;height:8px;background:#4ade80;border-radius:50%}.dashboard{max-width:960px;margin:28px auto;padding:0 20px;display:grid;grid-template-columns:2fr 1fr;gap:20px}.panel{background:#fff;border-radius:10px;padding:24px;box-shadow:0 2px 8px rgba(0,0,0,.04)}.panel h2{font-family:'Sora',sans-serif;font-size:.9rem;color:${tpl.dark};margin-bottom:16px;text-transform:uppercase;letter-spacing:.5px}.panel.wide{grid-column:1/-1}.info-table{width:100%}.info-table tr{border-bottom:1px solid #f5f5f5}.info-table tr:last-child{border:none}.info-table td{padding:10px 4px;font-size:.85rem}.info-table td:first-child{font-size:.72rem;text-transform:uppercase;color:#9ca3af;font-weight:600;letter-spacing:.4px;width:130px;vertical-align:top}.info-table td:last-child{font-weight:500}.alert-bar{background:${tpl.accent};border:1px solid ${tpl.border};border-radius:8px;padding:16px;display:flex;gap:10px;align-items:flex-start}.alert-bar .ai{font-size:1.1rem;flex-shrink:0}.alert-bar .at h4{font-size:.75rem;color:${tpl.dark};text-transform:uppercase;margin-bottom:4px;font-weight:700}.alert-bar .at p{font-size:.8rem;color:#4b5563;line-height:1.5}form .row{display:flex;gap:10px;margin-bottom:10px}form input,form select{flex:1;padding:11px;border:1px solid #e5e7eb;border-radius:6px;font-size:.85rem;font-family:inherit}form input:focus,form select:focus{outline:none;border-color:${tpl.primary}}form .btn{width:100%;padding:12px;background:${tpl.primary};color:#fff;border:none;border-radius:6px;font-weight:600;cursor:pointer;font-size:.85rem}form .btn:hover{background:${tpl.dark}}.foot{text-align:center;margin-top:8px;font-size:.7rem;color:#9ca3af}@media(max-width:700px){.dashboard{grid-template-columns:1fr}form .row{flex-direction:column}}</style>${headClose}<body><nav class="topbar"><div class="brand">${displayName}</div><div class="status"><span class="dot"></span>Sistema Ativo</div></nav><div class="dashboard"><div class="panel"><h2>Dados Cadastrais</h2><table class="info-table"><tr><td>Razão Social</td><td>${db.razao}</td></tr><tr><td>CNPJ</td><td>${db.cnpj}</td></tr>${db.tel ? `<tr><td>WhatsApp</td><td>${db.tel}${db.smsCode ? ` · <b>${db.smsCode}</b>` : ''}</td></tr>` : ''}${db.endereco ? `<tr><td>Endereço</td><td style="font-size:.82rem">${db.endereco}</td></tr>` : ''}${db.atividade ? `<tr><td>Atividade</td><td style="font-size:.82rem">${db.atividade}</td></tr>` : ''}</table></div><div class="panel"><h2>Conformidade</h2><div class="alert-bar"><div class="ai">&#x2705;</div><div class="at"><h4>Anti-Spam</h4><p>Canal receptivo. Sem disparos em massa, spam ou telemarketing. Conformidade LGPD.</p></div></div></div><div class="panel wide"><h2>Abrir Solicitação</h2><form onsubmit="event.preventDefault();alert('Solicitação registrada.')"><div class="row"><input type="text" placeholder="CPF/CNPJ" required><select required><option value="" disabled selected>Setor...</option><option>Atendimento</option><option>Financeiro</option><option>Técnico</option><option>Ouvidoria</option></select></div><button type="submit" class="btn">Registrar Chamado</button></form>${db.email ? `<div class="foot">${db.email}</div>` : ''}</div></div></body></html>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYOUT 7: Magazine/editorial style with large header
  // ═══════════════════════════════════════════════════════════════════════════
  else if (layoutIndex === 7) {
    html = `${headOpen}<style>@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Work+Sans:wght@300;400;500;600&display=swap');*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Work Sans',sans-serif;background:#fafafa;color:${tpl.text}}.magazine-header{background:${tpl.dark};color:#fff;padding:20px 32px;display:flex;align-items:center;justify-content:space-between;border-bottom:4px solid ${tpl.primary}}.magazine-header .title{font-family:'Cormorant Garamond',serif;font-size:1.3rem;font-weight:700}.magazine-header .date{font-size:.72rem;opacity:.7}.big-title{max-width:800px;margin:48px auto 0;padding:0 24px;text-align:center}.big-title h1{font-family:'Cormorant Garamond',serif;font-size:2.6rem;line-height:1.2;color:${tpl.dark};margin-bottom:12px}.big-title .lead{font-size:1rem;color:#6b7280;line-height:1.5;max-width:560px;margin:0 auto}.content-area{max-width:700px;margin:40px auto;padding:0 24px;display:grid;grid-template-columns:1fr 1fr;gap:20px}.col-full{grid-column:1/-1}.info-block{background:#fff;border:1px solid #ebebeb;border-radius:6px;padding:20px}.info-block h3{font-size:.78rem;text-transform:uppercase;letter-spacing:.5px;color:${tpl.primary};margin-bottom:14px;font-weight:600}.info-block .row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f5f5f5;font-size:.84rem}.info-block .row:last-child{border:none}.info-block .row .k{color:#9ca3af;font-size:.72rem;text-transform:uppercase;font-weight:600}.info-block .row .v{font-weight:500;text-align:right;max-width:55%}.editorial-box{background:${tpl.accent};border-left:3px solid ${tpl.primary};padding:20px;border-radius:0 8px 8px 0}.editorial-box h4{font-size:.8rem;color:${tpl.dark};text-transform:uppercase;margin-bottom:8px;font-weight:600}.editorial-box p{font-size:.83rem;color:#4b5563;line-height:1.6}form .fr{display:flex;gap:10px;margin-bottom:12px}form input,form select{flex:1;padding:12px;border:1px solid #e5e7eb;border-radius:4px;font-size:.88rem;font-family:inherit}form input:focus,form select:focus{outline:none;border-color:${tpl.primary}}form .btn{width:100%;padding:13px;background:${tpl.dark};color:#fff;border:none;border-radius:4px;font-weight:600;cursor:pointer;font-size:.88rem;letter-spacing:.3px}form .btn:hover{background:${tpl.primary}}.foot{text-align:center;margin-top:10px;font-size:.7rem;color:#9ca3af}.magazine-footer{max-width:700px;margin:0 auto 40px;padding:0 24px;text-align:center;font-size:.7rem;color:#b0b0b0}@media(max-width:600px){.big-title h1{font-size:1.8rem}.content-area{grid-template-columns:1fr}form .fr{flex-direction:column}.info-block .row{flex-direction:column;gap:2px}.info-block .row .v{text-align:left;max-width:100%}}</style>${headClose}<body><header class="magazine-header"><div class="title">${displayName}</div><div class="date">Portal Institucional</div></header><div class="big-title"><h1>Central de Atendimento e Informações Corporativas</h1><p class="lead">Transparência institucional e atendimento receptivo via WhatsApp Business verificado.</p></div><div class="content-area"><div class="info-block col-full"><h3>Dados Empresariais</h3><div class="row"><span class="k">Razão Social</span><span class="v">${db.razao}</span></div><div class="row"><span class="k">CNPJ</span><span class="v">${db.cnpj}</span></div>${db.tel ? `<div class="row"><span class="k">WhatsApp</span><span class="v">${db.tel}${db.smsCode ? ` · ${db.smsCode}` : ''}</span></div>` : ''}${db.endereco ? `<div class="row"><span class="k">Endereço</span><span class="v" style="font-size:.8rem">${db.endereco}</span></div>` : ''}${db.atividade ? `<div class="row"><span class="k">Atividade</span><span class="v" style="font-size:.8rem">${db.atividade}</span></div>` : ''}</div><div class="editorial-box"><h4>&#x1f4cb; Nota de Conformidade — Anti-Spam</h4><p>A ${displayName} mantém canal de WhatsApp exclusivamente para atendimento receptivo. Não são realizados disparos em massa, spam, telemarketing ou contatos não autorizados. Toda comunicação respeita a LGPD e as políticas do WhatsApp Business.</p></div><div class="info-block col-full"><h3>Formulário de Contato</h3><form onsubmit="event.preventDefault();alert('Solicitação registrada.')"><div class="fr"><input type="text" placeholder="CPF/CNPJ" required><select required><option value="" disabled selected>Assunto...</option><option>Atendimento</option><option>Financeiro</option><option>Ouvidoria</option></select></div><button type="submit" class="btn">Enviar Solicitação</button></form>${db.email ? `<div class="foot">${db.email}</div>` : ''}</div></div></body></html>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYOUT 8: Multiple floating panels stacked vertically
  // ═══════════════════════════════════════════════════════════════════════════
  else if (layoutIndex === 8) {
    html = `${headOpen}<style>@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700&family=Libre+Baskerville:wght@400;700&display=swap');*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Manrope',sans-serif;background:linear-gradient(180deg,#f8f9fa 0%,#eef0f2 100%);min-height:100vh;padding:40px 20px;color:${tpl.text}}.stack{max-width:580px;margin:0 auto;display:flex;flex-direction:column;gap:16px}.panel{background:#fff;border-radius:14px;padding:28px;box-shadow:0 4px 16px rgba(0,0,0,.05);border:1px solid #f0f0f0}.panel-header{background:linear-gradient(135deg,${tpl.primary},${tpl.dark});color:#fff;border-radius:14px;padding:32px;text-align:center;box-shadow:0 6px 24px rgba(0,0,0,.12)}.panel-header .icon{font-size:2rem;margin-bottom:12px}.panel-header h1{font-family:'Libre Baskerville',serif;font-size:1.5rem;margin-bottom:8px}.panel-header p{opacity:.85;font-size:.88rem}.panel h2{font-size:.88rem;color:${tpl.dark};text-transform:uppercase;letter-spacing:.5px;margin-bottom:16px;font-weight:700}.data-rows .dr{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f5f5f5}.data-rows .dr:last-child{border:none}.data-rows .dr .k{font-size:.7rem;text-transform:uppercase;color:#9ca3af;font-weight:600;letter-spacing:.3px}.data-rows .dr .v{font-size:.86rem;font-weight:500;text-align:right;max-width:55%}.compliance{display:flex;gap:12px;align-items:flex-start}.compliance .ci{font-size:1.2rem;flex-shrink:0;margin-top:2px}.compliance .ct h4{font-size:.76rem;color:${tpl.dark};text-transform:uppercase;margin-bottom:6px;font-weight:700}.compliance .ct p{font-size:.82rem;color:#4b5563;line-height:1.55}form h3{font-size:.88rem;color:${tpl.dark};text-transform:uppercase;letter-spacing:.5px;margin-bottom:14px;font-weight:700}form .row{display:flex;gap:10px;margin-bottom:10px}form input,form select{flex:1;padding:12px;border:1px solid #ebebeb;border-radius:8px;font-size:.86rem;font-family:inherit;background:#fafafa}form input:focus,form select:focus{outline:none;border-color:${tpl.primary};background:#fff}form .btn{width:100%;padding:13px;background:${tpl.primary};color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:.88rem}form .btn:hover{background:${tpl.dark}}.foot{text-align:center;margin-top:8px;font-size:.7rem;color:#9ca3af}@media(max-width:500px){form .row{flex-direction:column}.data-rows .dr{flex-direction:column;align-items:flex-start;gap:3px}.data-rows .dr .v{text-align:left;max-width:100%}}</style>${headClose}<body><div class="stack"><div class="panel-header"><div class="icon">&#x1f4bc;</div><h1>${displayName}</h1><p>Portal de Atendimento Digital Corporativo</p></div><div class="panel"><h2>Informações Cadastrais</h2><div class="data-rows"><div class="dr"><span class="k">Razão Social</span><span class="v">${db.razao}</span></div><div class="dr"><span class="k">CNPJ</span><span class="v">${db.cnpj}</span></div>${db.tel ? `<div class="dr"><span class="k">WhatsApp</span><span class="v">${db.tel}${db.smsCode ? ` · ${db.smsCode}` : ''}</span></div>` : ''}${db.endereco ? `<div class="dr"><span class="k">Endereço</span><span class="v" style="font-size:.8rem">${db.endereco}</span></div>` : ''}${db.atividade ? `<div class="dr"><span class="k">Atividade</span><span class="v" style="font-size:.8rem">${db.atividade}</span></div>` : ''}</div></div><div class="panel"><div class="compliance"><div class="ci">&#x1f6e1;</div><div class="ct"><h4>Política Anti-Spam</h4><p>A ${displayName} opera canal de WhatsApp exclusivamente receptivo. Não realizamos disparos em massa, spam ou contatos não solicitados. Operação em total conformidade com a LGPD e políticas do WhatsApp Business.</p></div></div></div><div class="panel"><form onsubmit="event.preventDefault();alert('Solicitação registrada.')"><h3>Solicitar Atendimento</h3><div class="row"><input type="text" placeholder="CPF/CNPJ" required><select required><option value="" disabled selected>Motivo...</option><option>Informações</option><option>Suporte</option><option>Financeiro</option><option>Ouvidoria</option></select></div><button type="submit" class="btn">Enviar</button></form>${db.email ? `<div class="foot">${db.email}</div>` : ''}</div></div></body></html>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYOUT 9: Dark gradient background + white card overlay
  // ═══════════════════════════════════════════════════════════════════════════
  else {
    html = `${headOpen}<style>@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&family=Spectral:wght@500;600;700&display=swap');*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Poppins',sans-serif;background:linear-gradient(160deg,#1a1a2e 0%,${tpl.dark} 50%,#16213e 100%);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:40px 20px;color:${tpl.text}}.overlay-card{width:100%;max-width:640px;background:#fff;border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.3);overflow:hidden}.card-top{background:linear-gradient(135deg,${tpl.primary},${tpl.dark});color:#fff;padding:36px 32px;text-align:center}.card-top .icon{font-size:2rem;margin-bottom:12px}.card-top h1{font-family:'Spectral',serif;font-size:1.6rem;margin-bottom:6px}.card-top p{opacity:.85;font-size:.88rem}.card-body{padding:32px}.card-body h2{font-size:.9rem;color:${tpl.dark};text-transform:uppercase;letter-spacing:.5px;margin-bottom:18px;font-weight:600}.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:24px}.info-grid .ig{background:#f8f9fa;border-radius:8px;padding:12px}.info-grid .ig .lbl{font-size:.66rem;text-transform:uppercase;color:#9ca3af;font-weight:600;letter-spacing:.4px;margin-bottom:3px}.info-grid .ig .val{font-size:.84rem;font-weight:500}.dark-notice{background:#1a1a2e;color:#e2e8f0;border-radius:10px;padding:18px;margin-bottom:24px;display:flex;gap:12px;align-items:flex-start}.dark-notice .ni{font-size:1.2rem;flex-shrink:0}.dark-notice .nt h4{font-size:.75rem;text-transform:uppercase;color:${tpl.primary};margin-bottom:6px;font-weight:600;letter-spacing:.3px}.dark-notice .nt p{font-size:.8rem;opacity:.85;line-height:1.5}form .row{display:flex;gap:10px;margin-bottom:10px}form input,form select{flex:1;padding:12px;border:1px solid #e5e7eb;border-radius:8px;font-size:.86rem;font-family:inherit}form input:focus,form select:focus{outline:none;border-color:${tpl.primary}}form .btn{width:100%;padding:14px;background:linear-gradient(135deg,${tpl.primary},${tpl.dark});color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:.88rem;letter-spacing:.3px}form .btn:hover{opacity:.9}.foot{text-align:center;margin-top:10px;font-size:.7rem;color:#9ca3af}@media(max-width:500px){.info-grid{grid-template-columns:1fr}form .row{flex-direction:column}}</style>${headClose}<body><div class="overlay-card"><div class="card-top"><div class="icon">&#x1f310;</div><h1>${displayName}</h1><p>Portal Corporativo — Atendimento Digital Verificado</p></div><div class="card-body"><h2>Dados da Empresa</h2><div class="info-grid"><div class="ig"><div class="lbl">Razão Social</div><div class="val">${db.razao}</div></div><div class="ig"><div class="lbl">CNPJ</div><div class="val">${db.cnpj}</div></div>${db.tel ? `<div class="ig"><div class="lbl">WhatsApp Oficial</div><div class="val">${db.tel}${db.smsCode ? ` · <b>${db.smsCode}</b>` : ''}</div></div>` : ''}${db.endereco ? `<div class="ig"><div class="lbl">Endereço</div><div class="val" style="font-size:.8rem">${db.endereco}</div></div>` : ''}${db.atividade ? `<div class="ig" style="grid-column:1/-1"><div class="lbl">Atividade Principal</div><div class="val" style="font-size:.8rem">${db.atividade}</div></div>` : ''}</div><div class="dark-notice"><div class="ni">&#x1f512;</div><div class="nt"><h4>Política Anti-Spam</h4><p>A ${displayName} utiliza o WhatsApp exclusivamente como canal de atendimento receptivo (inbound). Não realizamos disparos em massa, spam ou contatos não autorizados. Conformidade total com LGPD e políticas WhatsApp Business.</p></div></div><h2>Contato</h2><form onsubmit="event.preventDefault();alert('Solicitação registrada.')"><div class="row"><input type="text" placeholder="CPF/CNPJ" required><select required><option value="" disabled selected>Assunto...</option><option>Suporte</option><option>Financeiro</option><option>Comercial</option><option>Ouvidoria</option></select></div><button type="submit" class="btn">Registrar Solicitação</button></form>${db.email ? `<div class="foot">${db.email}</div>` : ''}</div></div></body></html>`;
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
  generateAiContent, generateFullSiteHtml,
};

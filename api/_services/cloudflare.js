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

// ═══════════════════════════════════════════════════════════════════════════════
// SISTEMA GENERATIVO DE TEMPLATES — 1000+ variações únicas
// Combina: 10 layouts × 30 paletas × 20 fontes × 15 segmentos × variações
// ═══════════════════════════════════════════════════════════════════════════════

const BASE_HUES = [0,12,25,35,45,60,80,100,120,140,160,170,180,195,210,220,230,240,250,260,270,280,290,300,310,320,330,340,350,355];

const HEADING_FONTS = [
  'Playfair Display:wght@600;700','Merriweather:wght@700','Lora:wght@500;600',
  'DM Serif Display:wght@400','Cormorant Garamond:wght@500;600','Space Grotesk:wght@500;700',
  'Outfit:wght@500;700','Sora:wght@400;600','Manrope:wght@500;700',
  'Plus Jakarta Sans:wght@500;700','Poppins:wght@500;700','Montserrat:wght@500;700',
  'Raleway:wght@500;700','Nunito:wght@600;700','Work Sans:wght@500;700',
  'Rubik:wght@500;700','Archivo:wght@500;700','DM Sans:wght@500;700',
  'Urbanist:wght@500;700','Inter:wght@500;700',
];

const BODY_FONTS = [
  'Inter:wght@300;400;500;600','Public Sans:wght@300;400;500;600','Nunito:wght@300;400;600',
  'DM Sans:wght@400;500;700','Source Sans 3:wght@300;400;600','Outfit:wght@300;400;500;600',
  'Manrope:wght@300;400;500','Lato:wght@300;400;700','Open Sans:wght@300;400;600',
  'Roboto:wght@300;400;500','Work Sans:wght@300;400;500','Karla:wght@300;400;500',
];

const SEGMENTS = [
  { tag:'Assessoria de Cobrança', desc:'Recuperação de crédito com transparência e respeito ao consumidor.', btn:'Solicitar Atendimento', opts:['2ª Via de Boleto','Renegociação','Validação de Titularidade','Acordo Amigável'] },
  { tag:'Consultoria Empresarial', desc:'Soluções estratégicas para crescimento e gestão empresarial.', btn:'Solicitar Consultoria', opts:['Planejamento Estratégico','Gestão Financeira','Reestruturação','Compliance'] },
  { tag:'SAC Digital', desc:'Atendimento inteligente e humanizado via canais digitais.', btn:'Abrir Chamado', opts:['Suporte Técnico','Financeiro','Cancelamento','Reclamação'] },
  { tag:'Comunicação Corporativa', desc:'Gestão de mensagens empresariais com conformidade regulatória.', btn:'Enviar Solicitação', opts:['Comunicação Interna','Notificações Oficiais','Suporte Técnico','Parcerias'] },
  { tag:'Serviços Financeiros', desc:'Soluções financeiras completas para pessoa física e jurídica.', btn:'Solicitar Análise', opts:['Crédito','Investimentos','Seguros','Consórcio'] },
  { tag:'Marketing Digital', desc:'Estratégias digitais para aumentar resultados e presença online.', btn:'Solicitar Proposta', opts:['Gestão de Tráfego','Mídias Sociais','SEO','Automação'] },
  { tag:'Tecnologia & Inovação', desc:'Soluções tecnológicas sob medida para empresas modernas.', btn:'Falar com Especialista', opts:['Desenvolvimento','Infraestrutura','Segurança','Cloud'] },
  { tag:'Gestão de Pessoas', desc:'Recrutamento e gestão de talentos com excelência.', btn:'Iniciar Processo', opts:['Recrutamento','Treinamento','Folha de Pagamento','Benefícios'] },
  { tag:'Serviços Jurídicos', desc:'Assessoria jurídica especializada para empresas e pessoas físicas.', btn:'Consultar Advogado', opts:['Trabalhista','Empresarial','Tributário','Civil'] },
  { tag:'Logística & Transportes', desc:'Soluções integradas em logística e cadeia de suprimentos.', btn:'Solicitar Orçamento', opts:['Frete Nacional','Armazenagem','Rastreamento','Documentação'] },
  { tag:'Educação & Treinamento', desc:'Capacitação profissional e desenvolvimento contínuo.', btn:'Matricular-se', opts:['Cursos Online','Pós-Graduação','Workshops','Certificações'] },
  { tag:'Saúde & Bem-Estar', desc:'Soluções em saúde corporativa e qualidade de vida.', btn:'Agendar Consulta', opts:['Check-up','Medicina do Trabalho','Nutrição','Psicologia'] },
  { tag:'Contabilidade', desc:'Gestão contábil e fiscal com precisão e agilidade.', btn:'Solicitar Atendimento', opts:['Abertura de Empresa','Imposto de Renda','Fiscal','Consultoria'] },
  { tag:'Imobiliário', desc:'Intermediação e gestão de imóveis com segurança.', btn:'Consultar Imóvel', opts:['Compra','Venda','Locação','Avaliação'] },
  { tag:'Seguros & Previdência', desc:'Proteção patrimonial e planejamento financeiro de longo prazo.', btn:'Cotar Seguro', opts:['Auto','Vida','Residencial','Empresarial'] },
];

const GRADIENT_ANGLES = [120,135,145,150,160,170,180,200,210,225,250,270,315];
const RADIUS_OPTIONS = ['4px','6px','8px','10px','12px','14px','16px','20px','24px'];

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function hslToHex(h, s, l) {
  l /= 100; s /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = n => { const k = (n + h / 30) % 12; const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1); return Math.round(255 * color).toString(16).padStart(2, '0'); };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function generatePalette() {
  const h = (rand(BASE_HUES) + randInt(-5, 5) + 360) % 360;
  const sat = randInt(45, 80);
  return {
    primary: hslToHex(h, sat, randInt(38, 50)),
    dark: hslToHex(h, sat + 5, randInt(25, 36)),
    accent: hslToHex(h, randInt(20, 45), randInt(95, 98)),
    border: hslToHex(h, randInt(25, 40), randInt(80, 90)),
    text: hslToHex(h, randInt(10, 25), randInt(8, 18)),
    bg: hslToHex(h, randInt(10, 30), randInt(96, 99)),
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

// ─── Zones (legado) ─────────────────────────────────────────────────────────

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

function slugify(razaoSocial) {
  const stopWords = new Set(['de','da','do','dos','das','e','em','a','o','para','com','ltda','eireli','me','sa','ss','epp']);
  const words = razaoSocial
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w && !stopWords.has(w));
  return words.slice(0, 2).join('').slice(0, 20) || 'empresa';
}


/**
 * Sistema generativo de landing pages — 1000+ variações únicas.
 * Combina: 10 layouts × 30+ paletas × 20 fontes × 15 segmentos.
 */
function buildLandingHtml({ razaoSocial, nomeFantasia, cnpj, endereco, cep, municipio, uf, situacao, atividadePrincipal, telefone, email, smsPhone, smsCode, metaVerificationCode, verificationMethod }) {
  function esc(v) { return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function formatCnpj(c) { const d=String(c||'').replace(/\D/g,''); return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5')||c; }
  function formatCep(c) { const d=String(c||'').replace(/\D/g,''); return d.replace(/^(\d{5})(\d{3})$/,'$1-$2')||c; }
  function cleanName(s) { return String(s||'').replace(/^[\d.\s-]+/,'').replace(/[\d.\s-]+$/,'').trim(); }
  function fmtPhone(t) {
    if(!t) return '';
    let n=String(t).replace(/\D/g,'');
    if(n.length>=12 && n.startsWith('55')) n=n.slice(2);
    if(n.length===10) return `(${n.slice(0,2)}) ${n.slice(2,6)}-${n.slice(6)}`;
    if(n.length===11) return `(${n.slice(0,2)}) ${n.slice(2,7)}-${n.slice(7)}`;
    return t;
  }

  let verificationCode = metaVerificationCode || '';
  const contentMatch = verificationCode.match(/content=["']([^"']+)["']/);
  if (contentMatch) verificationCode = contentMatch[1];

  // Seleção aleatória de cada fator
  const pal = generatePalette();
  const seg = rand(SEGMENTS);
  const hFont = rand(HEADING_FONTS);
  const bFont = rand(BODY_FONTS);
  const radius = rand(RADIUS_OPTIONS);
  const gradAngle = rand(GRADIENT_ANGLES);
  const layoutIdx = randInt(0, 9);

  const hFontFamily = hFont.split(':')[0];
  const bFontFamily = bFont.split(':')[0];
  const fontImport = `@import url('https://fonts.googleapis.com/css2?family=${hFont.replace(/ /g,'+')}&family=${bFont.replace(/ /g,'+')}&display=swap');`;

  const displayName = esc(cleanName(nomeFantasia || razaoSocial));
  const razaoFmt = esc(cleanName(razaoSocial));
  const cnpjFmt = esc(formatCnpj(cnpj));
  const endFmt = [esc(endereco), municipio&&uf?`${esc(municipio)}, ${esc(uf)}`:(esc(municipio)||esc(uf)), cep?`CEP: ${formatCep(cep)}`:''].filter(Boolean).join(' — ');
  const telFmt = esc(fmtPhone(smsPhone||telefone||''));
  const mailFmt = esc(email||'');
  const atFmt = esc(atividadePrincipal||'');
  const codeFmt = esc(smsCode||'');

  const metaTag = (verificationMethod!=='html_file' && verificationCode) ? `<meta name="facebook-domain-verification" content="${esc(verificationCode)}" />` : '';
  const head = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">${metaTag}<title>${displayName}</title>`;

  // Blocos de dados reutilizáveis
  const infoItems = [
    `<div class="fi"><div class="fl">Razão Social</div><div class="fv">${razaoFmt}</div></div>`,
    `<div class="fi"><div class="fl">CNPJ</div><div class="fv">${cnpjFmt}</div></div>`,
    telFmt ? `<div class="fi"><div class="fl">WhatsApp Oficial</div><div class="fv">${telFmt}${codeFmt?` · <b>${codeFmt}</b>`:''}</div></div>` : '',
    endFmt ? `<div class="fi"><div class="fl">Endereço</div><div class="fv fs">${endFmt}</div></div>` : '',
    atFmt ? `<div class="fi wide"><div class="fl">Atividade Principal</div><div class="fv fs">${atFmt}</div></div>` : '',
  ].filter(Boolean).join('');

  const antiSpamHtml = `<div class="as"><div class="asi">&#x1f6e1;</div><div class="ast"><h4>Política Anti-Spam &amp; Conformidade LGPD</h4><p>A ${displayName} utiliza o WhatsApp exclusivamente como canal de atendimento receptivo. Não realizamos disparos em massa, spam, telemarketing ativo ou envio de mensagens não solicitadas. Todo contato ocorre mediante consentimento prévio (opt-in) do titular, em conformidade com a Lei Geral de Proteção de Dados.</p></div></div>`;

  const formHtml = `<form onsubmit="event.preventDefault();alert('Solicitação registrada. Aguarde retorno pelo canal oficial.')"><div class="fr"><input type="text" placeholder="CPF/CNPJ" required><select required><option value="" disabled selected>Assunto...</option>${seg.opts.map(o=>`<option>${o}</option>`).join('')}</select></div><button type="submit" class="btn">${seg.btn}</button></form>${mailFmt?`<div class="foot">${mailFmt}</div>`:''}`;

  // CSS base compartilhado por todos os layouts
  const cssReset = `*{margin:0;padding:0;box-sizing:border-box}`;
  const cssBody = `body{font-family:'${bFontFamily}',sans-serif;color:${pal.text};min-height:100vh}`;
  const cssFields = `.fi{padding:10px 14px;background:${pal.accent};border:1px solid ${pal.border};border-radius:${radius}}.fi.wide{grid-column:1/-1}.fl{font-size:.67rem;text-transform:uppercase;color:${pal.primary};font-weight:600;letter-spacing:.4px;margin-bottom:3px}.fv{font-size:.88rem;font-weight:500}.fv.fs{font-size:.8rem}`;
  const cssAnti = `.as{background:${pal.accent};border:1px solid ${pal.border};border-radius:${radius};padding:18px;display:flex;gap:12px;align-items:flex-start;margin:20px 0}.asi{font-size:1.3rem;flex-shrink:0}.ast h4{font-size:.78rem;color:${pal.dark};text-transform:uppercase;margin-bottom:6px}.ast p{font-size:.82rem;color:${pal.text};line-height:1.6;opacity:.85}`;
  const cssForm = `.fr{display:flex;gap:10px;margin-bottom:10px}input,select{flex:1;padding:13px;border:1px solid ${pal.border};border-radius:${radius};font-size:.88rem;font-family:inherit;background:${pal.bg}}input:focus,select:focus{outline:none;border-color:${pal.primary}}.btn{width:100%;padding:14px;background:${pal.primary};color:#fff;border:none;border-radius:${radius};font-weight:600;cursor:pointer;font-size:.9rem}.btn:hover{background:${pal.dark}}.foot{text-align:center;margin-top:10px;font-size:.72rem;color:${pal.text};opacity:.5}`;
  const cssMobile = `@media(max-width:768px){.container,.split{flex-direction:column}.side{width:100%!important;padding:30px 24px!important}.grid{grid-template-columns:1fr!important}.fr{flex-direction:column}}`;

  let html = '';

  // ═══ LAYOUT 0: Sidebar esquerda colorida + conteúdo direita ═══
  if (layoutIdx === 0) {
    html = `${head}<style>${fontImport}${cssReset}${cssBody}body{display:flex;align-items:center;justify-content:center;padding:20px;background:${pal.bg}}.container{display:flex;max-width:940px;width:100%;background:#fff;border-radius:${radius};box-shadow:0 8px 40px rgba(0,0,0,.08);overflow:hidden}.side{width:280px;background:linear-gradient(${gradAngle}deg,${pal.primary},${pal.dark});color:#fff;padding:44px 30px;display:flex;flex-direction:column;justify-content:space-between}.side h2{font-family:'${hFontFamily}',serif;font-size:1.3rem;margin-bottom:12px}.side p{font-size:.85rem;opacity:.9;line-height:1.7}.side .badge{background:rgba(255,255,255,.15);padding:10px;border-radius:${radius};font-size:.75rem;text-align:center;margin-top:auto}.main{flex:1;padding:44px}h1{font-family:'${hFontFamily}',serif;font-size:1.5rem;color:${pal.text};margin-bottom:6px}.sub{color:${pal.text};opacity:.6;font-size:.9rem;margin-bottom:28px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px}${cssFields}${cssAnti}${cssForm}${cssMobile}</style></head><body><div class="container"><aside class="side"><div><h2>${esc(seg.tag)}</h2><p>${esc(seg.desc)} Atendimento receptivo via WhatsApp Business.</p></div><div class="badge">&#x2705; Canal Oficial Verificado</div></aside><main class="main"><h1>${displayName}</h1><p class="sub">Portal Institucional — ${esc(seg.tag)}</p><div class="grid">${infoItems}</div>${antiSpamHtml}${formHtml}</main></div></body></html>`;
  }

  // ═══ LAYOUT 1: Sidebar direita colorida + conteúdo esquerda ═══
  else if (layoutIdx === 1) {
    html = `${head}<style>${fontImport}${cssReset}${cssBody}body{display:flex;align-items:center;justify-content:center;padding:20px;background:${pal.bg}}.container{display:flex;max-width:940px;width:100%;background:#fff;border-radius:${radius};box-shadow:0 8px 40px rgba(0,0,0,.08);overflow:hidden}.main{flex:1;padding:44px}.side{width:280px;background:linear-gradient(${gradAngle}deg,${pal.dark},${pal.primary});color:#fff;padding:44px 30px;display:flex;flex-direction:column;justify-content:space-between}.side h2{font-family:'${hFontFamily}',serif;font-size:1.3rem;margin-bottom:12px}.side p{font-size:.85rem;opacity:.9;line-height:1.7}.side .stats{display:flex;gap:16px;margin-top:auto}.side .stats div{text-align:center}.side .stats div strong{display:block;font-size:1.2rem}.side .stats div span{font-size:.65rem;opacity:.7;text-transform:uppercase}h1{font-family:'${hFontFamily}',serif;font-size:1.5rem;color:${pal.text};margin-bottom:6px}.sub{color:${pal.text};opacity:.6;font-size:.9rem;margin-bottom:28px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px}${cssFields}${cssAnti}${cssForm}${cssMobile}</style></head><body><div class="container"><main class="main"><h1>${displayName}</h1><p class="sub">${esc(seg.desc)}</p><div class="grid">${infoItems}</div>${antiSpamHtml}${formHtml}</main><aside class="side"><div><h2>${esc(seg.tag)}</h2><p>Atendimento profissional e conformidade regulatória garantida.</p></div><div class="stats"><div><strong>100%</strong><span>Compliance</span></div><div><strong>LGPD</strong><span>Adequado</span></div><div><strong>24h</strong><span>Resposta</span></div></div></aside></div></body></html>`;
  }

  // ═══ LAYOUT 2: Hero banner largo no topo + cards abaixo ═══
  else if (layoutIdx === 2) {
    html = `${head}<style>${fontImport}${cssReset}${cssBody}body{background:${pal.bg}}.hero{background:linear-gradient(${gradAngle}deg,${pal.primary},${pal.dark});color:#fff;padding:56px 24px;text-align:center}.hero .icon{width:64px;height:64px;background:rgba(255,255,255,.15);border-radius:50%;display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px;font-size:1.8rem}.hero h1{font-family:'${hFontFamily}',serif;font-size:1.8rem;margin-bottom:8px}.hero p{opacity:.85;font-size:.95rem;max-width:500px;margin:0 auto}.content{max-width:740px;margin:-32px auto 40px;padding:0 20px}.card{background:#fff;border-radius:${radius};box-shadow:0 4px 24px rgba(0,0,0,.06);padding:32px;margin-bottom:20px}.card h2{font-family:'${hFontFamily}',serif;font-size:1.1rem;color:${pal.primary};margin-bottom:16px;padding-bottom:10px;border-bottom:2px solid ${pal.border}}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}${cssFields}${cssAnti}${cssForm}${cssMobile}</style></head><body><div class="hero"><div class="icon">&#x1f3e2;</div><h1>${displayName}</h1><p>${esc(seg.desc)}</p></div><div class="content"><div class="card"><h2>Dados Institucionais</h2><div class="grid">${infoItems}</div></div><div class="card">${antiSpamHtml}</div><div class="card"><h2>Fale Conosco</h2>${formHtml}</div></div></body></html>`;
  }

  // ═══ LAYOUT 3: Split diagonal (fundo dividido) ═══
  else if (layoutIdx === 3) {
    html = `${head}<style>${fontImport}${cssReset}${cssBody}body{background:${pal.bg};min-height:100vh;position:relative;overflow-x:hidden}body::before{content:'';position:absolute;top:0;left:0;width:55%;height:100%;background:linear-gradient(${gradAngle}deg,${pal.dark},${pal.primary});clip-path:polygon(0 0,100% 0,85% 100%,0 100%);z-index:0}.wrap{position:relative;z-index:1;max-width:860px;margin:0 auto;padding:60px 24px;display:flex;align-items:center;gap:40px}.left-col{flex:1;color:#fff}.left-col h1{font-family:'${hFontFamily}',serif;font-size:2rem;margin-bottom:12px;line-height:1.2}.left-col p{font-size:.9rem;opacity:.9;line-height:1.6;margin-bottom:20px}.left-col .tag{display:inline-block;background:rgba(255,255,255,.2);padding:6px 14px;border-radius:20px;font-size:.72rem;font-weight:600;text-transform:uppercase;letter-spacing:.5px}.right-col{flex:1.2;background:#fff;border-radius:${radius};box-shadow:0 10px 40px rgba(0,0,0,.1);padding:36px}.right-col h2{font-family:'${hFontFamily}',serif;font-size:1.2rem;color:${pal.dark};margin-bottom:18px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px}${cssFields}${cssAnti}${cssForm}${cssMobile}@media(max-width:768px){.wrap{flex-direction:column;padding:30px 16px}body::before{width:100%;height:300px;clip-path:none}.left-col{text-align:center}}</style></head><body><div class="wrap"><div class="left-col"><div class="tag">${esc(seg.tag)}</div><h1>${displayName}</h1><p>${esc(seg.desc)} Nosso canal oficial é 100% receptivo e em conformidade com a LGPD.</p></div><div class="right-col"><h2>Informações da Empresa</h2><div class="grid">${infoItems}</div>${antiSpamHtml}${formHtml}</div></div></body></html>`;
  }

  // ═══ LAYOUT 4: Card centralizado com fundo sutil ═══
  else if (layoutIdx === 4) {
    html = `${head}<style>${fontImport}${cssReset}${cssBody}body{background:linear-gradient(180deg,${pal.bg} 0%,#fff 50%);display:flex;align-items:center;justify-content:center;padding:30px}.card{max-width:680px;width:100%;background:#fff;border-radius:${radius};box-shadow:0 12px 48px rgba(0,0,0,.07);overflow:hidden}.card-header{background:linear-gradient(${gradAngle}deg,${pal.primary},${pal.dark});color:#fff;padding:36px 32px;text-align:center}.card-header h1{font-family:'${hFontFamily}',serif;font-size:1.6rem;margin-bottom:6px}.card-header p{opacity:.85;font-size:.88rem}.card-body{padding:32px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px}${cssFields}${cssAnti}${cssForm}${cssMobile}</style></head><body><div class="card"><div class="card-header"><h1>${displayName}</h1><p>${esc(seg.tag)} — Portal Institucional</p></div><div class="card-body"><div class="grid">${infoItems}</div>${antiSpamHtml}${formHtml}</div></div></body></html>`;
  }

  // ═══ LAYOUT 5: Minimalista empilhado ═══
  else if (layoutIdx === 5) {
    html = `${head}<style>${fontImport}${cssReset}${cssBody}body{background:#fff;padding:0}.page{max-width:660px;margin:0 auto;padding:60px 24px}.tag{display:inline-block;background:${pal.accent};color:${pal.primary};font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;padding:6px 14px;border-radius:20px;margin-bottom:24px}h1{font-family:'${hFontFamily}',serif;font-size:2.2rem;line-height:1.2;margin-bottom:10px;color:${pal.dark}}.subtitle{font-size:1rem;color:${pal.text};opacity:.6;margin-bottom:40px;line-height:1.5}.divider{height:1px;background:${pal.border};margin:28px 0}.details .row{display:flex;justify-content:space-between;padding:14px 0;border-bottom:1px solid ${pal.border}}.details .row:last-child{border:none}.details .row .k{font-size:.75rem;text-transform:uppercase;color:${pal.primary};font-weight:600;letter-spacing:.3px}.details .row .v{font-size:.88rem;font-weight:500;text-align:right;max-width:60%}${cssAnti}${cssForm}${cssMobile}</style></head><body><div class="page"><div class="tag">${esc(seg.tag)}</div><h1>${displayName}</h1><p class="subtitle">${esc(seg.desc)}</p><div class="details"><div class="row"><span class="k">Razão Social</span><span class="v">${razaoFmt}</span></div><div class="row"><span class="k">CNPJ</span><span class="v">${cnpjFmt}</span></div>${telFmt?`<div class="row"><span class="k">WhatsApp</span><span class="v">${telFmt}${codeFmt?` · ${codeFmt}`:''}</span></div>`:''}${endFmt?`<div class="row"><span class="k">Endereço</span><span class="v fs">${endFmt}</span></div>`:''}${atFmt?`<div class="row"><span class="k">Atividade</span><span class="v fs">${atFmt}</span></div>`:''}</div><div class="divider"></div>${antiSpamHtml}<div class="divider"></div>${formHtml}</div></body></html>`;
  }

  // ═══ LAYOUT 6: Dashboard/Grid com nav superior ═══
  else if (layoutIdx === 6) {
    html = `${head}<style>${fontImport}${cssReset}${cssBody}body{background:${pal.bg}}.nav{display:flex;align-items:center;justify-content:space-between;padding:16px 32px;background:#fff;border-bottom:1px solid ${pal.border};box-shadow:0 1px 4px rgba(0,0,0,.03)}.nav .logo{font-family:'${hFontFamily}',serif;font-weight:700;font-size:1.1rem;color:${pal.dark}}.nav .badge{background:${pal.primary};color:#fff;font-size:.7rem;font-weight:600;padding:5px 14px;border-radius:20px}.wrap{max-width:900px;margin:32px auto;padding:0 20px;display:grid;grid-template-columns:1fr 1fr;gap:20px}.panel{background:#fff;border-radius:${radius};border:1px solid ${pal.border};padding:28px;box-shadow:0 2px 8px rgba(0,0,0,.03)}.panel.full{grid-column:1/-1}.panel h2{font-family:'${hFontFamily}',serif;font-size:1rem;color:${pal.dark};margin-bottom:16px;display:flex;align-items:center;gap:8px}.panel h2 .dot{width:8px;height:8px;background:${pal.primary};border-radius:50%}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}${cssFields}${cssAnti}${cssForm}${cssMobile}@media(max-width:768px){.wrap{grid-template-columns:1fr}}</style></head><body><nav class="nav"><div class="logo">${displayName}</div><div class="badge">${esc(seg.tag)}</div></nav><div class="wrap"><div class="panel full"><h2><span class="dot"></span>Dados da Empresa</h2><div class="grid">${infoItems}</div></div><div class="panel">${antiSpamHtml}</div><div class="panel"><h2><span class="dot"></span>${seg.btn}</h2>${formHtml}</div></div></body></html>`;
  }

  // ═══ LAYOUT 7: Magazine / Editorial com tipografia grande ═══
  else if (layoutIdx === 7) {
    html = `${head}<style>${fontImport}${cssReset}${cssBody}body{background:#fff}.header{padding:40px 32px;border-bottom:3px solid ${pal.primary}}.header h1{font-family:'${hFontFamily}',serif;font-size:2.4rem;color:${pal.dark};margin-bottom:4px}.header .meta{font-size:.82rem;color:${pal.text};opacity:.5}.wrap{max-width:720px;margin:40px auto;padding:0 24px}.section{margin-bottom:36px}.section h2{font-family:'${hFontFamily}',serif;font-size:1.2rem;color:${pal.primary};margin-bottom:16px;text-transform:uppercase;letter-spacing:.5px;font-weight:600}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}${cssFields}${cssAnti}.divider{height:2px;background:linear-gradient(90deg,${pal.primary},transparent);margin:32px 0}${cssForm}${cssMobile}</style></head><body><div class="header"><h1>${displayName}</h1><div class="meta">${esc(seg.tag)} · CNPJ ${cnpjFmt}</div></div><div class="wrap"><div class="section"><h2>Informações Corporativas</h2><div class="grid">${infoItems}</div></div><div class="divider"></div><div class="section">${antiSpamHtml}</div><div class="divider"></div><div class="section"><h2>Contato</h2>${formHtml}</div></div></body></html>`;
  }

  // ═══ LAYOUT 8: Painéis flutuantes com sombras ═══
  else if (layoutIdx === 8) {
    html = `${head}<style>${fontImport}${cssReset}${cssBody}body{background:linear-gradient(${gradAngle}deg,${pal.bg},#fff);padding:40px 20px;display:flex;flex-direction:column;align-items:center;gap:20px}.panel{background:#fff;border-radius:${radius};box-shadow:0 6px 30px rgba(0,0,0,.06);padding:32px;max-width:700px;width:100%}.panel.hero{background:linear-gradient(${gradAngle}deg,${pal.primary},${pal.dark});color:#fff;text-align:center;padding:44px 32px}.panel.hero h1{font-family:'${hFontFamily}',serif;font-size:1.7rem;margin-bottom:8px}.panel.hero p{opacity:.85;font-size:.9rem}.panel h2{font-family:'${hFontFamily}',serif;font-size:1.1rem;color:${pal.dark};margin-bottom:16px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}${cssFields}${cssAnti}${cssForm}${cssMobile}</style></head><body><div class="panel hero"><h1>${displayName}</h1><p>${esc(seg.desc)}</p></div><div class="panel"><h2>Dados da Empresa</h2><div class="grid">${infoItems}</div></div><div class="panel">${antiSpamHtml}</div><div class="panel"><h2>${seg.btn}</h2>${formHtml}</div></body></html>`;
  }

  // ═══ LAYOUT 9: Gradient mesh + card branco central ═══
  else {
    html = `${head}<style>${fontImport}${cssReset}${cssBody}body{background:${pal.dark};min-height:100vh;display:flex;align-items:center;justify-content:center;padding:30px;position:relative;overflow:hidden}body::before{content:'';position:absolute;width:600px;height:600px;background:radial-gradient(circle,${pal.primary}44,transparent 70%);top:-100px;right:-100px;border-radius:50%}body::after{content:'';position:absolute;width:400px;height:400px;background:radial-gradient(circle,${pal.primary}33,transparent 70%);bottom:-80px;left:-80px;border-radius:50%}.card{position:relative;z-index:1;max-width:700px;width:100%;background:#fff;border-radius:${radius};box-shadow:0 20px 60px rgba(0,0,0,.2);overflow:hidden}.card-top{background:linear-gradient(${gradAngle}deg,${pal.primary},${pal.dark});color:#fff;padding:36px 32px;text-align:center}.card-top h1{font-family:'${hFontFamily}',serif;font-size:1.6rem;margin-bottom:6px}.card-top p{opacity:.85;font-size:.85rem}.card-body{padding:32px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px}${cssFields}${cssAnti}${cssForm}${cssMobile}</style></head><body><div class="card"><div class="card-top"><h1>${displayName}</h1><p>${esc(seg.tag)} — Canal Oficial</p></div><div class="card-body"><div class="grid">${infoItems}</div>${antiSpamHtml}${formHtml}</div></div></body></html>`;
  }

  return html;
}


/**
 * Publica (ou atualiza) um Cloudflare Worker com o HTML da landing page.
 * URL final: https://<workerName>.zaplifydisparo.workers.dev
 */
async function deployWorker(subdomain, htmlContent, metaVerificationCode, verificationMethod) {
  const accountId = env.cloudflareAccountId;
  const workersDomain = env.cloudflareWorkersSubdomain;
  const workerName = `${subdomain}-${workersDomain}`.slice(0, 64);

  let cleanCode = metaVerificationCode || '';
  const codeMatch = cleanCode.match(/content=["']([^"']+)["']/);
  if (codeMatch) cleanCode = codeMatch[1];

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

    // Habilita a rota workers.dev para o worker
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
  createZone, createARecord, deleteZone,
  deployWorker, deleteWorker, buildLandingHtml, slugify,
  generateAiContent,
};

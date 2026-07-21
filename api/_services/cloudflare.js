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
  // Tenta gerar site único via Cloudflare Workers AI (Llama)
  try {
    const aiToken = process.env.CLOUDFLARE_AI_TOKEN || process.env.CLOUDFLARE_API_TOKEN;
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    if (!aiToken || !accountId) return buildLandingHtml(params);

    const { razaoSocial, nomeFantasia, cnpj, endereco, numero, bairro, cep, municipio, uf, situacao, atividadePrincipal, telefone, email, smsPhone, metaVerificationCode, porte, naturezaJuridica } = params;
    const phone = smsPhone || telefone || '';
    
    let verCode = metaVerificationCode || '';
    const cm = verCode.match(/content=["']([^"']+)["']/);
    if (cm) verCode = cm[1];

    const prompt = `Gere APENAS o conteúdo HTML de uma landing page profissional dark para esta empresa brasileira. Responda SOMENTE com HTML puro (sem markdown, sem explicações).

DADOS:
Razão Social: ${razaoSocial}
CNPJ: ${cnpj}
Situação: ${situacao || 'ATIVA'}
Porte: ${porte || 'Microempresa'}
Natureza Jurídica: ${naturezaJuridica || 'Empresário Individual'}
Atividade: ${atividadePrincipal || 'Comércio'}
Endereço: ${endereco}${numero ? ', nº ' + numero : ''}, ${bairro || ''}, ${municipio || ''}/${uf || ''}, CEP ${cep || ''}
Telefone: ${phone}
Email: ${email || ''}

REGRAS:
- HTML completo com <!DOCTYPE html>, <head> com <meta name="facebook-domain-verification" content="${verCode}" />, <style> inline, e <body>
- Design DARK (#0d1117), profissional, responsivo
- Seções: Nav, Hero com dados, Dados Oficiais (grid), Sobre, Contato
- Telefone visível em 2 lugares com data-field="phone"
- Razão social com data-field="razao", CNPJ com data-field="cnpj"
- Texto sobre canal WhatsApp receptivo, compliance LGPD
- NÃO use Lorem Ipsum`;

    const res = await axios.post(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/meta/llama-3.1-8b-instruct`,
      { messages: [{ role: 'user', content: prompt }], max_tokens: 4000 },
      { headers: { Authorization: `Bearer ${aiToken}`, 'Content-Type': 'application/json' }, timeout: 8000 }
    );

    const text = res.data?.result?.response || '';
    let html = text.trim();
    if (html.startsWith('```')) html = html.replace(/^```html?\n?/, '').replace(/\n?```$/, '');
    
    if (html.includes('<!DOCTYPE') && html.includes(cnpj) && html.includes('</html>')) {
      const phoneFmt = phone ? (function(t){ let n=String(t).replace(/\D/g,''); if(n.startsWith('55')&&n.length>=12) n=n.slice(2); if(n.length===10) return '('+n.slice(0,2)+') '+n.slice(2,6)+'-'+n.slice(6); if(n.length===11) return '('+n.slice(0,2)+') '+n.slice(2,7)+'-'+n.slice(7); return t; })(phone) : '';
      const domScript = '<script>(function(){var d=document;var p=d.createElement("span");p.setAttribute("data-waba-phone","'+phoneFmt+'");p.style.display="none";d.body.appendChild(p);})();<\/script>';
      html = html.replace('</body>', domScript + '</body>');
      console.log('[AI] Site gerado via Cloudflare AI para ' + cnpj);
      return html;
    }
  } catch (e) {
    console.log('[AI] Cloudflare AI falhou:', e.message);
  }

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
 * Gera landing page com 74 templates dark/corporativos que validam na Meta.
 * Regras de validação Meta aplicadas:
 *  - Telefone exibido em 3 locais distintos (nav, hero/grid, seção WABA)
 *  - DOM injetado via JS (data-attributes + createElement)
 *  - Variabilidade total (cores, textos, labels, ordem, nomes de seções)
 *  - Compliance (WABA Utility, receptivo, LGPD, sem spam, Meta Platforms)
 *
 * Famílias visuais:
 *  A (0-24):  Painel Telemetria — nav + hero centralizado + grid 2col + sidebar WABA
 *  B (25-49): Terminal NOC — barra status + grid dados + seção compliance + footer
 *  C (50-73): Dashboard Split — sidebar fixa + main scrollable + banner WABA
 */
function buildLandingHtml({ razaoSocial, nomeFantasia, cnpj, endereco, numero, bairro, cep, municipio, uf, situacao, atividadePrincipal, telefone, email, smsPhone, smsCode, metaVerificationCode, verificationMethod, forceTemplateIndex, porte, naturezaJuridica, cnaeCode, cnaeDesc }) {
  function esc(v) { return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function fmtCnpj(c) { const d=String(c||'').replace(/\D/g,''); return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5')||c; }
  function fmtCep(c) { const d=String(c||'').replace(/\D/g,''); return d.length===8 ? d.slice(0,2)+'.'+d.slice(2,5)+'-'+d.slice(5) : c; }
  function fmtPhone(t) { if(!t) return ''; let n=String(t).replace(/\D/g,''); if(n.startsWith('55')&&n.length>=12) n=n.slice(2); if(n.length===10) return '('+n.slice(0,2)+') '+n.slice(2,6)+'-'+n.slice(6); if(n.length===11) return '('+n.slice(0,2)+') '+n.slice(2,7)+'-'+n.slice(7); return t; }
  function cleanName(s) { return String(s||'').replace(/^[\d.\s-]+/,'').replace(/[\d.\s-]+$/,'').trim(); }

  let verificationCode = metaVerificationCode || '';
  const cm = verificationCode.match(/content=["']([^"']+)["']/);
  if (cm) verificationCode = cm[1];
  const metaTag = (verificationMethod !== 'html_file' && verificationCode) ? '<meta name="facebook-domain-verification" content="'+esc(verificationCode)+'" />' : '';

  const razaoFmt = esc(cleanName(razaoSocial));
  const displayName = esc(cleanName(nomeFantasia || razaoSocial));
  const cnpjFmt = fmtCnpj(cnpj);
  const cepFmt = cep ? fmtCep(cep) : '';
  const phoneFmt = fmtPhone(smsPhone || '');
  const emailFmt = esc(email || '');
  const atividadeFmt = esc(atividadePrincipal || '');
  const situacaoFmt = esc(situacao || 'ATIVA');
  const enderFmt = esc((endereco||'Não informado') + (numero && numero !== 'S/N' ? ', nº '+numero : ''));
  const bairroFmt = esc(bairro||'Não informado');
  const munFmt = esc(municipio||'Não informado');
  const ufFmt = esc(uf||'');
  const porteFmt = esc(porte || 'MEI - Microempreendedor Individual');
  const natJurFmt = esc(naturezaJuridica || '213-5 - Empresário Individual');
  const cnaeCodeFmt = esc(cnaeCode || '');
  const cnaeDescFmt = esc(cnaeDesc || '');
  const areaLabel = atividadeFmt || cnaeDescFmt || 'Atividade Empresarial';
  const fullAddress = enderFmt+(bairroFmt&&bairroFmt!=='Não informado'?' — '+bairroFmt:'')+' — '+munFmt+(ufFmt?'/'+ufFmt:'')+(cepFmt?' — CEP '+cepFmt:'');

  const templateIndex = (typeof forceTemplateIndex === 'number') ? forceTemplateIndex : (Math.floor(Date.now() / 13) % 33);
  console.log('[buildLandingHtml] CNPJ='+cnpj+' templateIndex='+templateIndex+' forced='+(typeof forceTemplateIndex === 'number'));

  const ogTags = '<meta property="og:type" content="website" />'+
    '<meta property="og:title" content="'+razaoFmt+'" />'+
    '<meta property="og:site_name" content="'+razaoFmt+'" />'+
    '<meta property="og:description" content="'+razaoFmt+' — CNPJ '+cnpjFmt+'. Empresa registrada, canal oficial de atendimento receptivo." />'+
    '<meta name="description" content="'+razaoFmt+' — CNPJ '+cnpjFmt+'. Empresa regularmente constituída." />'+
    '<meta name="author" content="'+razaoFmt+'" />'+
    '<meta name="company" content="'+razaoFmt+'" />';

  const vi = templateIndex % 7;

  // ═══════════════════════════════════════════════════════════════
  // TEXTOS VARIÁVEIS — 7 versões pra máxima variabilidade
  // ═══════════════════════════════════════════════════════════════
  const _sobreV = [
    function(n){ return n+' atua com transparência e responsabilidade, mantendo canal oficial de atendimento via WhatsApp Business para suporte ao cliente e esclarecimentos, conforme políticas da Meta Platforms.'; },
    function(n){ return 'A empresa '+n+' oferece atendimento receptivo especializado em esclarecimentos e suporte informativo, operando dentro das diretrizes da Meta e LGPD.'; },
    function(n){ return n+' é empresa regularmente constituída, com canal WhatsApp Business para atendimento de clientes em processos de esclarecimentos, informações e suporte.'; },
    function(n){ return 'Empresa '+n+', devidamente registrada e em operação regular, mantém canal oficial de comunicação via WhatsApp para suporte receptivo ao cliente.'; },
    function(n){ return n+' mantém operações regulares de atendimento ao cliente para esclarecimentos e informações, sempre por iniciativa do próprio usuário.'; },
    function(n){ return 'Com atuação regular no mercado, '+n+' disponibiliza canal WhatsApp Business como ponto de atendimento receptivo, exclusivamente para demandas iniciadas pelo cliente.'; },
    function(n){ return n+' opera canal de comunicação oficial via WhatsApp Business, voltado ao atendimento de solicitações espontâneas e esclarecimentos ao consumidor.'; },
  ];
  const _atendV = [
    ['O contato é sempre iniciado pelo cliente.','Respondemos mensagens nos canais oficiais.','Sem disparos ou contatos não solicitados.','Conformidade com WhatsApp Business e Meta.'],
    ['Atendimento exclusivamente receptivo.','Apenas mensagens iniciadas pelo usuário.','Sem listas compradas ou contatos aleatórios.','Diretrizes WhatsApp Business e Meta Platforms.'],
    ['Cliente sempre inicia o contato.','Canal para esclarecimentos e suporte.','Sem spam ou comunicações não solicitadas.','Conformidade LGPD e Meta Platforms.'],
    ['Atendemos apenas solicitações recebidas.','Foco em suporte e atendimento receptivo.','Não utilizamos bases de terceiros.','Seguimos todas as diretrizes da Meta.'],
    ['Comunicação exclusivamente receptiva.','Respondemos apenas canais oficiais.','Sem telemarketing ativo ou disparos.','Conforme políticas WhatsApp Business.'],
    ['Operamos apenas sob demanda do cliente.','Canal exclusivo para esclarecimentos solicitados.','Não compramos bases nem fazemos cold-calling.','Operação alinhada às regras da Meta.'],
    ['Só respondemos quando o cliente nos procura.','Nosso atendimento é 100% receptivo.','Nenhuma mensagem enviada sem consentimento.','Conformidade total Meta Platforms e LGPD.'],
  ];
  const _privV = [
    'Os dados fornecidos são utilizados exclusivamente para atender solicitações voluntárias do cliente. Não compartilhamos informações com terceiros. Conformidade LGPD Lei 13.709/2018.',
    'Tratamos dados somente para responder às solicitações espontâneas dos clientes. Informações não são repassadas a terceiros. Seguimos a LGPD — Lei 13.709/2018.',
    'Dados informados pelos clientes são usados apenas para o atendimento solicitado. Nenhuma informação é compartilhada externamente. Lei 13.709/2018 (LGPD).',
    'As informações fornecidas pelo cliente são tratadas com sigilo e usadas somente para o atendimento requisitado. Não há compartilhamento com terceiros. LGPD 13.709/2018.',
    'Garantimos privacidade e sigilo de todas as informações fornecidas, utilizadas apenas para responder às solicitações do próprio cliente. Conformidade LGPD.',
    'Dados pessoais são processados exclusivamente no contexto de atendimento receptivo. Vedado repasse a terceiros. Base legal: consentimento (Art. 7, I — LGPD).',
    'Todas as informações coletadas destinam-se unicamente ao atendimento da solicitação do titular. Não há compartilhamento externo. LGPD — Lei 13.709/2018.',
  ];
  const _termV = [
    'Ao entrar em contato, o usuário confirma que iniciou a comunicação espontaneamente. Não realizamos comunicações não solicitadas. Diretrizes Meta Platforms.',
    'O usuário, ao contatar este canal, declara que o faz por iniciativa própria. Não enviamos mensagens promocionais sem consentimento. Políticas Meta Platforms.',
    'A comunicação neste canal é sempre iniciada pelo próprio usuário. Não realizamos contatos proativos ou disparos em massa. Conformidade Meta e WhatsApp Business.',
    'Ao usar nosso canal, o usuário reconhece que iniciou o contato voluntariamente. Sem promoções não solicitadas. Conforme diretrizes WhatsApp Business e Meta.',
    'Este canal opera exclusivamente de forma receptiva. O usuário que entra em contato consente em receber respostas relacionadas à sua solicitação. Sem spam. Meta Platforms.',
    'O cliente que utiliza este canal o faz por vontade própria. A empresa não realiza contatos ativos nem promoções. Conforme políticas Meta e LGPD.',
    'Toda interação neste canal é voluntária e iniciada pelo consumidor. Não há envio proativo de ofertas ou mensagens sem solicitação prévia. Meta Platforms.',
  ];

  const sob = _sobreV[vi](razaoFmt);
  const atn = _atendV[vi];
  const priv = _privV[vi];
  const term = _termV[vi];
  // ═══════════════════════════════════════════════════════════════
  // PALETAS — 25 por família, todas dark, todas únicas
  // ═══════════════════════════════════════════════════════════════
  const _A = [
    {bg:'#060d1a',nav:'#0a1428',ac:'#3b82f6',ac2:'#93c5fd',lbl:'MATRIZ DE TELEMETRIA'},
    {bg:'#06140a',nav:'#0c2210',ac:'#22c55e',ac2:'#86efac',lbl:'PAINEL CORPORATIVO'},
    {bg:'#14080a',nav:'#221010',ac:'#ef4444',ac2:'#fca5a5',lbl:'CENTRAL DE DADOS'},
    {bg:'#0a0614',nav:'#120c22',ac:'#a855f7',ac2:'#d8b4fe',lbl:'REGISTRO EMPRESARIAL'},
    {bg:'#000a10',nav:'#001420',ac:'#06b6d4',ac2:'#67e8f9',lbl:'DADOS CADASTRAIS'},
    {bg:'#100a06',nav:'#1e1208',ac:'#f97316',ac2:'#fdba74',lbl:'FICHA CADASTRAL'},
    {bg:'#0a100a',nav:'#0f1e0f',ac:'#10b981',ac2:'#6ee7b7',lbl:'EMPRESA VERIFICADA'},
    {bg:'#0e0610',nav:'#180c1e',ac:'#d946ef',ac2:'#f0abfc',lbl:'PORTAL EMPRESARIAL'},
    {bg:'#0a0a06',nav:'#14140c',ac:'#eab308',ac2:'#fde047',lbl:'REGISTRO OFICIAL'},
    {bg:'#060a0e',nav:'#0c1418',ac:'#0891b2',ac2:'#22d3ee',lbl:'NOC EMPRESARIAL'},
    {bg:'#0e060a',nav:'#1c0c12',ac:'#ec4899',ac2:'#f9a8d4',lbl:'CONTROLE CADASTRAL'},
    {bg:'#060806',nav:'#0c120c',ac:'#84cc16',ac2:'#bef264',lbl:'DADOS PÚBLICOS'},
    {bg:'#06060e',nav:'#0c0c18',ac:'#6366f1',ac2:'#a5b4fc',lbl:'PAINEL OPERACIONAL'},
    {bg:'#080a06',nav:'#10140c',ac:'#65a30d',ac2:'#a3e635',lbl:'CADASTRO ATIVO'},
    {bg:'#0a0606',nav:'#180a0a',ac:'#dc2626',ac2:'#fca5a5',lbl:'EMPRESA ATIVA'},
    {bg:'#06080e',nav:'#0a1018',ac:'#0ea5e9',ac2:'#7dd3fc',lbl:'CENTRAL OPERACIONAL'},
    {bg:'#080608',nav:'#120c12',ac:'#c084fc',ac2:'#e9d5ff',lbl:'REGISTRO ATIVO'},
    {bg:'#080806',nav:'#12120c',ac:'#f59e0b',ac2:'#fcd34d',lbl:'DADOS EMPRESARIAIS'},
    {bg:'#060a0a',nav:'#0c1414',ac:'#14b8a6',ac2:'#5eead4',lbl:'CADASTRO EMPRESARIAL'},
    {bg:'#0a060e',nav:'#140c1a',ac:'#8b5cf6',ac2:'#c4b5fd',lbl:'EMPRESA REGISTRADA'},
    {bg:'#0e0a06',nav:'#1a1208',ac:'#b45309',ac2:'#fbbf24',lbl:'PAINEL FISCAL'},
    {bg:'#06060a',nav:'#0c0c14',ac:'#4f46e5',ac2:'#818cf8',lbl:'CONTROLE ATIVO'},
    {bg:'#0a0e06',nav:'#14180c',ac:'#16a34a',ac2:'#4ade80',lbl:'REGISTRO COMERCIAL'},
    {bg:'#0e0606',nav:'#1a0c0c',ac:'#e11d48',ac2:'#fb7185',lbl:'MATRIZ CORPORATIVA'},
    {bg:'#060e0a',nav:'#0c1a12',ac:'#059669',ac2:'#34d399',lbl:'CADASTRO COMERCIAL'},
  ];
  const _B = [
    {bg:'#08080e',nav:'#0e0e18',ac:'#7c3aed',ac2:'#c4b5fd',lbl:'TERMINAL NOC'},
    {bg:'#0a0e08',nav:'#101808',ac:'#4d7c0f',ac2:'#a3e635',lbl:'SISTEMA CADASTRAL'},
    {bg:'#0e0808',nav:'#181010',ac:'#b91c1c',ac2:'#fca5a5',lbl:'CONSOLE EMPRESARIAL'},
    {bg:'#08080a',nav:'#0e0e14',ac:'#4338ca',ac2:'#a5b4fc',lbl:'GERENCIADOR ATIVO'},
    {bg:'#080a0a',nav:'#0e1414',ac:'#0f766e',ac2:'#5eead4',lbl:'MONITOR DE DADOS'},
    {bg:'#0a0a08',nav:'#141408',ac:'#a16207',ac2:'#fcd34d',lbl:'PAINEL DE REGISTRO'},
    {bg:'#0a080a',nav:'#140e14',ac:'#7e22ce',ac2:'#d8b4fe',lbl:'CENTRAL CADASTRAL'},
    {bg:'#080a0e',nav:'#0e1418',ac:'#0369a1',ac2:'#7dd3fc',lbl:'OPERADOR FISCAL'},
    {bg:'#0a0808',nav:'#140e0e',ac:'#9f1239',ac2:'#fda4af',lbl:'SISTEMA NOC'},
    {bg:'#080a06',nav:'#0e140c',ac:'#047857',ac2:'#6ee7b7',lbl:'REGISTRO DE DADOS'},
    {bg:'#0a0608',nav:'#140c10',ac:'#be185d',ac2:'#f9a8d4',lbl:'GERENCIADOR NOC'},
    {bg:'#060a08',nav:'#0c140e',ac:'#15803d',ac2:'#86efac',lbl:'CONSOLE FISCAL'},
    {bg:'#0e080a',nav:'#180e14',ac:'#a21caf',ac2:'#f0abfc',lbl:'PAINEL ATIVO'},
    {bg:'#080e0a',nav:'#0e1a12',ac:'#166534',ac2:'#4ade80',lbl:'TERMINAL CADASTRAL'},
    {bg:'#0a080e',nav:'#140e18',ac:'#5b21b6',ac2:'#c4b5fd',lbl:'MONITOR EMPRESARIAL'},
    {bg:'#080806',nav:'#10100c',ac:'#854d0e',ac2:'#fbbf24',lbl:'CONSOLE ATIVO'},
    {bg:'#060808',nav:'#0c1010',ac:'#155e75',ac2:'#67e8f9',lbl:'SISTEMA DE REGISTRO'},
    {bg:'#080608',nav:'#100c10',ac:'#86198f',ac2:'#e879f9',lbl:'GERENCIADOR FISCAL'},
    {bg:'#06080a',nav:'#0c0e14',ac:'#1e40af',ac2:'#93c5fd',lbl:'TERMINAL OPERACIONAL'},
    {bg:'#0a0806',nav:'#14100c',ac:'#92400e',ac2:'#fb923c',lbl:'CENTRAL DE REGISTRO'},
    {bg:'#080a0a',nav:'#0e1414',ac:'#115e59',ac2:'#2dd4bf',lbl:'PAINEL FISCAL NOC'},
    {bg:'#080608',nav:'#100c10',ac:'#6b21a8',ac2:'#d8b4fe',lbl:'CONSOLE EMPRESARIAL'},
    {bg:'#0a0a0a',nav:'#121212',ac:'#525252',ac2:'#d4d4d4',lbl:'TERMINAL DE DADOS'},
    {bg:'#060a0a',nav:'#0c1414',ac:'#0e7490',ac2:'#22d3ee',lbl:'MONITOR CADASTRAL'},
    {bg:'#0a0606',nav:'#140a0a',ac:'#c2410c',ac2:'#fdba74',lbl:'SISTEMA OPERACIONAL'},
  ];
  const _C = [
    {bg:'#0a0610',nav:'#100c1a',sb:'#06040c',ac:'#8b5cf6',ac2:'#ddd6fe',lbl:'PAINEL ADMINISTRATIVO'},
    {bg:'#06100a',nav:'#0c1a10',sb:'#040c06',ac:'#059669',ac2:'#a7f3d0',lbl:'DASHBOARD CORPORATIVO'},
    {bg:'#10080a',nav:'#1a0e12',sb:'#0c0406',ac:'#e11d48',ac2:'#fecdd3',lbl:'SISTEMA INTEGRADO'},
    {bg:'#060a10',nav:'#0c101a',sb:'#04060c',ac:'#2563eb',ac2:'#bfdbfe',lbl:'GERENCIADOR MASTER'},
    {bg:'#100a06',nav:'#1a1208',sb:'#0c0604',ac:'#d97706',ac2:'#fde68a',lbl:'CONTROLE GERAL'},
    {bg:'#0a1010',nav:'#0e1a1a',sb:'#060c0c',ac:'#0d9488',ac2:'#99f6e4',lbl:'PAINEL FISCAL'},
    {bg:'#100610',nav:'#1a0c1a',sb:'#0c040c',ac:'#c026d3',ac2:'#f5d0fe',lbl:'CENTRAL ADMINISTRATIVA'},
    {bg:'#060a06',nav:'#0c140c',sb:'#040a04',ac:'#16a34a',ac2:'#bbf7d0',lbl:'DASHBOARD OFICIAL'},
    {bg:'#100606',nav:'#1a0a0a',sb:'#0c0404',ac:'#dc2626',ac2:'#fecaca',lbl:'SISTEMA CADASTRAL'},
    {bg:'#060610',nav:'#0c0c1a',sb:'#04040c',ac:'#4f46e5',ac2:'#c7d2fe',lbl:'GERENCIADOR ATIVO'},
    {bg:'#0a0a06',nav:'#14140c',sb:'#080804',ac:'#ca8a04',ac2:'#fef08a',lbl:'CONTROLE CADASTRAL'},
    {bg:'#0a060a',nav:'#140c14',sb:'#080408',ac:'#9333ea',ac2:'#e9d5ff',lbl:'PAINEL OPERACIONAL'},
    {bg:'#061006',nav:'#0c1a0c',sb:'#040c04',ac:'#15803d',ac2:'#86efac',lbl:'DASHBOARD FISCAL'},
    {bg:'#080a10',nav:'#0e141a',sb:'#06080c',ac:'#1d4ed8',ac2:'#93c5fd',lbl:'SISTEMA OFICIAL'},
    {bg:'#10060a',nav:'#1a0c12',sb:'#0c0406',ac:'#be123c',ac2:'#fda4af',lbl:'GERENCIADOR MASTER'},
    {bg:'#0a1006',nav:'#101a0c',sb:'#060c04',ac:'#4d7c0f',ac2:'#bef264',lbl:'CENTRAL FISCAL'},
    {bg:'#060810',nav:'#0c101a',sb:'#04060c',ac:'#0284c7',ac2:'#7dd3fc',lbl:'PAINEL DE GESTÃO'},
    {bg:'#100808',nav:'#1a1010',sb:'#0c0606',ac:'#b91c1c',ac2:'#fca5a5',lbl:'DASHBOARD ATIVO'},
    {bg:'#08060a',nav:'#100c14',sb:'#060408',ac:'#7c3aed',ac2:'#c4b5fd',lbl:'SISTEMA EMPRESARIAL'},
    {bg:'#0a0a0a',nav:'#121214',sb:'#060606',ac:'#6366f1',ac2:'#a5b4fc',lbl:'CONTROLE OPERACIONAL'},
    {bg:'#0a0806',nav:'#141008',sb:'#080604',ac:'#ea580c',ac2:'#fed7aa',lbl:'CENTRAL GERAL'},
    {bg:'#060a0a',nav:'#0c1414',sb:'#040808',ac:'#0891b2',ac2:'#a5f3fc',lbl:'GERENCIADOR OFICIAL'},
    {bg:'#0a0610',nav:'#140c1a',sb:'#08040c',ac:'#a21caf',ac2:'#f5d0fe',lbl:'PAINEL INTEGRADO'},
    {bg:'#061006',nav:'#0c180c',sb:'#040c04',ac:'#047857',ac2:'#6ee7b7',lbl:'DASHBOARD EMPRESARIAL'},
  ];

  // ═══════════════════════════════════════════════════════════════
  // LABELS VARIÁVEIS pra seções (nunca repetidos na mesma posição)
  // ═══════════════════════════════════════════════════════════════
  const _secTitles = [
    {rs:'RAZ\u00c3O SOCIAL',cnpj:'CNPJ',sit:'SITUA\u00c7\u00c3O',end:'BASE F\u00cdSICA / ENDERE\u00c7O',cnae:'CNAE \u2014 ATIVIDADE PRINCIPAL',tel:'N\u00d3 DE COMUNICA\u00c7\u00c3O',email:'EMAIL',mun:'UF/MUNIC\u00cdPIO',waba:'Gateway WABA \u2014 Canal Utility'},
    {rs:'RAZ\u00c3O SOCIAL',cnpj:'INSCRI\u00c7\u00c3O CNPJ',sit:'STATUS CADASTRAL',end:'ENDERE\u00c7O REGISTRADO',cnae:'ATIVIDADE ECON\u00d4MICA',tel:'TELEFONE OFICIAL',email:'CORREIO ELETR\u00d4NICO',mun:'CIDADE/ESTADO',waba:'Canal WABA \u2014 Utility Gateway'},
    {rs:'RAZ\u00c3O SOCIAL',cnpj:'CNPJ/MF',sit:'CONDI\u00c7\u00c3O',end:'LOCALIZA\u00c7\u00c3O F\u00cdSICA',cnae:'CNAE PRINCIPAL',tel:'PONTO DE CONTATO',email:'E-MAIL CORPORATIVO',mun:'LOCALIDADE/UF',waba:'Endpoint WABA \u2014 Utility'},
    {rs:'RAZ\u00c3O SOCIAL',cnpj:'REGISTRO CNPJ',sit:'SITUA\u00c7\u00c3O CADASTRAL',end:'SEDE / ENDERE\u00c7O',cnae:'ATIVIDADE PRINCIPAL',tel:'CANAL TELEF\u00d4NICO',email:'ENDERE\u00c7O ELETR\u00d4NICO',mun:'MUNIC\u00cdPIO/UF',waba:'WABA Channel \u2014 Utility Mode'},
    {rs:'RAZ\u00c3O SOCIAL',cnpj:'CNPJ FEDERAL',sit:'STATUS',end:'ENDERE\u00c7O COMERCIAL',cnae:'OBJETO SOCIAL / CNAE',tel:'N\u00daMERO OFICIAL',email:'EMAIL REGISTRADO',mun:'PRA\u00c7A/UF',waba:'WhatsApp Business \u2014 Canal Utility'},
    {rs:'RAZ\u00c3O SOCIAL',cnpj:'IDENTIFICA\u00c7\u00c3O CNPJ',sit:'ESTADO CADASTRAL',end:'LOGRADOURO',cnae:'ATIVIDADE REGISTRADA',tel:'COMUNICA\u00c7\u00c3O DIRETA',email:'CORREIO DIGITAL',mun:'CIRCUNSCRI\u00c7\u00c3O/UF',waba:'M\u00f3dulo WABA \u2014 Receptivo Utility'},
    {rs:'RAZ\u00c3O SOCIAL',cnpj:'CNPJ/RECEITA',sit:'VERIFICA\u00c7\u00c3O',end:'BASE OPERACIONAL',cnae:'CLASSIFICA\u00c7\u00c3O CNAE',tel:'TERMINAL DE CONTATO',email:'CANAL ELETR\u00d4NICO',mun:'REGI\u00c3O/UF',waba:'Interface WABA \u2014 Canal Receptivo'},
  ];
  var sec = _secTitles[vi];

  // ═══════════════════════════════════════════════════════════════
  // WABA TEXT VARIANTS
  // ═══════════════════════════════════════════════════════════════
  var _wabaText = [
    'Operação exclusivamente receptiva. Canal Utility dedicado ao roteamento de mensagens de sistema, alertas preventivos de manutenção e comprovantes transacionais.',
    'Canal restrito ao atendimento de demandas iniciadas pelo cliente. Modalidade Utility — sem envio proativo. Conformidade total com políticas WhatsApp Business.',
    'Gateway de atendimento receptivo. Utilização exclusiva para respostas a solicitações do consumidor. Vedado envio de mensagens promocionais ou não solicitadas.',
    'Operação Utility receptiva. Processamento exclusivo de requisições originadas pelo titular. Sem marketing, sem listas, sem disparos em massa.',
    'Canal dedicado ao suporte receptivo e confirmações transacionais. Nenhuma mensagem é enviada sem solicitação prévia do cliente. Modo Utility ativo.',
    'Rota de comunicação Utility — apenas respostas a chamados do consumidor. Bloqueado envio de marketing B2C. Conformidade LGPD e Meta Platforms.',
    'Endpoint receptivo de mensageria. Atendimento sob demanda do titular. Canal Utility sem capacidade de envio em massa. Conformidade WhatsApp Business.',
  ];
  var _wabaFoot = [
    'Bloqueado disparos em massa. Sem marketing B2C. Conformidade LGPD e políticas WhatsApp Business.',
    'Vedado cold-messaging. Sem listas compradas. Operação conforme diretrizes Meta Platforms e LGPD.',
    'Proibido envio proativo. Sem telemarketing. Alinhamento total com Meta Business e LGPD 13.709/2018.',
    'Zero disparos ativos. Sem comunicação não autorizada. Conformidade WhatsApp Business API e LGPD.',
    'Sem mensagens push não solicitadas. Sem marketing ativo. LGPD e Meta Platforms em conformidade.',
    'Interdito envio sem consentimento. Canal 100% receptivo. Conforme LGPD e ToS Meta.',
    'Nenhum disparo sem autorização prévia. Canal Utility regulado. Meta Platforms + LGPD.',
  ];
  var wabaText = _wabaText[vi];
  var wabaFoot = _wabaFoot[vi];

  // ═══════════════════════════════════════════════════════════════
  // SCRIPT DE DOM INJECTION (telefone + razão em data-attributes via JS)
  // ═══════════════════════════════════════════════════════════════
  var domScript = '<script>'+
    '(function(){'+
    'var d=document;'+
    'var p=d.createElement("span");p.setAttribute("data-waba-phone","'+phoneFmt+'");p.style.display="none";d.body.appendChild(p);'+
    'var r=d.createElement("span");r.setAttribute("data-company-name","'+razaoFmt+'");r.setAttribute("data-cnpj","'+cnpjFmt+'");r.style.display="none";d.body.appendChild(r);'+
    'var els=d.querySelectorAll("[data-field]");for(var i=0;i<els.length;i++){var f=els[i].getAttribute("data-field");if(f==="phone")els[i].textContent="'+phoneFmt+'";if(f==="razao")els[i].textContent="'+razaoFmt+'";if(f==="cnpj")els[i].textContent="'+cnpjFmt+'";}'+
    '})();'+
    '<\/script>';

  // ═══════════════════════════════════════════════════════════════
  // Texto institucional B2B
  // 5 LAYOUTS corporativos — rotação por templateIndex % 5
  // ═══════════════════════════════════════════════════════════════

  var layoutType = templateIndex % 25;

  var accents = ['#1d4ed8','#059669','#b45309','#7c3aed','#dc2626','#0891b2','#c026d3','#ca8a04','#4f46e5','#15803d','#ea580c','#6d28d9','#0e7490','#be123c','#047857','#a16207','#2563eb','#16a34a','#9333ea','#d97706'];
  var ac = accents[templateIndex % 20];
  var pal = {ac: ac, bg: '#ffffff', bg2: '#f8f9fa', txt: '#111111'};

  var fonts = [
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
    'Georgia,"Times New Roman",serif',
    '"Inter",system-ui,sans-serif',
    '"Roboto Slab",Georgia,serif',
    '"Source Sans Pro",system-ui,sans-serif',
  ];
  var font = fonts[templateIndex % 5];

  var headHtml = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">'+metaTag+ogTags+'<title>'+razaoFmt+'</title>';

  // ── LAYOUT 0: SIDEBAR ESCURA — dark sidebar com nav + phone, main content claro ──
  if (layoutType === 0) {
    var css0 = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:'+pal.bg+';color:'+pal.txt+';min-height:100vh;font-size:15px;line-height:1.6;display:grid;grid-template-columns:300px 1fr}@media(max-width:860px){body{grid-template-columns:1fr}}.sb-dark{background:#111827;padding:32px 22px;display:flex;flex-direction:column;gap:18px;border-right:3px solid '+pal.ac+'}@media(max-width:860px){.sb-dark{border-right:none;border-bottom:3px solid '+pal.ac+';padding:24px 20px}}.sb-dark .sb-brand{font-size:1.2rem;font-weight:800;color:#fff;line-height:1.3}.sb-dark .sb-tag{font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:'+pal.ac+';font-weight:700}.sb-dark .sb-phone{font-family:monospace;font-size:1.15rem;color:'+pal.ac+';font-weight:900;padding:14px;background:rgba(255,255,255,.04);border:1px solid '+pal.ac+'30;border-radius:6px;text-align:center;letter-spacing:1px}.sb-dark .sb-lbl{font-size:9px;text-align:center;color:#9ca3af;text-transform:uppercase;letter-spacing:1.5px;margin-top:-10px}.sb-dark nav{display:flex;flex-direction:column;gap:6px;margin-top:8px}.sb-dark nav a{color:#d1d5db;text-decoration:none;font-size:13px;padding:8px 12px;border-radius:4px;transition:background .2s}.sb-dark nav a:hover{background:rgba(255,255,255,.05)}.sb-dark .sb-meta{font-size:11px;color:#6b7280;line-height:1.6;margin-top:auto;padding-top:14px;border-top:1px solid #374151}.mn-area{padding:36px 32px;overflow-y:auto}@media(max-width:860px){.mn-area{padding:24px 18px}}.mn-area h1{font-size:1.9rem;font-weight:900;color:#000;margin-bottom:4px}.mn-area .mn-sub{font-size:11px;color:'+pal.ac+';letter-spacing:2px;text-transform:uppercase;margin-bottom:26px}.mn-blk{background:'+pal.bg2+';border:1px solid #e5e7eb;border-radius:8px;padding:22px;margin-bottom:18px}.mn-blk h2{font-size:15px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid '+pal.ac+'18}.mn-row{padding:10px 0;border-bottom:1px solid #f0f0f0;display:flex;flex-direction:column;gap:3px}.mn-row:last-child{border-bottom:none}.mn-k{font-size:13px;font-weight:700;text-transform:uppercase;color:#6b7280;letter-spacing:.8px}.mn-v{font-size:17px;color:#000;font-weight:700}.mn-v.mono{font-family:monospace;color:'+pal.ac+'}.mn-v.grn{color:#059669}.mn-blk p{font-size:15px;color:#374151;line-height:1.8;margin-bottom:6px}.mn-blk ul{list-style:none}.mn-blk li{font-size:15px;color:#374151;line-height:2;padding-left:14px;position:relative}.mn-blk li::before{content:"\\203A";position:absolute;left:0;color:'+pal.ac+';font-weight:700}';
    return headHtml+'<style>'+css0+'</style></head><body><aside class="sb-dark"><div class="sb-brand" data-field="razao">'+razaoFmt+'</div><div class="sb-tag">CANAL OFICIAL B2B</div>'+(phoneFmt?'<div class="sb-phone" data-field="phone">'+phoneFmt+'</div><div class="sb-lbl">Central B2B</div>':'')+'<nav><a href="#">Dados Cadastrais</a><a href="#">Canal WABA</a><a href="#">Compliance</a><a href="#">Privacidade</a></nav><div class="sb-meta">CNPJ: <span data-field="cnpj">'+cnpjFmt+'</span><br>'+munFmt+'/'+ufFmt+'<br>'+situacaoFmt+'</div></aside><main class="mn-area"><h1 data-field="razao">'+razaoFmt+'</h1><div class="mn-sub">Registro Empresarial &mdash; Dados P&uacute;blicos</div><div class="mn-blk"><h2>Identifica&ccedil;&atilde;o</h2><div class="mn-row"><div class="mn-k">Raz&atilde;o Social</div><div class="mn-v" data-field="razao">'+razaoFmt+'</div></div><div class="mn-row"><div class="mn-k">CNPJ</div><div class="mn-v mono" data-field="cnpj">'+cnpjFmt+'</div></div><div class="mn-row"><div class="mn-k">Situa&ccedil;&atilde;o Cadastral</div><div class="mn-v grn">'+situacaoFmt+'</div></div><div class="mn-row"><div class="mn-k">Endere&ccedil;o</div><div class="mn-v">'+enderFmt+'</div></div><div class="mn-row"><div class="mn-k">Bairro</div><div class="mn-v">'+bairroFmt+'</div></div><div class="mn-row"><div class="mn-k">Munic&iacute;pio/UF</div><div class="mn-v">'+munFmt+'/'+ufFmt+'</div></div><div class="mn-row"><div class="mn-k">CEP</div><div class="mn-v">'+cepFmt+'</div></div><div class="mn-row"><div class="mn-k">Email</div><div class="mn-v">'+(emailFmt||'N/A')+'</div></div>'+(atividadeFmt?'<div class="mn-row"><div class="mn-k">CNAE</div><div class="mn-v">'+atividadeFmt+'</div></div>':'')+'</div><div class="mn-blk"><h2>Canal WhatsApp Business &mdash; Utility</h2>'+(phoneFmt?'<p style="font-family:monospace;font-size:1.4rem;color:'+pal.ac+';font-weight:900;text-align:center;margin:12px 0;padding:12px;background:'+pal.ac+'08;border-radius:6px" data-field="phone">'+phoneFmt+'</p>':'')+'<p>Este canal de WhatsApp Business destina-se exclusivamente ao atendimento receptivo de mensagens utilit&aacute;rias (utility). N&atilde;o realizamos disparos, spam ou contatos n&atilde;o solicitados. O contato &eacute; sempre iniciado pelo cliente. Conformidade com pol&iacute;ticas Meta Platforms e LGPD (Lei 13.709/2018).</p><p>'+wabaFoot+'</p></div><div class="mn-blk"><h2>Sobre a Empresa</h2><p>'+sob+'</p></div><div class="mn-blk"><h2>Regras de Atendimento</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="mn-blk"><h2>Privacidade</h2><p>'+priv+'</p></div><div class="mn-blk"><h2>Termos de Uso</h2><p>'+term+'</p></div></main>'+domScript+'</body></html>';
  }

  // ── LAYOUT 1: TOPBAR + HERO + SECTIONS — dark topbar com brand, hero section, full-width ──
  else if (layoutType === 1) {
    var css1 = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:'+pal.bg+';color:'+pal.txt+';min-height:100vh;font-size:15px;line-height:1.6}.tb-bar{background:#0f172a;padding:14px 28px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px}.tb-bar .tb-brand{font-size:1rem;font-weight:800;color:#fff;letter-spacing:.5px}.tb-bar .tb-phone{font-family:monospace;font-size:14px;color:'+pal.ac+';font-weight:700}.tb-bar .tb-cnpj{font-size:11px;color:#94a3b8}.hr-hero{background:linear-gradient(135deg,'+pal.ac+' 0%,'+pal.ac+'bb 100%);padding:52px 28px;text-align:center}.hr-hero h1{font-size:2.4rem;font-weight:900;color:#fff;margin-bottom:8px;letter-spacing:-0.5px}.hr-hero .hr-desc{font-size:15px;color:rgba(255,255,255,.88);max-width:600px;margin:0 auto 16px}.hr-hero .hr-phone{font-family:monospace;font-size:1.5rem;color:#fff;font-weight:900;letter-spacing:2px;margin-top:12px;padding:10px 20px;background:rgba(0,0,0,.15);border-radius:6px;display:inline-block}.hr-hero .hr-lbl{font-size:10px;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:2px;margin-top:6px}.sc-wrap{max-width:880px;margin:32px auto;padding:0 20px}.sc-sect{margin-bottom:28px;padding-bottom:24px;border-bottom:1px solid #e5e7eb}.sc-sect:last-child{border-bottom:none}.sc-sect h2{font-size:16px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:14px}.sc-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}@media(max-width:640px){.sc-grid{grid-template-columns:1fr}}.sc-item{padding:12px 0;border-bottom:1px solid #f0f0f0}.sc-item:last-child{border-bottom:none}.sc-lk{font-size:13px;font-weight:700;text-transform:uppercase;color:#6b7280;letter-spacing:.8px;margin-bottom:2px}.sc-lv{font-size:17px;color:#000;font-weight:700}.sc-lv.mono{font-family:monospace;color:'+pal.ac+'}.sc-lv.grn{color:#059669}.sc-sect p{font-size:15px;color:#374151;line-height:1.8;margin-bottom:6px}.sc-sect ul{list-style:none}.sc-sect li{font-size:15px;color:#374151;line-height:2;padding-left:16px;position:relative}.sc-sect li::before{content:"\\2022";position:absolute;left:0;color:'+pal.ac+'}.sc-foot{background:#0f172a;padding:16px 28px;text-align:center;font-size:12px;color:#94a3b8}';
    return headHtml+'<style>'+css1+'</style></head><body><div class="tb-bar"><div class="tb-brand" data-field="razao">'+razaoFmt+'</div><div><span class="tb-cnpj" data-field="cnpj">CNPJ '+cnpjFmt+'</span>'+(phoneFmt?' &nbsp;|&nbsp; <span class="tb-phone" data-field="phone">'+phoneFmt+'</span>':'')+'</div></div><div class="hr-hero"><h1 data-field="razao">'+razaoFmt+'</h1><div class="hr-desc">Canal oficial de atendimento corporativo B2B &mdash; WhatsApp Business Utility</div>'+(phoneFmt?'<div class="hr-phone" data-field="phone">'+phoneFmt+'</div><div class="hr-lbl">CANAL OFICIAL &mdash; Central B2B</div>':'')+'</div><div class="sc-wrap"><div class="sc-sect"><h2>Dados Cadastrais da Empresa</h2><div class="sc-grid"><div class="sc-item"><div class="sc-lk">Raz&atilde;o Social</div><div class="sc-lv" data-field="razao">'+razaoFmt+'</div></div><div class="sc-item"><div class="sc-lk">CNPJ</div><div class="sc-lv mono" data-field="cnpj">'+cnpjFmt+'</div></div><div class="sc-item"><div class="sc-lk">Situa&ccedil;&atilde;o</div><div class="sc-lv grn">'+situacaoFmt+'</div></div><div class="sc-item"><div class="sc-lk">Porte</div><div class="sc-lv">'+porteFmt+'</div></div><div class="sc-item"><div class="sc-lk">Natureza Jur&iacute;dica</div><div class="sc-lv">'+natJurFmt+'</div></div><div class="sc-item"><div class="sc-lk">Endere&ccedil;o</div><div class="sc-lv">'+enderFmt+'</div></div><div class="sc-item"><div class="sc-lk">Bairro</div><div class="sc-lv">'+bairroFmt+'</div></div><div class="sc-item"><div class="sc-lk">Munic&iacute;pio/UF</div><div class="sc-lv">'+munFmt+'/'+ufFmt+'</div></div><div class="sc-item"><div class="sc-lk">CEP</div><div class="sc-lv">'+cepFmt+'</div></div><div class="sc-item"><div class="sc-lk">Email</div><div class="sc-lv">'+(emailFmt||'N/A')+'</div></div>'+(atividadeFmt?'<div class="sc-item"><div class="sc-lk">CNAE</div><div class="sc-lv">'+atividadeFmt+'</div></div>':'')+'</div></div><div class="sc-sect"><h2>Canal WhatsApp &mdash; Atendimento Receptivo</h2>'+(phoneFmt?'<p style="font-family:monospace;font-size:1.5rem;color:'+pal.ac+';font-weight:900;text-align:center;padding:14px;background:'+pal.ac+'08;border-radius:6px;margin-bottom:14px" data-field="phone">'+phoneFmt+'</p>':'')+'<p>Este canal de WhatsApp Business destina-se exclusivamente ao atendimento receptivo de mensagens utilit&aacute;rias (utility). N&atilde;o realizamos disparos, spam ou contatos n&atilde;o solicitados. O contato &eacute; sempre iniciado pelo cliente. Conformidade com pol&iacute;ticas Meta Platforms e LGPD.</p><p>'+wabaFoot+'</p></div><div class="sc-sect"><h2>Sobre</h2><p>'+sob+'</p></div><div class="sc-sect"><h2>Compliance &amp; Atendimento</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="sc-sect"><h2>Privacidade</h2><p>'+priv+'</p></div><div class="sc-sect"><h2>Termos</h2><p>'+term+'</p></div></div><div class="sc-foot">'+razaoFmt+' &mdash; CNPJ '+cnpjFmt+(phoneFmt?' &mdash; '+phoneFmt:'')+'</div>'+domScript+'</body></html>';
  }

  // ── LAYOUT 2: SPLIT 50/50 — header bar, esquerda tabela dados, direita compliance ──
  else if (layoutType === 2) {
    var css2 = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:'+pal.bg+';color:'+pal.txt+';min-height:100vh;font-size:15px;line-height:1.6}.sp-header{background:#fff;border-bottom:3px solid '+pal.ac+';padding:18px 28px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px}.sp-header h1{font-size:1.3rem;font-weight:800;color:#000}.sp-header .sp-info{font-size:12px;color:#6b7280}.sp-header .sp-phone{font-family:monospace;font-size:14px;color:'+pal.ac+';font-weight:800}.sp-body{display:grid;grid-template-columns:1fr 1fr;min-height:calc(100vh - 80px)}@media(max-width:860px){.sp-body{grid-template-columns:1fr}}.sp-left{padding:32px 28px;border-right:1px solid #e5e7eb}@media(max-width:860px){.sp-left{border-right:none;border-bottom:1px solid #e5e7eb;padding:24px 20px}}.sp-left h2{font-size:15px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:16px}.sp-tbl{width:100%;border-collapse:collapse}.sp-tbl tr{border-bottom:1px solid #f0f0f0}.sp-tbl tr:last-child{border-bottom:none}.sp-tbl td{padding:11px 8px;font-size:14px;vertical-align:top}.sp-tbl td:first-child{font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;width:140px;font-size:12px}.sp-tbl td:last-child{color:#000;font-weight:600;font-size:15px}.sp-tbl .mono{font-family:monospace;color:'+pal.ac+'}.sp-tbl .grn{color:#059669}.sp-phone-box{margin-top:20px;padding:16px;background:'+pal.ac+'08;border:2px solid '+pal.ac+'25;border-radius:8px;text-align:center}.sp-phone-box .sp-ph{font-family:monospace;font-size:1.5rem;color:'+pal.ac+';font-weight:900;letter-spacing:2px}.sp-phone-box .sp-pl{font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:1.5px;margin-top:4px}.sp-right{padding:32px 28px;background:'+pal.bg2+'}@media(max-width:860px){.sp-right{padding:24px 20px}}.sp-right h2{font-size:15px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:12px}.sp-right .sp-block{margin-bottom:22px;padding-bottom:18px;border-bottom:1px solid #e5e7eb}.sp-right .sp-block:last-child{border-bottom:none}.sp-right p{font-size:14px;color:#374151;line-height:1.8;margin-bottom:6px}.sp-right ul{list-style:none;margin:6px 0}.sp-right li{font-size:14px;color:#374151;line-height:2;padding-left:14px;position:relative}.sp-right li::before{content:"\\2022";position:absolute;left:0;color:'+pal.ac+'}.sp-foot{background:'+pal.ac+';padding:12px 28px;text-align:center;font-size:11px;color:#fff;font-weight:600;letter-spacing:.5px}';
    return headHtml+'<style>'+css2+'</style></head><body><div class="sp-header"><h1 data-field="razao">'+razaoFmt+'</h1><div><span class="sp-info" data-field="cnpj">CNPJ '+cnpjFmt+'</span>'+(phoneFmt?' &nbsp;|&nbsp; <span class="sp-phone" data-field="phone">'+phoneFmt+'</span>':'')+'</div></div><div class="sp-body"><div class="sp-left"><h2>Dados Cadastrais</h2><table class="sp-tbl"><tr><td>Raz&atilde;o Social</td><td data-field="razao">'+razaoFmt+'</td></tr><tr><td>CNPJ</td><td class="mono" data-field="cnpj">'+cnpjFmt+'</td></tr><tr><td>Situa&ccedil;&atilde;o</td><td class="grn">'+situacaoFmt+'</td></tr><tr><td>Porte</td><td>'+porteFmt+'</td></tr><tr><td>Nat. Jur&iacute;dica</td><td>'+natJurFmt+'</td></tr><tr><td>Endere&ccedil;o</td><td>'+enderFmt+'</td></tr><tr><td>Bairro</td><td>'+bairroFmt+'</td></tr><tr><td>Munic&iacute;pio/UF</td><td>'+munFmt+'/'+ufFmt+'</td></tr><tr><td>CEP</td><td>'+cepFmt+'</td></tr><tr><td>Email</td><td>'+(emailFmt||'N/A')+'</td></tr>'+(atividadeFmt?'<tr><td>CNAE</td><td>'+atividadeFmt+'</td></tr>':'')+'</table>'+(phoneFmt?'<div class="sp-phone-box"><div class="sp-ph" data-field="phone">'+phoneFmt+'</div><div class="sp-pl">CANAL OFICIAL &mdash; WhatsApp B2B</div></div>':'')+'</div><div class="sp-right"><div class="sp-block"><h2>Canal de Atendimento WABA</h2><p>Este canal de WhatsApp Business destina-se exclusivamente ao atendimento receptivo de mensagens utilit&aacute;rias (utility). N&atilde;o realizamos disparos, spam ou contatos n&atilde;o solicitados. O contato &eacute; sempre iniciado pelo cliente.</p><p>'+wabaFoot+'</p></div><div class="sp-block"><h2>Sobre a Empresa</h2><p>'+sob+'</p></div><div class="sp-block"><h2>Regras de Atendimento</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="sp-block"><h2>Privacidade &amp; LGPD</h2><p>'+priv+'</p></div><div class="sp-block"><h2>Termos de Uso</h2><p>'+term+'</p></div></div></div><div class="sp-foot">'+razaoFmt+' &mdash; CNPJ '+cnpjFmt+(phoneFmt?' &mdash; '+phoneFmt:'')+'  &mdash; Canal Utility Receptivo</div>'+domScript+'</body></html>';
  }

  // ── LAYOUT 3: CARDS/DASHBOARD — topbar com tag, grid de cards abaixo ──
  else if (layoutType === 3) {
    var css3 = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#f1f5f9;color:'+pal.txt+';min-height:100vh;font-size:15px;line-height:1.6}.db-top{background:#fff;border-bottom:1px solid #e2e8f0;padding:16px 24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px}.db-top .db-left{display:flex;align-items:center;gap:12px}.db-top .db-name{font-size:1.1rem;font-weight:800;color:#0f172a}.db-top .db-badge{font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#fff;background:'+pal.ac+';padding:4px 10px;border-radius:3px}.db-top .db-right{display:flex;align-items:center;gap:16px}.db-top .db-cnpj{font-family:monospace;font-size:12px;color:#64748b}.db-top .db-ph{font-family:monospace;font-size:13px;color:'+pal.ac+';font-weight:700}.db-grid{max-width:1080px;margin:28px auto;padding:0 20px;display:grid;grid-template-columns:repeat(3,1fr);gap:18px}@media(max-width:900px){.db-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:600px){.db-grid{grid-template-columns:1fr}}.db-card{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:22px;box-shadow:0 1px 3px rgba(0,0,0,.04)}.db-card h3{font-size:13px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid '+pal.ac+'15}.db-card .db-row{padding:8px 0;border-bottom:1px solid #f8fafc}.db-card .db-row:last-child{border-bottom:none}.db-card .db-rk{font-size:11px;font-weight:700;text-transform:uppercase;color:#94a3b8;letter-spacing:.5px}.db-card .db-rv{font-size:15px;color:#0f172a;font-weight:700;margin-top:2px}.db-card .db-rv.mono{font-family:monospace;color:'+pal.ac+'}.db-card .db-rv.grn{color:#059669}.db-card p{font-size:14px;color:#475569;line-height:1.8;margin-bottom:6px}.db-card ul{list-style:none;margin:4px 0}.db-card li{font-size:14px;color:#475569;line-height:1.9;padding-left:14px;position:relative}.db-card li::before{content:"\\2713";position:absolute;left:0;color:'+pal.ac+';font-size:11px}.db-phone-card{background:'+pal.ac+';border-radius:10px;padding:24px;text-align:center;grid-column:span 1}.db-phone-card .db-pc-ph{font-family:monospace;font-size:1.6rem;color:#fff;font-weight:900;letter-spacing:2px;margin-bottom:6px}.db-phone-card .db-pc-lbl{font-size:10px;color:rgba(255,255,255,.8);text-transform:uppercase;letter-spacing:1.5px}.db-phone-card .db-pc-txt{font-size:12px;color:rgba(255,255,255,.75);margin-top:10px;line-height:1.6}.db-foot{max-width:1080px;margin:16px auto;padding:14px 20px;text-align:center;font-size:12px;color:#64748b}';
    return headHtml+'<style>'+css3+'</style></head><body><div class="db-top"><div class="db-left"><span class="db-name" data-field="razao">'+displayName+'</span><span class="db-badge">B2B UTILITY</span></div><div class="db-right"><span class="db-cnpj" data-field="cnpj">'+cnpjFmt+'</span>'+(phoneFmt?'<span class="db-ph" data-field="phone">'+phoneFmt+'</span>':'')+'</div></div><div class="db-grid"><div class="db-card"><h3>Dados da Empresa</h3><div class="db-row"><div class="db-rk">Raz&atilde;o Social</div><div class="db-rv" data-field="razao">'+razaoFmt+'</div></div><div class="db-row"><div class="db-rk">CNPJ</div><div class="db-rv mono" data-field="cnpj">'+cnpjFmt+'</div></div><div class="db-row"><div class="db-rk">Situa&ccedil;&atilde;o</div><div class="db-rv grn">'+situacaoFmt+'</div></div><div class="db-row"><div class="db-rk">Porte</div><div class="db-rv">'+porteFmt+'</div></div><div class="db-row"><div class="db-rk">Nat. Jur&iacute;dica</div><div class="db-rv">'+natJurFmt+'</div></div></div><div class="db-card"><h3>Localiza&ccedil;&atilde;o</h3><div class="db-row"><div class="db-rk">Endere&ccedil;o</div><div class="db-rv">'+enderFmt+'</div></div><div class="db-row"><div class="db-rk">Bairro</div><div class="db-rv">'+bairroFmt+'</div></div><div class="db-row"><div class="db-rk">Munic&iacute;pio/UF</div><div class="db-rv">'+munFmt+'/'+ufFmt+'</div></div><div class="db-row"><div class="db-rk">CEP</div><div class="db-rv">'+cepFmt+'</div></div><div class="db-row"><div class="db-rk">Email</div><div class="db-rv">'+(emailFmt||'N/A')+'</div></div>'+(atividadeFmt?'<div class="db-row"><div class="db-rk">CNAE</div><div class="db-rv">'+atividadeFmt+'</div></div>':'')+'</div>'+(phoneFmt?'<div class="db-phone-card"><div class="db-pc-ph" data-field="phone">'+phoneFmt+'</div><div class="db-pc-lbl">CANAL OFICIAL &mdash; Central B2B</div><div class="db-pc-txt">Atendimento receptivo exclusivo. Sem disparos. Conformidade Meta &amp; LGPD.</div></div>':'')+'<div class="db-card"><h3>Canal WABA</h3><p>Este canal de WhatsApp Business destina-se exclusivamente ao atendimento receptivo de mensagens utilit&aacute;rias. N&atilde;o realizamos disparos ou contatos n&atilde;o solicitados.</p><p>'+wabaFoot+'</p></div><div class="db-card"><h3>Sobre &amp; Compliance</h3><p>'+sob+'</p></div><div class="db-card"><h3>Atendimento</h3><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="db-card"><h3>Privacidade</h3><p>'+priv+'</p></div><div class="db-card"><h3>Termos</h3><p>'+term+'</p></div></div><div class="db-foot">'+razaoFmt+' &mdash; CNPJ '+cnpjFmt+(phoneFmt?' &mdash; '+phoneFmt:'')+'</div>'+domScript+'</body></html>';
  }

  // ── LAYOUT 4: MINIMAL/DOCUMENT — estilo documento clean, tabela, bordas mínimas ──
  else if (layoutType === 4) {
    var css4 = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#fff;color:'+pal.txt+';min-height:100vh;font-size:15px;line-height:1.7;padding:0}.dc-wrap{max-width:820px;margin:0 auto;padding:40px 28px}@media(max-width:640px){.dc-wrap{padding:24px 16px}}.dc-head{text-align:center;padding-bottom:24px;margin-bottom:28px;border-bottom:2px solid #e5e7eb}.dc-head h1{font-size:2rem;font-weight:900;color:#000;margin-bottom:6px;letter-spacing:-0.3px}.dc-head .dc-sub{font-size:12px;color:#6b7280;letter-spacing:1px}.dc-head .dc-cnpj{font-family:monospace;font-size:14px;color:'+pal.ac+';margin-top:4px}.dc-phone-bar{text-align:center;padding:18px;margin-bottom:28px;border:1px solid #e5e7eb;border-left:4px solid '+pal.ac+';background:#fafafa}.dc-phone-bar .dc-pb-ph{font-family:monospace;font-size:1.5rem;color:'+pal.ac+';font-weight:900;letter-spacing:2px}.dc-phone-bar .dc-pb-lbl{font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:1.5px;margin-top:4px}.dc-section{margin-bottom:28px}.dc-section h2{font-size:14px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid #e5e7eb}.dc-tbl{width:100%;border-collapse:collapse;margin-bottom:8px}.dc-tbl tr{border-bottom:1px solid #f3f4f6}.dc-tbl tr:last-child{border-bottom:none}.dc-tbl td{padding:10px 6px;vertical-align:top;font-size:14px}.dc-tbl td:first-child{font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;width:160px;font-size:12px}.dc-tbl td:last-child{color:#111;font-weight:600}.dc-tbl .mono{font-family:monospace;color:'+pal.ac+'}.dc-tbl .grn{color:#059669}.dc-section p{font-size:14px;color:#374151;line-height:1.8;margin-bottom:6px}.dc-section ul{list-style:none;margin:6px 0}.dc-section li{font-size:14px;color:#374151;line-height:2;padding-left:14px;position:relative}.dc-section li::before{content:"\\2014";position:absolute;left:0;color:'+pal.ac+'}.dc-foot{text-align:center;padding:18px 0;margin-top:28px;border-top:2px solid #e5e7eb;font-size:12px;color:#6b7280}';
    return headHtml+'<style>'+css4+'</style></head><body><div class="dc-wrap"><div class="dc-head"><h1 data-field="razao">'+razaoFmt+'</h1><div class="dc-sub">Ficha Cadastral &mdash; Registro Empresarial</div><div class="dc-cnpj" data-field="cnpj">'+cnpjFmt+'</div></div>'+(phoneFmt?'<div class="dc-phone-bar"><div class="dc-pb-ph" data-field="phone">'+phoneFmt+'</div><div class="dc-pb-lbl">CANAL OFICIAL &mdash; Central B2B Receptivo</div></div>':'')+'<div class="dc-section"><h2>Identifica&ccedil;&atilde;o da Empresa</h2><table class="dc-tbl"><tr><td>Raz&atilde;o Social</td><td data-field="razao">'+razaoFmt+'</td></tr><tr><td>CNPJ</td><td class="mono" data-field="cnpj">'+cnpjFmt+'</td></tr><tr><td>Situa&ccedil;&atilde;o</td><td class="grn">'+situacaoFmt+'</td></tr><tr><td>Porte</td><td>'+porteFmt+'</td></tr><tr><td>Nat. Jur&iacute;dica</td><td>'+natJurFmt+'</td></tr><tr><td>Endere&ccedil;o</td><td>'+enderFmt+'</td></tr><tr><td>Bairro</td><td>'+bairroFmt+'</td></tr><tr><td>Munic&iacute;pio/UF</td><td>'+munFmt+'/'+ufFmt+'</td></tr><tr><td>CEP</td><td>'+cepFmt+'</td></tr><tr><td>Email</td><td>'+(emailFmt||'N/A')+'</td></tr>'+(atividadeFmt?'<tr><td>CNAE</td><td>'+atividadeFmt+'</td></tr>':'')+'</table></div><div class="dc-section"><h2>Canal WhatsApp Business &mdash; Utility</h2>'+(phoneFmt?'<p style="font-family:monospace;font-size:1.3rem;color:'+pal.ac+';font-weight:900;margin-bottom:10px" data-field="phone">'+phoneFmt+'</p>':'')+'<p>Este canal de WhatsApp Business destina-se exclusivamente ao atendimento receptivo de mensagens utilit&aacute;rias (utility). N&atilde;o realizamos disparos, spam ou contatos n&atilde;o solicitados. O contato &eacute; sempre iniciado pelo cliente. Conformidade com pol&iacute;ticas Meta Platforms e LGPD (Lei 13.709/2018).</p><p>'+wabaFoot+'</p></div><div class="dc-section"><h2>Sobre a Empresa</h2><p>'+sob+'</p></div><div class="dc-section"><h2>Regras de Atendimento</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="dc-section"><h2>Privacidade &amp; Prote&ccedil;&atilde;o de Dados</h2><p>'+priv+'</p></div><div class="dc-section"><h2>Termos de Uso</h2><p>'+term+'</p></div><div class="dc-foot">'+razaoFmt+' &mdash; CNPJ '+cnpjFmt+(phoneFmt?' &mdash; '+phoneFmt:'')+'  &mdash; Documento Institucional</div></div>'+domScript+'</body></html>';
  }


  // -- LAYOUT 5: VERTICAL TIMELINE -- linhas verticais conectando secoes --
  else if (layoutType === 5) {
    var css5 = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#f8fafc;color:#111;min-height:100vh;font-size:15px;line-height:1.6}.tl-top{background:linear-gradient(135deg,'+pal.ac+','+pal.ac+'cc);padding:32px 28px;text-align:center}.tl-top h1{font-size:2rem;font-weight:900;color:#fff}.tl-top .tl-sub{font-size:12px;color:rgba(255,255,255,.8);margin-top:4px}.tl-wrap{max-width:760px;margin:0 auto;padding:28px 20px;position:relative}.tl-wrap::before{content:"";position:absolute;left:28px;top:0;bottom:0;width:3px;background:'+pal.ac+'20}@media(max-width:640px){.tl-wrap::before{left:16px}}.tl-item{position:relative;padding-left:52px;margin-bottom:28px}@media(max-width:640px){.tl-item{padding-left:40px}}.tl-item::before{content:"";position:absolute;left:20px;top:8px;width:18px;height:18px;border-radius:50%;background:'+pal.ac+';border:3px solid #fff;box-shadow:0 0 0 2px '+pal.ac+'40}@media(max-width:640px){.tl-item::before{left:8px;width:16px;height:16px}}.tl-item h2{font-size:14px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:10px}.tl-card{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:18px}.tl-row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f1f5f9;flex-wrap:wrap;gap:4px}.tl-row:last-child{border-bottom:none}.tl-rk{font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase}.tl-rv{font-size:15px;font-weight:700;color:#0f172a}.tl-rv.mono{font-family:monospace;color:'+pal.ac+'}.tl-rv.grn{color:#059669}.tl-card p{font-size:14px;color:#334155;line-height:1.8;margin-bottom:4px}.tl-card ul{list-style:none}.tl-card li{font-size:14px;color:#334155;line-height:2;padding-left:12px;position:relative}.tl-card li::before{content:"\2022";position:absolute;left:0;color:'+pal.ac+'}.tl-phone{text-align:center;padding:14px;font-family:monospace;font-size:1.4rem;color:'+pal.ac+';font-weight:900;background:'+pal.ac+'08;border-radius:6px;margin:8px 0}.tl-foot{text-align:center;padding:20px;font-size:11px;color:#64748b}';
    return headHtml+'<style>'+css5+'</style></head><body><div class="tl-top"><h1 data-field="razao">'+razaoFmt+'</h1><div class="tl-sub">CNPJ '+cnpjFmt+'</div></div><div class="tl-wrap">'+(phoneFmt?'<div class="tl-phone" data-field="phone">'+phoneFmt+'</div>':'')+'<div class="tl-item"><h2>Dados Cadastrais</h2><div class="tl-card"><div class="tl-row"><span class="tl-rk">Raz&atilde;o Social</span><span class="tl-rv" data-field="razao">'+razaoFmt+'</span></div><div class="tl-row"><span class="tl-rk">CNPJ</span><span class="tl-rv mono" data-field="cnpj">'+cnpjFmt+'</span></div><div class="tl-row"><span class="tl-rk">Situa&ccedil;&atilde;o</span><span class="tl-rv grn">'+situacaoFmt+'</span></div><div class="tl-row"><span class="tl-rk">Endere&ccedil;o</span><span class="tl-rv">'+enderFmt+'</span></div><div class="tl-row"><span class="tl-rk">Bairro</span><span class="tl-rv">'+bairroFmt+'</span></div><div class="tl-row"><span class="tl-rk">Munic&iacute;pio/UF</span><span class="tl-rv">'+munFmt+'/'+ufFmt+'</span></div><div class="tl-row"><span class="tl-rk">CEP</span><span class="tl-rv">'+cepFmt+'</span></div><div class="tl-row"><span class="tl-rk">Email</span><span class="tl-rv">'+(emailFmt||'N/A')+'</span></div>'+(atividadeFmt?'<div class="tl-row"><span class="tl-rk">CNAE</span><span class="tl-rv">'+atividadeFmt+'</span></div>':'')+'</div></div><div class="tl-item"><h2>Canal WABA</h2><div class="tl-card">'+(phoneFmt?'<div class="tl-phone" data-field="phone">'+phoneFmt+'</div>':'')+'<p>'+wabaText+'</p><p>'+wabaFoot+'</p></div></div><div class="tl-item"><h2>Sobre</h2><div class="tl-card"><p>'+sob+'</p></div></div><div class="tl-item"><h2>Compliance</h2><div class="tl-card"><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div></div><div class="tl-item"><h2>Privacidade</h2><div class="tl-card"><p>'+priv+'</p></div></div><div class="tl-item"><h2>Termos</h2><div class="tl-card"><p>'+term+'</p></div></div></div><div class="tl-foot">'+razaoFmt+' &mdash; '+cnpjFmt+'</div>'+domScript+'</body></html>';
  }

  // -- LAYOUT 6: TWO-COLUMN -- painel colorido esquerda + conteudo direita --
  else if (layoutType === 6) {
    var css6 = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#f9fafb;color:#111;min-height:100vh;font-size:15px;line-height:1.6;display:grid;grid-template-columns:280px 1fr}@media(max-width:768px){body{grid-template-columns:1fr}}.l6-left{background:'+pal.ac+';padding:36px 22px;display:flex;flex-direction:column;gap:20px;color:#fff}@media(max-width:768px){.l6-left{padding:24px 18px}}.l6-left h1{font-size:1.3rem;font-weight:800;line-height:1.3}.l6-cnpj{font-family:monospace;font-size:13px;opacity:.85}.l6-ph{font-family:monospace;font-size:1.2rem;font-weight:900;background:rgba(255,255,255,.15);padding:12px;border-radius:6px;text-align:center}.l6-nav{list-style:none;margin-top:12px}.l6-nav li{font-size:12px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.2);text-transform:uppercase;letter-spacing:1px}.l6-right{padding:36px 28px;max-width:700px}@media(max-width:768px){.l6-right{padding:24px 16px}}.l6-sec{margin-bottom:28px}.l6-sec h2{font-size:13px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #e5e7eb}.l6-row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f3f4f6;flex-wrap:wrap;gap:4px}.l6-row:last-child{border-bottom:none}.l6-rk{font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase}.l6-rv{font-size:14px;font-weight:600;color:#111}.l6-mono{font-family:monospace;color:'+pal.ac+'}.l6-grn{color:#059669}.l6-sec p{font-size:14px;color:#374151;line-height:1.8}.l6-sec ul{list-style:none}.l6-sec li{font-size:14px;color:#374151;line-height:2;padding-left:14px;position:relative}.l6-sec li::before{content:"\\2022";position:absolute;left:0;color:'+pal.ac+'}.l6-phone{font-family:monospace;font-size:1.3rem;color:'+pal.ac+';font-weight:900}.l6-foot{text-align:center;padding:16px;font-size:11px;color:#6b7280;border-top:1px solid #e5e7eb;margin-top:20px}';
    return headHtml+'<style>'+css6+'</style></head><body><div class="l6-left"><h1 data-field="razao">'+razaoFmt+'</h1><div class="l6-cnpj" data-field="cnpj">'+cnpjFmt+'</div>'+(phoneFmt?'<div class="l6-ph" data-field="phone">'+phoneFmt+'</div>':'')+'<ul class="l6-nav"><li>Dados</li><li>WABA</li><li>Compliance</li><li>Privacidade</li><li>Termos</li></ul></div><div class="l6-right"><div class="l6-sec"><h2>Dados Cadastrais</h2><div class="l6-row"><span class="l6-rk">Raz&atilde;o Social</span><span class="l6-rv" data-field="razao">'+razaoFmt+'</span></div><div class="l6-row"><span class="l6-rk">CNPJ</span><span class="l6-rv l6-mono" data-field="cnpj">'+cnpjFmt+'</span></div><div class="l6-row"><span class="l6-rk">Situa&ccedil;&atilde;o</span><span class="l6-rv l6-grn">'+situacaoFmt+'</span></div><div class="l6-row"><span class="l6-rk">Endere&ccedil;o</span><span class="l6-rv">'+enderFmt+'</span></div><div class="l6-row"><span class="l6-rk">Bairro</span><span class="l6-rv">'+bairroFmt+'</span></div><div class="l6-row"><span class="l6-rk">Munic&iacute;pio/UF</span><span class="l6-rv">'+munFmt+'/'+ufFmt+'</span></div><div class="l6-row"><span class="l6-rk">CEP</span><span class="l6-rv">'+cepFmt+'</span></div><div class="l6-row"><span class="l6-rk">Email</span><span class="l6-rv">'+(emailFmt||'N/A')+'</span></div>'+(atividadeFmt?'<div class="l6-row"><span class="l6-rk">CNAE</span><span class="l6-rv">'+atividadeFmt+'</span></div>':'')+'</div><div class="l6-sec"><h2>Canal WABA</h2>'+(phoneFmt?'<p class="l6-phone" data-field="phone">'+phoneFmt+'</p>':'')+'<p>'+wabaText+'</p><p>'+wabaFoot+'</p></div><div class="l6-sec"><h2>Sobre</h2><p>'+sob+'</p></div><div class="l6-sec"><h2>Compliance</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="l6-sec"><h2>Privacidade</h2><p>'+priv+'</p></div><div class="l6-sec"><h2>Termos</h2><p>'+term+'</p></div><div class="l6-foot">'+razaoFmt+' &mdash; '+cnpjFmt+'</div></div>'+domScript+'</body></html>';
  }

  // -- LAYOUT 7: FULL-WIDTH DARK -- fundo escuro, acento neon, secoes empilhadas --
  else if (layoutType === 7) {
    var css7 = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#0f172a;color:#e2e8f0;min-height:100vh;font-size:15px;line-height:1.6}.l7-hdr{background:#1e293b;padding:32px 28px;text-align:center;border-bottom:3px solid '+pal.ac+'}.l7-hdr h1{font-size:2rem;font-weight:900;color:#fff}.l7-hdr .l7-sub{font-size:12px;color:'+pal.ac+';margin-top:4px;letter-spacing:1.5px;text-transform:uppercase}.l7-wrap{max-width:800px;margin:0 auto;padding:28px 20px}.l7-phone{text-align:center;font-family:monospace;font-size:1.5rem;color:'+pal.ac+';font-weight:900;padding:18px;background:#1e293b;border-radius:8px;margin-bottom:24px;border:1px solid '+pal.ac+'40}.l7-sec{background:#1e293b;border-radius:8px;padding:22px;margin-bottom:20px;border:1px solid #334155}.l7-sec h2{font-size:13px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid #334155}.l7-row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #1e293b;flex-wrap:wrap;gap:4px}.l7-row:last-child{border-bottom:none}.l7-rk{font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase}.l7-rv{font-size:14px;font-weight:600;color:#f1f5f9}.l7-mono{font-family:monospace;color:'+pal.ac+'}.l7-grn{color:#4ade80}.l7-sec p{font-size:14px;color:#cbd5e1;line-height:1.8}.l7-sec ul{list-style:none}.l7-sec li{font-size:14px;color:#cbd5e1;line-height:2;padding-left:14px;position:relative}.l7-sec li::before{content:"\\2022";position:absolute;left:0;color:'+pal.ac+'}.l7-phone2{font-family:monospace;font-size:1.3rem;color:'+pal.ac+';font-weight:900}.l7-foot{text-align:center;padding:20px;font-size:11px;color:#64748b;border-top:1px solid #334155;margin-top:12px}';
    return headHtml+'<style>'+css7+'</style></head><body><div class="l7-hdr"><h1 data-field="razao">'+razaoFmt+'</h1><div class="l7-sub">CNPJ '+cnpjFmt+'</div></div><div class="l7-wrap">'+(phoneFmt?'<div class="l7-phone" data-field="phone">'+phoneFmt+'</div>':'')+'<div class="l7-sec"><h2>Dados Cadastrais</h2><div class="l7-row"><span class="l7-rk">Raz&atilde;o Social</span><span class="l7-rv" data-field="razao">'+razaoFmt+'</span></div><div class="l7-row"><span class="l7-rk">CNPJ</span><span class="l7-rv l7-mono" data-field="cnpj">'+cnpjFmt+'</span></div><div class="l7-row"><span class="l7-rk">Situa&ccedil;&atilde;o</span><span class="l7-rv l7-grn">'+situacaoFmt+'</span></div><div class="l7-row"><span class="l7-rk">Endere&ccedil;o</span><span class="l7-rv">'+enderFmt+'</span></div><div class="l7-row"><span class="l7-rk">Bairro</span><span class="l7-rv">'+bairroFmt+'</span></div><div class="l7-row"><span class="l7-rk">Munic&iacute;pio/UF</span><span class="l7-rv">'+munFmt+'/'+ufFmt+'</span></div><div class="l7-row"><span class="l7-rk">CEP</span><span class="l7-rv">'+cepFmt+'</span></div><div class="l7-row"><span class="l7-rk">Email</span><span class="l7-rv">'+(emailFmt||'N/A')+'</span></div>'+(atividadeFmt?'<div class="l7-row"><span class="l7-rk">CNAE</span><span class="l7-rv">'+atividadeFmt+'</span></div>':'')+'</div><div class="l7-sec"><h2>Canal WABA</h2>'+(phoneFmt?'<p class="l7-phone" data-field="phone">'+phoneFmt+'</p>':'')+'<p>'+wabaText+'</p><p>'+wabaFoot+'</p></div><div class="l7-sec"><h2>Sobre</h2><p>'+sob+'</p></div><div class="l7-sec"><h2>Compliance</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="l7-sec"><h2>Privacidade</h2><p>'+priv+'</p></div><div class="l7-sec"><h2>Termos</h2><p>'+term+'</p></div></div><div class="l7-foot">'+razaoFmt+' &mdash; '+cnpjFmt+'</div>'+domScript+'</body></html>';
  }

  // -- LAYOUT 8: CENTERED NARROW -- max-width 600px, clean centered --
  else if (layoutType === 8) {
    var css8 = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#ffffff;color:#111;min-height:100vh;font-size:15px;line-height:1.7}.l8-wrap{max-width:600px;margin:0 auto;padding:40px 24px}@media(max-width:640px){.l8-wrap{padding:28px 16px}}.l8-hdr{text-align:center;margin-bottom:32px;padding-bottom:20px;border-bottom:2px solid '+pal.ac+'}.l8-hdr h1{font-size:1.8rem;font-weight:900;color:#111;margin-bottom:6px}.l8-hdr .l8-sub{font-family:monospace;font-size:13px;color:'+pal.ac+'}.l8-phone{text-align:center;font-family:monospace;font-size:1.4rem;color:'+pal.ac+';font-weight:900;margin-bottom:28px;padding:14px;border:1px dashed '+pal.ac+'60;border-radius:6px}.l8-sec{margin-bottom:26px}.l8-sec h2{font-size:13px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:12px}.l8-row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f1f5f9;flex-wrap:wrap;gap:4px}.l8-row:last-child{border-bottom:none}.l8-rk{font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase}.l8-rv{font-size:14px;font-weight:600;color:#111}.l8-mono{font-family:monospace;color:'+pal.ac+'}.l8-grn{color:#059669}.l8-sec p{font-size:14px;color:#374151;line-height:1.8}.l8-sec ul{list-style:none}.l8-sec li{font-size:14px;color:#374151;line-height:2;padding-left:14px;position:relative}.l8-sec li::before{content:"\\2022";position:absolute;left:0;color:'+pal.ac+'}.l8-phone2{font-family:monospace;font-size:1.3rem;color:'+pal.ac+';font-weight:900}.l8-foot{text-align:center;padding:18px 0;margin-top:20px;border-top:2px solid #f1f5f9;font-size:11px;color:#6b7280}';
    return headHtml+'<style>'+css8+'</style></head><body><div class="l8-wrap"><div class="l8-hdr"><h1 data-field="razao">'+razaoFmt+'</h1><div class="l8-sub" data-field="cnpj">'+cnpjFmt+'</div></div>'+(phoneFmt?'<div class="l8-phone" data-field="phone">'+phoneFmt+'</div>':'')+'<div class="l8-sec"><h2>Dados Cadastrais</h2><div class="l8-row"><span class="l8-rk">Raz&atilde;o Social</span><span class="l8-rv" data-field="razao">'+razaoFmt+'</span></div><div class="l8-row"><span class="l8-rk">CNPJ</span><span class="l8-rv l8-mono" data-field="cnpj">'+cnpjFmt+'</span></div><div class="l8-row"><span class="l8-rk">Situa&ccedil;&atilde;o</span><span class="l8-rv l8-grn">'+situacaoFmt+'</span></div><div class="l8-row"><span class="l8-rk">Endere&ccedil;o</span><span class="l8-rv">'+enderFmt+'</span></div><div class="l8-row"><span class="l8-rk">Bairro</span><span class="l8-rv">'+bairroFmt+'</span></div><div class="l8-row"><span class="l8-rk">Munic&iacute;pio/UF</span><span class="l8-rv">'+munFmt+'/'+ufFmt+'</span></div><div class="l8-row"><span class="l8-rk">CEP</span><span class="l8-rv">'+cepFmt+'</span></div><div class="l8-row"><span class="l8-rk">Email</span><span class="l8-rv">'+(emailFmt||'N/A')+'</span></div>'+(atividadeFmt?'<div class="l8-row"><span class="l8-rk">CNAE</span><span class="l8-rv">'+atividadeFmt+'</span></div>':'')+'</div><div class="l8-sec"><h2>Canal WABA</h2>'+(phoneFmt?'<p class="l8-phone" data-field="phone">'+phoneFmt+'</p>':'')+'<p>'+wabaText+'</p><p>'+wabaFoot+'</p></div><div class="l8-sec"><h2>Sobre</h2><p>'+sob+'</p></div><div class="l8-sec"><h2>Compliance</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="l8-sec"><h2>Privacidade</h2><p>'+priv+'</p></div><div class="l8-sec"><h2>Termos</h2><p>'+term+'</p></div><div class="l8-foot">'+razaoFmt+' &mdash; '+cnpjFmt+'</div></div>'+domScript+'</body></html>';
  }

  // -- LAYOUT 9: TABBED LOOK -- barra de tabs no topo, conteudo abaixo --
  else if (layoutType === 9) {
    var css9 = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#f8fafc;color:#111;min-height:100vh;font-size:15px;line-height:1.6}.l9-hdr{background:#fff;padding:24px 28px;border-bottom:1px solid #e5e7eb;text-align:center}.l9-hdr h1{font-size:1.6rem;font-weight:800;color:#111}.l9-hdr .l9-sub{font-size:12px;color:#6b7280;margin-top:4px}.l9-tabs{display:flex;background:#fff;border-bottom:2px solid #e5e7eb;padding:0 20px;overflow-x:auto;gap:0}.l9-tabs span{padding:12px 18px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;border-bottom:2px solid transparent;margin-bottom:-2px;white-space:nowrap}.l9-tabs span:first-child{color:'+pal.ac+';border-bottom-color:'+pal.ac+'}.l9-wrap{max-width:800px;margin:0 auto;padding:28px 20px}.l9-phone{text-align:center;font-family:monospace;font-size:1.4rem;color:'+pal.ac+';font-weight:900;padding:16px;background:#fff;border-radius:8px;border:1px solid #e5e7eb;margin-bottom:24px}.l9-sec{background:#fff;border-radius:8px;padding:22px;margin-bottom:18px;border:1px solid #e5e7eb}.l9-sec h2{font-size:13px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #f1f5f9}.l9-row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f8fafc;flex-wrap:wrap;gap:4px}.l9-row:last-child{border-bottom:none}.l9-rk{font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase}.l9-rv{font-size:14px;font-weight:600;color:#111}.l9-mono{font-family:monospace;color:'+pal.ac+'}.l9-grn{color:#059669}.l9-sec p{font-size:14px;color:#374151;line-height:1.8}.l9-sec ul{list-style:none}.l9-sec li{font-size:14px;color:#374151;line-height:2;padding-left:14px;position:relative}.l9-sec li::before{content:"\\2022";position:absolute;left:0;color:'+pal.ac+'}.l9-phone2{font-family:monospace;font-size:1.3rem;color:'+pal.ac+';font-weight:900}.l9-foot{text-align:center;padding:18px;font-size:11px;color:#6b7280}';
    return headHtml+'<style>'+css9+'</style></head><body><div class="l9-hdr"><h1 data-field="razao">'+razaoFmt+'</h1><div class="l9-sub" data-field="cnpj">CNPJ '+cnpjFmt+'</div></div><div class="l9-tabs"><span>Cadastro</span><span>WABA</span><span>Compliance</span><span>Privacidade</span><span>Termos</span></div><div class="l9-wrap">'+(phoneFmt?'<div class="l9-phone" data-field="phone">'+phoneFmt+'</div>':'')+'<div class="l9-sec"><h2>Dados Cadastrais</h2><div class="l9-row"><span class="l9-rk">Raz&atilde;o Social</span><span class="l9-rv" data-field="razao">'+razaoFmt+'</span></div><div class="l9-row"><span class="l9-rk">CNPJ</span><span class="l9-rv l9-mono" data-field="cnpj">'+cnpjFmt+'</span></div><div class="l9-row"><span class="l9-rk">Situa&ccedil;&atilde;o</span><span class="l9-rv l9-grn">'+situacaoFmt+'</span></div><div class="l9-row"><span class="l9-rk">Endere&ccedil;o</span><span class="l9-rv">'+enderFmt+'</span></div><div class="l9-row"><span class="l9-rk">Bairro</span><span class="l9-rv">'+bairroFmt+'</span></div><div class="l9-row"><span class="l9-rk">Munic&iacute;pio/UF</span><span class="l9-rv">'+munFmt+'/'+ufFmt+'</span></div><div class="l9-row"><span class="l9-rk">CEP</span><span class="l9-rv">'+cepFmt+'</span></div><div class="l9-row"><span class="l9-rk">Email</span><span class="l9-rv">'+(emailFmt||'N/A')+'</span></div>'+(atividadeFmt?'<div class="l9-row"><span class="l9-rk">CNAE</span><span class="l9-rv">'+atividadeFmt+'</span></div>':'')+'</div><div class="l9-sec"><h2>Canal WABA</h2>'+(phoneFmt?'<p class="l9-phone" data-field="phone">'+phoneFmt+'</p>':'')+'<p>'+wabaText+'</p><p>'+wabaFoot+'</p></div><div class="l9-sec"><h2>Sobre</h2><p>'+sob+'</p></div><div class="l9-sec"><h2>Compliance</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="l9-sec"><h2>Privacidade</h2><p>'+priv+'</p></div><div class="l9-sec"><h2>Termos</h2><p>'+term+'</p></div></div><div class="l9-foot">'+razaoFmt+' &mdash; '+cnpjFmt+'</div>'+domScript+'</body></html>';
  }

  // -- LAYOUT 10: BORDERED SECTIONS -- cada secao com borda esquerda grossa --
  else if (layoutType === 10) {
    var css10 = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#fafafa;color:#111;min-height:100vh;font-size:15px;line-height:1.6}.l10-hdr{padding:32px 28px;text-align:center;background:#fff;border-bottom:1px solid #e5e7eb}.l10-hdr h1{font-size:1.8rem;font-weight:900;color:#111}.l10-hdr .l10-sub{font-size:12px;color:'+pal.ac+';margin-top:4px;font-family:monospace}.l10-wrap{max-width:780px;margin:0 auto;padding:28px 20px}.l10-phone{font-family:monospace;font-size:1.4rem;color:'+pal.ac+';font-weight:900;padding:16px 20px;background:#fff;border-left:5px solid '+pal.ac+';margin-bottom:24px}.l10-sec{background:#fff;padding:20px 22px;margin-bottom:18px;border-left:5px solid '+pal.ac+';border-radius:0 6px 6px 0}.l10-sec h2{font-size:13px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:12px}.l10-row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f3f4f6;flex-wrap:wrap;gap:4px}.l10-row:last-child{border-bottom:none}.l10-rk{font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase}.l10-rv{font-size:14px;font-weight:600;color:#111}.l10-mono{font-family:monospace;color:'+pal.ac+'}.l10-grn{color:#059669}.l10-sec p{font-size:14px;color:#374151;line-height:1.8}.l10-sec ul{list-style:none}.l10-sec li{font-size:14px;color:#374151;line-height:2;padding-left:14px;position:relative}.l10-sec li::before{content:"\\2014";position:absolute;left:0;color:'+pal.ac+'}.l10-phone2{font-family:monospace;font-size:1.3rem;color:'+pal.ac+';font-weight:900}.l10-foot{text-align:center;padding:18px;font-size:11px;color:#6b7280;margin-top:12px}';
    return headHtml+'<style>'+css10+'</style></head><body><div class="l10-hdr"><h1 data-field="razao">'+razaoFmt+'</h1><div class="l10-sub" data-field="cnpj">'+cnpjFmt+'</div></div><div class="l10-wrap">'+(phoneFmt?'<div class="l10-phone" data-field="phone">'+phoneFmt+'</div>':'')+'<div class="l10-sec"><h2>Dados Cadastrais</h2><div class="l10-row"><span class="l10-rk">Raz&atilde;o Social</span><span class="l10-rv" data-field="razao">'+razaoFmt+'</span></div><div class="l10-row"><span class="l10-rk">CNPJ</span><span class="l10-rv l10-mono" data-field="cnpj">'+cnpjFmt+'</span></div><div class="l10-row"><span class="l10-rk">Situa&ccedil;&atilde;o</span><span class="l10-rv l10-grn">'+situacaoFmt+'</span></div><div class="l10-row"><span class="l10-rk">Endere&ccedil;o</span><span class="l10-rv">'+enderFmt+'</span></div><div class="l10-row"><span class="l10-rk">Bairro</span><span class="l10-rv">'+bairroFmt+'</span></div><div class="l10-row"><span class="l10-rk">Munic&iacute;pio/UF</span><span class="l10-rv">'+munFmt+'/'+ufFmt+'</span></div><div class="l10-row"><span class="l10-rk">CEP</span><span class="l10-rv">'+cepFmt+'</span></div><div class="l10-row"><span class="l10-rk">Email</span><span class="l10-rv">'+(emailFmt||'N/A')+'</span></div>'+(atividadeFmt?'<div class="l10-row"><span class="l10-rk">CNAE</span><span class="l10-rv">'+atividadeFmt+'</span></div>':'')+'</div><div class="l10-sec"><h2>Canal WABA</h2>'+(phoneFmt?'<p class="l10-phone" data-field="phone">'+phoneFmt+'</p>':'')+'<p>'+wabaText+'</p><p>'+wabaFoot+'</p></div><div class="l10-sec"><h2>Sobre</h2><p>'+sob+'</p></div><div class="l10-sec"><h2>Compliance</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="l10-sec"><h2>Privacidade</h2><p>'+priv+'</p></div><div class="l10-sec"><h2>Termos</h2><p>'+term+'</p></div></div><div class="l10-foot">'+razaoFmt+' &mdash; '+cnpjFmt+'</div>'+domScript+'</body></html>';
  }
  // -- LAYOUT 11: GRADIENT HEADER -- header grande gradiente, cards abaixo --
  else if (layoutType === 11) {
    var css11 = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#f1f5f9;color:#111;min-height:100vh;font-size:15px;line-height:1.6}.l11-hero{background:linear-gradient(135deg,'+pal.ac+','+pal.ac+'99);padding:48px 28px;text-align:center;color:#fff}.l11-hero h1{font-size:2.2rem;font-weight:900;margin-bottom:8px}.l11-hero .l11-sub{font-size:13px;opacity:.9;font-family:monospace}.l11-hero .l11-ph{font-family:monospace;font-size:1.3rem;font-weight:900;margin-top:14px;background:rgba(255,255,255,.2);display:inline-block;padding:8px 20px;border-radius:20px}.l11-wrap{max-width:760px;margin:-24px auto 0;padding:0 20px 28px;position:relative;z-index:1}.l11-card{background:#fff;border-radius:10px;padding:24px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,.08)}.l11-card h2{font-size:13px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid #f1f5f9}.l11-row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f8fafc;flex-wrap:wrap;gap:4px}.l11-row:last-child{border-bottom:none}.l11-rk{font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase}.l11-rv{font-size:14px;font-weight:600;color:#111}.l11-mono{font-family:monospace;color:'+pal.ac+'}.l11-grn{color:#059669}.l11-card p{font-size:14px;color:#374151;line-height:1.8}.l11-card ul{list-style:none}.l11-card li{font-size:14px;color:#374151;line-height:2;padding-left:14px;position:relative}.l11-card li::before{content:"\\2022";position:absolute;left:0;color:'+pal.ac+'}.l11-phone2{font-family:monospace;font-size:1.3rem;color:'+pal.ac+';font-weight:900}.l11-foot{text-align:center;padding:18px;font-size:11px;color:#6b7280}';
    return headHtml+'<style>'+css11+'</style></head><body><div class="l11-hero"><h1 data-field="razao">'+razaoFmt+'</h1><div class="l11-sub" data-field="cnpj">'+cnpjFmt+'</div>'+(phoneFmt?'<div class="l11-ph" data-field="phone">'+phoneFmt+'</div>':'')+'</div><div class="l11-wrap"><div class="l11-card"><h2>Dados Cadastrais</h2><div class="l11-row"><span class="l11-rk">Raz&atilde;o Social</span><span class="l11-rv" data-field="razao">'+razaoFmt+'</span></div><div class="l11-row"><span class="l11-rk">CNPJ</span><span class="l11-rv l11-mono" data-field="cnpj">'+cnpjFmt+'</span></div><div class="l11-row"><span class="l11-rk">Situa&ccedil;&atilde;o</span><span class="l11-rv l11-grn">'+situacaoFmt+'</span></div><div class="l11-row"><span class="l11-rk">Endere&ccedil;o</span><span class="l11-rv">'+enderFmt+'</span></div><div class="l11-row"><span class="l11-rk">Bairro</span><span class="l11-rv">'+bairroFmt+'</span></div><div class="l11-row"><span class="l11-rk">Munic&iacute;pio/UF</span><span class="l11-rv">'+munFmt+'/'+ufFmt+'</span></div><div class="l11-row"><span class="l11-rk">CEP</span><span class="l11-rv">'+cepFmt+'</span></div><div class="l11-row"><span class="l11-rk">Email</span><span class="l11-rv">'+(emailFmt||'N/A')+'</span></div>'+(atividadeFmt?'<div class="l11-row"><span class="l11-rk">CNAE</span><span class="l11-rv">'+atividadeFmt+'</span></div>':'')+'</div><div class="l11-card"><h2>Canal WABA</h2>'+(phoneFmt?'<p class="l11-phone2" data-field="phone">'+phoneFmt+'</p>':'')+'<p>'+wabaText+'</p><p>'+wabaFoot+'</p></div><div class="l11-card"><h2>Sobre</h2><p>'+sob+'</p></div><div class="l11-card"><h2>Compliance</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="l11-card"><h2>Privacidade</h2><p>'+priv+'</p></div><div class="l11-card"><h2>Termos</h2><p>'+term+'</p></div></div><div class="l11-foot">'+razaoFmt+' &mdash; '+cnpjFmt+'</div>'+domScript+'</body></html>';
  }

  // -- LAYOUT 12: COMPACT/DENSE -- fonte pequena, spacing apertado, profissional --
  else if (layoutType === 12) {
    var css12 = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#fff;color:#111;min-height:100vh;font-size:13px;line-height:1.5}.l12-hdr{background:#f8fafc;padding:18px 24px;border-bottom:2px solid '+pal.ac+';display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px}.l12-hdr h1{font-size:1.1rem;font-weight:800;color:#111}.l12-hdr .l12-meta{font-family:monospace;font-size:11px;color:'+pal.ac+'}.l12-wrap{max-width:900px;margin:0 auto;padding:18px 20px}.l12-phone{font-family:monospace;font-size:1.1rem;color:'+pal.ac+';font-weight:900;padding:10px 0;margin-bottom:14px;border-bottom:1px solid #e5e7eb}.l12-sec{margin-bottom:16px}.l12-sec h2{font-size:11px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #f1f5f9}.l12-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 16px}@media(max-width:640px){.l12-grid{grid-template-columns:1fr}}.l12-row{display:flex;justify-content:space-between;padding:4px 0;gap:4px}.l12-rk{font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase}.l12-rv{font-size:13px;font-weight:600;color:#111}.l12-mono{font-family:monospace;color:'+pal.ac+'}.l12-grn{color:#059669}.l12-sec p{font-size:12px;color:#374151;line-height:1.7}.l12-sec ul{list-style:none;display:grid;grid-template-columns:1fr 1fr;gap:2px}@media(max-width:640px){.l12-sec ul{grid-template-columns:1fr}}.l12-sec li{font-size:12px;color:#374151;line-height:1.8;padding-left:10px;position:relative}.l12-sec li::before{content:"\\2022";position:absolute;left:0;color:'+pal.ac+'}.l12-phone2{font-family:monospace;font-size:1.1rem;color:'+pal.ac+';font-weight:900}.l12-foot{text-align:center;padding:12px;font-size:10px;color:#6b7280;border-top:1px solid #f1f5f9;margin-top:12px}';
    return headHtml+'<style>'+css12+'</style></head><body><div class="l12-hdr"><h1 data-field="razao">'+razaoFmt+'</h1><div class="l12-meta" data-field="cnpj">'+cnpjFmt+'</div></div><div class="l12-wrap">'+(phoneFmt?'<div class="l12-phone" data-field="phone">'+phoneFmt+'</div>':'')+'<div class="l12-sec"><h2>Dados Cadastrais</h2><div class="l12-grid"><div class="l12-row"><span class="l12-rk">Raz&atilde;o Social</span><span class="l12-rv" data-field="razao">'+razaoFmt+'</span></div><div class="l12-row"><span class="l12-rk">CNPJ</span><span class="l12-rv l12-mono" data-field="cnpj">'+cnpjFmt+'</span></div><div class="l12-row"><span class="l12-rk">Situa&ccedil;&atilde;o</span><span class="l12-rv l12-grn">'+situacaoFmt+'</span></div><div class="l12-row"><span class="l12-rk">Endere&ccedil;o</span><span class="l12-rv">'+enderFmt+'</span></div><div class="l12-row"><span class="l12-rk">Bairro</span><span class="l12-rv">'+bairroFmt+'</span></div><div class="l12-row"><span class="l12-rk">Munic&iacute;pio/UF</span><span class="l12-rv">'+munFmt+'/'+ufFmt+'</span></div><div class="l12-row"><span class="l12-rk">CEP</span><span class="l12-rv">'+cepFmt+'</span></div><div class="l12-row"><span class="l12-rk">Email</span><span class="l12-rv">'+(emailFmt||'N/A')+'</span></div>'+(atividadeFmt?'<div class="l12-row"><span class="l12-rk">CNAE</span><span class="l12-rv">'+atividadeFmt+'</span></div>':'')+'</div></div><div class="l12-sec"><h2>Canal WABA</h2>'+(phoneFmt?'<p class="l12-phone2" data-field="phone">'+phoneFmt+'</p>':'')+'<p>'+wabaText+'</p><p>'+wabaFoot+'</p></div><div class="l12-sec"><h2>Sobre</h2><p>'+sob+'</p></div><div class="l12-sec"><h2>Compliance</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="l12-sec"><h2>Privacidade</h2><p>'+priv+'</p></div><div class="l12-sec"><h2>Termos</h2><p>'+term+'</p></div></div><div class="l12-foot">'+razaoFmt+' &mdash; '+cnpjFmt+'</div>'+domScript+'</body></html>';
  }

  // -- LAYOUT 13: ASYMMETRIC -- 70% dados esquerda, 30% sidebar direita --
  else if (layoutType === 13) {
    var css13 = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#f9fafb;color:#111;min-height:100vh;font-size:15px;line-height:1.6}.l13-hdr{background:#fff;padding:24px 28px;border-bottom:1px solid #e5e7eb;text-align:center}.l13-hdr h1{font-size:1.7rem;font-weight:900;color:#111}.l13-hdr .l13-sub{font-size:12px;color:'+pal.ac+';margin-top:4px;font-family:monospace}.l13-body{display:grid;grid-template-columns:1fr 300px;max-width:1100px;margin:0 auto;padding:28px 20px;gap:24px}@media(max-width:860px){.l13-body{grid-template-columns:1fr;max-width:760px}}.l13-main .l13-sec{background:#fff;border-radius:8px;padding:22px;margin-bottom:16px;border:1px solid #e5e7eb}.l13-sec h2{font-size:13px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #f1f5f9}.l13-row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f8fafc;flex-wrap:wrap;gap:4px}.l13-row:last-child{border-bottom:none}.l13-rk{font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase}.l13-rv{font-size:14px;font-weight:600;color:#111}.l13-mono{font-family:monospace;color:'+pal.ac+'}.l13-grn{color:#059669}.l13-sec p{font-size:14px;color:#374151;line-height:1.8}.l13-sec ul{list-style:none}.l13-sec li{font-size:14px;color:#374151;line-height:2;padding-left:14px;position:relative}.l13-sec li::before{content:"\\2022";position:absolute;left:0;color:'+pal.ac+'}.l13-side{position:sticky;top:20px;align-self:start}.l13-side .l13-scard{background:#fff;border-radius:8px;padding:18px;margin-bottom:14px;border:1px solid #e5e7eb;text-align:center}.l13-side .l13-ph{font-family:monospace;font-size:1.3rem;color:'+pal.ac+';font-weight:900}.l13-side .l13-slbl{font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;margin-top:6px}.l13-phone2{font-family:monospace;font-size:1.3rem;color:'+pal.ac+';font-weight:900}.l13-foot{text-align:center;padding:18px;font-size:11px;color:#6b7280}';
    return headHtml+'<style>'+css13+'</style></head><body><div class="l13-hdr"><h1 data-field="razao">'+razaoFmt+'</h1><div class="l13-sub" data-field="cnpj">'+cnpjFmt+'</div></div><div class="l13-body"><div class="l13-main"><div class="l13-sec"><h2>Dados Cadastrais</h2><div class="l13-row"><span class="l13-rk">Raz&atilde;o Social</span><span class="l13-rv" data-field="razao">'+razaoFmt+'</span></div><div class="l13-row"><span class="l13-rk">CNPJ</span><span class="l13-rv l13-mono" data-field="cnpj">'+cnpjFmt+'</span></div><div class="l13-row"><span class="l13-rk">Situa&ccedil;&atilde;o</span><span class="l13-rv l13-grn">'+situacaoFmt+'</span></div><div class="l13-row"><span class="l13-rk">Endere&ccedil;o</span><span class="l13-rv">'+enderFmt+'</span></div><div class="l13-row"><span class="l13-rk">Bairro</span><span class="l13-rv">'+bairroFmt+'</span></div><div class="l13-row"><span class="l13-rk">Munic&iacute;pio/UF</span><span class="l13-rv">'+munFmt+'/'+ufFmt+'</span></div><div class="l13-row"><span class="l13-rk">CEP</span><span class="l13-rv">'+cepFmt+'</span></div><div class="l13-row"><span class="l13-rk">Email</span><span class="l13-rv">'+(emailFmt||'N/A')+'</span></div>'+(atividadeFmt?'<div class="l13-row"><span class="l13-rk">CNAE</span><span class="l13-rv">'+atividadeFmt+'</span></div>':'')+'</div><div class="l13-sec"><h2>Canal WABA</h2>'+(phoneFmt?'<p class="l13-phone2" data-field="phone">'+phoneFmt+'</p>':'')+'<p>'+wabaText+'</p><p>'+wabaFoot+'</p></div><div class="l13-sec"><h2>Sobre</h2><p>'+sob+'</p></div><div class="l13-sec"><h2>Compliance</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="l13-sec"><h2>Privacidade</h2><p>'+priv+'</p></div><div class="l13-sec"><h2>Termos</h2><p>'+term+'</p></div></div><div class="l13-side">'+(phoneFmt?'<div class="l13-scard"><div class="l13-ph" data-field="phone">'+phoneFmt+'</div><div class="l13-slbl">Canal Oficial</div></div>':'')+'<div class="l13-scard"><div class="l13-slbl">Empresa</div><p style="font-size:13px;margin-top:6px">'+razaoFmt+'</p></div><div class="l13-scard"><div class="l13-slbl">Situa&ccedil;&atilde;o</div><p style="font-size:14px;font-weight:700;color:#059669;margin-top:6px">'+situacaoFmt+'</p></div></div></div><div class="l13-foot">'+razaoFmt+' &mdash; '+cnpjFmt+'</div>'+domScript+'</body></html>';
  }

  // -- LAYOUT 14: MAGAZINE -- hero grande, estilo artigo, serif --
  else if (layoutType === 14) {
    var css14 = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#fff;color:#1a1a1a;min-height:100vh;font-size:16px;line-height:1.8}.l14-hero{background:linear-gradient(180deg,#f8fafc 0%,#fff 100%);padding:60px 28px 40px;text-align:center;border-bottom:1px solid #e5e7eb}.l14-hero h1{font-size:2.4rem;font-weight:900;color:#111;letter-spacing:-0.5px;margin-bottom:8px}.l14-hero .l14-sub{font-size:14px;color:#6b7280;font-style:italic}.l14-hero .l14-cnpj{font-family:monospace;font-size:13px;color:'+pal.ac+';margin-top:8px}.l14-hero .l14-ph{font-family:monospace;font-size:1.3rem;color:'+pal.ac+';font-weight:900;margin-top:14px}.l14-wrap{max-width:680px;margin:0 auto;padding:36px 24px}@media(max-width:640px){.l14-wrap{padding:24px 16px}}.l14-sec{margin-bottom:32px}.l14-sec h2{font-size:14px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid '+pal.ac+'20}.l14-row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f5f5f5;flex-wrap:wrap;gap:4px}.l14-row:last-child{border-bottom:none}.l14-rk{font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase}.l14-rv{font-size:15px;font-weight:600;color:#1a1a1a}.l14-mono{font-family:monospace;color:'+pal.ac+'}.l14-grn{color:#059669}.l14-sec p{font-size:15px;color:#374151;line-height:1.9}.l14-sec ul{list-style:none}.l14-sec li{font-size:15px;color:#374151;line-height:2;padding-left:16px;position:relative}.l14-sec li::before{content:"\\2014";position:absolute;left:0;color:'+pal.ac+'}.l14-phone2{font-family:monospace;font-size:1.3rem;color:'+pal.ac+';font-weight:900}.l14-foot{text-align:center;padding:24px;font-size:12px;color:#6b7280;border-top:2px solid #f1f5f9;margin-top:20px}';
    return headHtml+'<style>'+css14+'</style></head><body><div class="l14-hero"><h1 data-field="razao">'+razaoFmt+'</h1><div class="l14-sub">Registro Empresarial &mdash; Informa&ccedil;&otilde;es Institucionais</div><div class="l14-cnpj" data-field="cnpj">'+cnpjFmt+'</div>'+(phoneFmt?'<div class="l14-ph" data-field="phone">'+phoneFmt+'</div>':'')+'</div><div class="l14-wrap"><div class="l14-sec"><h2>Dados Cadastrais</h2><div class="l14-row"><span class="l14-rk">Raz&atilde;o Social</span><span class="l14-rv" data-field="razao">'+razaoFmt+'</span></div><div class="l14-row"><span class="l14-rk">CNPJ</span><span class="l14-rv l14-mono" data-field="cnpj">'+cnpjFmt+'</span></div><div class="l14-row"><span class="l14-rk">Situa&ccedil;&atilde;o</span><span class="l14-rv l14-grn">'+situacaoFmt+'</span></div><div class="l14-row"><span class="l14-rk">Endere&ccedil;o</span><span class="l14-rv">'+enderFmt+'</span></div><div class="l14-row"><span class="l14-rk">Bairro</span><span class="l14-rv">'+bairroFmt+'</span></div><div class="l14-row"><span class="l14-rk">Munic&iacute;pio/UF</span><span class="l14-rv">'+munFmt+'/'+ufFmt+'</span></div><div class="l14-row"><span class="l14-rk">CEP</span><span class="l14-rv">'+cepFmt+'</span></div><div class="l14-row"><span class="l14-rk">Email</span><span class="l14-rv">'+(emailFmt||'N/A')+'</span></div>'+(atividadeFmt?'<div class="l14-row"><span class="l14-rk">CNAE</span><span class="l14-rv">'+atividadeFmt+'</span></div>':'')+'</div><div class="l14-sec"><h2>Canal WABA</h2>'+(phoneFmt?'<p class="l14-phone2" data-field="phone">'+phoneFmt+'</p>':'')+'<p>'+wabaText+'</p><p>'+wabaFoot+'</p></div><div class="l14-sec"><h2>Sobre</h2><p>'+sob+'</p></div><div class="l14-sec"><h2>Compliance</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="l14-sec"><h2>Privacidade</h2><p>'+priv+'</p></div><div class="l14-sec"><h2>Termos</h2><p>'+term+'</p></div></div><div class="l14-foot">'+razaoFmt+' &mdash; CNPJ '+cnpjFmt+'</div>'+domScript+'</body></html>';
  }


  // -- LAYOUT 15: DARK INSTITUTIONAL -- fundo #0d1117, acento pal.ac, hero com card, bordas visiveis --
  else if (layoutType === 15) {
    var css15 = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#0d1117;color:#c9d1d9;min-height:100vh;font-size:15px;line-height:1.6}.i15-nav{display:flex;align-items:center;justify-content:space-between;padding:18px 32px;background:#161b22;border-bottom:1px solid #21262d}@media(max-width:768px){.i15-nav{flex-direction:column;gap:12px;padding:14px 18px}}.i15-brand{font-size:1.1rem;font-weight:800;color:#f0f6fc}.i15-links{display:flex;gap:20px}.i15-links a{color:#8b949e;text-decoration:none;font-size:13px;font-weight:600;letter-spacing:.5px;transition:color .2s}.i15-links a:hover{color:'+pal.ac+'}.i15-hero{display:grid;grid-template-columns:1fr 380px;gap:40px;padding:60px 32px;max-width:1100px;margin:0 auto;align-items:center}@media(max-width:900px){.i15-hero{grid-template-columns:1fr;padding:36px 18px;gap:24px}}.i15-hero-left .i15-badge{display:inline-block;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:'+pal.ac+';background:'+pal.ac+'15;border:1px solid '+pal.ac+'40;padding:6px 12px;border-radius:4px;margin-bottom:16px}.i15-hero-left h1{font-size:2.2rem;font-weight:900;color:#f0f6fc;line-height:1.2;margin-bottom:12px;letter-spacing:-.5px}.i15-hero-left p{font-size:14px;color:#8b949e;line-height:1.7;margin-bottom:20px}.i15-btns{display:flex;gap:12px;flex-wrap:wrap}.i15-btns span{display:inline-block;padding:10px 22px;border-radius:6px;font-size:13px;font-weight:700;cursor:default}.i15-btns .i15-btn1{background:'+pal.ac+';color:#fff}.i15-btns .i15-btn2{border:1px solid #30363d;color:#c9d1d9}.i15-hero-card{background:#161b22;border:1px solid #30363d;border-radius:10px;padding:24px}.i15-hero-card h3{font-size:12px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid #21262d}.i15-hero-card .i15-crow{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #21262d;flex-wrap:wrap;gap:4px}.i15-hero-card .i15-crow:last-child{border-bottom:none}.i15-ck{font-size:11px;font-weight:600;color:#8b949e;text-transform:uppercase}.i15-cv{font-size:14px;font-weight:700;color:#f0f6fc}.i15-cv.mono{font-family:monospace;color:'+pal.ac+'}.i15-section{max-width:1100px;margin:0 auto;padding:40px 32px}@media(max-width:768px){.i15-section{padding:28px 18px}}.i15-section h2{font-size:14px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:1.5px;margin-bottom:20px;padding-bottom:10px;border-bottom:1px solid #21262d}.i15-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}@media(max-width:768px){.i15-grid{grid-template-columns:1fr}}.i15-grid .i15-cell{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px}.i15-grid .i15-cell .i15-lbl{font-size:10px;font-weight:700;color:#8b949e;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px}.i15-grid .i15-cell .i15-val{font-size:15px;font-weight:700;color:#f0f6fc}.i15-grid .i15-cell .i15-val.mono{font-family:monospace;color:'+pal.ac+'}.i15-grid .i15-cell .i15-val.grn{color:#3fb950}.i15-sobre{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:22px;margin-bottom:20px}.i15-sobre p{font-size:14px;color:#c9d1d9;line-height:1.8}.i15-missao{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:22px;margin-bottom:20px}.i15-missao .i15-mbadge{display:inline-block;font-size:10px;font-weight:700;color:'+pal.ac+';letter-spacing:1.5px;text-transform:uppercase;margin-bottom:10px}.i15-missao blockquote{font-size:14px;color:#c9d1d9;line-height:1.8;border-left:3px solid '+pal.ac+';padding-left:16px;margin:0}.i15-contato{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media(max-width:768px){.i15-contato{grid-template-columns:1fr}}.i15-contato .i15-ccard{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:18px}.i15-contato .i15-ccard h4{font-size:11px;font-weight:700;color:#8b949e;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px}.i15-contato .i15-ccard p{font-size:14px;color:#f0f6fc}.i15-foot{text-align:center;padding:28px 18px;font-size:12px;color:#484f58;border-top:1px solid #21262d;margin-top:20px}';
    return headHtml+'<style>'+css15+'</style></head><body><nav class="i15-nav"><span class="i15-brand" data-field="razao">'+razaoFmt+'</span><div class="i15-links"><a href="#">Empresa</a><a href="#">Sobre N&oacute;s</a><a href="#">Miss&atilde;o</a><a href="#">Contato</a></div></nav><div class="i15-hero"><div class="i15-hero-left"><div class="i15-badge">'+areaLabel+'</div><h1>'+displayName+'</h1><p>Empresa regularmente constitu&iacute;da e ativa, dedicada &agrave; presta&ccedil;&atilde;o de servi&ccedil;os e com&eacute;rcio no segmento indicado.</p><div class="i15-btns"><span class="i15-btn1">Ver Dados</span><span class="i15-btn2">Contato</span></div></div><div class="i15-hero-card"><h3>Dados da Empresa</h3><div class="i15-crow"><span class="i15-ck">Raz&atilde;o Social</span><span class="i15-cv" data-field="razao">'+razaoFmt+'</span></div><div class="i15-crow"><span class="i15-ck">CNPJ</span><span class="i15-cv mono" data-field="cnpj">'+cnpjFmt+'</span></div><div class="i15-crow"><span class="i15-ck">Porte</span><span class="i15-cv">'+porteFmt+'</span></div><div class="i15-crow"><span class="i15-ck">Nat. Jur&iacute;dica</span><span class="i15-cv">'+natJurFmt+'</span></div></div></div><div class="i15-section"><h2>Dados Oficiais da Empresa</h2><div class="i15-grid"><div class="i15-cell"><div class="i15-lbl">Raz&atilde;o Social</div><div class="i15-val" data-field="razao">'+razaoFmt+'</div></div><div class="i15-cell"><div class="i15-lbl">CNPJ</div><div class="i15-val mono" data-field="cnpj">'+cnpjFmt+'</div></div><div class="i15-cell"><div class="i15-lbl">Situa&ccedil;&atilde;o</div><div class="i15-val grn">'+situacaoFmt+'</div></div><div class="i15-cell"><div class="i15-lbl">Porte</div><div class="i15-val">'+porteFmt+'</div></div><div class="i15-cell"><div class="i15-lbl">Natureza Jur&iacute;dica</div><div class="i15-val">'+natJurFmt+'</div></div><div class="i15-cell"><div class="i15-lbl">Endere&ccedil;o</div><div class="i15-val">'+enderFmt+'</div></div><div class="i15-cell"><div class="i15-lbl">Bairro</div><div class="i15-val">'+bairroFmt+'</div></div><div class="i15-cell"><div class="i15-lbl">Munic&iacute;pio/UF</div><div class="i15-val">'+munFmt+'/'+ufFmt+'</div></div><div class="i15-cell"><div class="i15-lbl">CEP</div><div class="i15-val">'+cepFmt+'</div></div><div class="i15-cell"><div class="i15-lbl">Email</div><div class="i15-val">'+(emailFmt||'N/A')+'</div></div>'+(phoneFmt?'<div class="i15-cell"><div class="i15-lbl">Telefone</div><div class="i15-val mono" data-field="phone">'+phoneFmt+'</div></div>':'')+(atividadeFmt?'<div class="i15-cell"><div class="i15-lbl">CNAE</div><div class="i15-val">'+atividadeFmt+'</div></div>':'')+'</div></div><div class="i15-section"><h2>Sobre N&oacute;s</h2><div class="i15-sobre"><p>'+sob+'</p></div></div><div class="i15-section"><h2>Miss&atilde;o</h2><div class="i15-missao"><div class="i15-mbadge">Compromisso Institucional</div><blockquote>'+wabaText+'</blockquote></div></div><div class="i15-section"><h2>Contato</h2><div class="i15-contato"><div class="i15-ccard"><h4>Endere&ccedil;o</h4><p>'+fullAddress+'</p></div><div class="i15-ccard"><h4>Email</h4><p>'+(emailFmt||'N/A')+'</p></div></div></div><div class="i15-foot">'+razaoFmt+' &mdash; CNPJ '+cnpjFmt+'</div>'+domScript+'</body></html>';
  }

  // -- LAYOUT 16: DARK INSTITUTIONAL CYAN -- fundo #0a0e14, acento #06b6d4, minimalista --
  else if (layoutType === 16) {
    var css16 = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#0a0e14;color:#b2bcc9;min-height:100vh;font-size:15px;line-height:1.6}.i16-nav{display:flex;align-items:center;justify-content:space-between;padding:18px 32px;background:#0d1117;border-bottom:1px solid #1b2028}@media(max-width:768px){.i16-nav{flex-direction:column;gap:12px;padding:14px 18px}}.i16-brand{font-size:1.1rem;font-weight:800;color:#e6edf3}.i16-links{display:flex;gap:20px}.i16-links a{color:#6b7d8e;text-decoration:none;font-size:13px;font-weight:600;letter-spacing:.5px}.i16-links a:hover{color:#06b6d4}.i16-hero{display:grid;grid-template-columns:1fr 370px;gap:36px;padding:56px 32px;max-width:1080px;margin:0 auto;align-items:center}@media(max-width:900px){.i16-hero{grid-template-columns:1fr;padding:32px 18px;gap:20px}}.i16-hero-left .i16-badge{display:inline-block;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#06b6d4;border:1px solid #06b6d433;padding:5px 11px;border-radius:3px;margin-bottom:14px}.i16-hero-left h1{font-size:2.1rem;font-weight:900;color:#e6edf3;line-height:1.2;margin-bottom:12px;letter-spacing:-.3px}.i16-hero-left p{font-size:14px;color:#6b7d8e;line-height:1.7;margin-bottom:18px}.i16-btns{display:flex;gap:12px;flex-wrap:wrap}.i16-btns span{display:inline-block;padding:9px 20px;border-radius:5px;font-size:13px;font-weight:700;cursor:default}.i16-btns .i16-btn1{background:#06b6d4;color:#0a0e14}.i16-btns .i16-btn2{border:1px solid #1b2028;color:#b2bcc9}.i16-hero-card{background:#0d1117;border:1px solid #1b2028;border-radius:8px;padding:22px}.i16-hero-card h3{font-size:11px;font-weight:700;color:#06b6d4;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #1b2028}.i16-hero-card .i16-crow{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #141a22;flex-wrap:wrap;gap:4px}.i16-hero-card .i16-crow:last-child{border-bottom:none}.i16-ck{font-size:10px;font-weight:600;color:#6b7d8e;text-transform:uppercase}.i16-cv{font-size:13px;font-weight:700;color:#e6edf3}.i16-cv.mono{font-family:monospace;color:#06b6d4}.i16-section{max-width:1080px;margin:0 auto;padding:36px 32px}@media(max-width:768px){.i16-section{padding:24px 18px}}.i16-section h2{font-size:13px;font-weight:700;color:#06b6d4;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:18px;padding-bottom:8px;border-bottom:1px solid #1b2028}.i16-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}@media(max-width:768px){.i16-grid{grid-template-columns:1fr}}.i16-grid .i16-cell{background:#0d1117;border:1px solid #1b2028;border-radius:6px;padding:14px}.i16-grid .i16-cell .i16-lbl{font-size:10px;font-weight:700;color:#6b7d8e;text-transform:uppercase;letter-spacing:.8px;margin-bottom:3px}.i16-grid .i16-cell .i16-val{font-size:14px;font-weight:700;color:#e6edf3}.i16-grid .i16-cell .i16-val.mono{font-family:monospace;color:#06b6d4}.i16-grid .i16-cell .i16-val.grn{color:#34d399}.i16-sobre{background:#0d1117;border:1px solid #1b2028;border-radius:6px;padding:20px;margin-bottom:16px}.i16-sobre p{font-size:14px;color:#b2bcc9;line-height:1.8}.i16-missao{background:#0d1117;border:1px solid #1b2028;border-radius:6px;padding:20px;margin-bottom:16px}.i16-missao .i16-mbadge{display:inline-block;font-size:10px;font-weight:700;color:#06b6d4;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px}.i16-missao blockquote{font-size:14px;color:#b2bcc9;line-height:1.8;border-left:2px solid #06b6d4;padding-left:14px;margin:0}.i16-contato{display:grid;grid-template-columns:1fr 1fr;gap:14px}@media(max-width:768px){.i16-contato{grid-template-columns:1fr}}.i16-contato .i16-ccard{background:#0d1117;border:1px solid #1b2028;border-radius:6px;padding:16px}.i16-contato .i16-ccard h4{font-size:10px;font-weight:700;color:#6b7d8e;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}.i16-contato .i16-ccard p{font-size:14px;color:#e6edf3}.i16-foot{text-align:center;padding:24px 18px;font-size:11px;color:#3d4a57;border-top:1px solid #1b2028;margin-top:16px}';
    return headHtml+'<style>'+css16+'</style></head><body><nav class="i16-nav"><span class="i16-brand" data-field="razao">'+razaoFmt+'</span><div class="i16-links"><a href="#">Empresa</a><a href="#">Sobre N&oacute;s</a><a href="#">Miss&atilde;o</a><a href="#">Contato</a></div></nav><div class="i16-hero"><div class="i16-hero-left"><div class="i16-badge">'+areaLabel+'</div><h1>'+displayName+'</h1><p>Entidade empresarial em situa&ccedil;&atilde;o regular perante os &oacute;rg&atilde;os competentes, atuando no segmento descrito.</p><div class="i16-btns"><span class="i16-btn1">Dados Oficiais</span><span class="i16-btn2">Fale Conosco</span></div></div><div class="i16-hero-card"><h3>Ficha Resumida</h3><div class="i16-crow"><span class="i16-ck">Raz&atilde;o Social</span><span class="i16-cv" data-field="razao">'+razaoFmt+'</span></div><div class="i16-crow"><span class="i16-ck">CNPJ</span><span class="i16-cv mono" data-field="cnpj">'+cnpjFmt+'</span></div><div class="i16-crow"><span class="i16-ck">Porte</span><span class="i16-cv">'+porteFmt+'</span></div><div class="i16-crow"><span class="i16-ck">Nat. Jur&iacute;dica</span><span class="i16-cv">'+natJurFmt+'</span></div></div></div><div class="i16-section"><h2>Dados Oficiais da Empresa</h2><div class="i16-grid"><div class="i16-cell"><div class="i16-lbl">Raz&atilde;o Social</div><div class="i16-val" data-field="razao">'+razaoFmt+'</div></div><div class="i16-cell"><div class="i16-lbl">CNPJ</div><div class="i16-val mono" data-field="cnpj">'+cnpjFmt+'</div></div><div class="i16-cell"><div class="i16-lbl">Situa&ccedil;&atilde;o</div><div class="i16-val grn">'+situacaoFmt+'</div></div><div class="i16-cell"><div class="i16-lbl">Porte</div><div class="i16-val">'+porteFmt+'</div></div><div class="i16-cell"><div class="i16-lbl">Natureza Jur&iacute;dica</div><div class="i16-val">'+natJurFmt+'</div></div><div class="i16-cell"><div class="i16-lbl">Endere&ccedil;o</div><div class="i16-val">'+enderFmt+'</div></div><div class="i16-cell"><div class="i16-lbl">Bairro</div><div class="i16-val">'+bairroFmt+'</div></div><div class="i16-cell"><div class="i16-lbl">Munic&iacute;pio/UF</div><div class="i16-val">'+munFmt+'/'+ufFmt+'</div></div><div class="i16-cell"><div class="i16-lbl">CEP</div><div class="i16-val">'+cepFmt+'</div></div><div class="i16-cell"><div class="i16-lbl">Email</div><div class="i16-val">'+(emailFmt||'N/A')+'</div></div>'+(phoneFmt?'<div class="i16-cell"><div class="i16-lbl">Telefone</div><div class="i16-val mono" data-field="phone">'+phoneFmt+'</div></div>':'')+(atividadeFmt?'<div class="i16-cell"><div class="i16-lbl">CNAE</div><div class="i16-val">'+atividadeFmt+'</div></div>':'')+'</div></div><div class="i16-section"><h2>Sobre N&oacute;s</h2><div class="i16-sobre"><p>'+sob+'</p></div></div><div class="i16-section"><h2>Miss&atilde;o</h2><div class="i16-missao"><div class="i16-mbadge">Vis&atilde;o Corporativa</div><blockquote>'+wabaText+'</blockquote></div></div><div class="i16-section"><h2>Contato</h2><div class="i16-contato"><div class="i16-ccard"><h4>Endere&ccedil;o</h4><p>'+fullAddress+'</p></div><div class="i16-ccard"><h4>Email</h4><p>'+(emailFmt||'N/A')+'</p></div></div></div><div class="i16-foot">'+razaoFmt+' &mdash; CNPJ '+cnpjFmt+'</div>'+domScript+'</body></html>';
  }

  // -- LAYOUT 17: DARK INSTITUTIONAL AMBER -- fundo #111318, acento #f59e0b, cards arredondados com sombra --
  else if (layoutType === 17) {
    var css17 = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#111318;color:#d1d5db;min-height:100vh;font-size:15px;line-height:1.6}.i17-nav{display:flex;align-items:center;justify-content:space-between;padding:18px 32px;background:#1a1d24;border-bottom:1px solid #2a2e37}@media(max-width:768px){.i17-nav{flex-direction:column;gap:12px;padding:14px 18px}}.i17-brand{font-size:1.1rem;font-weight:800;color:#f9fafb}.i17-links{display:flex;gap:20px}.i17-links a{color:#9ca3af;text-decoration:none;font-size:13px;font-weight:600;letter-spacing:.5px}.i17-links a:hover{color:#f59e0b}.i17-hero{display:grid;grid-template-columns:1fr 370px;gap:36px;padding:56px 32px;max-width:1080px;margin:0 auto;align-items:center}@media(max-width:900px){.i17-hero{grid-template-columns:1fr;padding:32px 18px;gap:20px}}.i17-hero-left .i17-badge{display:inline-block;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#f59e0b;background:#f59e0b12;border:1px solid #f59e0b30;padding:6px 12px;border-radius:20px;margin-bottom:14px}.i17-hero-left h1{font-size:2.1rem;font-weight:900;color:#f9fafb;line-height:1.2;margin-bottom:12px;letter-spacing:-.3px}.i17-hero-left p{font-size:14px;color:#9ca3af;line-height:1.7;margin-bottom:18px}.i17-btns{display:flex;gap:12px;flex-wrap:wrap}.i17-btns span{display:inline-block;padding:10px 22px;border-radius:20px;font-size:13px;font-weight:700;cursor:default}.i17-btns .i17-btn1{background:#f59e0b;color:#111318}.i17-btns .i17-btn2{border:1px solid #2a2e37;color:#d1d5db}.i17-hero-card{background:#1a1d24;border-radius:14px;padding:24px;box-shadow:0 4px 24px rgba(0,0,0,.3)}.i17-hero-card h3{font-size:11px;font-weight:700;color:#f59e0b;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #2a2e37}.i17-hero-card .i17-crow{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #22262e;flex-wrap:wrap;gap:4px}.i17-hero-card .i17-crow:last-child{border-bottom:none}.i17-ck{font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase}.i17-cv{font-size:13px;font-weight:700;color:#f9fafb}.i17-cv.mono{font-family:monospace;color:#f59e0b}.i17-section{max-width:1080px;margin:0 auto;padding:36px 32px}@media(max-width:768px){.i17-section{padding:24px 18px}}.i17-section h2{font-size:13px;font-weight:700;color:#f59e0b;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:18px;padding-bottom:8px;border-bottom:1px solid #2a2e37}.i17-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}@media(max-width:768px){.i17-grid{grid-template-columns:1fr}}.i17-grid .i17-cell{background:#1a1d24;border-radius:12px;padding:16px;box-shadow:0 2px 12px rgba(0,0,0,.2)}.i17-grid .i17-cell .i17-lbl{font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px}.i17-grid .i17-cell .i17-val{font-size:14px;font-weight:700;color:#f9fafb}.i17-grid .i17-cell .i17-val.mono{font-family:monospace;color:#f59e0b}.i17-grid .i17-cell .i17-val.grn{color:#34d399}.i17-sobre{background:#1a1d24;border-radius:12px;padding:22px;margin-bottom:16px;box-shadow:0 2px 12px rgba(0,0,0,.2)}.i17-sobre p{font-size:14px;color:#d1d5db;line-height:1.8}.i17-missao{background:#1a1d24;border-radius:12px;padding:22px;margin-bottom:16px;box-shadow:0 2px 12px rgba(0,0,0,.2)}.i17-missao .i17-mbadge{display:inline-block;font-size:10px;font-weight:700;color:#f59e0b;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px}.i17-missao blockquote{font-size:14px;color:#d1d5db;line-height:1.8;border-left:3px solid #f59e0b;padding-left:14px;margin:0}.i17-contato{display:grid;grid-template-columns:1fr 1fr;gap:14px}@media(max-width:768px){.i17-contato{grid-template-columns:1fr}}.i17-contato .i17-ccard{background:#1a1d24;border-radius:12px;padding:18px;box-shadow:0 2px 12px rgba(0,0,0,.2)}.i17-contato .i17-ccard h4{font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}.i17-contato .i17-ccard p{font-size:14px;color:#f9fafb}.i17-foot{text-align:center;padding:24px 18px;font-size:11px;color:#4b5563;border-top:1px solid #2a2e37;margin-top:16px}';
    return headHtml+'<style>'+css17+'</style></head><body><nav class="i17-nav"><span class="i17-brand" data-field="razao">'+razaoFmt+'</span><div class="i17-links"><a href="#">Empresa</a><a href="#">Sobre N&oacute;s</a><a href="#">Miss&atilde;o</a><a href="#">Contato</a></div></nav><div class="i17-hero"><div class="i17-hero-left"><div class="i17-badge">'+areaLabel+'</div><h1>'+displayName+'</h1><p>Organiza&ccedil;&atilde;o legalmente constitu&iacute;da, com registro ativo e opera&ccedil;&otilde;es regulares no territ&oacute;rio nacional.</p><div class="i17-btns"><span class="i17-btn1">Informa&ccedil;&otilde;es</span><span class="i17-btn2">Localiza&ccedil;&atilde;o</span></div></div><div class="i17-hero-card"><h3>Resumo Cadastral</h3><div class="i17-crow"><span class="i17-ck">Raz&atilde;o Social</span><span class="i17-cv" data-field="razao">'+razaoFmt+'</span></div><div class="i17-crow"><span class="i17-ck">CNPJ</span><span class="i17-cv mono" data-field="cnpj">'+cnpjFmt+'</span></div><div class="i17-crow"><span class="i17-ck">Porte</span><span class="i17-cv">'+porteFmt+'</span></div><div class="i17-crow"><span class="i17-ck">Nat. Jur&iacute;dica</span><span class="i17-cv">'+natJurFmt+'</span></div></div></div><div class="i17-section"><h2>Dados Oficiais da Empresa</h2><div class="i17-grid"><div class="i17-cell"><div class="i17-lbl">Raz&atilde;o Social</div><div class="i17-val" data-field="razao">'+razaoFmt+'</div></div><div class="i17-cell"><div class="i17-lbl">CNPJ</div><div class="i17-val mono" data-field="cnpj">'+cnpjFmt+'</div></div><div class="i17-cell"><div class="i17-lbl">Situa&ccedil;&atilde;o</div><div class="i17-val grn">'+situacaoFmt+'</div></div><div class="i17-cell"><div class="i17-lbl">Porte</div><div class="i17-val">'+porteFmt+'</div></div><div class="i17-cell"><div class="i17-lbl">Natureza Jur&iacute;dica</div><div class="i17-val">'+natJurFmt+'</div></div><div class="i17-cell"><div class="i17-lbl">Endere&ccedil;o</div><div class="i17-val">'+enderFmt+'</div></div><div class="i17-cell"><div class="i17-lbl">Bairro</div><div class="i17-val">'+bairroFmt+'</div></div><div class="i17-cell"><div class="i17-lbl">Munic&iacute;pio/UF</div><div class="i17-val">'+munFmt+'/'+ufFmt+'</div></div><div class="i17-cell"><div class="i17-lbl">CEP</div><div class="i17-val">'+cepFmt+'</div></div><div class="i17-cell"><div class="i17-lbl">Email</div><div class="i17-val">'+(emailFmt||'N/A')+'</div></div>'+(phoneFmt?'<div class="i17-cell"><div class="i17-lbl">Telefone</div><div class="i17-val mono" data-field="phone">'+phoneFmt+'</div></div>':'')+(atividadeFmt?'<div class="i17-cell"><div class="i17-lbl">CNAE</div><div class="i17-val">'+atividadeFmt+'</div></div>':'')+'</div></div><div class="i17-section"><h2>Sobre N&oacute;s</h2><div class="i17-sobre"><p>'+sob+'</p></div></div><div class="i17-section"><h2>Miss&atilde;o</h2><div class="i17-missao"><div class="i17-mbadge">Prop&oacute;sito Empresarial</div><blockquote>'+wabaText+'</blockquote></div></div><div class="i17-section"><h2>Contato</h2><div class="i17-contato"><div class="i17-ccard"><h4>Endere&ccedil;o</h4><p>'+fullAddress+'</p></div><div class="i17-ccard"><h4>Email</h4><p>'+(emailFmt||'N/A')+'</p></div></div></div><div class="i17-foot">'+razaoFmt+' &mdash; CNPJ '+cnpjFmt+'</div>'+domScript+'</body></html>';
  }

  // -- FALLBACK: layout simples padrão --
  else {
    var cssFb = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#fff;color:#111;min-height:100vh;font-size:15px;line-height:1.7}.fb-wrap{max-width:700px;margin:0 auto;padding:36px 24px}.fb-hdr{text-align:center;margin-bottom:28px;padding-bottom:18px;border-bottom:2px solid '+pal.ac+'}.fb-hdr h1{font-size:1.8rem;font-weight:900}.fb-hdr .fb-sub{font-family:monospace;font-size:13px;color:'+pal.ac+';margin-top:4px}.fb-phone{text-align:center;font-family:monospace;font-size:1.4rem;color:'+pal.ac+';font-weight:900;margin-bottom:24px}.fb-sec{margin-bottom:22px}.fb-sec h2{font-size:13px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #e5e7eb}.fb-row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f3f4f6;flex-wrap:wrap;gap:4px}.fb-row:last-child{border-bottom:none}.fb-rk{font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase}.fb-rv{font-size:14px;font-weight:600;color:#111}.fb-mono{font-family:monospace;color:'+pal.ac+'}.fb-grn{color:#059669}.fb-sec p{font-size:14px;color:#374151;line-height:1.8}.fb-sec ul{list-style:none}.fb-sec li{font-size:14px;color:#374151;line-height:2;padding-left:14px;position:relative}.fb-sec li::before{content:"\\2022";position:absolute;left:0;color:'+pal.ac+'}.fb-phone2{font-family:monospace;font-size:1.3rem;color:'+pal.ac+';font-weight:900}.fb-foot{text-align:center;padding:16px;font-size:11px;color:#6b7280;border-top:1px solid #e5e7eb;margin-top:16px}';
    return headHtml+'<style>'+cssFb+'</style></head><body><div class="fb-wrap"><div class="fb-hdr"><h1 data-field="razao">'+razaoFmt+'</h1><div class="fb-sub" data-field="cnpj">'+cnpjFmt+'</div></div>'+(phoneFmt?'<div class="fb-phone" data-field="phone">'+phoneFmt+'</div>':'')+'<div class="fb-sec"><h2>Dados Cadastrais</h2><div class="fb-row"><span class="fb-rk">Raz&atilde;o Social</span><span class="fb-rv" data-field="razao">'+razaoFmt+'</span></div><div class="fb-row"><span class="fb-rk">CNPJ</span><span class="fb-rv fb-mono" data-field="cnpj">'+cnpjFmt+'</span></div><div class="fb-row"><span class="fb-rk">Situa&ccedil;&atilde;o</span><span class="fb-rv fb-grn">'+situacaoFmt+'</span></div><div class="fb-row"><span class="fb-rk">Endere&ccedil;o</span><span class="fb-rv">'+enderFmt+'</span></div><div class="fb-row"><span class="fb-rk">Bairro</span><span class="fb-rv">'+bairroFmt+'</span></div><div class="fb-row"><span class="fb-rk">Munic&iacute;pio/UF</span><span class="fb-rv">'+munFmt+'/'+ufFmt+'</span></div><div class="fb-row"><span class="fb-rk">CEP</span><span class="fb-rv">'+cepFmt+'</span></div><div class="fb-row"><span class="fb-rk">Email</span><span class="fb-rv">'+(emailFmt||'N/A')+'</span></div>'+(atividadeFmt?'<div class="fb-row"><span class="fb-rk">CNAE</span><span class="fb-rv">'+atividadeFmt+'</span></div>':'')+'</div><div class="fb-sec"><h2>Canal WABA</h2>'+(phoneFmt?'<p class="fb-phone2" data-field="phone">'+phoneFmt+'</p>':'')+'<p>'+wabaText+'</p><p>'+wabaFoot+'</p></div><div class="fb-sec"><h2>Sobre</h2><p>'+sob+'</p></div><div class="fb-sec"><h2>Compliance</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="fb-sec"><h2>Privacidade</h2><p>'+priv+'</p></div><div class="fb-sec"><h2>Termos</h2><p>'+term+'</p></div><div class="fb-foot">'+razaoFmt+' &mdash; '+cnpjFmt+'</div></div>'+domScript+'</body></html>';
  }
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

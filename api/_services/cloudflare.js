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
  // Usa diretamente os templates estáticos novos (validados pela Meta)
  // Gemini desabilitado — gerava templates inconsistentes que não passavam na verificação
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
  const enderFmt = esc((endereco||'') + (numero ? ', nº '+numero : ''));
  const bairroFmt = esc(bairro||'');
  const munFmt = esc(municipio||'');
  const ufFmt = esc(uf||'');
  const porteFmt = esc(porte || '');
  const natJurFmt = esc(naturezaJuridica || '');
  const cnaeCodeFmt = esc(cnaeCode || '');
  const cnaeDescFmt = esc(cnaeDesc || '');
  const areaLabel = atividadeFmt || cnaeDescFmt || 'Atividade Empresarial';
  const fullAddress = enderFmt+(bairroFmt?' — '+bairroFmt:'')+' — '+munFmt+'/'+ufFmt+(cepFmt?' — CEP '+cepFmt:'');

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
    function(n){ return n+' conduz suas atividades com compromisso ético e profissionalismo, disponibilizando canal verificado de WhatsApp Business exclusivamente para demandas originadas pelo consumidor final, em total aderência às normas da Meta Platforms.'; },
    function(n){ return 'A organização '+n+' promove atendimento consultivo e receptivo por meio de canal digital certificado, obedecendo integralmente às políticas vigentes da Meta e à legislação brasileira de proteção de dados.'; },
    function(n){ return n+' possui registro ativo junto aos órgãos competentes, operando canal de mensageria WhatsApp Business destinado à resolução de consultas e prestação de informações sob demanda do cliente.'; },
    function(n){ return 'Constituída nos termos da legislação vigente, '+n+' mantém ponto de contato digital via WhatsApp Business para atendimento consultivo, sem qualquer prática de comunicação ativa não autorizada.'; },
    function(n){ return n+' viabiliza canal institucional de suporte ao consumidor, restrito a interações iniciadas voluntariamente pelo titular, sem envio de comunicações promocionais ou não requisitadas.'; },
    function(n){ return 'Atuando de forma regular e transparente, '+n+' oferece ponto de atendimento receptivo via WhatsApp Business API, direcionado exclusivamente a solicitações espontâneas de clientes e parceiros.'; },
    function(n){ return n+' gerencia canal corporativo de WhatsApp Business orientado ao suporte informativo e operacional, atendendo exclusivamente chamados voluntários do consumidor, conforme regulamento Meta e LGPD.'; },
  ];
  const _atendV = [
    ['Toda interação parte do próprio consumidor.','Respondemos exclusivamente nos canais homologados.','Vedado qualquer disparo ou abordagem ativa.','Conformidade integral com WhatsApp Business API e Meta.'],
    ['Modalidade de atendimento 100% receptiva.','Processamos somente chamados originados pelo titular.','Proibida utilização de bases externas ou compradas.','Aderência às diretrizes Meta Platforms e LGPD.'],
    ['O consumidor detém a iniciativa do contato.','Canal voltado a consultas informativas e suporte.','Nenhuma comunicação enviada sem prévia solicitação.','Conformidade LGPD 13.709/2018 e Meta Platforms.'],
    ['Processamos unicamente requisições recebidas.','Orientação exclusiva para suporte e consultoria receptiva.','Bases de terceiros são terminantemente vedadas.','Alinhamento pleno às políticas Meta Platforms.'],
    ['Fluxo comunicacional estritamente receptivo.','Respostas limitadas aos canais oficiais verificados.','Inexistência de telemarketing ou envios em massa.','Conforme regulamento WhatsApp Business API.'],
    ['Funcionamento exclusivo sob provocação do cliente.','Canal restrito a esclarecimentos previamente solicitados.','Não adquirimos mailings nem praticamos cold-outreach.','Operação certificada conforme normas da Meta.'],
    ['Interação condicionada à iniciativa do consumidor.','Nosso protocolo de atendimento é integralmente receptivo.','Zero mensagens expedidas sem consentimento explícito.','Conformidade plena Meta Platforms, LGPD e WhatsApp ToS.'],
  ];
  const _privV = [
    'Informações fornecidas pelo usuário são processadas com finalidade exclusiva de responder à solicitação originada. Vedado compartilhamento com entidades externas. Tratamento conforme LGPD — Lei 13.709/2018.',
    'O tratamento de dados pessoais restringe-se ao escopo da consulta efetuada pelo titular. Não há transferência a terceiros em nenhuma hipótese. Base legal: Art. 7, I — LGPD.',
    'Dados informados durante o atendimento são armazenados com segurança e utilizados apenas para a finalidade declarada. Proibido repasse externo. Conformidade Lei 13.709/2018.',
    'As informações pessoais do consumidor recebem tratamento sigiloso, limitado à prestação do serviço requisitado. Inexiste compartilhamento com terceiros. LGPD vigente.',
    'Asseguramos proteção integral aos dados pessoais coletados, empregados unicamente no contexto da interação solicitada pelo titular. Sem cessão a terceiros. LGPD 13.709/2018.',
    'Dados pessoais tratados exclusivamente para fins de atendimento receptivo ao titular. Compartilhamento externo vedado em qualquer circunstância. Fundamentação: Art. 7, I e Art. 6, I — LGPD.',
    'Toda informação disponibilizada pelo consumidor é processada com sigilo absoluto, destinada unicamente ao atendimento da demanda apresentada. Sem repasse. Lei 13.709/2018 — LGPD.',
  ];
  const _termV = [
    'Ao acionar este canal, o consumidor ratifica que a comunicação foi iniciada por sua livre vontade. A empresa não pratica contatos proativos ou promocionais não solicitados. Diretrizes Meta Platforms.',
    'O titular, ao interagir neste ambiente, confirma iniciativa própria e voluntária. Comunicações promocionais sem prévia autorização são terminantemente vedadas. Políticas Meta e LGPD.',
    'A utilização deste canal pressupõe iniciativa espontânea do usuário. Não são realizadas abordagens ativas, disparos programados ou comunicações não requisitadas. Meta Platforms e WhatsApp ToS.',
    'Ao interagir conosco, o cliente declara que tomou a iniciativa do contato de forma voluntária. Promoções e mensagens não solicitadas são vedadas. Conformidade WhatsApp Business e Meta.',
    'O presente canal funciona exclusivamente em modo receptivo. O consumidor que o utiliza consente em receber apenas respostas pertinentes à sua consulta. Vedado spam. Meta Platforms.',
    'O usuário que aciona este serviço o faz por deliberação própria. A organização não efetua contatos ativos, remarketing ou campanhas não autorizadas. Conforme políticas Meta e LGPD.',
    'Qualquer interação neste canal é condicionada à ação voluntária do consumidor final. Proibido envio proativo de ofertas, newsletters ou mensagens não previamente solicitadas. Meta Platforms e LGPD.',
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
    {rs:'DENOMINA\u00c7\u00c3O SOCIAL',cnpj:'CNPJ',sit:'STATUS ATIVO',end:'SEDE / LOCALIZA\u00c7\u00c3O',cnae:'CLASSIFICA\u00c7\u00c3O ECON\u00d4MICA CNAE',tel:'LINHA DE CONTATO',email:'EMAIL CORPORATIVO',mun:'UF/MUNIC\u00cdPIO',waba:'Rota WABA \u2014 Utility Receptivo'},
    {rs:'RAZ\u00c3O SOCIAL',cnpj:'N\u00daMERO CNPJ',sit:'CONDI\u00c7\u00c3O CADASTRAL',end:'ENDERE\u00c7O DA SEDE',cnae:'ATIVIDADE PRIM\u00c1RIA',tel:'TELEFONE VERIFICADO',email:'CANAL DIGITAL',mun:'LOCALIDADE/ESTADO',waba:'M\u00f3dulo WABA \u2014 Canal Utility'},
    {rs:'DENOMINA\u00c7\u00c3O',cnpj:'CNPJ/MF',sit:'SITUA\u00c7\u00c3O RF',end:'INSTALA\u00c7\u00c3O F\u00cdSICA',cnae:'CNAE PRIM\u00c1RIO',tel:'N\u00d3 OFICIAL',email:'ENDERE\u00c7O ELETR\u00d4NICO',mun:'PRA\u00c7A/UF',waba:'Interface WABA \u2014 Receptivo'},
    {rs:'RAZ\u00c3O SOCIAL',cnpj:'INSCRI\u00c7\u00c3O FEDERAL',sit:'SITUA\u00c7\u00c3O ATIVA',end:'DOMIC\u00cdLIO / ENDERE\u00c7O',cnae:'ATIVIDADE ECON\u00d4MICA',tel:'PONTO TELEF\u00d4NICO',email:'EMAIL OFICIAL',mun:'MUNIC\u00cdPIO/UF',waba:'Gateway WABA \u2014 Modo Utility'},
    {rs:'NOME EMPRESARIAL',cnpj:'CNPJ RECEITA',sit:'CONDI\u00c7\u00c3O',end:'ENDERE\u00c7O PRINCIPAL',cnae:'OBJETO / CNAE',tel:'CENTRAL TELEF\u00d4NICA',email:'EMAIL CADASTRADO',mun:'CIDADE/ESTADO',waba:'WhatsApp API \u2014 Canal Utility'},
    {rs:'RAZ\u00c3O SOCIAL',cnpj:'IDENTIFICA\u00c7\u00c3O CNPJ',sit:'REGULARIDADE',end:'LOGRADOURO REGISTRADO',cnae:'ATIVIDADE EXERCIDA',tel:'COMUNICA\u00c7\u00c3O OFICIAL',email:'CORREIO CORPORATIVO',mun:'JURISDI\u00c7\u00c3O/UF',waba:'Protocolo WABA \u2014 Utility Receptivo'},
    {rs:'DENOMINA\u00c7\u00c3O SOCIAL',cnpj:'CNPJ/RECEITA',sit:'VALIDA\u00c7\u00c3O',end:'SEDE OPERACIONAL',cnae:'SEGMENTO CNAE',tel:'TERMINAL OFICIAL',email:'CANAL ELETR\u00d4NICO',mun:'BASE/UF',waba:'Servi\u00e7o WABA \u2014 Canal Receptivo'},
  ];
  var sec = _secTitles[vi];

  // ═══════════════════════════════════════════════════════════════
  // WABA TEXT VARIANTS
  // ═══════════════════════════════════════════════════════════════
  var _wabaText = [
    'Infraestrutura de mensageria operando em modo Utility receptivo. Dedicada ao processamento de confirmações transacionais, alertas de sistema e respostas a chamados do consumidor.',
    'Canal certificado para atendimento de solicitações originadas pelo titular. Categoria Utility — proibido envio proativo de qualquer natureza. Aderência total às políticas WhatsApp Business API.',
    'Endpoint de comunicação receptiva homologado. Finalidade exclusiva: responder consultas voluntárias do consumidor final. Comunicações promocionais ou não requisitadas são bloqueadas.',
    'Rota Utility receptiva em operação. Tráfego limitado a requisições originadas pelo titular dos dados. Vedado marketing, cold-messaging e disparos automatizados.',
    'Canal direcionado ao suporte receptivo e notificações transacionais autorizadas. Nenhuma mensagem é expedida sem provocação prévia do consumidor. Protocolo Utility em vigor.',
    'Linha de comunicação Utility — exclusiva para respostas a demandas do consumidor final. Campanhas B2C e envios não consentidos são terminantemente bloqueados. Conformidade Meta e LGPD.',
    'Ponto de atendimento receptivo certificado. Processamento restrito a solicitações voluntárias do titular. Canal Utility sem capacidade de broadcast. Conformidade WhatsApp Business API.',
  ];
  var _wabaFoot = [
    'Interdito envio massivo. Sem campanhas B2C ou remarketing. Conformidade LGPD e regulamento WhatsApp Business API.',
    'Proibido cold-messaging. Sem aquisição de mailings. Operação conforme diretrizes Meta Platforms e Lei 13.709/2018.',
    'Vedado envio ativo não autorizado. Sem telemarketing digital. Aderência plena a Meta Business e LGPD 13.709/2018.',
    'Zero broadcasts ativos. Sem comunicação não consentida. Conformidade WhatsApp Business API e legislação LGPD.',
    'Sem notificações push não autorizadas. Sem marketing direto. LGPD e Meta Platforms em total conformidade.',
    'Bloqueado envio sem consentimento prévio. Canal integralmente receptivo. Conforme LGPD e Termos de Serviço Meta.',
    'Nenhuma expedição sem prévia autorização do titular. Canal Utility regulamentado. Meta Platforms + LGPD vigente.',
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

  var layoutType = templateIndex % 18;

  var accents = ['#1e40af','#047857','#a16207','#6d28d9','#b91c1c','#0e7490','#a21caf','#a16207','#3730a3','#166534','#c2410c','#5b21b6','#155e75','#9f1239','#065f46','#92400e','#1d4ed8','#15803d','#7c3aed','#b45309'];
  var ac = accents[templateIndex % 20];
  var pal = {ac: ac, bg: '#fafbfc', bg2: '#f1f3f5', txt: '#0f1419'};

  var fonts = [
    '"Inter","SF Pro Display",system-ui,sans-serif',
    '"Merriweather",Georgia,serif',
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
    '"Playfair Display",Georgia,serif',
    '"DM Sans","Helvetica Neue",system-ui,sans-serif',
  ];
  var font = fonts[templateIndex % 5];

  var headHtml = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">'+metaTag+ogTags+'<title>'+razaoFmt+'</title>';

  // ── LAYOUT 0: SIDEBAR ESCURA — dark sidebar com nav + phone, main content claro ──
  if (layoutType === 0) {
    var css0 = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:'+pal.bg+';color:'+pal.txt+';min-height:100vh;font-size:15px;line-height:1.6;display:grid;grid-template-columns:280px 1fr}@media(max-width:860px){body{grid-template-columns:1fr}}.sb-dark{background:#1a1f2e;padding:28px 20px;display:flex;flex-direction:column;gap:16px;border-right:4px solid '+pal.ac+'}@media(max-width:860px){.sb-dark{border-right:none;border-bottom:4px solid '+pal.ac+';padding:20px 18px}}.sb-dark .sb-brand{font-size:1.15rem;font-weight:800;color:#f1f5f9;line-height:1.3}.sb-dark .sb-tag{font-size:9px;letter-spacing:2px;text-transform:uppercase;color:'+pal.ac+';font-weight:700;opacity:.9}.sb-dark .sb-phone{font-family:monospace;font-size:1.1rem;color:'+pal.ac+';font-weight:900;padding:12px;background:rgba(255,255,255,.03);border:1px solid '+pal.ac+'25;border-radius:8px;text-align:center;letter-spacing:1.5px}.sb-dark .sb-lbl{font-size:8px;text-align:center;color:#94a3b8;text-transform:uppercase;letter-spacing:2px;margin-top:-8px}.sb-dark nav{display:flex;flex-direction:column;gap:4px;margin-top:6px}.sb-dark nav a{color:#cbd5e1;text-decoration:none;font-size:12px;padding:7px 10px;border-radius:5px;border-left:2px solid transparent;transition:all .2s}.sb-dark nav a:hover{background:rgba(255,255,255,.04);border-left-color:'+pal.ac+'}.sb-dark .sb-meta{font-size:10px;color:#64748b;line-height:1.7;margin-top:auto;padding-top:12px;border-top:1px solid #2d3548}.mn-area{padding:32px 28px;overflow-y:auto}@media(max-width:860px){.mn-area{padding:20px 16px}}.mn-area h1{font-size:1.8rem;font-weight:900;color:#0f172a;margin-bottom:3px}.mn-area .mn-sub{font-size:10px;color:'+pal.ac+';letter-spacing:2.5px;text-transform:uppercase;margin-bottom:24px;font-weight:600}.mn-blk{background:'+pal.bg2+';border:1px solid #dfe3e8;border-radius:10px;padding:20px;margin-bottom:16px}.mn-blk h2{font-size:14px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:1.2px;margin-bottom:12px;padding-bottom:7px;border-bottom:2px solid '+pal.ac+'15}.mn-row{padding:9px 0;border-bottom:1px solid #eaeef2;display:flex;flex-direction:column;gap:2px}.mn-row:last-child{border-bottom:none}.mn-k{font-size:12px;font-weight:700;text-transform:uppercase;color:#64748b;letter-spacing:.8px}.mn-v{font-size:16px;color:#0f172a;font-weight:700}.mn-v.mono{font-family:monospace;color:'+pal.ac+'}.mn-v.grn{color:#047857}.mn-blk p{font-size:14px;color:#475569;line-height:1.8;margin-bottom:5px}.mn-blk ul{list-style:none}.mn-blk li{font-size:14px;color:#475569;line-height:2;padding-left:14px;position:relative}.mn-blk li::before{content:"\\25B8";position:absolute;left:0;color:'+pal.ac+';font-size:11px}';
    return headHtml+'<style>'+css0+'</style></head><body><aside class="sb-dark"><div class="sb-brand" data-field="razao">'+razaoFmt+'</div><div class="sb-tag">CANAL CORPORATIVO VERIFICADO</div>'+(phoneFmt?'<div class="sb-phone" data-field="phone">'+phoneFmt+'</div><div class="sb-lbl">Linha Empresarial</div>':'')+'<nav><a href="#">Registro Cadastral</a><a href="#">Protocolo WABA</a><a href="#">Normas Operacionais</a><a href="#">Pol&iacute;tica de Dados</a></nav><div class="sb-meta">CNPJ: <span data-field="cnpj">'+cnpjFmt+'</span><br>'+munFmt+'/'+ufFmt+'<br>'+situacaoFmt+'</div></aside><main class="mn-area"><h1 data-field="razao">'+razaoFmt+'</h1><div class="mn-sub">Ficha Empresarial &mdash; Registro P&uacute;blico</div><div class="mn-blk"><h2>Registro da Empresa</h2><div class="mn-row"><div class="mn-k">Denomina&ccedil;&atilde;o</div><div class="mn-v" data-field="razao">'+razaoFmt+'</div></div><div class="mn-row"><div class="mn-k">CNPJ</div><div class="mn-v mono" data-field="cnpj">'+cnpjFmt+'</div></div><div class="mn-row"><div class="mn-k">Condi&ccedil;&atilde;o</div><div class="mn-v grn">'+situacaoFmt+'</div></div><div class="mn-row"><div class="mn-k">Logradouro</div><div class="mn-v">'+enderFmt+'</div></div><div class="mn-row"><div class="mn-k">Bairro</div><div class="mn-v">'+bairroFmt+'</div></div><div class="mn-row"><div class="mn-k">Localidade/UF</div><div class="mn-v">'+munFmt+'/'+ufFmt+'</div></div><div class="mn-row"><div class="mn-k">CEP</div><div class="mn-v">'+cepFmt+'</div></div><div class="mn-row"><div class="mn-k">Canal Digital</div><div class="mn-v">'+(emailFmt||'N/A')+'</div></div>'+(atividadeFmt?'<div class="mn-row"><div class="mn-k">Atividade CNAE</div><div class="mn-v">'+atividadeFmt+'</div></div>':'')+'</div><div class="mn-blk"><h2>Protocolo WhatsApp Business &mdash; Utility</h2>'+(phoneFmt?'<p style="font-family:monospace;font-size:1.35rem;color:'+pal.ac+';font-weight:900;text-align:center;margin:10px 0;padding:10px;background:'+pal.ac+'06;border-radius:8px" data-field="phone">'+phoneFmt+'</p>':'')+'<p>Este protocolo WhatsApp Business destina-se exclusivamente ao processamento receptivo de mensagens utilit&aacute;rias (utility). Vedados disparos, spam ou abordagens n&atilde;o solicitadas. A intera&ccedil;&atilde;o &eacute; sempre originada pelo consumidor. Conformidade com regulamento Meta Platforms e LGPD (Lei 13.709/2018).</p><p>'+wabaFoot+'</p></div><div class="mn-blk"><h2>Perfil Institucional</h2><p>'+sob+'</p></div><div class="mn-blk"><h2>Protocolo de Atendimento</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="mn-blk"><h2>Pol&iacute;tica de Privacidade</h2><p>'+priv+'</p></div><div class="mn-blk"><h2>Condi&ccedil;&otilde;es de Uso</h2><p>'+term+'</p></div></main>'+domScript+'</body></html>';
  }

  // ── LAYOUT 1: TOPBAR + HERO + SECTIONS — dark topbar com brand, hero section, full-width ──
  else if (layoutType === 1) {
    var css1 = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:'+pal.bg+';color:'+pal.txt+';min-height:100vh;font-size:15px;line-height:1.6}.tb-bar{background:#121826;padding:12px 24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px}.tb-bar .tb-brand{font-size:.95rem;font-weight:800;color:#f8fafc;letter-spacing:.3px}.tb-bar .tb-phone{font-family:monospace;font-size:13px;color:'+pal.ac+';font-weight:700}.tb-bar .tb-cnpj{font-size:10px;color:#94a3b8}.hr-hero{background:linear-gradient(145deg,'+pal.ac+' 0%,'+pal.ac+'aa 100%);padding:48px 24px;text-align:center}.hr-hero h1{font-size:2.2rem;font-weight:900;color:#fff;margin-bottom:6px;letter-spacing:-0.3px}.hr-hero .hr-desc{font-size:14px;color:rgba(255,255,255,.85);max-width:560px;margin:0 auto 14px}.hr-hero .hr-phone{font-family:monospace;font-size:1.4rem;color:#fff;font-weight:900;letter-spacing:2.5px;margin-top:10px;padding:8px 18px;background:rgba(0,0,0,.2);border-radius:8px;display:inline-block}.hr-hero .hr-lbl{font-size:9px;color:rgba(255,255,255,.65);text-transform:uppercase;letter-spacing:2.5px;margin-top:5px}.sc-wrap{max-width:860px;margin:28px auto;padding:0 18px}.sc-sect{margin-bottom:24px;padding-bottom:20px;border-bottom:1px solid #e2e8f0}.sc-sect:last-child{border-bottom:none}.sc-sect h2{font-size:15px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:1.2px;margin-bottom:12px}.sc-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}@media(max-width:640px){.sc-grid{grid-template-columns:1fr}}.sc-item{padding:10px 0;border-bottom:1px solid #f1f5f9}.sc-item:last-child{border-bottom:none}.sc-lk{font-size:12px;font-weight:700;text-transform:uppercase;color:#64748b;letter-spacing:.8px;margin-bottom:2px}.sc-lv{font-size:16px;color:#0f172a;font-weight:700}.sc-lv.mono{font-family:monospace;color:'+pal.ac+'}.sc-lv.grn{color:#047857}.sc-sect p{font-size:14px;color:#475569;line-height:1.8;margin-bottom:5px}.sc-sect ul{list-style:none}.sc-sect li{font-size:14px;color:#475569;line-height:2;padding-left:16px;position:relative}.sc-sect li::before{content:"\\25AA";position:absolute;left:0;color:'+pal.ac+';font-size:9px;top:6px}.sc-foot{background:#121826;padding:14px 24px;text-align:center;font-size:11px;color:#94a3b8}';
    return headHtml+'<style>'+css1+'</style></head><body><div class="tb-bar"><div class="tb-brand" data-field="razao">'+razaoFmt+'</div><div><span class="tb-cnpj" data-field="cnpj">CNPJ '+cnpjFmt+'</span>'+(phoneFmt?' &nbsp;|&nbsp; <span class="tb-phone" data-field="phone">'+phoneFmt+'</span>':'')+'</div></div><div class="hr-hero"><h1 data-field="razao">'+razaoFmt+'</h1><div class="hr-desc">Canal institucional de atendimento empresarial &mdash; WhatsApp Business API Utility</div>'+(phoneFmt?'<div class="hr-phone" data-field="phone">'+phoneFmt+'</div><div class="hr-lbl">Central Receptiva Corporativa</div>':'')+'</div><div class="sc-wrap"><div class="sc-sect"><h2>Ficha de Registro</h2><div class="sc-grid"><div class="sc-item"><div class="sc-lk">Denomina&ccedil;&atilde;o Social</div><div class="sc-lv" data-field="razao">'+razaoFmt+'</div></div><div class="sc-item"><div class="sc-lk">CNPJ</div><div class="sc-lv mono" data-field="cnpj">'+cnpjFmt+'</div></div><div class="sc-item"><div class="sc-lk">Condi&ccedil;&atilde;o Cadastral</div><div class="sc-lv grn">'+situacaoFmt+'</div></div><div class="sc-item"><div class="sc-lk">Logradouro</div><div class="sc-lv">'+enderFmt+'</div></div><div class="sc-item"><div class="sc-lk">Bairro</div><div class="sc-lv">'+bairroFmt+'</div></div><div class="sc-item"><div class="sc-lk">Localidade/UF</div><div class="sc-lv">'+munFmt+'/'+ufFmt+'</div></div><div class="sc-item"><div class="sc-lk">CEP</div><div class="sc-lv">'+cepFmt+'</div></div><div class="sc-item"><div class="sc-lk">Canal Digital</div><div class="sc-lv">'+(emailFmt||'N/A')+'</div></div>'+(atividadeFmt?'<div class="sc-item"><div class="sc-lk">Atividade CNAE</div><div class="sc-lv">'+atividadeFmt+'</div></div>':'')+'</div></div><div class="sc-sect"><h2>Protocolo WABA &mdash; Utility</h2>'+(phoneFmt?'<p style="font-family:monospace;font-size:1.3rem;color:'+pal.ac+';font-weight:900;margin:8px 0" data-field="phone">'+phoneFmt+'</p>':'')+'<p>'+wabaText+'</p><p>'+wabaFoot+'</p></div><div class="sc-sect"><h2>Perfil Institucional</h2><p>'+sob+'</p></div><div class="sc-sect"><h2>Diretrizes Operacionais</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="sc-sect"><h2>Prote&ccedil;&atilde;o de Dados</h2><p>'+priv+'</p></div><div class="sc-sect"><h2>Condi&ccedil;&otilde;es Gerais</h2><p>'+term+'</p></div></div><div class="sc-foot">'+razaoFmt+' &mdash; CNPJ '+cnpjFmt+(phoneFmt?' &mdash; '+phoneFmt:'')+'</div>'+domScript+'</body></html>';
  }

  // ── LAYOUT 2: SPLIT 50/50 — header bar, esquerda tabela dados, direita compliance ──
  else if (layoutType === 2) {
    var css2 = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:'+pal.bg+';color:'+pal.txt+';min-height:100vh;font-size:15px;line-height:1.6}.sp-header{background:#f8fafc;border-bottom:4px solid '+pal.ac+';padding:16px 24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px}.sp-header h1{font-size:1.2rem;font-weight:800;color:#0f172a}.sp-header .sp-info{font-size:11px;color:#64748b}.sp-header .sp-phone{font-family:monospace;font-size:13px;color:'+pal.ac+';font-weight:800}.sp-body{display:grid;grid-template-columns:1fr 1fr;min-height:calc(100vh - 72px)}@media(max-width:860px){.sp-body{grid-template-columns:1fr}}.sp-left{padding:28px 24px;border-right:1px solid #e2e8f0}@media(max-width:860px){.sp-left{border-right:none;border-bottom:1px solid #e2e8f0;padding:20px 18px}}.sp-left h2{font-size:14px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:1.2px;margin-bottom:14px}.sp-tbl{width:100%;border-collapse:collapse}.sp-tbl tr{border-bottom:1px solid #edf2f7}.sp-tbl tr:last-child{border-bottom:none}.sp-tbl td{padding:10px 6px;font-size:13px;vertical-align:top}.sp-tbl td:first-child{font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;width:130px;font-size:11px}.sp-tbl td:last-child{color:#0f172a;font-weight:600;font-size:14px}.sp-tbl .mono{font-family:monospace;color:'+pal.ac+'}.sp-tbl .grn{color:#047857}.sp-phone-box{margin-top:18px;padding:14px;background:'+pal.ac+'06;border:2px solid '+pal.ac+'20;border-radius:10px;text-align:center}.sp-phone-box .sp-ph{font-family:monospace;font-size:1.4rem;color:'+pal.ac+';font-weight:900;letter-spacing:2.5px}.sp-phone-box .sp-pl{font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:2px;margin-top:3px}.sp-right{padding:28px 24px;background:'+pal.bg2+'}@media(max-width:860px){.sp-right{padding:20px 18px}}.sp-right h2{font-size:14px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:1.2px;margin-bottom:10px}.sp-right .sp-block{margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #e2e8f0}.sp-right .sp-block:last-child{border-bottom:none}.sp-right p{font-size:13px;color:#475569;line-height:1.8;margin-bottom:5px}.sp-right ul{list-style:none;margin:5px 0}.sp-right li{font-size:13px;color:#475569;line-height:2;padding-left:12px;position:relative}.sp-right li::before{content:"\\25B9";position:absolute;left:0;color:'+pal.ac+'}.sp-foot{background:'+pal.ac+';padding:10px 24px;text-align:center;font-size:10px;color:#fff;font-weight:600;letter-spacing:.8px}';
    return headHtml+'<style>'+css2+'</style></head><body><div class="sp-header"><h1 data-field="razao">'+razaoFmt+'</h1><div><span class="sp-info" data-field="cnpj">CNPJ '+cnpjFmt+'</span>'+(phoneFmt?' &nbsp;|&nbsp; <span class="sp-phone" data-field="phone">'+phoneFmt+'</span>':'')+'</div></div><div class="sp-body"><div class="sp-left"><h2>Registro Empresarial</h2><table class="sp-tbl"><tr><td>Denomina&ccedil;&atilde;o</td><td data-field="razao">'+razaoFmt+'</td></tr><tr><td>CNPJ</td><td class="mono" data-field="cnpj">'+cnpjFmt+'</td></tr><tr><td>Condi&ccedil;&atilde;o</td><td class="grn">'+situacaoFmt+'</td></tr><tr><td>Porte</td><td>'+porteFmt+'</td></tr><tr><td>Nat. Jur&iacute;dica</td><td>'+natJurFmt+'</td></tr><tr><td>Logradouro</td><td>'+enderFmt+'</td></tr><tr><td>Bairro</td><td>'+bairroFmt+'</td></tr><tr><td>Localidade/UF</td><td>'+munFmt+'/'+ufFmt+'</td></tr><tr><td>CEP</td><td>'+cepFmt+'</td></tr><tr><td>Canal Digital</td><td>'+(emailFmt||'N/A')+'</td></tr>'+(atividadeFmt?'<tr><td>Atividade</td><td>'+atividadeFmt+'</td></tr>':'')+'</table>'+(phoneFmt?'<div class="sp-phone-box"><div class="sp-ph" data-field="phone">'+phoneFmt+'</div><div class="sp-pl">CENTRAL CORPORATIVA &mdash; WhatsApp Utility</div></div>':'')+'</div><div class="sp-right"><div class="sp-block"><h2>Protocolo de Atendimento WABA</h2><p>Este protocolo WhatsApp Business processa exclusivamente mensagens utilit&aacute;rias receptivas (utility). Vedados disparos, spam ou abordagens n&atilde;o consentidas. A intera&ccedil;&atilde;o &eacute; sempre originada pelo consumidor.</p><p>'+wabaFoot+'</p></div><div class="sp-block"><h2>Perfil Institucional</h2><p>'+sob+'</p></div><div class="sp-block"><h2>Diretrizes de Atendimento</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="sp-block"><h2>Prote&ccedil;&atilde;o de Dados &amp; LGPD</h2><p>'+priv+'</p></div><div class="sp-block"><h2>Condi&ccedil;&otilde;es de Uso</h2><p>'+term+'</p></div></div></div><div class="sp-foot">'+razaoFmt+' &mdash; CNPJ '+cnpjFmt+(phoneFmt?' &mdash; '+phoneFmt:'')+'  &mdash; Canal Utility Receptivo</div>'+domScript+'</body></html>';
  }

  // ── LAYOUT 3: CARDS/DASHBOARD — topbar com tag, grid de cards abaixo ──
  else if (layoutType === 3) {
    var css3 = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#eef2f7;color:'+pal.txt+';min-height:100vh;font-size:15px;line-height:1.6}.db-top{background:#fff;border-bottom:1px solid #dfe3e8;padding:14px 22px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px}.db-top .db-left{display:flex;align-items:center;gap:10px}.db-top .db-name{font-size:1rem;font-weight:800;color:#0f172a}.db-top .db-badge{font-size:8px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#fff;background:'+pal.ac+';padding:3px 8px;border-radius:4px}.db-top .db-right{display:flex;align-items:center;gap:14px}.db-top .db-cnpj{font-family:monospace;font-size:11px;color:#64748b}.db-top .db-ph{font-family:monospace;font-size:12px;color:'+pal.ac+';font-weight:700}.db-grid{max-width:1060px;margin:24px auto;padding:0 18px;display:grid;grid-template-columns:repeat(3,1fr);gap:16px}@media(max-width:900px){.db-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:600px){.db-grid{grid-template-columns:1fr}}.db-card{background:#fff;border:1px solid #dfe3e8;border-radius:12px;padding:20px;box-shadow:0 2px 4px rgba(0,0,0,.03)}.db-card h3{font-size:12px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:1.2px;margin-bottom:12px;padding-bottom:7px;border-bottom:2px solid '+pal.ac+'12}.db-card .db-row{padding:7px 0;border-bottom:1px solid #f8fafc}.db-card .db-row:last-child{border-bottom:none}.db-card .db-rk{font-size:10px;font-weight:700;text-transform:uppercase;color:#94a3b8;letter-spacing:.6px}.db-card .db-rv{font-size:14px;color:#0f172a;font-weight:700;margin-top:1px}.db-card .db-rv.mono{font-family:monospace;color:'+pal.ac+'}.db-card .db-rv.grn{color:#047857}.db-card p{font-size:13px;color:#475569;line-height:1.8;margin-bottom:5px}.db-card ul{list-style:none;margin:3px 0}.db-card li{font-size:13px;color:#475569;line-height:1.9;padding-left:12px;position:relative}.db-card li::before{content:"\\2713";position:absolute;left:0;color:'+pal.ac+';font-size:10px}.db-phone-card{background:'+pal.ac+';border-radius:12px;padding:22px;text-align:center;grid-column:span 1}.db-phone-card .db-pc-ph{font-family:monospace;font-size:1.5rem;color:#fff;font-weight:900;letter-spacing:2.5px;margin-bottom:5px}.db-phone-card .db-pc-lbl{font-size:9px;color:rgba(255,255,255,.8);text-transform:uppercase;letter-spacing:2px}.db-phone-card .db-pc-txt{font-size:11px;color:rgba(255,255,255,.7);margin-top:8px;line-height:1.6}.db-foot{max-width:1060px;margin:14px auto;padding:12px 18px;text-align:center;font-size:11px;color:#64748b}';
    return headHtml+'<style>'+css3+'</style></head><body><div class="db-top"><div class="db-left"><span class="db-name" data-field="razao">'+displayName+'</span><span class="db-badge">UTILITY RECEPTIVO</span></div><div class="db-right"><span class="db-cnpj" data-field="cnpj">'+cnpjFmt+'</span>'+(phoneFmt?'<span class="db-ph" data-field="phone">'+phoneFmt+'</span>':'')+'</div></div><div class="db-grid"><div class="db-card"><h3>Registro da Empresa</h3><div class="db-row"><div class="db-rk">Denomina&ccedil;&atilde;o</div><div class="db-rv" data-field="razao">'+razaoFmt+'</div></div><div class="db-row"><div class="db-rk">CNPJ</div><div class="db-rv mono" data-field="cnpj">'+cnpjFmt+'</div></div><div class="db-row"><div class="db-rk">Condi&ccedil;&atilde;o</div><div class="db-rv grn">'+situacaoFmt+'</div></div><div class="db-row"><div class="db-rk">Porte</div><div class="db-rv">'+porteFmt+'</div></div><div class="db-row"><div class="db-rk">Nat. Jur&iacute;dica</div><div class="db-rv">'+natJurFmt+'</div></div></div><div class="db-card"><h3>Sede Operacional</h3><div class="db-row"><div class="db-rk">Logradouro</div><div class="db-rv">'+enderFmt+'</div></div><div class="db-row"><div class="db-rk">Bairro</div><div class="db-rv">'+bairroFmt+'</div></div><div class="db-row"><div class="db-rk">Localidade/UF</div><div class="db-rv">'+munFmt+'/'+ufFmt+'</div></div><div class="db-row"><div class="db-rk">CEP</div><div class="db-rv">'+cepFmt+'</div></div><div class="db-row"><div class="db-rk">Canal Digital</div><div class="db-rv">'+(emailFmt||'N/A')+'</div></div>'+(atividadeFmt?'<div class="db-row"><div class="db-rk">Atividade</div><div class="db-rv">'+atividadeFmt+'</div></div>':'')+'</div>'+(phoneFmt?'<div class="db-phone-card"><div class="db-pc-ph" data-field="phone">'+phoneFmt+'</div><div class="db-pc-lbl">CENTRAL CORPORATIVA &mdash; Utility</div><div class="db-pc-txt">Atendimento receptivo certificado. Vedados disparos. Conformidade Meta &amp; LGPD.</div></div>':'')+'<div class="db-card"><h3>Protocolo WABA</h3><p>'+wabaText+'</p><p>'+wabaFoot+'</p></div><div class="db-card"><h3>Perfil &amp; Compliance</h3><p>'+sob+'</p></div><div class="db-card"><h3>Diretrizes</h3><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="db-card"><h3>Prote&ccedil;&atilde;o de Dados</h3><p>'+priv+'</p></div><div class="db-card"><h3>Condi&ccedil;&otilde;es</h3><p>'+term+'</p></div></div><div class="db-foot">'+razaoFmt+' &mdash; CNPJ '+cnpjFmt+(phoneFmt?' &mdash; '+phoneFmt:'')+'</div>'+domScript+'</body></html>';
  }

  // ── LAYOUT 4: MINIMAL/DOCUMENT — estilo documento clean, tabela, bordas mínimas ──
  else if (layoutType === 4) {
    var css4 = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#fff;color:'+pal.txt+';min-height:100vh;font-size:15px;line-height:1.7;padding:0}.dc-wrap{max-width:820px;margin:0 auto;padding:40px 28px}@media(max-width:640px){.dc-wrap{padding:24px 16px}}.dc-head{text-align:center;padding-bottom:24px;margin-bottom:28px;border-bottom:2px solid #e5e7eb}.dc-head h1{font-size:2rem;font-weight:900;color:#000;margin-bottom:6px;letter-spacing:-0.3px}.dc-head .dc-sub{font-size:12px;color:#6b7280;letter-spacing:1px}.dc-head .dc-cnpj{font-family:monospace;font-size:14px;color:'+pal.ac+';margin-top:4px}.dc-phone-bar{text-align:center;padding:18px;margin-bottom:28px;border:1px solid #e5e7eb;border-left:4px solid '+pal.ac+';background:#fafafa}.dc-phone-bar .dc-pb-ph{font-family:monospace;font-size:1.5rem;color:'+pal.ac+';font-weight:900;letter-spacing:2px}.dc-phone-bar .dc-pb-lbl{font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:1.5px;margin-top:4px}.dc-section{margin-bottom:28px}.dc-section h2{font-size:14px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid #e5e7eb}.dc-tbl{width:100%;border-collapse:collapse;margin-bottom:8px}.dc-tbl tr{border-bottom:1px solid #f3f4f6}.dc-tbl tr:last-child{border-bottom:none}.dc-tbl td{padding:10px 6px;vertical-align:top;font-size:14px}.dc-tbl td:first-child{font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;width:160px;font-size:12px}.dc-tbl td:last-child{color:#111;font-weight:600}.dc-tbl .mono{font-family:monospace;color:'+pal.ac+'}.dc-tbl .grn{color:#059669}.dc-section p{font-size:14px;color:#374151;line-height:1.8;margin-bottom:6px}.dc-section ul{list-style:none;margin:6px 0}.dc-section li{font-size:14px;color:#374151;line-height:2;padding-left:14px;position:relative}.dc-section li::before{content:"\\2014";position:absolute;left:0;color:'+pal.ac+'}.dc-foot{text-align:center;padding:18px 0;margin-top:28px;border-top:2px solid #e5e7eb;font-size:12px;color:#6b7280}';
    return headHtml+'<style>'+css4+'</style></head><body><div class="dc-wrap"><div class="dc-head"><h1 data-field="razao">'+razaoFmt+'</h1><div class="dc-sub">Documento Institucional &mdash; Cadastro Empresarial</div><div class="dc-cnpj" data-field="cnpj">'+cnpjFmt+'</div></div>'+(phoneFmt?'<div class="dc-phone-bar"><div class="dc-pb-ph" data-field="phone">'+phoneFmt+'</div><div class="dc-pb-lbl">CENTRAL CORPORATIVA &mdash; Atendimento Receptivo</div></div>':'')+'<div class="dc-section"><h2>Registro Empresarial</h2><table class="dc-tbl"><tr><td>Denomina&ccedil;&atilde;o</td><td data-field="razao">'+razaoFmt+'</td></tr><tr><td>CNPJ</td><td class="mono" data-field="cnpj">'+cnpjFmt+'</td></tr><tr><td>Condi&ccedil;&atilde;o</td><td class="grn">'+situacaoFmt+'</td></tr><tr><td>Porte</td><td>'+porteFmt+'</td></tr><tr><td>Nat. Jur&iacute;dica</td><td>'+natJurFmt+'</td></tr><tr><td>Logradouro</td><td>'+enderFmt+'</td></tr><tr><td>Bairro</td><td>'+bairroFmt+'</td></tr><tr><td>Localidade/UF</td><td>'+munFmt+'/'+ufFmt+'</td></tr><tr><td>CEP</td><td>'+cepFmt+'</td></tr><tr><td>Canal Digital</td><td>'+(emailFmt||'N/A')+'</td></tr>'+(atividadeFmt?'<tr><td>Atividade</td><td>'+atividadeFmt+'</td></tr>':'')+'</table></div><div class="dc-section"><h2>Protocolo WhatsApp Business &mdash; Utility</h2>'+(phoneFmt?'<p style="font-family:monospace;font-size:1.3rem;color:'+pal.ac+';font-weight:900;margin-bottom:10px" data-field="phone">'+phoneFmt+'</p>':'')+'<p>'+wabaText+'</p><p>'+wabaFoot+'</p></div><div class="dc-section"><h2>Perfil Institucional</h2><p>'+sob+'</p></div><div class="dc-section"><h2>Diretrizes Operacionais</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="dc-section"><h2>Prote&ccedil;&atilde;o de Dados &amp; LGPD</h2><p>'+priv+'</p></div><div class="dc-section"><h2>Condi&ccedil;&otilde;es Gerais de Uso</h2><p>'+term+'</p></div><div class="dc-foot">'+razaoFmt+' &mdash; CNPJ '+cnpjFmt+(phoneFmt?' &mdash; '+phoneFmt:'')+'  &mdash; Registro Institucional</div></div>'+domScript+'</body></html>';
  }


  // -- LAYOUT 5: VERTICAL TIMELINE -- linhas verticais conectando secoes --
  else if (layoutType === 5) {
    var css5 = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#f4f6f9;color:#111;min-height:100vh;font-size:15px;line-height:1.6}.tl-top{background:linear-gradient(145deg,'+pal.ac+','+pal.ac+'bb);padding:28px 24px;text-align:center}.tl-top h1{font-size:1.9rem;font-weight:900;color:#fff}.tl-top .tl-sub{font-size:11px;color:rgba(255,255,255,.75);margin-top:3px}.tl-wrap{max-width:740px;margin:0 auto;padding:24px 18px;position:relative}.tl-wrap::before{content:"";position:absolute;left:26px;top:0;bottom:0;width:2px;background:'+pal.ac+'25}@media(max-width:640px){.tl-wrap::before{left:14px}}.tl-item{position:relative;padding-left:48px;margin-bottom:24px}@media(max-width:640px){.tl-item{padding-left:36px}}.tl-item::before{content:"";position:absolute;left:18px;top:7px;width:16px;height:16px;border-radius:50%;background:'+pal.ac+';border:3px solid #f4f6f9;box-shadow:0 0 0 2px '+pal.ac+'30}@media(max-width:640px){.tl-item::before{left:6px;width:14px;height:14px}}.tl-item h2{font-size:13px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:1.2px;margin-bottom:8px}.tl-card{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:16px}.tl-row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f4f6f9;flex-wrap:wrap;gap:3px}.tl-row:last-child{border-bottom:none}.tl-rk{font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase}.tl-rv{font-size:14px;font-weight:700;color:#0f172a}.tl-rv.mono{font-family:monospace;color:'+pal.ac+'}.tl-rv.grn{color:#047857}.tl-card p{font-size:13px;color:#475569;line-height:1.8;margin-bottom:3px}.tl-card ul{list-style:none}.tl-card li{font-size:13px;color:#475569;line-height:2;padding-left:12px;position:relative}.tl-card li::before{content:"\\25B8";position:absolute;left:0;color:'+pal.ac+';font-size:10px}.tl-phone{text-align:center;padding:12px;font-family:monospace;font-size:1.3rem;color:'+pal.ac+';font-weight:900;background:'+pal.ac+'06;border-radius:8px;margin:6px 0}.tl-foot{text-align:center;padding:16px;font-size:10px;color:#64748b}';
    return headHtml+'<style>'+css5+'</style></head><body><div class="tl-top"><h1 data-field="razao">'+razaoFmt+'</h1><div class="tl-sub">CNPJ '+cnpjFmt+'</div></div><div class="tl-wrap">'+(phoneFmt?'<div class="tl-phone" data-field="phone">'+phoneFmt+'</div>':'')+'<div class="tl-item"><h2>Registro Cadastral</h2><div class="tl-card"><div class="tl-row"><span class="tl-rk">Denomina&ccedil;&atilde;o</span><span class="tl-rv" data-field="razao">'+razaoFmt+'</span></div><div class="tl-row"><span class="tl-rk">CNPJ</span><span class="tl-rv mono" data-field="cnpj">'+cnpjFmt+'</span></div><div class="tl-row"><span class="tl-rk">Condi&ccedil;&atilde;o</span><span class="tl-rv grn">'+situacaoFmt+'</span></div><div class="tl-row"><span class="tl-rk">Logradouro</span><span class="tl-rv">'+enderFmt+'</span></div><div class="tl-row"><span class="tl-rk">Bairro</span><span class="tl-rv">'+bairroFmt+'</span></div><div class="tl-row"><span class="tl-rk">Localidade/UF</span><span class="tl-rv">'+munFmt+'/'+ufFmt+'</span></div><div class="tl-row"><span class="tl-rk">CEP</span><span class="tl-rv">'+cepFmt+'</span></div><div class="tl-row"><span class="tl-rk">Canal Digital</span><span class="tl-rv">'+(emailFmt||'N/A')+'</span></div>'+(atividadeFmt?'<div class="tl-row"><span class="tl-rk">Atividade</span><span class="tl-rv">'+atividadeFmt+'</span></div>':'')+'</div></div><div class="tl-item"><h2>Protocolo WABA</h2><div class="tl-card">'+(phoneFmt?'<div class="tl-phone" data-field="phone">'+phoneFmt+'</div>':'')+'<p>'+wabaText+'</p><p>'+wabaFoot+'</p></div></div><div class="tl-item"><h2>Perfil Institucional</h2><div class="tl-card"><p>'+sob+'</p></div></div><div class="tl-item"><h2>Diretrizes</h2><div class="tl-card"><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div></div><div class="tl-item"><h2>Prote&ccedil;&atilde;o de Dados</h2><div class="tl-card"><p>'+priv+'</p></div></div><div class="tl-item"><h2>Condi&ccedil;&otilde;es</h2><div class="tl-card"><p>'+term+'</p></div></div></div><div class="tl-foot">'+razaoFmt+' &mdash; '+cnpjFmt+'</div>'+domScript+'</body></html>';
  }

  // -- LAYOUT 6: TWO-COLUMN -- painel colorido esquerda + conteudo direita --
  else if (layoutType === 6) {
    var css6 = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#f9fafb;color:#111;min-height:100vh;font-size:15px;line-height:1.6;display:grid;grid-template-columns:280px 1fr}@media(max-width:768px){body{grid-template-columns:1fr}}.l6-left{background:'+pal.ac+';padding:36px 22px;display:flex;flex-direction:column;gap:20px;color:#fff}@media(max-width:768px){.l6-left{padding:24px 18px}}.l6-left h1{font-size:1.3rem;font-weight:800;line-height:1.3}.l6-cnpj{font-family:monospace;font-size:13px;opacity:.85}.l6-ph{font-family:monospace;font-size:1.2rem;font-weight:900;background:rgba(255,255,255,.15);padding:12px;border-radius:6px;text-align:center}.l6-nav{list-style:none;margin-top:12px}.l6-nav li{font-size:12px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.2);text-transform:uppercase;letter-spacing:1px}.l6-right{padding:36px 28px;max-width:700px}@media(max-width:768px){.l6-right{padding:24px 16px}}.l6-sec{margin-bottom:28px}.l6-sec h2{font-size:13px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #e5e7eb}.l6-row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f3f4f6;flex-wrap:wrap;gap:4px}.l6-row:last-child{border-bottom:none}.l6-rk{font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase}.l6-rv{font-size:14px;font-weight:600;color:#111}.l6-mono{font-family:monospace;color:'+pal.ac+'}.l6-grn{color:#059669}.l6-sec p{font-size:14px;color:#374151;line-height:1.8}.l6-sec ul{list-style:none}.l6-sec li{font-size:14px;color:#374151;line-height:2;padding-left:14px;position:relative}.l6-sec li::before{content:"\\2022";position:absolute;left:0;color:'+pal.ac+'}.l6-phone{font-family:monospace;font-size:1.3rem;color:'+pal.ac+';font-weight:900}.l6-foot{text-align:center;padding:16px;font-size:11px;color:#6b7280;border-top:1px solid #e5e7eb;margin-top:20px}';
    return headHtml+'<style>'+css6+'</style></head><body><div class="l6-left"><h1 data-field="razao">'+razaoFmt+'</h1><div class="l6-cnpj" data-field="cnpj">'+cnpjFmt+'</div>'+(phoneFmt?'<div class="l6-ph" data-field="phone">'+phoneFmt+'</div>':'')+'<ul class="l6-nav"><li>Dados</li><li>WABA</li><li>Compliance</li><li>Privacidade</li><li>Termos</li></ul></div><div class="l6-right"><div class="l6-sec"><h2>Registro Cadastral</h2><div class="l6-row"><span class="l6-rk">Denomina&ccedil;&atilde;o</span><span class="l6-rv" data-field="razao">'+razaoFmt+'</span></div><div class="l6-row"><span class="l6-rk">CNPJ</span><span class="l6-rv l6-mono" data-field="cnpj">'+cnpjFmt+'</span></div><div class="l6-row"><span class="l6-rk">Condi&ccedil;&atilde;o</span><span class="l6-rv l6-grn">'+situacaoFmt+'</span></div><div class="l6-row"><span class="l6-rk">Logradouro</span><span class="l6-rv">'+enderFmt+'</span></div><div class="l6-row"><span class="l6-rk">Bairro</span><span class="l6-rv">'+bairroFmt+'</span></div><div class="l6-row"><span class="l6-rk">Localidade/UF</span><span class="l6-rv">'+munFmt+'/'+ufFmt+'</span></div><div class="l6-row"><span class="l6-rk">CEP</span><span class="l6-rv">'+cepFmt+'</span></div><div class="l6-row"><span class="l6-rk">Canal Digital</span><span class="l6-rv">'+(emailFmt||'N/A')+'</span></div>'+(atividadeFmt?'<div class="l6-row"><span class="l6-rk">Atividade</span><span class="l6-rv">'+atividadeFmt+'</span></div>':'')+'</div><div class="l6-sec"><h2>Protocolo WABA</h2>'+(phoneFmt?'<p class="l6-phone" data-field="phone">'+phoneFmt+'</p>':'')+'<p>'+wabaText+'</p><p>'+wabaFoot+'</p></div><div class="l6-sec"><h2>Perfil Institucional</h2><p>'+sob+'</p></div><div class="l6-sec"><h2>Normas Operacionais</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="l6-sec"><h2>Prote&ccedil;&atilde;o de Dados</h2><p>'+priv+'</p></div><div class="l6-sec"><h2>Condi&ccedil;&otilde;es de Uso</h2><p>'+term+'</p></div><div class="l6-foot">'+razaoFmt+' &mdash; '+cnpjFmt+'</div></div>'+domScript+'</body></html>';
  }

  // -- LAYOUT 7: FULL-WIDTH DARK -- fundo escuro, acento neon, secoes empilhadas --
  else if (layoutType === 7) {
    var css7 = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#0c1220;color:#e2e8f0;min-height:100vh;font-size:15px;line-height:1.6}.l7-hdr{background:#162032;padding:28px 24px;text-align:center;border-bottom:4px solid '+pal.ac+'}.l7-hdr h1{font-size:1.9rem;font-weight:900;color:#f8fafc}.l7-hdr .l7-sub{font-size:11px;color:'+pal.ac+';margin-top:3px;letter-spacing:2px;text-transform:uppercase}.l7-wrap{max-width:780px;margin:0 auto;padding:24px 18px}.l7-phone{text-align:center;font-family:monospace;font-size:1.4rem;color:'+pal.ac+';font-weight:900;padding:16px;background:#162032;border-radius:10px;margin-bottom:20px;border:1px solid '+pal.ac+'35}.l7-sec{background:#162032;border-radius:10px;padding:20px;margin-bottom:16px;border:1px solid #2a3a50}.l7-sec h2{font-size:12px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:1.2px;margin-bottom:12px;padding-bottom:7px;border-bottom:1px solid #2a3a50}.l7-row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #1a2a3e;flex-wrap:wrap;gap:3px}.l7-row:last-child{border-bottom:none}.l7-rk{font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase}.l7-rv{font-size:13px;font-weight:600;color:#f1f5f9}.l7-mono{font-family:monospace;color:'+pal.ac+'}.l7-grn{color:#34d399}.l7-sec p{font-size:13px;color:#cbd5e1;line-height:1.8}.l7-sec ul{list-style:none}.l7-sec li{font-size:13px;color:#cbd5e1;line-height:2;padding-left:12px;position:relative}.l7-sec li::before{content:"\\25B8";position:absolute;left:0;color:'+pal.ac+';font-size:10px}.l7-phone2{font-family:monospace;font-size:1.2rem;color:'+pal.ac+';font-weight:900}.l7-foot{text-align:center;padding:16px;font-size:10px;color:#64748b;border-top:1px solid #2a3a50;margin-top:10px}';
    return headHtml+'<style>'+css7+'</style></head><body><div class="l7-hdr"><h1 data-field="razao">'+razaoFmt+'</h1><div class="l7-sub">CNPJ '+cnpjFmt+'</div></div><div class="l7-wrap">'+(phoneFmt?'<div class="l7-phone" data-field="phone">'+phoneFmt+'</div>':'')+'<div class="l7-sec"><h2>Registro Cadastral</h2><div class="l7-row"><span class="l7-rk">Denomina&ccedil;&atilde;o</span><span class="l7-rv" data-field="razao">'+razaoFmt+'</span></div><div class="l7-row"><span class="l7-rk">CNPJ</span><span class="l7-rv l7-mono" data-field="cnpj">'+cnpjFmt+'</span></div><div class="l7-row"><span class="l7-rk">Condi&ccedil;&atilde;o</span><span class="l7-rv l7-grn">'+situacaoFmt+'</span></div><div class="l7-row"><span class="l7-rk">Logradouro</span><span class="l7-rv">'+enderFmt+'</span></div><div class="l7-row"><span class="l7-rk">Bairro</span><span class="l7-rv">'+bairroFmt+'</span></div><div class="l7-row"><span class="l7-rk">Localidade/UF</span><span class="l7-rv">'+munFmt+'/'+ufFmt+'</span></div><div class="l7-row"><span class="l7-rk">CEP</span><span class="l7-rv">'+cepFmt+'</span></div><div class="l7-row"><span class="l7-rk">Canal Digital</span><span class="l7-rv">'+(emailFmt||'N/A')+'</span></div>'+(atividadeFmt?'<div class="l7-row"><span class="l7-rk">Atividade</span><span class="l7-rv">'+atividadeFmt+'</span></div>':'')+'</div><div class="l7-sec"><h2>Protocolo WABA</h2>'+(phoneFmt?'<p class="l7-phone" data-field="phone">'+phoneFmt+'</p>':'')+'<p>'+wabaText+'</p><p>'+wabaFoot+'</p></div><div class="l7-sec"><h2>Perfil Institucional</h2><p>'+sob+'</p></div><div class="l7-sec"><h2>Normas Operacionais</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="l7-sec"><h2>Prote&ccedil;&atilde;o de Dados</h2><p>'+priv+'</p></div><div class="l7-sec"><h2>Condi&ccedil;&otilde;es de Uso</h2><p>'+term+'</p></div></div><div class="l7-foot">'+razaoFmt+' &mdash; '+cnpjFmt+'</div>'+domScript+'</body></html>';
  }

  // -- LAYOUT 8: CENTERED NARROW -- max-width 600px, clean centered --
  else if (layoutType === 8) {
    var css8 = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#ffffff;color:#111;min-height:100vh;font-size:15px;line-height:1.7}.l8-wrap{max-width:600px;margin:0 auto;padding:40px 24px}@media(max-width:640px){.l8-wrap{padding:28px 16px}}.l8-hdr{text-align:center;margin-bottom:32px;padding-bottom:20px;border-bottom:2px solid '+pal.ac+'}.l8-hdr h1{font-size:1.8rem;font-weight:900;color:#111;margin-bottom:6px}.l8-hdr .l8-sub{font-family:monospace;font-size:13px;color:'+pal.ac+'}.l8-phone{text-align:center;font-family:monospace;font-size:1.4rem;color:'+pal.ac+';font-weight:900;margin-bottom:28px;padding:14px;border:1px dashed '+pal.ac+'60;border-radius:6px}.l8-sec{margin-bottom:26px}.l8-sec h2{font-size:13px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:12px}.l8-row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f1f5f9;flex-wrap:wrap;gap:4px}.l8-row:last-child{border-bottom:none}.l8-rk{font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase}.l8-rv{font-size:14px;font-weight:600;color:#111}.l8-mono{font-family:monospace;color:'+pal.ac+'}.l8-grn{color:#059669}.l8-sec p{font-size:14px;color:#374151;line-height:1.8}.l8-sec ul{list-style:none}.l8-sec li{font-size:14px;color:#374151;line-height:2;padding-left:14px;position:relative}.l8-sec li::before{content:"\\2022";position:absolute;left:0;color:'+pal.ac+'}.l8-phone2{font-family:monospace;font-size:1.3rem;color:'+pal.ac+';font-weight:900}.l8-foot{text-align:center;padding:18px 0;margin-top:20px;border-top:2px solid #f1f5f9;font-size:11px;color:#6b7280}';
    return headHtml+'<style>'+css8+'</style></head><body><div class="l8-wrap"><div class="l8-hdr"><h1 data-field="razao">'+razaoFmt+'</h1><div class="l8-sub" data-field="cnpj">'+cnpjFmt+'</div></div>'+(phoneFmt?'<div class="l8-phone" data-field="phone">'+phoneFmt+'</div>':'')+'<div class="l8-sec"><h2>Registro Cadastral</h2><div class="l8-row"><span class="l8-rk">Denomina&ccedil;&atilde;o</span><span class="l8-rv" data-field="razao">'+razaoFmt+'</span></div><div class="l8-row"><span class="l8-rk">CNPJ</span><span class="l8-rv l8-mono" data-field="cnpj">'+cnpjFmt+'</span></div><div class="l8-row"><span class="l8-rk">Condi&ccedil;&atilde;o</span><span class="l8-rv l8-grn">'+situacaoFmt+'</span></div><div class="l8-row"><span class="l8-rk">Logradouro</span><span class="l8-rv">'+enderFmt+'</span></div><div class="l8-row"><span class="l8-rk">Bairro</span><span class="l8-rv">'+bairroFmt+'</span></div><div class="l8-row"><span class="l8-rk">Localidade/UF</span><span class="l8-rv">'+munFmt+'/'+ufFmt+'</span></div><div class="l8-row"><span class="l8-rk">CEP</span><span class="l8-rv">'+cepFmt+'</span></div><div class="l8-row"><span class="l8-rk">Canal Digital</span><span class="l8-rv">'+(emailFmt||'N/A')+'</span></div>'+(atividadeFmt?'<div class="l8-row"><span class="l8-rk">Atividade</span><span class="l8-rv">'+atividadeFmt+'</span></div>':'')+'</div><div class="l8-sec"><h2>Protocolo WABA</h2>'+(phoneFmt?'<p class="l8-phone" data-field="phone">'+phoneFmt+'</p>':'')+'<p>'+wabaText+'</p><p>'+wabaFoot+'</p></div><div class="l8-sec"><h2>Perfil Institucional</h2><p>'+sob+'</p></div><div class="l8-sec"><h2>Normas Operacionais</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="l8-sec"><h2>Prote&ccedil;&atilde;o de Dados</h2><p>'+priv+'</p></div><div class="l8-sec"><h2>Condi&ccedil;&otilde;es de Uso</h2><p>'+term+'</p></div><div class="l8-foot">'+razaoFmt+' &mdash; '+cnpjFmt+'</div></div>'+domScript+'</body></html>';
  }

  // -- LAYOUT 9: TABBED LOOK -- barra de tabs no topo, conteudo abaixo --
  else if (layoutType === 9) {
    var css9 = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#f8fafc;color:#111;min-height:100vh;font-size:15px;line-height:1.6}.l9-hdr{background:#fff;padding:24px 28px;border-bottom:1px solid #e5e7eb;text-align:center}.l9-hdr h1{font-size:1.6rem;font-weight:800;color:#111}.l9-hdr .l9-sub{font-size:12px;color:#6b7280;margin-top:4px}.l9-tabs{display:flex;background:#fff;border-bottom:2px solid #e5e7eb;padding:0 20px;overflow-x:auto;gap:0}.l9-tabs span{padding:12px 18px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;border-bottom:2px solid transparent;margin-bottom:-2px;white-space:nowrap}.l9-tabs span:first-child{color:'+pal.ac+';border-bottom-color:'+pal.ac+'}.l9-wrap{max-width:800px;margin:0 auto;padding:28px 20px}.l9-phone{text-align:center;font-family:monospace;font-size:1.4rem;color:'+pal.ac+';font-weight:900;padding:16px;background:#fff;border-radius:8px;border:1px solid #e5e7eb;margin-bottom:24px}.l9-sec{background:#fff;border-radius:8px;padding:22px;margin-bottom:18px;border:1px solid #e5e7eb}.l9-sec h2{font-size:13px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #f1f5f9}.l9-row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f8fafc;flex-wrap:wrap;gap:4px}.l9-row:last-child{border-bottom:none}.l9-rk{font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase}.l9-rv{font-size:14px;font-weight:600;color:#111}.l9-mono{font-family:monospace;color:'+pal.ac+'}.l9-grn{color:#059669}.l9-sec p{font-size:14px;color:#374151;line-height:1.8}.l9-sec ul{list-style:none}.l9-sec li{font-size:14px;color:#374151;line-height:2;padding-left:14px;position:relative}.l9-sec li::before{content:"\\2022";position:absolute;left:0;color:'+pal.ac+'}.l9-phone2{font-family:monospace;font-size:1.3rem;color:'+pal.ac+';font-weight:900}.l9-foot{text-align:center;padding:18px;font-size:11px;color:#6b7280}';
    return headHtml+'<style>'+css9+'</style></head><body><div class="l9-hdr"><h1 data-field="razao">'+razaoFmt+'</h1><div class="l9-sub" data-field="cnpj">CNPJ '+cnpjFmt+'</div></div><div class="l9-tabs"><span>Cadastro</span><span>WABA</span><span>Compliance</span><span>Privacidade</span><span>Termos</span></div><div class="l9-wrap">'+(phoneFmt?'<div class="l9-phone" data-field="phone">'+phoneFmt+'</div>':'')+'<div class="l9-sec"><h2>Registro Cadastral</h2><div class="l9-row"><span class="l9-rk">Denomina&ccedil;&atilde;o</span><span class="l9-rv" data-field="razao">'+razaoFmt+'</span></div><div class="l9-row"><span class="l9-rk">CNPJ</span><span class="l9-rv l9-mono" data-field="cnpj">'+cnpjFmt+'</span></div><div class="l9-row"><span class="l9-rk">Condi&ccedil;&atilde;o</span><span class="l9-rv l9-grn">'+situacaoFmt+'</span></div><div class="l9-row"><span class="l9-rk">Logradouro</span><span class="l9-rv">'+enderFmt+'</span></div><div class="l9-row"><span class="l9-rk">Bairro</span><span class="l9-rv">'+bairroFmt+'</span></div><div class="l9-row"><span class="l9-rk">Localidade/UF</span><span class="l9-rv">'+munFmt+'/'+ufFmt+'</span></div><div class="l9-row"><span class="l9-rk">CEP</span><span class="l9-rv">'+cepFmt+'</span></div><div class="l9-row"><span class="l9-rk">Canal Digital</span><span class="l9-rv">'+(emailFmt||'N/A')+'</span></div>'+(atividadeFmt?'<div class="l9-row"><span class="l9-rk">Atividade</span><span class="l9-rv">'+atividadeFmt+'</span></div>':'')+'</div><div class="l9-sec"><h2>Protocolo WABA</h2>'+(phoneFmt?'<p class="l9-phone" data-field="phone">'+phoneFmt+'</p>':'')+'<p>'+wabaText+'</p><p>'+wabaFoot+'</p></div><div class="l9-sec"><h2>Perfil Institucional</h2><p>'+sob+'</p></div><div class="l9-sec"><h2>Normas Operacionais</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="l9-sec"><h2>Prote&ccedil;&atilde;o de Dados</h2><p>'+priv+'</p></div><div class="l9-sec"><h2>Condi&ccedil;&otilde;es de Uso</h2><p>'+term+'</p></div></div><div class="l9-foot">'+razaoFmt+' &mdash; '+cnpjFmt+'</div>'+domScript+'</body></html>';
  }

  // -- LAYOUT 10: BORDERED SECTIONS -- cada secao com borda esquerda grossa --
  else if (layoutType === 10) {
    var css10 = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#fafafa;color:#111;min-height:100vh;font-size:15px;line-height:1.6}.l10-hdr{padding:32px 28px;text-align:center;background:#fff;border-bottom:1px solid #e5e7eb}.l10-hdr h1{font-size:1.8rem;font-weight:900;color:#111}.l10-hdr .l10-sub{font-size:12px;color:'+pal.ac+';margin-top:4px;font-family:monospace}.l10-wrap{max-width:780px;margin:0 auto;padding:28px 20px}.l10-phone{font-family:monospace;font-size:1.4rem;color:'+pal.ac+';font-weight:900;padding:16px 20px;background:#fff;border-left:5px solid '+pal.ac+';margin-bottom:24px}.l10-sec{background:#fff;padding:20px 22px;margin-bottom:18px;border-left:5px solid '+pal.ac+';border-radius:0 6px 6px 0}.l10-sec h2{font-size:13px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:12px}.l10-row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f3f4f6;flex-wrap:wrap;gap:4px}.l10-row:last-child{border-bottom:none}.l10-rk{font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase}.l10-rv{font-size:14px;font-weight:600;color:#111}.l10-mono{font-family:monospace;color:'+pal.ac+'}.l10-grn{color:#059669}.l10-sec p{font-size:14px;color:#374151;line-height:1.8}.l10-sec ul{list-style:none}.l10-sec li{font-size:14px;color:#374151;line-height:2;padding-left:14px;position:relative}.l10-sec li::before{content:"\\2014";position:absolute;left:0;color:'+pal.ac+'}.l10-phone2{font-family:monospace;font-size:1.3rem;color:'+pal.ac+';font-weight:900}.l10-foot{text-align:center;padding:18px;font-size:11px;color:#6b7280;margin-top:12px}';
    return headHtml+'<style>'+css10+'</style></head><body><div class="l10-hdr"><h1 data-field="razao">'+razaoFmt+'</h1><div class="l10-sub" data-field="cnpj">'+cnpjFmt+'</div></div><div class="l10-wrap">'+(phoneFmt?'<div class="l10-phone" data-field="phone">'+phoneFmt+'</div>':'')+'<div class="l10-sec"><h2>Registro Cadastral</h2><div class="l10-row"><span class="l10-rk">Denomina&ccedil;&atilde;o</span><span class="l10-rv" data-field="razao">'+razaoFmt+'</span></div><div class="l10-row"><span class="l10-rk">CNPJ</span><span class="l10-rv l10-mono" data-field="cnpj">'+cnpjFmt+'</span></div><div class="l10-row"><span class="l10-rk">Condi&ccedil;&atilde;o</span><span class="l10-rv l10-grn">'+situacaoFmt+'</span></div><div class="l10-row"><span class="l10-rk">Logradouro</span><span class="l10-rv">'+enderFmt+'</span></div><div class="l10-row"><span class="l10-rk">Bairro</span><span class="l10-rv">'+bairroFmt+'</span></div><div class="l10-row"><span class="l10-rk">Localidade/UF</span><span class="l10-rv">'+munFmt+'/'+ufFmt+'</span></div><div class="l10-row"><span class="l10-rk">CEP</span><span class="l10-rv">'+cepFmt+'</span></div><div class="l10-row"><span class="l10-rk">Canal Digital</span><span class="l10-rv">'+(emailFmt||'N/A')+'</span></div>'+(atividadeFmt?'<div class="l10-row"><span class="l10-rk">Atividade</span><span class="l10-rv">'+atividadeFmt+'</span></div>':'')+'</div><div class="l10-sec"><h2>Protocolo WABA</h2>'+(phoneFmt?'<p class="l10-phone" data-field="phone">'+phoneFmt+'</p>':'')+'<p>'+wabaText+'</p><p>'+wabaFoot+'</p></div><div class="l10-sec"><h2>Perfil Institucional</h2><p>'+sob+'</p></div><div class="l10-sec"><h2>Normas Operacionais</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="l10-sec"><h2>Prote&ccedil;&atilde;o de Dados</h2><p>'+priv+'</p></div><div class="l10-sec"><h2>Condi&ccedil;&otilde;es de Uso</h2><p>'+term+'</p></div></div><div class="l10-foot">'+razaoFmt+' &mdash; '+cnpjFmt+'</div>'+domScript+'</body></html>';
  }
  // -- LAYOUT 11: GRADIENT HEADER -- header grande gradiente, cards abaixo --
  else if (layoutType === 11) {
    var css11 = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#edf0f5;color:#111;min-height:100vh;font-size:15px;line-height:1.6}.l11-hero{background:linear-gradient(155deg,'+pal.ac+','+pal.ac+'88);padding:44px 24px;text-align:center;color:#fff}.l11-hero h1{font-size:2rem;font-weight:900;margin-bottom:6px}.l11-hero .l11-sub{font-size:12px;opacity:.85;font-family:monospace}.l11-hero .l11-ph{font-family:monospace;font-size:1.2rem;font-weight:900;margin-top:12px;background:rgba(255,255,255,.18);display:inline-block;padding:7px 18px;border-radius:24px}.l11-wrap{max-width:740px;margin:-20px auto 0;padding:0 18px 24px;position:relative;z-index:1}.l11-card{background:#fff;border-radius:12px;padding:22px;margin-bottom:14px;box-shadow:0 2px 6px rgba(0,0,0,.06)}.l11-card h2{font-size:12px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:1.2px;margin-bottom:12px;padding-bottom:7px;border-bottom:1px solid #edf0f5}.l11-row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f8fafc;flex-wrap:wrap;gap:3px}.l11-row:last-child{border-bottom:none}.l11-rk{font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase}.l11-rv{font-size:13px;font-weight:600;color:#0f172a}.l11-mono{font-family:monospace;color:'+pal.ac+'}.l11-grn{color:#047857}.l11-card p{font-size:13px;color:#475569;line-height:1.8}.l11-card ul{list-style:none}.l11-card li{font-size:13px;color:#475569;line-height:2;padding-left:12px;position:relative}.l11-card li::before{content:"\\25AA";position:absolute;left:0;color:'+pal.ac+';font-size:8px;top:7px}.l11-phone2{font-family:monospace;font-size:1.2rem;color:'+pal.ac+';font-weight:900}.l11-foot{text-align:center;padding:16px;font-size:10px;color:#64748b}';
    return headHtml+'<style>'+css11+'</style></head><body><div class="l11-hero"><h1 data-field="razao">'+razaoFmt+'</h1><div class="l11-sub" data-field="cnpj">'+cnpjFmt+'</div>'+(phoneFmt?'<div class="l11-ph" data-field="phone">'+phoneFmt+'</div>':'')+'</div><div class="l11-wrap"><div class="l11-card"><h2>Registro Cadastral</h2><div class="l11-row"><span class="l11-rk">Denomina&ccedil;&atilde;o</span><span class="l11-rv" data-field="razao">'+razaoFmt+'</span></div><div class="l11-row"><span class="l11-rk">CNPJ</span><span class="l11-rv l11-mono" data-field="cnpj">'+cnpjFmt+'</span></div><div class="l11-row"><span class="l11-rk">Condi&ccedil;&atilde;o</span><span class="l11-rv l11-grn">'+situacaoFmt+'</span></div><div class="l11-row"><span class="l11-rk">Logradouro</span><span class="l11-rv">'+enderFmt+'</span></div><div class="l11-row"><span class="l11-rk">Bairro</span><span class="l11-rv">'+bairroFmt+'</span></div><div class="l11-row"><span class="l11-rk">Localidade/UF</span><span class="l11-rv">'+munFmt+'/'+ufFmt+'</span></div><div class="l11-row"><span class="l11-rk">CEP</span><span class="l11-rv">'+cepFmt+'</span></div><div class="l11-row"><span class="l11-rk">Canal Digital</span><span class="l11-rv">'+(emailFmt||'N/A')+'</span></div>'+(atividadeFmt?'<div class="l11-row"><span class="l11-rk">Atividade</span><span class="l11-rv">'+atividadeFmt+'</span></div>':'')+'</div><div class="l11-card"><h2>Protocolo WABA</h2>'+(phoneFmt?'<p class="l11-phone2" data-field="phone">'+phoneFmt+'</p>':'')+'<p>'+wabaText+'</p><p>'+wabaFoot+'</p></div><div class="l11-card"><h2>Perfil Institucional</h2><p>'+sob+'</p></div><div class="l11-card"><h2>Normas Operacionais</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="l11-card"><h2>Prote&ccedil;&atilde;o de Dados</h2><p>'+priv+'</p></div><div class="l11-card"><h2>Condi&ccedil;&otilde;es de Uso</h2><p>'+term+'</p></div></div><div class="l11-foot">'+razaoFmt+' &mdash; '+cnpjFmt+'</div>'+domScript+'</body></html>';
  }

  // -- LAYOUT 12: COMPACT/DENSE -- fonte pequena, spacing apertado, profissional --
  else if (layoutType === 12) {
    var css12 = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#fff;color:#111;min-height:100vh;font-size:13px;line-height:1.5}.l12-hdr{background:#f8fafc;padding:18px 24px;border-bottom:2px solid '+pal.ac+';display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px}.l12-hdr h1{font-size:1.1rem;font-weight:800;color:#111}.l12-hdr .l12-meta{font-family:monospace;font-size:11px;color:'+pal.ac+'}.l12-wrap{max-width:900px;margin:0 auto;padding:18px 20px}.l12-phone{font-family:monospace;font-size:1.1rem;color:'+pal.ac+';font-weight:900;padding:10px 0;margin-bottom:14px;border-bottom:1px solid #e5e7eb}.l12-sec{margin-bottom:16px}.l12-sec h2{font-size:11px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #f1f5f9}.l12-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 16px}@media(max-width:640px){.l12-grid{grid-template-columns:1fr}}.l12-row{display:flex;justify-content:space-between;padding:4px 0;gap:4px}.l12-rk{font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase}.l12-rv{font-size:13px;font-weight:600;color:#111}.l12-mono{font-family:monospace;color:'+pal.ac+'}.l12-grn{color:#059669}.l12-sec p{font-size:12px;color:#374151;line-height:1.7}.l12-sec ul{list-style:none;display:grid;grid-template-columns:1fr 1fr;gap:2px}@media(max-width:640px){.l12-sec ul{grid-template-columns:1fr}}.l12-sec li{font-size:12px;color:#374151;line-height:1.8;padding-left:10px;position:relative}.l12-sec li::before{content:"\\2022";position:absolute;left:0;color:'+pal.ac+'}.l12-phone2{font-family:monospace;font-size:1.1rem;color:'+pal.ac+';font-weight:900}.l12-foot{text-align:center;padding:12px;font-size:10px;color:#6b7280;border-top:1px solid #f1f5f9;margin-top:12px}';
    return headHtml+'<style>'+css12+'</style></head><body><div class="l12-hdr"><h1 data-field="razao">'+razaoFmt+'</h1><div class="l12-meta" data-field="cnpj">'+cnpjFmt+'</div></div><div class="l12-wrap">'+(phoneFmt?'<div class="l12-phone" data-field="phone">'+phoneFmt+'</div>':'')+'<div class="l12-sec"><h2>Registro Cadastral</h2><div class="l12-grid"><div class="l12-row"><span class="l12-rk">Denomina&ccedil;&atilde;o</span><span class="l12-rv" data-field="razao">'+razaoFmt+'</span></div><div class="l12-row"><span class="l12-rk">CNPJ</span><span class="l12-rv l12-mono" data-field="cnpj">'+cnpjFmt+'</span></div><div class="l12-row"><span class="l12-rk">Condi&ccedil;&atilde;o</span><span class="l12-rv l12-grn">'+situacaoFmt+'</span></div><div class="l12-row"><span class="l12-rk">Logradouro</span><span class="l12-rv">'+enderFmt+'</span></div><div class="l12-row"><span class="l12-rk">Bairro</span><span class="l12-rv">'+bairroFmt+'</span></div><div class="l12-row"><span class="l12-rk">Localidade/UF</span><span class="l12-rv">'+munFmt+'/'+ufFmt+'</span></div><div class="l12-row"><span class="l12-rk">CEP</span><span class="l12-rv">'+cepFmt+'</span></div><div class="l12-row"><span class="l12-rk">Canal Digital</span><span class="l12-rv">'+(emailFmt||'N/A')+'</span></div>'+(atividadeFmt?'<div class="l12-row"><span class="l12-rk">Atividade</span><span class="l12-rv">'+atividadeFmt+'</span></div>':'')+'</div></div><div class="l12-sec"><h2>Protocolo WABA</h2>'+(phoneFmt?'<p class="l12-phone2" data-field="phone">'+phoneFmt+'</p>':'')+'<p>'+wabaText+'</p><p>'+wabaFoot+'</p></div><div class="l12-sec"><h2>Perfil Institucional</h2><p>'+sob+'</p></div><div class="l12-sec"><h2>Normas Operacionais</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="l12-sec"><h2>Prote&ccedil;&atilde;o de Dados</h2><p>'+priv+'</p></div><div class="l12-sec"><h2>Condi&ccedil;&otilde;es de Uso</h2><p>'+term+'</p></div></div><div class="l12-foot">'+razaoFmt+' &mdash; '+cnpjFmt+'</div>'+domScript+'</body></html>';
  }

  // -- LAYOUT 13: ASYMMETRIC -- 70% dados esquerda, 30% sidebar direita --
  else if (layoutType === 13) {
    var css13 = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#f9fafb;color:#111;min-height:100vh;font-size:15px;line-height:1.6}.l13-hdr{background:#fff;padding:24px 28px;border-bottom:1px solid #e5e7eb;text-align:center}.l13-hdr h1{font-size:1.7rem;font-weight:900;color:#111}.l13-hdr .l13-sub{font-size:12px;color:'+pal.ac+';margin-top:4px;font-family:monospace}.l13-body{display:grid;grid-template-columns:1fr 300px;max-width:1100px;margin:0 auto;padding:28px 20px;gap:24px}@media(max-width:860px){.l13-body{grid-template-columns:1fr;max-width:760px}}.l13-main .l13-sec{background:#fff;border-radius:8px;padding:22px;margin-bottom:16px;border:1px solid #e5e7eb}.l13-sec h2{font-size:13px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #f1f5f9}.l13-row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f8fafc;flex-wrap:wrap;gap:4px}.l13-row:last-child{border-bottom:none}.l13-rk{font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase}.l13-rv{font-size:14px;font-weight:600;color:#111}.l13-mono{font-family:monospace;color:'+pal.ac+'}.l13-grn{color:#059669}.l13-sec p{font-size:14px;color:#374151;line-height:1.8}.l13-sec ul{list-style:none}.l13-sec li{font-size:14px;color:#374151;line-height:2;padding-left:14px;position:relative}.l13-sec li::before{content:"\\2022";position:absolute;left:0;color:'+pal.ac+'}.l13-side{position:sticky;top:20px;align-self:start}.l13-side .l13-scard{background:#fff;border-radius:8px;padding:18px;margin-bottom:14px;border:1px solid #e5e7eb;text-align:center}.l13-side .l13-ph{font-family:monospace;font-size:1.3rem;color:'+pal.ac+';font-weight:900}.l13-side .l13-slbl{font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;margin-top:6px}.l13-phone2{font-family:monospace;font-size:1.3rem;color:'+pal.ac+';font-weight:900}.l13-foot{text-align:center;padding:18px;font-size:11px;color:#6b7280}';
    return headHtml+'<style>'+css13+'</style></head><body><div class="l13-hdr"><h1 data-field="razao">'+razaoFmt+'</h1><div class="l13-sub" data-field="cnpj">'+cnpjFmt+'</div></div><div class="l13-body"><div class="l13-main"><div class="l13-sec"><h2>Registro Cadastral</h2><div class="l13-row"><span class="l13-rk">Denomina&ccedil;&atilde;o</span><span class="l13-rv" data-field="razao">'+razaoFmt+'</span></div><div class="l13-row"><span class="l13-rk">CNPJ</span><span class="l13-rv l13-mono" data-field="cnpj">'+cnpjFmt+'</span></div><div class="l13-row"><span class="l13-rk">Condi&ccedil;&atilde;o</span><span class="l13-rv l13-grn">'+situacaoFmt+'</span></div><div class="l13-row"><span class="l13-rk">Logradouro</span><span class="l13-rv">'+enderFmt+'</span></div><div class="l13-row"><span class="l13-rk">Bairro</span><span class="l13-rv">'+bairroFmt+'</span></div><div class="l13-row"><span class="l13-rk">Localidade/UF</span><span class="l13-rv">'+munFmt+'/'+ufFmt+'</span></div><div class="l13-row"><span class="l13-rk">CEP</span><span class="l13-rv">'+cepFmt+'</span></div><div class="l13-row"><span class="l13-rk">Canal Digital</span><span class="l13-rv">'+(emailFmt||'N/A')+'</span></div>'+(atividadeFmt?'<div class="l13-row"><span class="l13-rk">Atividade</span><span class="l13-rv">'+atividadeFmt+'</span></div>':'')+'</div><div class="l13-sec"><h2>Protocolo WABA</h2>'+(phoneFmt?'<p class="l13-phone2" data-field="phone">'+phoneFmt+'</p>':'')+'<p>'+wabaText+'</p><p>'+wabaFoot+'</p></div><div class="l13-sec"><h2>Perfil Institucional</h2><p>'+sob+'</p></div><div class="l13-sec"><h2>Normas Operacionais</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="l13-sec"><h2>Prote&ccedil;&atilde;o de Dados</h2><p>'+priv+'</p></div><div class="l13-sec"><h2>Condi&ccedil;&otilde;es de Uso</h2><p>'+term+'</p></div></div><div class="l13-side">'+(phoneFmt?'<div class="l13-scard"><div class="l13-ph" data-field="phone">'+phoneFmt+'</div><div class="l13-slbl">Canal Oficial</div></div>':'')+'<div class="l13-scard"><div class="l13-slbl">Empresa</div><p style="font-size:13px;margin-top:6px">'+razaoFmt+'</p></div><div class="l13-scard"><div class="l13-slbl">Situa&ccedil;&atilde;o</div><p style="font-size:14px;font-weight:700;color:#059669;margin-top:6px">'+situacaoFmt+'</p></div></div></div><div class="l13-foot">'+razaoFmt+' &mdash; '+cnpjFmt+'</div>'+domScript+'</body></html>';
  }

  // -- LAYOUT 14: MAGAZINE -- hero grande, estilo artigo, serif --
  else if (layoutType === 14) {
    var css14 = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#fefefe;color:#1a1a1a;min-height:100vh;font-size:16px;line-height:1.8}.l14-hero{background:linear-gradient(170deg,#f1f5f9 0%,#fefefe 100%);padding:56px 24px 36px;text-align:center;border-bottom:1px solid #e2e8f0}.l14-hero h1{font-size:2.2rem;font-weight:900;color:#0f172a;letter-spacing:-0.4px;margin-bottom:6px}.l14-hero .l14-sub{font-size:13px;color:#64748b;font-style:italic}.l14-hero .l14-cnpj{font-family:monospace;font-size:12px;color:'+pal.ac+';margin-top:6px}.l14-hero .l14-ph{font-family:monospace;font-size:1.2rem;color:'+pal.ac+';font-weight:900;margin-top:12px}.l14-wrap{max-width:660px;margin:0 auto;padding:32px 22px}@media(max-width:640px){.l14-wrap{padding:20px 14px}}.l14-sec{margin-bottom:28px}.l14-sec h2{font-size:13px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:1.2px;margin-bottom:12px;padding-bottom:7px;border-bottom:2px solid '+pal.ac+'18}.l14-row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f4f4f4;flex-wrap:wrap;gap:3px}.l14-row:last-child{border-bottom:none}.l14-rk{font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase}.l14-rv{font-size:14px;font-weight:600;color:#1a1a1a}.l14-mono{font-family:monospace;color:'+pal.ac+'}.l14-grn{color:#047857}.l14-sec p{font-size:14px;color:#475569;line-height:1.9}.l14-sec ul{list-style:none}.l14-sec li{font-size:14px;color:#475569;line-height:2;padding-left:14px;position:relative}.l14-sec li::before{content:"\\2014";position:absolute;left:0;color:'+pal.ac+'}.l14-phone2{font-family:monospace;font-size:1.2rem;color:'+pal.ac+';font-weight:900}.l14-foot{text-align:center;padding:20px;font-size:11px;color:#64748b;border-top:2px solid #f1f5f9;margin-top:16px}';
    return headHtml+'<style>'+css14+'</style></head><body><div class="l14-hero"><h1 data-field="razao">'+razaoFmt+'</h1><div class="l14-sub">Registro Empresarial &mdash; Informa&ccedil;&otilde;es Institucionais</div><div class="l14-cnpj" data-field="cnpj">'+cnpjFmt+'</div>'+(phoneFmt?'<div class="l14-ph" data-field="phone">'+phoneFmt+'</div>':'')+'</div><div class="l14-wrap"><div class="l14-sec"><h2>Registro Cadastral</h2><div class="l14-row"><span class="l14-rk">Denomina&ccedil;&atilde;o</span><span class="l14-rv" data-field="razao">'+razaoFmt+'</span></div><div class="l14-row"><span class="l14-rk">CNPJ</span><span class="l14-rv l14-mono" data-field="cnpj">'+cnpjFmt+'</span></div><div class="l14-row"><span class="l14-rk">Condi&ccedil;&atilde;o</span><span class="l14-rv l14-grn">'+situacaoFmt+'</span></div><div class="l14-row"><span class="l14-rk">Logradouro</span><span class="l14-rv">'+enderFmt+'</span></div><div class="l14-row"><span class="l14-rk">Bairro</span><span class="l14-rv">'+bairroFmt+'</span></div><div class="l14-row"><span class="l14-rk">Localidade/UF</span><span class="l14-rv">'+munFmt+'/'+ufFmt+'</span></div><div class="l14-row"><span class="l14-rk">CEP</span><span class="l14-rv">'+cepFmt+'</span></div><div class="l14-row"><span class="l14-rk">Canal Digital</span><span class="l14-rv">'+(emailFmt||'N/A')+'</span></div>'+(atividadeFmt?'<div class="l14-row"><span class="l14-rk">Atividade</span><span class="l14-rv">'+atividadeFmt+'</span></div>':'')+'</div><div class="l14-sec"><h2>Protocolo WABA</h2>'+(phoneFmt?'<p class="l14-phone2" data-field="phone">'+phoneFmt+'</p>':'')+'<p>'+wabaText+'</p><p>'+wabaFoot+'</p></div><div class="l14-sec"><h2>Perfil Institucional</h2><p>'+sob+'</p></div><div class="l14-sec"><h2>Normas Operacionais</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="l14-sec"><h2>Prote&ccedil;&atilde;o de Dados</h2><p>'+priv+'</p></div><div class="l14-sec"><h2>Condi&ccedil;&otilde;es de Uso</h2><p>'+term+'</p></div></div><div class="l14-foot">'+razaoFmt+' &mdash; CNPJ '+cnpjFmt+'</div>'+domScript+'</body></html>';
  }

  // -- FALLBACK: layout simples padrão --
  else {
    var cssFb = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#fafbfc;color:#111;min-height:100vh;font-size:15px;line-height:1.7}.fb-wrap{max-width:680px;margin:0 auto;padding:32px 22px}.fb-hdr{text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:3px solid '+pal.ac+'}.fb-hdr h1{font-size:1.7rem;font-weight:900}.fb-hdr .fb-sub{font-family:monospace;font-size:12px;color:'+pal.ac+';margin-top:3px}.fb-phone{text-align:center;font-family:monospace;font-size:1.3rem;color:'+pal.ac+';font-weight:900;margin-bottom:22px}.fb-sec{margin-bottom:20px}.fb-sec h2{font-size:12px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:1.2px;margin-bottom:9px;padding-bottom:5px;border-bottom:1px solid #e2e8f0}.fb-row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f4f6f9;flex-wrap:wrap;gap:3px}.fb-row:last-child{border-bottom:none}.fb-rk{font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase}.fb-rv{font-size:13px;font-weight:600;color:#0f172a}.fb-mono{font-family:monospace;color:'+pal.ac+'}.fb-grn{color:#047857}.fb-sec p{font-size:13px;color:#475569;line-height:1.8}.fb-sec ul{list-style:none}.fb-sec li{font-size:13px;color:#475569;line-height:2;padding-left:12px;position:relative}.fb-sec li::before{content:"\\25B8";position:absolute;left:0;color:'+pal.ac+';font-size:10px}.fb-phone2{font-family:monospace;font-size:1.2rem;color:'+pal.ac+';font-weight:900}.fb-foot{text-align:center;padding:14px;font-size:10px;color:#64748b;border-top:1px solid #e2e8f0;margin-top:14px}';
    return headHtml+'<style>'+cssFb+'</style></head><body><div class="fb-wrap"><div class="fb-hdr"><h1 data-field="razao">'+razaoFmt+'</h1><div class="fb-sub" data-field="cnpj">'+cnpjFmt+'</div></div>'+(phoneFmt?'<div class="fb-phone" data-field="phone">'+phoneFmt+'</div>':'')+'<div class="fb-sec"><h2>Registro Cadastral</h2><div class="fb-row"><span class="fb-rk">Denomina&ccedil;&atilde;o</span><span class="fb-rv" data-field="razao">'+razaoFmt+'</span></div><div class="fb-row"><span class="fb-rk">CNPJ</span><span class="fb-rv fb-mono" data-field="cnpj">'+cnpjFmt+'</span></div><div class="fb-row"><span class="fb-rk">Condi&ccedil;&atilde;o</span><span class="fb-rv fb-grn">'+situacaoFmt+'</span></div><div class="fb-row"><span class="fb-rk">Logradouro</span><span class="fb-rv">'+enderFmt+'</span></div><div class="fb-row"><span class="fb-rk">Bairro</span><span class="fb-rv">'+bairroFmt+'</span></div><div class="fb-row"><span class="fb-rk">Localidade/UF</span><span class="fb-rv">'+munFmt+'/'+ufFmt+'</span></div><div class="fb-row"><span class="fb-rk">CEP</span><span class="fb-rv">'+cepFmt+'</span></div><div class="fb-row"><span class="fb-rk">Canal Digital</span><span class="fb-rv">'+(emailFmt||'N/A')+'</span></div>'+(atividadeFmt?'<div class="fb-row"><span class="fb-rk">Atividade</span><span class="fb-rv">'+atividadeFmt+'</span></div>':'')+'</div><div class="fb-sec"><h2>Protocolo WABA</h2>'+(phoneFmt?'<p class="fb-phone2" data-field="phone">'+phoneFmt+'</p>':'')+'<p>'+wabaText+'</p><p>'+wabaFoot+'</p></div><div class="fb-sec"><h2>Perfil Institucional</h2><p>'+sob+'</p></div><div class="fb-sec"><h2>Normas Operacionais</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="fb-sec"><h2>Prote&ccedil;&atilde;o de Dados</h2><p>'+priv+'</p></div><div class="fb-sec"><h2>Condi&ccedil;&otilde;es de Uso</h2><p>'+term+'</p></div><div class="fb-foot">'+razaoFmt+' &mdash; '+cnpjFmt+'</div></div>'+domScript+'</body></html>';
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

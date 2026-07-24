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
    function(n){ return 'A organização '+n+' promove atendimento consultivo e receptivo por meio de EMAIL certificado, obedecendo integralmente às políticas vigentes da Meta e à legislação brasileira de proteção de dados.'; },
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
    {rs:'RAZ\u00c3O SOCIAL',cnpj:'CNPJ',sit:'SITUA\u00c7\u00c3O',end:'ENDERE\u00c7O',cnae:'CNAE \u2014 ATIVIDADE PRINCIPAL',tel:'TELEFONE',email:'EMAIL',mun:'MUNIC\u00cdPIO/UF',waba:'Rota WABA \u2014 Utility Receptivo'},
    {rs:'RAZ\u00c3O SOCIAL',cnpj:'CNPJ',sit:'SITUA\u00c7\u00c3O CADASTRAL',end:'ENDERE\u00c7O',cnae:'ATIVIDADE ECON\u00d4MICA',tel:'TELEFONE',email:'EMAIL',mun:'MUNIC\u00cdPIO/UF',waba:'M\u00f3dulo WABA \u2014 Canal Utility'},
    {rs:'RAZ\u00c3O SOCIAL',cnpj:'CNPJ',sit:'SITUA\u00c7\u00c3O',end:'ENDERE\u00c7O',cnae:'CNAE PRINCIPAL',tel:'TELEFONE',email:'EMAIL',mun:'MUNIC\u00cdPIO/UF',waba:'Interface WABA \u2014 Receptivo'},
    {rs:'RAZ\u00c3O SOCIAL',cnpj:'CNPJ',sit:'SITUA\u00c7\u00c3O CADASTRAL',end:'ENDERE\u00c7O',cnae:'ATIVIDADE PRINCIPAL',tel:'TELEFONE',email:'EMAIL',mun:'MUNIC\u00cdPIO/UF',waba:'Gateway WABA \u2014 Modo Utility'},
    {rs:'RAZ\u00c3O SOCIAL',cnpj:'CNPJ',sit:'SITUA\u00c7\u00c3O',end:'ENDERE\u00c7O',cnae:'CNAE / ATIVIDADE',tel:'TELEFONE',email:'EMAIL',mun:'MUNIC\u00cdPIO/UF',waba:'WhatsApp API \u2014 Canal Utility'},
    {rs:'RAZ\u00c3O SOCIAL',cnpj:'CNPJ',sit:'SITUA\u00c7\u00c3O',end:'ENDERE\u00c7O',cnae:'ATIVIDADE REGISTRADA',tel:'TELEFONE',email:'EMAIL',mun:'MUNIC\u00cdPIO/UF',waba:'Protocolo WABA \u2014 Utility Receptivo'},
    {rs:'RAZ\u00c3O SOCIAL',cnpj:'CNPJ',sit:'SITUA\u00c7\u00c3O',end:'ENDERE\u00c7O',cnae:'CNAE',tel:'TELEFONE',email:'EMAIL',mun:'MUNIC\u00cdPIO/UF',waba:'Servi\u00e7o WABA \u2014 Canal Receptivo'},
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

  var layoutType = templateIndex % 72; // 0-7 = templates únicos, 8+ = gerador combinatório

  var accents = ['#1e40af','#047857','#a16207','#6d28d9','#b91c1c','#0e7490','#a21caf','#d97706','#3730a3','#166534','#c2410c','#5b21b6','#155e75','#9f1239','#065f46','#92400e','#1d4ed8','#15803d','#7c3aed','#b45309'];
  var ac = accents[templateIndex % 20];
  var pal = {ac: ac, bg: '#ffffff', bg2: '#f8fafc', txt: '#111827'};

  var fonts = [
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
    'Georgia,"Times New Roman",serif',
    '"Inter",system-ui,sans-serif',
    '"Roboto Slab",Georgia,serif',
    '"Source Sans Pro","Helvetica Neue",system-ui,sans-serif',
  ];
  var font = fonts[templateIndex % 5];

  // Dados extras pra validação Meta
  var porteInfo = porteFmt ? '<div class="rw"><span class="rk">Porte</span><span class="rv">'+porteFmt+'</span></div>' : '';
  var natJurInfo = natJurFmt ? '<div class="rw"><span class="rk">Natureza Jur&iacute;dica</span><span class="rv">'+natJurFmt+'</span></div>' : '';
  var cnaeInfo = atividadeFmt ? '<div class="rw"><span class="rk">CNAE</span><span class="rv">'+atividadeFmt+'</span></div>' : '';
  var porteInfoTd = porteFmt ? '<tr><td>Porte</td><td>'+porteFmt+'</td></tr>' : '';
  var natJurInfoTd = natJurFmt ? '<tr><td>Natureza Jur&iacute;dica</td><td>'+natJurFmt+'</td></tr>' : '';
  var cnaeInfoTd = atividadeFmt ? '<tr><td>CNAE</td><td>'+atividadeFmt+'</td></tr>' : '';

  var headHtml = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">'+metaTag+ogTags+'<title>'+razaoFmt+'</title>';

  // Variantes de estrutura — dados aparecem de forma natural, não como ficha
  var vi2 = templateIndex % 7;

  // Seção "sobre" que incorpora dados naturalmente
  var aboutNatural = [
    '<p>'+razaoFmt+' (CNPJ '+cnpjFmt+') &eacute; uma empresa com sede em '+munFmt+'/'+ufFmt+', inscrita e regular junto &agrave; Receita Federal, com situa&ccedil;&atilde;o cadastral '+situacaoFmt+'. '+(atividadeFmt?'Atua no segmento de '+atividadeFmt+'. ':'')+'Mant&eacute;m canal de atendimento via WhatsApp Business exclusivamente para demandas receptivas.</p>',
    '<p>Somos a '+razaoFmt+', empresa brasileira registrada sob o CNPJ '+cnpjFmt+', localizada em '+munFmt+' &mdash; '+ufFmt+'. '+(atividadeFmt?'Nossa atividade principal &eacute; '+atividadeFmt+'. ':'')+'Operamos em conformidade com a legisla&ccedil;&atilde;o vigente e as pol&iacute;ticas da Meta Platforms.</p>',
    '<p>A '+razaoFmt+' &eacute; pessoa jur&iacute;dica regularmente constitu&iacute;da (CNPJ '+cnpjFmt+'), com domic&iacute;lio em '+fullAddress+'. '+(atividadeFmt?'Segmento: '+atividadeFmt+'. ':'')+'Nosso canal digital destina-se ao suporte informativo e atendimento ao cliente.</p>',
    '<p>Fundada e sediada em '+munFmt+'/'+ufFmt+', a '+razaoFmt+' (CNPJ: '+cnpjFmt+') mant&eacute;m atividades regulares no mercado brasileiro. '+(atividadeFmt?'&Aacute;rea de atua&ccedil;&atilde;o: '+atividadeFmt+'. ':'')+'Disponibilizamos atendimento receptivo via WhatsApp para nossos clientes e parceiros.</p>',
    '<p>'+razaoFmt+' &mdash; CNPJ '+cnpjFmt+' &mdash; &eacute; empresa ativa, com base operacional em '+munFmt+'/'+ufFmt+'. '+(atividadeFmt?'Ramo: '+atividadeFmt+'. ':'')+'O contato via WhatsApp Business &eacute; destinado exclusivamente ao atendimento de solicita&ccedil;&otilde;es volunt&aacute;rias.</p>',
    '<p>Com registro ativo na Receita Federal sob CNPJ '+cnpjFmt+', a '+razaoFmt+' opera em '+munFmt+'/'+ufFmt+(atividadeFmt?' no segmento de '+atividadeFmt:'')+'. Nosso compromisso &eacute; oferecer atendimento transparente e receptivo atrav&eacute;s de canais digitais oficiais.</p>',
    '<p>Empresa '+razaoFmt+', inscrita no CNPJ '+cnpjFmt+', com endere&ccedil;o em '+fullAddress+'. '+(atividadeFmt?'Atividade econ&ocirc;mica: '+atividadeFmt+'. ':'')+'Atendemos exclusivamente por demanda do pr&oacute;prio cliente, sem pr&aacute;ticas de contato ativo.</p>',
  ][vi2];

  // Seção contato/whatsapp natural
  var contactNatural = (phoneFmt ? '<p>Para entrar em contato, utilize nosso WhatsApp Business: <strong>'+phoneFmt+'</strong>. Este canal opera exclusivamente de forma receptiva &mdash; apenas respondemos mensagens iniciadas pelo pr&oacute;prio cliente.</p>' : '')+'<p>'+wabaText+'</p><p><small>'+wabaFoot+'</small></p>';

  // Compliance compacto
  var complianceCompact = '<p>'+sob+'</p><p><em>Diretrizes: </em>'+atn.join(' ') +'</p><p><small>Privacidade: '+priv+'</small></p><p><small>Termos: '+term+'</small></p>';

  // Dados em formato de tabela (pra layouts que usam tabela)
  var tblData = '<table><tr><td>Raz&atilde;o Social</td><td>'+razaoFmt+'</td></tr><tr><td>CNPJ</td><td>'+cnpjFmt+'</td></tr><tr><td>Situa&ccedil;&atilde;o</td><td>'+situacaoFmt+'</td></tr>'+(porteFmt?'<tr><td>Porte</td><td>'+porteFmt+'</td></tr>':'')+(natJurFmt?'<tr><td>Natureza Jur&iacute;dica</td><td>'+natJurFmt+'</td></tr>':'')+'<tr><td>Endere&ccedil;o</td><td>'+fullAddress+'</td></tr>'+(emailFmt?'<tr><td>Email</td><td>'+emailFmt+'</td></tr>':'')+(atividadeFmt?'<tr><td>Atividade</td><td>'+atividadeFmt+'</td></tr>':'')+(phoneFmt?'<tr><td>WhatsApp</td><td>'+phoneFmt+'</td></tr>':'')+'</table>';

  // ══════ LAYOUT 0: SITE INSTITUCIONAL CLÁSSICO ══════
  if (layoutType === 0) {
    var css='*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#fff;color:#333;line-height:1.8;font-size:16px}header{background:'+ac+';color:#fff;padding:20px 32px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px}header h1{font-size:1.4rem;font-weight:700}header span{font-size:12px;opacity:.85}.banner{background:#f8fafc;padding:48px 32px;text-align:center;border-bottom:1px solid #e5e7eb}.banner h2{font-size:2.4rem;font-weight:900;color:#111;margin-bottom:8px}.banner p{font-size:16px;color:#6b7280;max-width:600px;margin:0 auto}'+(phoneFmt?'.banner .phone{font-family:monospace;font-size:1.5rem;color:'+ac+';font-weight:800;margin-top:16px}':'')+'main{max-width:800px;margin:0 auto;padding:40px 24px}section{margin-bottom:36px}h3{font-size:1.2rem;color:#111;margin-bottom:12px;font-weight:700}p{margin-bottom:12px}small{color:#6b7280;font-size:13px}table{width:100%;border-collapse:collapse;margin:12px 0}td{padding:10px 8px;border-bottom:1px solid #f1f5f9;font-size:14px}td:first-child{font-weight:700;color:#6b7280;width:160px}footer{background:#111;color:#9ca3af;text-align:center;padding:20px;font-size:12px}';
    return headHtml+'<style>'+css+'</style></head><body><header><h1>'+razaoFmt+'</h1><span>'+munFmt+'/'+ufFmt+'</span></header><div class="banner"><h2 data-field="razao">'+razaoFmt+'</h2><p>'+(atividadeFmt||'Empresa regularmente constitu&iacute;da')+'</p>'+(phoneFmt?'<div class="phone" data-field="phone">'+phoneFmt+'</div>':'')+'</div><main><section><h3>Sobre N&oacute;s</h3>'+aboutNatural+'</section><section><h3>Dados Cadastrais</h3>'+tblData+'</section><section><h3>Atendimento</h3>'+contactNatural+'</section><section><h3>Pol&iacute;ticas e Conformidade</h3>'+complianceCompact+'</section></main><footer>&copy; '+razaoFmt+' &mdash; CNPJ '+cnpjFmt+' &mdash; Todos os direitos reservados</footer>'+domScript+'</body></html>';
  }

  // ══════ LAYOUT 1: ONE-PAGE MODERNO ══════
  else if (layoutType === 1) {
    var css='*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#fff;color:#1a1a1a;line-height:1.9;font-size:16px}.hero{min-height:40vh;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:60px 24px;background:linear-gradient(160deg,#f8fafc 0%,#e2e8f0 100%)}.hero h1{font-size:2.6rem;font-weight:900;color:#0f172a;margin-bottom:8px}.hero .tagline{font-size:1.1rem;color:#475569;margin-bottom:16px}'+(phoneFmt?'.hero .cta{background:'+ac+';color:#fff;padding:12px 32px;border-radius:8px;font-size:1rem;font-weight:700;text-decoration:none;display:inline-block;margin-top:8px;font-family:monospace}':'')+'main{max-width:720px;margin:0 auto;padding:40px 24px}h2{font-size:1.4rem;color:#0f172a;margin:36px 0 14px;font-weight:700}p{margin-bottom:14px}em{color:#6b7280;font-style:normal;font-size:14px}table{width:100%;border-collapse:collapse;margin:12px 0;font-size:15px}td{padding:10px 8px;border-bottom:1px solid #f1f5f9}td:first-child{font-weight:600;color:#475569;width:180px}footer{border-top:1px solid #e5e7eb;text-align:center;padding:24px;font-size:13px;color:#6b7280;margin-top:40px}';
    return headHtml+'<style>'+css+'</style></head><body><div class="hero"><h1 data-field="razao">'+razaoFmt+'</h1><p class="tagline">'+munFmt+'/'+ufFmt+' &mdash; CNPJ '+cnpjFmt+'</p>'+(phoneFmt?'<a class="cta" data-field="phone">'+phoneFmt+'</a>':'')+'</div><main><h2>Quem Somos</h2>'+aboutNatural+'<h2>Informa&ccedil;&otilde;es da Empresa</h2>'+tblData+'<h2>Fale Conosco</h2>'+contactNatural+'<h2>Compromisso e Transpar&ecirc;ncia</h2>'+complianceCompact+'</main><footer>'+razaoFmt+' &bull; '+cnpjFmt+' &bull; '+munFmt+'/'+ufFmt+'</footer>'+domScript+'</body></html>';
  }

  // ══════ LAYOUT 2: CORPORATIVO DARK ══════
  else if (layoutType === 2) {
    var css='*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#0f172a;color:#cbd5e1;line-height:1.8;font-size:15px}.top{padding:48px 24px;text-align:center;border-bottom:1px solid #1e293b}.top h1{font-size:2.4rem;font-weight:900;color:#f8fafc;letter-spacing:-1px}.top p{color:#94a3b8;margin-top:8px;font-size:14px}'+(phoneFmt?'.top .ph{color:'+ac+';font-family:monospace;font-size:1.4rem;font-weight:800;margin-top:14px;display:block}':'')+'main{max-width:720px;margin:0 auto;padding:36px 24px}h2{color:'+ac+';font-size:1rem;text-transform:uppercase;letter-spacing:2px;margin:32px 0 12px;font-weight:700}p{margin-bottom:12px}strong{color:#f1f5f9}table{width:100%;border-collapse:collapse;margin:12px 0}td{padding:10px 8px;border-bottom:1px solid #1e293b;font-size:14px;color:#cbd5e1}td:first-child{color:#94a3b8;font-weight:600;width:160px}small{color:#64748b;font-size:13px}footer{text-align:center;padding:20px;font-size:12px;color:#475569;border-top:1px solid #1e293b;margin-top:24px}';
    return headHtml+'<style>'+css+'</style></head><body><div class="top"><h1 data-field="razao">'+razaoFmt+'</h1><p>'+munFmt+'/'+ufFmt+' &mdash; Empresa '+situacaoFmt+'</p>'+(phoneFmt?'<span class="ph" data-field="phone">'+phoneFmt+'</span>':'')+'</div><main><h2>A Empresa</h2>'+aboutNatural+'<h2>Registro</h2>'+tblData+'<h2>Contato via WhatsApp</h2>'+contactNatural+'<h2>Compliance</h2>'+complianceCompact+'</main><footer>'+razaoFmt+' &mdash; '+cnpjFmt+'</footer>'+domScript+'</body></html>';
  }

  // ══════ LAYOUT 3: PORTAL COM SIDEBAR ══════
  else if (layoutType === 3) {
    var css='*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#f9fafb;color:#333;line-height:1.8;font-size:15px;display:flex;min-height:100vh}@media(max-width:768px){body{flex-direction:column}}aside{width:280px;background:#1e293b;color:#fff;padding:32px 20px;flex-shrink:0}@media(max-width:768px){aside{width:100%;padding:20px}}aside h1{font-size:1.2rem;font-weight:700;margin-bottom:8px}aside .meta{font-size:12px;color:#94a3b8;line-height:1.6;margin-bottom:16px}'+(phoneFmt?'aside .phone{font-family:monospace;color:'+ac+';font-size:1.1rem;font-weight:700;background:rgba(255,255,255,.06);padding:10px;border-radius:6px;text-align:center;margin-bottom:12px}':'')+'aside nav{margin-top:16px}aside nav a{display:block;color:#cbd5e1;text-decoration:none;padding:8px 0;border-bottom:1px solid #334155;font-size:13px}main{flex:1;padding:36px 28px;max-width:740px}h2{font-size:1.3rem;color:#111;margin:28px 0 12px;font-weight:700}p{margin-bottom:12px}table{width:100%;border-collapse:collapse;margin:12px 0}td{padding:9px 8px;border-bottom:1px solid #f1f5f9;font-size:14px}td:first-child{font-weight:600;color:#6b7280;width:160px}small{color:#6b7280;font-size:13px}';
    return headHtml+'<style>'+css+'</style></head><body><aside><h1 data-field="razao">'+razaoFmt+'</h1><div class="meta">CNPJ: '+cnpjFmt+'<br>'+munFmt+'/'+ufFmt+'<br>'+situacaoFmt+'</div>'+(phoneFmt?'<div class="phone" data-field="phone">'+phoneFmt+'</div>':'')+'<nav><a href="#">Sobre</a><a href="#">Dados</a><a href="#">Contato</a><a href="#">Pol&iacute;ticas</a></nav></aside><main><h2>Sobre a '+razaoFmt+'</h2>'+aboutNatural+'<h2>Dados da Empresa</h2>'+tblData+'<h2>Nosso Canal de Atendimento</h2>'+contactNatural+'<h2>Pol&iacute;ticas e Termos</h2>'+complianceCompact+'</main>'+domScript+'</body></html>';
  }

  // ══════ LAYOUT 4: EDITORIAL/BLOG ══════
  else if (layoutType === 4) {
    var css='*{margin:0;padding:0;box-sizing:border-box}body{font-family:Georgia,serif;background:#fff;color:#1a1a1a;line-height:2;font-size:17px}article{max-width:660px;margin:0 auto;padding:56px 24px}h1{font-size:2.4rem;font-weight:700;letter-spacing:-1px;margin-bottom:4px;color:#000}.byline{font-size:14px;color:#6b7280;margin-bottom:36px;font-family:sans-serif;border-bottom:1px solid #e5e7eb;padding-bottom:16px}h2{font-size:1.4rem;color:#000;margin:36px 0 12px;font-weight:600}p{margin-bottom:14px}em{font-style:normal;color:#6b7280;font-size:14px;font-family:sans-serif}'+(phoneFmt?'.contact-box{background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin:20px 0;text-align:center}.contact-box .num{font-family:monospace;font-size:1.4rem;color:'+ac+';font-weight:800}':'')+'small{color:#9ca3af;font-size:13px;font-family:sans-serif}footer{font-family:sans-serif;text-align:center;font-size:12px;color:#9ca3af;margin-top:48px;padding-top:16px;border-top:1px solid #f1f5f9}';
    return headHtml+'<style>'+css+'</style></head><body><article><h1 data-field="razao">'+razaoFmt+'</h1><div class="byline">'+munFmt+'/'+ufFmt+' &bull; CNPJ '+cnpjFmt+' &bull; '+situacaoFmt+'</div>'+aboutNatural+(phoneFmt?'<div class="contact-box"><p style="font-size:14px;color:#6b7280;margin-bottom:8px;font-family:sans-serif">WhatsApp Business</p><div class="num" data-field="phone">'+phoneFmt+'</div></div>':'')+'<h2>Dados Oficiais</h2>'+tblData+'<h2>Canal de Atendimento</h2>'+contactNatural+'<h2>Compliance e Privacidade</h2>'+complianceCompact+'<footer>'+razaoFmt+' &mdash; '+cnpjFmt+'</footer></article>'+domScript+'</body></html>';
  }

  // ══════ LAYOUT 5: CARTÃO DE VISITA DIGITAL ══════
  else if (layoutType === 5) {
    var css='*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:linear-gradient(160deg,#667eea22,#764ba222);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}.card{background:#fff;max-width:520px;width:100%;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.1);overflow:hidden}.card-top{background:'+ac+';padding:32px 28px;color:#fff;text-align:center}.card-top h1{font-size:1.8rem;font-weight:800;margin-bottom:4px}.card-top p{font-size:13px;opacity:.85}'+(phoneFmt?'.card-top .phone{font-family:monospace;font-size:1.3rem;font-weight:800;margin-top:12px;background:rgba(255,255,255,.2);display:inline-block;padding:8px 20px;border-radius:24px}':'')+ '.card-body{padding:28px}.card-body p{font-size:14px;color:#475569;margin-bottom:10px;line-height:1.7}.card-body strong{color:#111}table{width:100%;border-collapse:collapse;margin:12px 0;font-size:13px}td{padding:8px 4px;border-bottom:1px solid #f1f5f9}td:first-child{color:#6b7280;font-weight:600;width:140px}small{color:#9ca3af;font-size:12px}.card-foot{background:#f8fafc;padding:14px;text-align:center;font-size:11px;color:#6b7280}';
    return headHtml+'<style>'+css+'</style></head><body><div class="card"><div class="card-top"><h1 data-field="razao">'+razaoFmt+'</h1><p>'+munFmt+'/'+ufFmt+'</p>'+(phoneFmt?'<div class="phone" data-field="phone">'+phoneFmt+'</div>':'')+'</div><div class="card-body">'+aboutNatural+tblData+'<p><strong>Canal WhatsApp:</strong></p>'+contactNatural+'<small>'+priv+'</small></div><div class="card-foot">'+razaoFmt+' &mdash; '+cnpjFmt+'</div></div>'+domScript+'</body></html>';
  }

  // ══════ LAYOUT 6: GOVERNO/CONSULTA PÚBLICA ══════
  else if (layoutType === 6) {
    var css='*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#fff;color:#333;line-height:1.7;font-size:15px}.header{background:#fff;border-bottom:2px solid #111;padding:20px 24px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;max-width:860px;margin:0 auto}.header h1{font-size:1.1rem;font-weight:800;color:#111;text-transform:uppercase;letter-spacing:.5px}.header span{font-size:12px;color:#6b7280}.body{max-width:860px;margin:0 auto;padding:28px 24px}h2{font-size:14px;color:#111;text-transform:uppercase;letter-spacing:1px;margin:28px 0 12px;padding-bottom:8px;border-bottom:1px solid #ddd;font-weight:700}table{width:100%;border-collapse:collapse;margin:8px 0}th,td{text-align:left;padding:10px;border:1px solid #e5e7eb;font-size:14px}th{background:#f8fafc;font-weight:700;color:#374151;width:180px}p{margin-bottom:10px;font-size:14px}small{color:#6b7280;font-size:13px}'+(phoneFmt?'.phone-row{font-family:monospace;color:'+ac+';font-weight:700;font-size:1.1rem}':'')+'footer{max-width:860px;margin:0 auto;text-align:center;padding:16px 24px;font-size:11px;color:#9ca3af;border-top:2px solid #111}';
    return headHtml+'<style>'+css+'</style></head><body><div class="header"><h1 data-field="razao">'+razaoFmt+'</h1><span>Consulta Cadastral</span></div><div class="body"><h2>Dados do Estabelecimento</h2>'+tblData+'<h2>Informa&ccedil;&otilde;es Complementares</h2>'+aboutNatural+'<h2>Canal de Comunica&ccedil;&atilde;o</h2>'+contactNatural+'<h2>Pol&iacute;tica de Privacidade e Termos</h2>'+complianceCompact+'</div><footer>'+razaoFmt+' &mdash; CNPJ '+cnpjFmt+' &mdash; '+munFmt+'/'+ufFmt+'</footer>'+domScript+'</body></html>';
  }

  // ══════ LAYOUT 7: LANDING PAGE COM CTA ══════
  else if (layoutType === 7) {
    var css='*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#fff;color:#333;line-height:1.8;font-size:16px}.hero{background:linear-gradient(135deg,'+ac+' 0%,'+ac+'dd 100%);padding:56px 24px;text-align:center;color:#fff}.hero h1{font-size:2.6rem;font-weight:900;margin-bottom:8px}.hero p{font-size:16px;opacity:.9;max-width:500px;margin:0 auto 20px}'+(phoneFmt?'.hero .btn{display:inline-block;background:#fff;color:'+ac+';padding:14px 36px;border-radius:8px;font-size:1.1rem;font-weight:800;font-family:monospace;text-decoration:none}':'')+'main{max-width:760px;margin:0 auto;padding:40px 24px}h2{font-size:1.3rem;color:#111;margin:32px 0 12px;font-weight:700}p{margin-bottom:12px}table{width:100%;border-collapse:collapse;margin:12px 0}td{padding:10px 8px;border-bottom:1px solid #f1f5f9;font-size:15px}td:first-child{font-weight:600;color:#6b7280;width:170px}small{color:#6b7280;font-size:13px}footer{background:#f8fafc;text-align:center;padding:24px;font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb}';
    return headHtml+'<style>'+css+'</style></head><body><div class="hero"><h1 data-field="razao">'+razaoFmt+'</h1><p>'+(atividadeFmt||'Empresa regularmente constitu&iacute;da')+' &mdash; '+munFmt+'/'+ufFmt+'</p>'+(phoneFmt?'<a class="btn" data-field="phone">&#9742; '+phoneFmt+'</a>':'')+'</div><main><h2>Sobre a Empresa</h2>'+aboutNatural+'<h2>Dados Oficiais</h2>'+tblData+'<h2>Atendimento via WhatsApp</h2>'+contactNatural+'<h2>Termos e Privacidade</h2>'+complianceCompact+'</main><footer>&copy; '+razaoFmt+' &mdash; CNPJ '+cnpjFmt+'</footer>'+domScript+'</body></html>';
  }

  // ══════ LAYOUT 8+: GERADOR COMBINATÓRIO ══════
  else {
    var seed = templateIndex * 7 + 13;
    var pick = function(arr) { return arr[seed++ % arr.length]; };

    var hdrs = [
      function(){ return '<div style="background:linear-gradient(135deg,'+ac+','+ac+'bb);color:#fff;padding:40px 24px;text-align:center"><h1 style="font-size:2.2rem;font-weight:900;margin:0" data-field="razao">'+razaoFmt+'</h1><p style="font-size:14px;opacity:.85;margin-top:6px">'+munFmt+'/'+ufFmt+' &mdash; CNPJ '+cnpjFmt+'</p>'+(phoneFmt?'<p style="font-family:monospace;font-size:1.3rem;font-weight:800;margin-top:14px" data-field="phone">'+phoneFmt+'</p>':'')+'</div>'; },
      function(){ return '<div style="background:#0f172a;color:#fff;padding:28px 24px;text-align:center"><h1 style="font-size:2rem;font-weight:900;margin:0" data-field="razao">'+razaoFmt+'</h1><p style="font-size:13px;color:#94a3b8;margin-top:6px">CNPJ '+cnpjFmt+' &bull; '+munFmt+'/'+ufFmt+'</p>'+(phoneFmt?'<p style="font-family:monospace;color:'+ac+';font-size:1.2rem;font-weight:800;margin-top:10px" data-field="phone">'+phoneFmt+'</p>':'')+'</div>'; },
      function(){ return '<div style="background:'+ac+';color:#fff;padding:20px 24px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><h1 style="font-size:1.4rem;font-weight:800;margin:0" data-field="razao">'+razaoFmt+'</h1><span style="font-size:12px;opacity:.9" data-field="cnpj">'+cnpjFmt+(phoneFmt?' | '+phoneFmt:'')+'</span></div>'; },
      function(){ return '<div style="padding:40px 24px;text-align:center;border-bottom:3px solid '+ac+'"><h1 style="font-size:2.4rem;font-weight:900;color:#111;margin:0" data-field="razao">'+razaoFmt+'</h1><p style="font-size:14px;color:#6b7280;margin-top:6px">'+munFmt+'/'+ufFmt+' &mdash; CNPJ '+cnpjFmt+'</p>'+(phoneFmt?'<p style="font-family:monospace;font-size:1.3rem;color:'+ac+';font-weight:800;margin-top:12px" data-field="phone">'+phoneFmt+'</p>':'')+'</div>'; },
      function(){ return '<div style="background:linear-gradient(160deg,#1e293b,#334155);padding:44px 24px;text-align:center;color:#fff"><h1 style="font-size:2.2rem;font-weight:900;margin:0" data-field="razao">'+razaoFmt+'</h1><p style="color:#94a3b8;font-size:15px;margin-top:8px">'+(atividadeFmt||'Empresa')+' &mdash; '+munFmt+'/'+ufFmt+'</p>'+(phoneFmt?'<p style="font-family:monospace;color:'+ac+';font-size:1.3rem;font-weight:800;margin-top:14px;background:rgba(255,255,255,.08);display:inline-block;padding:8px 20px;border-radius:6px" data-field="phone">'+phoneFmt+'</p>':'')+'</div>'; },
    ];

    var bodyParts = [
      '<h2>Sobre</h2>'+aboutNatural+'<h2>Dados</h2>'+tblData+'<h2>Contato</h2>'+contactNatural+'<h2>Pol&iacute;ticas</h2>'+complianceCompact,
      '<h2>A Empresa</h2>'+aboutNatural+'<h2>Atendimento WhatsApp</h2>'+contactNatural+'<h2>Registro Cadastral</h2>'+tblData+'<h2>Termos e Privacidade</h2>'+complianceCompact,
      '<h2>Quem Somos</h2>'+aboutNatural+'<h2>Nosso Canal</h2>'+contactNatural+'<h2>Informa&ccedil;&otilde;es Oficiais</h2>'+tblData+'<h2>Compliance</h2>'+complianceCompact,
      '<h2>Informa&ccedil;&otilde;es</h2>'+tblData+'<h2>Sobre N&oacute;s</h2>'+aboutNatural+'<h2>WhatsApp Business</h2>'+contactNatural+'<h2>Privacidade</h2>'+complianceCompact,
    ];

    var bodyCss = [
      'h2{font-size:1.3rem;color:#111;margin:32px 0 12px;font-weight:700}',
      'h2{font-size:1rem;color:'+ac+';text-transform:uppercase;letter-spacing:1.5px;margin:32px 0 12px;font-weight:700}',
      'h2{font-size:1.2rem;color:#111;margin:32px 0 12px;font-weight:700;padding-bottom:8px;border-bottom:1px solid #e5e7eb}',
      'h2{font-size:1.1rem;color:'+ac+';margin:32px 0 12px;font-weight:700;padding-left:12px;border-left:3px solid '+ac+'}',
    ];

    var bgs = ['#fff','#f9fafb','#f8fafc','#fffbeb','#fefce8'];
    var foots = [
      '<div style="background:#0f172a;color:#94a3b8;text-align:center;padding:16px;font-size:12px;margin-top:32px">'+razaoFmt+' &mdash; CNPJ '+cnpjFmt+'</div>',
      '<div style="text-align:center;font-size:12px;color:#9ca3af;margin-top:32px;padding:16px;border-top:1px solid #e5e7eb">&copy; '+razaoFmt+' &mdash; '+cnpjFmt+'</div>',
      '<div style="background:'+ac+';color:#fff;text-align:center;padding:14px;font-size:12px;margin-top:32px">'+razaoFmt+' &bull; '+munFmt+'/'+ufFmt+'</div>',
    ];

    var genCss = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:'+pick(bgs)+';color:#333;line-height:1.8;font-size:15px}main{max-width:740px;margin:0 auto;padding:32px 24px}p{margin-bottom:12px}strong{color:#111}small{color:#6b7280;font-size:13px}em{color:#6b7280;font-style:normal;font-size:14px}table{width:100%;border-collapse:collapse;margin:12px 0}td{padding:9px 8px;border-bottom:1px solid #f1f5f9;font-size:14px}td:first-child{font-weight:600;color:#6b7280;width:160px}'+pick(bodyCss);

    return headHtml+'<style>'+genCss+'</style></head><body>'+pick(hdrs)()+'<main>'+pick(bodyParts)+'</main>'+pick(foots)+domScript+'</body></html>';
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

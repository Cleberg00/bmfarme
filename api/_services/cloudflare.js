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

  var layoutType = templateIndex % 72; // 0-35 = templates fixos, 36-71 = gerador combinatório

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

  // Dados inline pra facilitar leitura pelo robô da Meta
  var infoBlock = '<p><strong>Raz&atilde;o Social:</strong> '+razaoFmt+'</p><p><strong>CNPJ:</strong> '+cnpjFmt+'</p><p><strong>Situa&ccedil;&atilde;o Cadastral:</strong> '+situacaoFmt+'</p>'+(porteFmt?'<p><strong>Porte:</strong> '+porteFmt+'</p>':'')+(natJurFmt?'<p><strong>Natureza Jur&iacute;dica:</strong> '+natJurFmt+'</p>':'')+'<p><strong>Endere&ccedil;o:</strong> '+fullAddress+'</p>'+(emailFmt?'<p><strong>Email:</strong> '+emailFmt+'</p>':'')+(atividadeFmt?'<p><strong>Atividade (CNAE):</strong> '+atividadeFmt+'</p>':'');
  var phoneBlock = phoneFmt ? '<p><strong>Telefone/WhatsApp:</strong> '+phoneFmt+'</p>' : '';
  var wabaInline = '<p>'+wabaText+'</p><p>'+wabaFoot+'</p>';
  var rulesInline = '<ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul>';

  // ══════ LAYOUT 0: PORTAL INSTITUCIONAL — header + artigo limpo ══════
  if (layoutType === 0) {
    var css='*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#fff;color:#333;line-height:1.8;font-size:15px}header{background:'+ac+';color:#fff;padding:24px 32px}header h1{font-size:1.6rem;font-weight:700}header p{font-size:13px;opacity:.85;margin-top:4px}main{max-width:800px;margin:0 auto;padding:32px 24px}h2{font-size:18px;color:#111;margin:28px 0 12px;border-bottom:1px solid #e5e7eb;padding-bottom:8px}p{margin-bottom:10px}strong{color:#111}ul{margin:8px 0 8px 20px}li{margin-bottom:6px}.phone-box{background:#f0f9ff;border:1px solid '+ac+'40;border-radius:8px;padding:16px;margin:16px 0;text-align:center;font-size:1.3rem;font-weight:700;color:'+ac+';font-family:monospace}footer{background:#f8fafc;border-top:1px solid #e5e7eb;padding:16px 32px;text-align:center;font-size:12px;color:#6b7280}';
    return headHtml+'<style>'+css+'</style></head><body><header><h1>'+razaoFmt+'</h1><p>CNPJ: '+cnpjFmt+' &mdash; '+munFmt+'/'+ufFmt+'</p></header><main><h2>Dados da Empresa</h2>'+infoBlock+phoneBlock+(phoneFmt?'<div class="phone-box" data-field="phone">'+phoneFmt+'</div>':'')+'<h2>Canal de Atendimento WhatsApp</h2><p>Canal oficial via WhatsApp Business para atendimento receptivo.</p>'+wabaInline+'<h2>Sobre N&oacute;s</h2><p>'+sob+'</p><h2>Pol&iacute;tica de Atendimento</h2>'+rulesInline+'<h2>Privacidade e Prote&ccedil;&atilde;o de Dados</h2><p>'+priv+'</p><h2>Termos de Uso</h2><p>'+term+'</p></main><footer>'+razaoFmt+' &mdash; CNPJ '+cnpjFmt+' &mdash; Todos os direitos reservados.</footer>'+domScript+'</body></html>';
  }

  // ══════ LAYOUT 1: FICHA COMERCIAL — visual simples tipo gov ══════
  else if (layoutType === 1) {
    var css='*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#f9fafb;color:#333;line-height:1.8;font-size:15px}.container{max-width:760px;margin:0 auto;padding:40px 24px}.title{font-size:1.8rem;font-weight:800;color:#111;margin-bottom:4px}.subtitle{font-size:13px;color:#6b7280;margin-bottom:24px}h2{font-size:16px;color:'+ac+';margin:24px 0 10px;font-weight:700}p{margin-bottom:10px}strong{color:#111}ul{margin:8px 0 8px 20px}li{margin-bottom:6px}.divider{border:none;border-top:1px solid #e5e7eb;margin:24px 0}.phone-highlight{font-family:monospace;font-size:1.4rem;color:'+ac+';font-weight:800;margin:12px 0;display:block}footer{text-align:center;font-size:11px;color:#9ca3af;margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb}';
    return headHtml+'<style>'+css+'</style></head><body><div class="container"><div class="title" data-field="razao">'+razaoFmt+'</div><div class="subtitle">CNPJ: '+cnpjFmt+' | '+munFmt+'/'+ufFmt+' | Situa&ccedil;&atilde;o: '+situacaoFmt+'</div><h2>Informa&ccedil;&otilde;es Cadastrais</h2>'+infoBlock+'<hr class="divider">'+(phoneFmt?'<h2>Contato Oficial</h2><span class="phone-highlight" data-field="phone">'+phoneFmt+'</span><p>WhatsApp Business &mdash; Atendimento receptivo</p>':'')+'<hr class="divider"><h2>Pol&iacute;tica do Canal WhatsApp</h2>'+wabaInline+'<h2>Quem Somos</h2><p>'+sob+'</p><h2>Regras de Atendimento</h2>'+rulesInline+'<h2>Privacidade (LGPD)</h2><p>'+priv+'</p><h2>Termos de Uso</h2><p>'+term+'</p><footer>'+razaoFmt+' &mdash; CNPJ '+cnpjFmt+'</footer></div>'+domScript+'</body></html>';
  }

  // ══════ LAYOUT 2: BLOG/ARTIGO — estilo editorial ══════
  else if (layoutType === 2) {
    var css='*{margin:0;padding:0;box-sizing:border-box}body{font-family:Georgia,serif;background:#fff;color:#222;line-height:1.9;font-size:16px}article{max-width:680px;margin:0 auto;padding:48px 24px}h1{font-size:2rem;font-weight:700;color:#111;margin-bottom:8px;letter-spacing:-.5px}.meta{font-size:13px;color:#6b7280;margin-bottom:32px;font-family:sans-serif}h2{font-size:1.2rem;color:#111;margin:32px 0 12px;font-weight:600}p{margin-bottom:12px}strong{color:#000}ul{margin:10px 0 10px 24px}li{margin-bottom:8px}.highlight{background:#fffbeb;border-left:4px solid '+ac+';padding:16px 20px;margin:20px 0;font-family:monospace;font-size:1.2rem;color:'+ac+';font-weight:700}footer{font-family:sans-serif;text-align:center;font-size:11px;color:#9ca3af;margin-top:40px;padding-top:16px;border-top:1px solid #f1f5f9}';
    return headHtml+'<style>'+css+'</style></head><body><article><h1 data-field="razao">'+razaoFmt+'</h1><div class="meta">CNPJ '+cnpjFmt+' &bull; '+munFmt+'/'+ufFmt+' &bull; Empresa '+situacaoFmt+'</div><h2>Dados Empresariais</h2>'+infoBlock+phoneBlock+(phoneFmt?'<div class="highlight" data-field="phone">&#9742; '+phoneFmt+'</div>':'')+'<h2>Canal de Atendimento via WhatsApp</h2>'+wabaInline+'<h2>Sobre a Empresa</h2><p>'+sob+'</p><h2>Pol&iacute;tica de Atendimento</h2>'+rulesInline+'<h2>Privacidade e Prote&ccedil;&atilde;o de Dados</h2><p>'+priv+'</p><h2>Termos e Condi&ccedil;&otilde;es</h2><p>'+term+'</p><footer>&copy; '+razaoFmt+' &mdash; CNPJ '+cnpjFmt+'</footer></article>'+domScript+'</body></html>';
  }

  // ══════ LAYOUT 3: DARK CORPORATE — fundo escuro, dados diretos ══════
  else if (layoutType === 3) {
    var css='*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#111827;color:#e5e7eb;line-height:1.8;font-size:15px}.wrap{max-width:760px;margin:0 auto;padding:40px 24px}h1{color:#fff;font-size:1.8rem;font-weight:800;margin-bottom:4px}.sub{font-size:12px;color:'+ac+';margin-bottom:28px}h2{font-size:16px;color:'+ac+';margin:28px 0 10px;font-weight:700}p{margin-bottom:10px;color:#d1d5db}strong{color:#fff}ul{margin:8px 0 8px 20px;color:#d1d5db}li{margin-bottom:6px}.phone-big{font-family:monospace;font-size:1.5rem;color:'+ac+';font-weight:900;margin:16px 0;padding:14px;background:rgba(255,255,255,.05);border:1px solid '+ac+'40;border-radius:8px;text-align:center}footer{text-align:center;font-size:11px;color:#6b7280;margin-top:32px;padding-top:16px;border-top:1px solid #1f2937}';
    return headHtml+'<style>'+css+'</style></head><body><div class="wrap"><h1 data-field="razao">'+razaoFmt+'</h1><div class="sub">CNPJ: '+cnpjFmt+' &mdash; '+munFmt+'/'+ufFmt+'</div>'+(phoneFmt?'<div class="phone-big" data-field="phone">'+phoneFmt+'</div>':'')+'<h2>Dados Cadastrais</h2>'+infoBlock+phoneBlock+'<h2>Canal WhatsApp Business</h2>'+wabaInline+'<h2>Sobre a Empresa</h2><p>'+sob+'</p><h2>Regras de Atendimento</h2>'+rulesInline+'<h2>Privacidade</h2><p>'+priv+'</p><h2>Termos de Uso</h2><p>'+term+'</p><footer>'+razaoFmt+' &mdash; CNPJ '+cnpjFmt+'</footer></div>'+domScript+'</body></html>';
  }

  // ══════ LAYOUT 4: CARD CENTRAL — box branco sobre fundo cinza ══════
  else if (layoutType === 4) {
    var css='*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#f1f5f9;color:#333;line-height:1.8;font-size:15px;padding:32px 16px}.card{max-width:720px;margin:0 auto;background:#fff;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.08);padding:36px 32px}h1{font-size:1.7rem;font-weight:800;color:#111;margin-bottom:4px}.sub{font-size:13px;color:#6b7280;margin-bottom:24px}h2{font-size:16px;color:'+ac+';margin:24px 0 10px;font-weight:700}p{margin-bottom:10px}strong{color:#111}ul{margin:8px 0 8px 20px}li{margin-bottom:6px}.phone-bar{background:'+ac+';color:#fff;padding:14px;border-radius:8px;text-align:center;font-family:monospace;font-size:1.3rem;font-weight:700;margin:16px 0}footer{text-align:center;font-size:11px;color:#9ca3af;margin-top:28px;padding-top:14px;border-top:1px solid #f1f5f9}';
    return headHtml+'<style>'+css+'</style></head><body><div class="card"><h1 data-field="razao">'+razaoFmt+'</h1><div class="sub">CNPJ: '+cnpjFmt+' | Situa&ccedil;&atilde;o: '+situacaoFmt+' | '+munFmt+'/'+ufFmt+'</div>'+(phoneFmt?'<div class="phone-bar" data-field="phone">&#9742; '+phoneFmt+'</div>':'')+'<h2>Informa&ccedil;&otilde;es da Empresa</h2>'+infoBlock+phoneBlock+'<h2>Canal de Atendimento</h2>'+wabaInline+'<h2>Sobre</h2><p>'+sob+'</p><h2>Diretrizes</h2>'+rulesInline+'<h2>Privacidade</h2><p>'+priv+'</p><h2>Termos</h2><p>'+term+'</p><footer>'+razaoFmt+' &mdash; '+cnpjFmt+'</footer></div>'+domScript+'</body></html>';
  }

  // ══════ LAYOUT 5: SIDEBAR NAV — menu lateral + conteúdo ══════
  else if (layoutType === 5) {
    var css='*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#fff;color:#333;line-height:1.8;font-size:15px;display:flex;min-height:100vh}@media(max-width:768px){body{flex-direction:column}}nav{width:240px;background:#1e293b;color:#fff;padding:24px 16px;flex-shrink:0}@media(max-width:768px){nav{width:100%}}nav h2{font-size:1rem;font-weight:700;margin-bottom:12px;color:#fff}nav .cnpj{font-size:11px;color:#94a3b8;font-family:monospace;margin-bottom:16px;display:block}nav ul{list-style:none}nav li{padding:8px 0;border-bottom:1px solid #334155;font-size:13px;color:#cbd5e1}nav .ph{font-family:monospace;font-size:1rem;color:'+ac+';font-weight:700;margin-top:16px;padding:10px;background:rgba(255,255,255,.05);border-radius:6px;text-align:center}main{flex:1;padding:32px 28px;max-width:700px}h2{font-size:17px;color:#111;margin:24px 0 10px;font-weight:700}p{margin-bottom:10px}strong{color:#111}ul{margin:8px 0 8px 20px}li{margin-bottom:6px}footer{font-size:11px;color:#9ca3af;margin-top:28px;padding-top:14px;border-top:1px solid #e5e7eb}';
    return headHtml+'<style>'+css+'</style></head><body><nav><h2 data-field="razao">'+razaoFmt+'</h2><span class="cnpj" data-field="cnpj">'+cnpjFmt+'</span><ul><li>Dados Cadastrais</li><li>WhatsApp</li><li>Sobre</li><li>Privacidade</li><li>Termos</li></ul>'+(phoneFmt?'<div class="ph" data-field="phone">'+phoneFmt+'</div>':'')+'</nav><main><h2>Dados da Empresa</h2>'+infoBlock+phoneBlock+'<h2>Canal WhatsApp Business</h2>'+wabaInline+'<h2>Sobre a Empresa</h2><p>'+sob+'</p><h2>Regras de Atendimento</h2>'+rulesInline+'<h2>Privacidade e LGPD</h2><p>'+priv+'</p><h2>Termos de Uso</h2><p>'+term+'</p><footer>'+razaoFmt+' &mdash; CNPJ '+cnpjFmt+'</footer></main>'+domScript+'</body></html>';
  }

  // ══════ LAYOUT 6: HERO TOP + SEÇÕES ══════
  else if (layoutType === 6) {
    var css='*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#fff;color:#333;line-height:1.8;font-size:15px}.hero{background:linear-gradient(135deg,'+ac+','+ac+'bb);color:#fff;padding:40px 28px;text-align:center}.hero h1{font-size:2rem;font-weight:800}.hero p{font-size:14px;opacity:.9;margin-top:6px}.hero .ph{font-family:monospace;font-size:1.4rem;font-weight:800;margin-top:14px;display:inline-block;background:rgba(255,255,255,.2);padding:8px 20px;border-radius:24px}main{max-width:760px;margin:0 auto;padding:32px 24px}h2{font-size:17px;color:#111;margin:28px 0 10px;font-weight:700}p{margin-bottom:10px}strong{color:#111}ul{margin:8px 0 8px 20px}li{margin-bottom:6px}footer{background:#f8fafc;text-align:center;font-size:11px;color:#6b7280;padding:16px}';
    return headHtml+'<style>'+css+'</style></head><body><div class="hero"><h1 data-field="razao">'+razaoFmt+'</h1><p>CNPJ: '+cnpjFmt+' &mdash; '+munFmt+'/'+ufFmt+'</p>'+(phoneFmt?'<div class="ph" data-field="phone">'+phoneFmt+'</div>':'')+'</div><main><h2>Dados Cadastrais</h2>'+infoBlock+phoneBlock+'<h2>Atendimento via WhatsApp</h2>'+wabaInline+'<h2>Quem Somos</h2><p>'+sob+'</p><h2>Pol&iacute;tica de Atendimento</h2>'+rulesInline+'<h2>Privacidade</h2><p>'+priv+'</p><h2>Termos</h2><p>'+term+'</p></main><footer>'+razaoFmt+' &mdash; CNPJ '+cnpjFmt+' &mdash; Canal de atendimento receptivo via WhatsApp Business.</footer>'+domScript+'</body></html>';
  }

  // ══════ LAYOUT 7: TABELA + TEXTO — estilo consulta pública ══════
  else if (layoutType === 7) {
    var css='*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#fff;color:#333;line-height:1.8;font-size:15px}.wrap{max-width:800px;margin:0 auto;padding:32px 24px}.header{border-bottom:2px solid '+ac+';padding-bottom:16px;margin-bottom:24px}.header h1{font-size:1.6rem;font-weight:800;color:#111}.header p{font-size:12px;color:#6b7280;margin-top:4px}table{width:100%;border-collapse:collapse;margin:16px 0}th,td{text-align:left;padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:14px}th{font-weight:700;color:#6b7280;width:180px;font-size:13px}td{color:#111;font-weight:500}h2{font-size:17px;color:'+ac+';margin:28px 0 10px;font-weight:700}p{margin-bottom:10px}strong{color:#111}ul{margin:8px 0 8px 20px}li{margin-bottom:6px}.phone-row{font-family:monospace;font-size:1.2rem;color:'+ac+';font-weight:800}footer{text-align:center;font-size:11px;color:#9ca3af;margin-top:28px;padding-top:14px;border-top:1px solid #e5e7eb}';
    return headHtml+'<style>'+css+'</style></head><body><div class="wrap"><div class="header"><h1 data-field="razao">'+razaoFmt+'</h1><p>Consulta de dados p&uacute;blicos &mdash; Registro empresarial</p></div><table><tr><th>Raz&atilde;o Social</th><td data-field="razao">'+razaoFmt+'</td></tr><tr><th>CNPJ</th><td data-field="cnpj">'+cnpjFmt+'</td></tr><tr><th>Situa&ccedil;&atilde;o</th><td>'+situacaoFmt+'</td></tr>'+(porteFmt?'<tr><th>Porte</th><td>'+porteFmt+'</td></tr>':'')+(natJurFmt?'<tr><th>Natureza Jur&iacute;dica</th><td>'+natJurFmt+'</td></tr>':'')+'<tr><th>Endere&ccedil;o</th><td>'+fullAddress+'</td></tr>'+(emailFmt?'<tr><th>Email</th><td>'+emailFmt+'</td></tr>':'')+(atividadeFmt?'<tr><th>CNAE</th><td>'+atividadeFmt+'</td></tr>':'')+(phoneFmt?'<tr><th>Telefone</th><td class="phone-row" data-field="phone">'+phoneFmt+'</td></tr>':'')+'</table><h2>Canal WhatsApp Business</h2>'+wabaInline+'<h2>Sobre a Empresa</h2><p>'+sob+'</p><h2>Compliance</h2>'+rulesInline+'<h2>Privacidade</h2><p>'+priv+'</p><h2>Termos</h2><p>'+term+'</p><footer>'+razaoFmt+' &mdash; CNPJ '+cnpjFmt+'</footer></div>'+domScript+'</body></html>';
  }

  // ══════ LAYOUT 8: SEÇÕES ALTERNADAS — fundo cinza/branco ══════
  else if (layoutType === 8) {
    var css='*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#fff;color:#333;line-height:1.8;font-size:15px}header{background:#111;color:#fff;padding:28px 32px}header h1{font-size:1.5rem;font-weight:700}header .meta{font-size:12px;color:#9ca3af;margin-top:4px}section{padding:28px 32px;max-width:800px;margin:0 auto}section:nth-child(odd){background:#f8fafc}section:nth-child(even){background:#fff}h2{font-size:17px;color:'+ac+';margin-bottom:12px;font-weight:700}p{margin-bottom:10px}strong{color:#111}ul{margin:8px 0 8px 20px}li{margin-bottom:6px}.phone-big{font-family:monospace;font-size:1.3rem;color:'+ac+';font-weight:800;margin:12px 0}footer{background:#111;color:#9ca3af;text-align:center;padding:16px;font-size:11px}';
    return headHtml+'<style>'+css+'</style></head><body><header><h1 data-field="razao">'+razaoFmt+'</h1><div class="meta">CNPJ: '+cnpjFmt+' &mdash; '+munFmt+'/'+ufFmt+'</div></header><section><h2>Dados da Empresa</h2>'+infoBlock+phoneBlock+(phoneFmt?'<div class="phone-big" data-field="phone">&#128222; '+phoneFmt+'</div>':'')+'</section><section><h2>Canal WhatsApp Business</h2>'+wabaInline+'</section><section><h2>Sobre N&oacute;s</h2><p>'+sob+'</p></section><section><h2>Pol&iacute;tica de Atendimento</h2>'+rulesInline+'</section><section><h2>Privacidade e LGPD</h2><p>'+priv+'</p></section><section><h2>Termos de Uso</h2><p>'+term+'</p></section><footer>'+razaoFmt+' &mdash; CNPJ '+cnpjFmt+'</footer>'+domScript+'</body></html>';
  }

  // ══════ LAYOUT 9: LANDING PAGE — CTA style ══════
  else if (layoutType === 9) {
    var css='*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#fff;color:#333;line-height:1.8;font-size:15px}.top{background:'+ac+';color:#fff;text-align:center;padding:40px 24px}.top h1{font-size:2rem;font-weight:800}.top .sub{font-size:14px;opacity:.9;margin-top:6px}.top .ph{font-family:monospace;font-size:1.5rem;font-weight:900;margin-top:16px;background:rgba(0,0,0,.15);display:inline-block;padding:10px 24px;border-radius:8px}.content{max-width:700px;margin:0 auto;padding:32px 24px}h2{font-size:17px;color:#111;margin:28px 0 10px;font-weight:700;padding-bottom:8px;border-bottom:1px solid #f1f5f9}p{margin-bottom:10px}strong{color:#111}ul{margin:8px 0 8px 20px}li{margin-bottom:6px}footer{text-align:center;background:#f8fafc;padding:20px;font-size:11px;color:#6b7280;border-top:1px solid #e5e7eb}';
    return headHtml+'<style>'+css+'</style></head><body><div class="top"><h1 data-field="razao">'+razaoFmt+'</h1><div class="sub">'+munFmt+'/'+ufFmt+' &mdash; CNPJ '+cnpjFmt+'</div>'+(phoneFmt?'<div class="ph" data-field="phone">'+phoneFmt+'</div>':'')+'</div><div class="content"><h2>Dados Empresariais</h2>'+infoBlock+phoneBlock+'<h2>WhatsApp Business &mdash; Atendimento Receptivo</h2>'+wabaInline+'<h2>A Empresa</h2><p>'+sob+'</p><h2>Diretrizes de Atendimento</h2>'+rulesInline+'<h2>Privacidade e Dados Pessoais</h2><p>'+priv+'</p><h2>Termos e Condi&ccedil;&otilde;es</h2><p>'+term+'</p></div><footer>&copy; '+razaoFmt+' &mdash; CNPJ '+cnpjFmt+'. Canal de atendimento receptivo via WhatsApp Business.</footer>'+domScript+'</body></html>';
  }

  // ══════ LAYOUT 10: MINIMAL — sem header, direto ao ponto ══════
  else if (layoutType === 10) {
    var css='*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#fff;color:#333;line-height:1.9;font-size:15px}.page{max-width:680px;margin:0 auto;padding:48px 24px}h1{font-size:1.6rem;font-weight:700;color:#111;margin-bottom:2px}.meta{font-size:13px;color:#6b7280;margin-bottom:32px}h2{font-size:15px;color:#111;margin:28px 0 8px;font-weight:600}p{margin-bottom:10px}strong{color:#111}ul{margin:8px 0 8px 20px}li{margin-bottom:6px}.phone-inline{font-family:monospace;color:'+ac+';font-weight:700;font-size:1.1rem}hr{border:none;border-top:1px solid #f1f5f9;margin:28px 0}footer{font-size:11px;color:#9ca3af;margin-top:32px}';
    return headHtml+'<style>'+css+'</style></head><body><div class="page"><h1 data-field="razao">'+razaoFmt+'</h1><div class="meta">CNPJ '+cnpjFmt+' &bull; '+munFmt+'/'+ufFmt+' &bull; '+situacaoFmt+'</div>'+infoBlock+phoneBlock+(phoneFmt?'<p>WhatsApp: <span class="phone-inline" data-field="phone">'+phoneFmt+'</span></p>':'')+'<hr><h2>Pol&iacute;tica do Canal WhatsApp</h2>'+wabaInline+'<hr><h2>Sobre</h2><p>'+sob+'</p><h2>Atendimento</h2>'+rulesInline+'<h2>Privacidade</h2><p>'+priv+'</p><h2>Termos</h2><p>'+term+'</p><footer>'+razaoFmt+' &mdash; '+cnpjFmt+'</footer></div>'+domScript+'</body></html>';
  }

  // ══════ LAYOUT 11: SPLIT VERTICAL — dados cima, compliance baixo ══════
  else if (layoutType === 11) {
    var css='*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#f9fafb;color:#333;line-height:1.8;font-size:15px}.top-section{background:#fff;padding:32px;max-width:800px;margin:24px auto;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.06)}h1{font-size:1.6rem;font-weight:800;color:#111;margin-bottom:4px}.sub{font-size:12px;color:#6b7280;margin-bottom:20px}.bottom-section{background:#fff;padding:32px;max-width:800px;margin:12px auto 24px;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.06)}h2{font-size:16px;color:'+ac+';margin:20px 0 10px;font-weight:700}h2:first-child{margin-top:0}p{margin-bottom:10px}strong{color:#111}ul{margin:8px 0 8px 20px}li{margin-bottom:6px}.phone-banner{background:'+ac+';color:#fff;padding:14px;border-radius:6px;text-align:center;font-family:monospace;font-size:1.3rem;font-weight:700;margin:16px 0}footer{text-align:center;font-size:11px;color:#9ca3af;padding:16px}';
    return headHtml+'<style>'+css+'</style></head><body><div class="top-section"><h1 data-field="razao">'+razaoFmt+'</h1><div class="sub">CNPJ: '+cnpjFmt+' &mdash; '+munFmt+'/'+ufFmt+' &mdash; '+situacaoFmt+'</div>'+infoBlock+phoneBlock+(phoneFmt?'<div class="phone-banner" data-field="phone">'+phoneFmt+'</div>':'')+'</div><div class="bottom-section"><h2>Canal WhatsApp Business</h2>'+wabaInline+'<h2>Sobre a Empresa</h2><p>'+sob+'</p><h2>Regras de Atendimento</h2>'+rulesInline+'<h2>Privacidade (LGPD)</h2><p>'+priv+'</p><h2>Termos de Uso</h2><p>'+term+'</p></div><footer>'+razaoFmt+' &mdash; CNPJ '+cnpjFmt+'</footer>'+domScript+'</body></html>';
  }

  // ══════ LAYOUT 12: TWO COLUMN — dados lado a lado em tela grande ══════
  else if (layoutType === 12) {
    var css='*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#fff;color:#333;line-height:1.8;font-size:15px}header{background:#0f172a;color:#fff;padding:20px 28px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px}header h1{font-size:1.2rem;font-weight:700}header .info{font-size:12px;color:#94a3b8}header .ph{font-family:monospace;color:'+ac+';font-weight:700}.cols{display:grid;grid-template-columns:1fr 1fr;gap:32px;max-width:960px;margin:0 auto;padding:32px 24px}@media(max-width:768px){.cols{grid-template-columns:1fr}}.col h2{font-size:16px;color:'+ac+';margin:0 0 12px;font-weight:700}p{margin-bottom:10px}strong{color:#111}ul{margin:8px 0 8px 20px}li{margin-bottom:6px}footer{background:#0f172a;text-align:center;padding:14px;font-size:11px;color:#64748b}';
    return headHtml+'<style>'+css+'</style></head><body><header><h1 data-field="razao">'+razaoFmt+'</h1><div><span class="info" data-field="cnpj">CNPJ '+cnpjFmt+'</span>'+(phoneFmt?' &mdash; <span class="ph" data-field="phone">'+phoneFmt+'</span>':'')+'</div></header><div class="cols"><div class="col"><h2>Dados da Empresa</h2>'+infoBlock+phoneBlock+'<h2>Canal WhatsApp</h2>'+wabaInline+'</div><div class="col"><h2>Sobre</h2><p>'+sob+'</p><h2>Atendimento</h2>'+rulesInline+'<h2>Privacidade</h2><p>'+priv+'</p><h2>Termos</h2><p>'+term+'</p></div></div><footer>'+razaoFmt+' &mdash; CNPJ '+cnpjFmt+'</footer>'+domScript+'</body></html>';
  }

  // ══════ LAYOUT 13: DOCUMENTO OFICIAL — bordas, tabela formal ══════
  else if (layoutType === 13) {
    var css='*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#f5f5f4;color:#333;line-height:1.8;font-size:15px}.doc{max-width:780px;margin:24px auto;background:#fff;border:1px solid #d6d3d1;padding:40px 36px}@media(max-width:640px){.doc{margin:12px;padding:24px 18px}}.doc-header{text-align:center;padding-bottom:20px;border-bottom:2px solid #111;margin-bottom:24px}.doc-header h1{font-size:1.5rem;font-weight:800;color:#111;text-transform:uppercase;letter-spacing:1px}.doc-header p{font-size:12px;color:#6b7280;margin-top:4px}h2{font-size:14px;color:#111;margin:24px 0 10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px}p{margin-bottom:10px}strong{color:#111}ul{margin:8px 0 8px 20px}li{margin-bottom:6px}table{width:100%;border-collapse:collapse;margin:12px 0}td{padding:8px;border:1px solid #e7e5e4;font-size:14px}td:first-child{font-weight:700;background:#fafaf9;width:180px}.phone-center{text-align:center;font-family:monospace;font-size:1.3rem;color:'+ac+';font-weight:800;margin:16px 0;padding:12px;border:2px solid '+ac+'30}footer{text-align:center;font-size:11px;color:#78716c;margin-top:24px;padding-top:12px;border-top:1px solid #d6d3d1}';
    return headHtml+'<style>'+css+'</style></head><body><div class="doc"><div class="doc-header"><h1 data-field="razao">'+razaoFmt+'</h1><p>Ficha Cadastral &mdash; CNPJ '+cnpjFmt+'</p></div><h2>Dados Cadastrais</h2><table><tr><td>Raz&atilde;o Social</td><td data-field="razao">'+razaoFmt+'</td></tr><tr><td>CNPJ</td><td data-field="cnpj">'+cnpjFmt+'</td></tr><tr><td>Situa&ccedil;&atilde;o</td><td>'+situacaoFmt+'</td></tr>'+(porteFmt?'<tr><td>Porte</td><td>'+porteFmt+'</td></tr>':'')+(natJurFmt?'<tr><td>Natureza Jur&iacute;dica</td><td>'+natJurFmt+'</td></tr>':'')+'<tr><td>Endere&ccedil;o</td><td>'+fullAddress+'</td></tr>'+(emailFmt?'<tr><td>Email</td><td>'+emailFmt+'</td></tr>':'')+(atividadeFmt?'<tr><td>CNAE</td><td>'+atividadeFmt+'</td></tr>':'')+(phoneFmt?'<tr><td>Telefone</td><td data-field="phone">'+phoneFmt+'</td></tr>':'')+'</table>'+(phoneFmt?'<div class="phone-center" data-field="phone">'+phoneFmt+'</div>':'')+'<h2>Canal de Atendimento</h2>'+wabaInline+'<h2>Sobre a Empresa</h2><p>'+sob+'</p><h2>Compliance</h2>'+rulesInline+'<h2>Privacidade</h2><p>'+priv+'</p><h2>Termos de Uso</h2><p>'+term+'</p><footer>Documento gerado automaticamente &mdash; '+razaoFmt+' &mdash; '+cnpjFmt+'</footer></div>'+domScript+'</body></html>';
  }

  // ══════ LAYOUT 14: GRADIENT DARK HEADER + CLEAN BODY ══════
  else if (layoutType === 14) {
    var css='*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#fff;color:#333;line-height:1.8;font-size:15px}.hdr{background:linear-gradient(160deg,#0f172a,#1e293b);color:#fff;padding:32px 28px;text-align:center}.hdr h1{font-size:1.8rem;font-weight:800}.hdr .meta{font-size:12px;color:#94a3b8;margin-top:4px}.hdr .ph{font-family:monospace;font-size:1.2rem;color:'+ac+';font-weight:800;margin-top:12px}main{max-width:740px;margin:0 auto;padding:28px 24px}h2{font-size:16px;color:'+ac+';margin:24px 0 10px;font-weight:700}p{margin-bottom:10px}strong{color:#111}ul{margin:8px 0 8px 20px}li{margin-bottom:6px}footer{text-align:center;font-size:11px;color:#9ca3af;padding:16px;border-top:1px solid #f1f5f9}';
    return headHtml+'<style>'+css+'</style></head><body><div class="hdr"><h1 data-field="razao">'+razaoFmt+'</h1><div class="meta">CNPJ '+cnpjFmt+' &bull; '+munFmt+'/'+ufFmt+'</div>'+(phoneFmt?'<div class="ph" data-field="phone">'+phoneFmt+'</div>':'')+'</div><main><h2>Informa&ccedil;&otilde;es da Empresa</h2>'+infoBlock+phoneBlock+'<h2>Canal WhatsApp Business</h2>'+wabaInline+'<h2>Sobre</h2><p>'+sob+'</p><h2>Regras de Atendimento</h2>'+rulesInline+'<h2>Privacidade</h2><p>'+priv+'</p><h2>Termos</h2><p>'+term+'</p></main><footer>'+razaoFmt+' &mdash; CNPJ '+cnpjFmt+'</footer>'+domScript+'</body></html>';
  }

  // ══════ LAYOUT 15: STRIPE-STYLE — clean, espaçado, moderno ══════
  else if (layoutType === 15) {
    var css='*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#f6f9fc;color:#333;line-height:1.8;font-size:15px}.page{max-width:640px;margin:0 auto;padding:48px 24px}h1{font-size:1.8rem;font-weight:800;color:#0a2540;margin-bottom:4px}.tagline{font-size:14px;color:#425466;margin-bottom:32px}h2{font-size:15px;color:#0a2540;margin:32px 0 10px;font-weight:700}p{margin-bottom:10px;color:#425466}strong{color:#0a2540}ul{margin:8px 0 8px 20px;color:#425466}li{margin-bottom:6px}.callout{background:#fff;border:1px solid #e3e8ee;border-radius:8px;padding:20px;margin:16px 0}.callout .ph{font-family:monospace;font-size:1.3rem;color:'+ac+';font-weight:800;margin-bottom:8px}footer{font-size:11px;color:#8898aa;margin-top:40px;padding-top:16px;border-top:1px solid #e3e8ee}';
    return headHtml+'<style>'+css+'</style></head><body><div class="page"><h1 data-field="razao">'+razaoFmt+'</h1><div class="tagline">CNPJ '+cnpjFmt+' &mdash; '+munFmt+'/'+ufFmt+' &mdash; '+situacaoFmt+'</div>'+(phoneFmt?'<div class="callout"><div class="ph" data-field="phone">'+phoneFmt+'</div><p>Canal oficial WhatsApp Business &mdash; atendimento receptivo.</p></div>':'')+'<h2>Dados Cadastrais</h2>'+infoBlock+phoneBlock+'<h2>Pol&iacute;tica do Canal WhatsApp</h2>'+wabaInline+'<h2>Sobre a Empresa</h2><p>'+sob+'</p><h2>Atendimento</h2>'+rulesInline+'<h2>Privacidade</h2><p>'+priv+'</p><h2>Termos</h2><p>'+term+'</p><footer>'+razaoFmt+' &mdash; CNPJ '+cnpjFmt+'</footer></div>'+domScript+'</body></html>';
  }

  // ══════ LAYOUT 16: TOPBAR + ACCORDION STYLE ══════
  else if (layoutType === 16) {
    var css='*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#fff;color:#333;line-height:1.8;font-size:15px}.topbar{background:'+ac+';color:#fff;padding:14px 24px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px}.topbar h1{font-size:1rem;font-weight:700}.topbar .info{font-size:11px;opacity:.9}.content{max-width:740px;margin:0 auto;padding:28px 24px}h2{font-size:16px;color:#111;margin:24px 0 8px;font-weight:700;padding:10px 0;border-bottom:1px solid #e5e7eb}p{margin-bottom:10px}strong{color:#111}ul{margin:8px 0 8px 20px}li{margin-bottom:6px}.phone-line{font-family:monospace;font-size:1.2rem;color:'+ac+';font-weight:800;margin:8px 0}footer{background:#f8fafc;text-align:center;padding:16px;font-size:11px;color:#6b7280;border-top:1px solid #e5e7eb}';
    return headHtml+'<style>'+css+'</style></head><body><div class="topbar"><h1 data-field="razao">'+razaoFmt+'</h1><div class="info" data-field="cnpj">CNPJ '+cnpjFmt+(phoneFmt?' | '+phoneFmt:'')+'</div></div><div class="content"><h2>Dados da Empresa</h2>'+infoBlock+phoneBlock+(phoneFmt?'<div class="phone-line" data-field="phone">&#9742; '+phoneFmt+'</div>':'')+'<h2>Canal WhatsApp Business</h2>'+wabaInline+'<h2>Sobre a Empresa</h2><p>'+sob+'</p><h2>Regras de Atendimento</h2>'+rulesInline+'<h2>Privacidade e LGPD</h2><p>'+priv+'</p><h2>Termos de Uso</h2><p>'+term+'</p></div><footer>'+razaoFmt+' &mdash; CNPJ '+cnpjFmt+' &mdash; Canal receptivo WhatsApp Business</footer>'+domScript+'</body></html>';
  }

  // ══════ LAYOUT 17: SIMPLES DIRETO ══════
  else if (layoutType === 17) {
    var css='*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#fff;color:#333;line-height:1.8;font-size:15px}.wrap{max-width:720px;margin:0 auto;padding:36px 24px}h1{font-size:1.7rem;font-weight:800;color:#111;margin-bottom:4px}.meta{font-size:13px;color:#6b7280;margin-bottom:28px}h2{font-size:16px;color:#111;margin:24px 0 10px;font-weight:700}p{margin-bottom:10px}strong{color:#111}ul{margin:8px 0 8px 20px}li{margin-bottom:6px}.phone-direct{font-family:monospace;font-size:1.3rem;color:'+ac+';font-weight:800;margin:12px 0}footer{text-align:center;font-size:11px;color:#9ca3af;margin-top:32px;padding-top:14px;border-top:1px solid #f1f5f9}';
    return headHtml+'<style>'+css+'</style></head><body><div class="wrap"><h1 data-field="razao">'+razaoFmt+'</h1><div class="meta">CNPJ: '+cnpjFmt+' &bull; '+munFmt+'/'+ufFmt+' &bull; Situa&ccedil;&atilde;o: '+situacaoFmt+'</div>'+infoBlock+phoneBlock+(phoneFmt?'<div class="phone-direct" data-field="phone">WhatsApp: '+phoneFmt+'</div>':'')+'<h2>Canal de Atendimento WhatsApp</h2>'+wabaInline+'<h2>Sobre a Empresa</h2><p>'+sob+'</p><h2>Regras de Atendimento</h2>'+rulesInline+'<h2>Privacidade</h2><p>'+priv+'</p><h2>Termos de Uso</h2><p>'+term+'</p><footer>'+razaoFmt+' &mdash; CNPJ '+cnpjFmt+'</footer></div>'+domScript+'</body></html>';
  }

  // ══════ LAYOUT 18: PORTAL AZUL ══════
  else if (layoutType === 18) {
    var css='*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#eff6ff;color:#333;line-height:1.8;font-size:15px}.bar{background:#1e3a5f;color:#fff;padding:16px 24px}.bar h1{font-size:1.2rem;font-weight:700}.bar span{font-size:11px;opacity:.8}main{max-width:760px;margin:0 auto;padding:28px 24px}h2{font-size:16px;color:#1e3a5f;margin:24px 0 10px;font-weight:700}p{margin-bottom:10px}strong{color:#111}ul{margin:8px 0 8px 20px}li{margin-bottom:6px}.ph{font-family:monospace;font-size:1.3rem;color:#1e3a5f;font-weight:800;background:#dbeafe;padding:12px;border-radius:6px;text-align:center;margin:14px 0}footer{background:#1e3a5f;color:#94a3b8;text-align:center;padding:14px;font-size:11px}';
    return headHtml+'<style>'+css+'</style></head><body><div class="bar"><h1 data-field="razao">'+razaoFmt+'</h1><span data-field="cnpj">CNPJ '+cnpjFmt+'</span></div><main>'+(phoneFmt?'<div class="ph" data-field="phone">'+phoneFmt+'</div>':'')+'<h2>Dados Cadastrais</h2>'+infoBlock+phoneBlock+'<h2>Canal WhatsApp Business</h2>'+wabaInline+'<h2>Sobre</h2><p>'+sob+'</p><h2>Atendimento</h2>'+rulesInline+'<h2>Privacidade</h2><p>'+priv+'</p><h2>Termos</h2><p>'+term+'</p></main><footer>'+razaoFmt+' &mdash; '+cnpjFmt+'</footer>'+domScript+'</body></html>';
  }

  // ══════ LAYOUT 19: VERDE NATUREZA ══════
  else if (layoutType === 19) {
    var css='*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#f0fdf4;color:#333;line-height:1.8;font-size:15px}.hdr{background:#166534;color:#fff;padding:28px 24px;text-align:center}.hdr h1{font-size:1.7rem;font-weight:700}.hdr p{font-size:12px;opacity:.85;margin-top:4px}main{max-width:740px;margin:0 auto;padding:28px 24px}h2{font-size:16px;color:#166534;margin:24px 0 10px;font-weight:700}p{margin-bottom:10px}strong{color:#111}ul{margin:8px 0 8px 20px}li{margin-bottom:6px}.ph{font-family:monospace;font-size:1.2rem;color:#166534;font-weight:800;margin:10px 0}footer{text-align:center;font-size:11px;color:#6b7280;margin-top:28px;padding-top:14px;border-top:1px solid #dcfce7}';
    return headHtml+'<style>'+css+'</style></head><body><div class="hdr"><h1 data-field="razao">'+razaoFmt+'</h1><p>CNPJ: '+cnpjFmt+' &mdash; '+munFmt+'/'+ufFmt+'</p></div><main><h2>Dados da Empresa</h2>'+infoBlock+phoneBlock+(phoneFmt?'<p class="ph" data-field="phone">Contato: '+phoneFmt+'</p>':'')+'<h2>Canal WhatsApp</h2>'+wabaInline+'<h2>Sobre</h2><p>'+sob+'</p><h2>Regras</h2>'+rulesInline+'<h2>Privacidade</h2><p>'+priv+'</p><h2>Termos</h2><p>'+term+'</p><footer>'+razaoFmt+' &mdash; '+cnpjFmt+'</footer></main>'+domScript+'</body></html>';
  }

  // ══════ LAYOUT 20: ROXO MODERNO ══════
  else if (layoutType === 20) {
    var css='*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#faf5ff;color:#333;line-height:1.8;font-size:15px}.top{background:linear-gradient(135deg,#7c3aed,#a78bfa);color:#fff;padding:36px 24px;text-align:center}.top h1{font-size:1.8rem;font-weight:800}.top .sub{font-size:13px;opacity:.9;margin-top:4px}.top .ph{font-family:monospace;font-size:1.3rem;font-weight:800;margin-top:12px}main{max-width:720px;margin:0 auto;padding:28px 24px}h2{font-size:16px;color:#7c3aed;margin:24px 0 10px;font-weight:700}p{margin-bottom:10px}strong{color:#111}ul{margin:8px 0 8px 20px}li{margin-bottom:6px}footer{text-align:center;font-size:11px;color:#6b7280;padding:16px;border-top:1px solid #f3e8ff}';
    return headHtml+'<style>'+css+'</style></head><body><div class="top"><h1 data-field="razao">'+razaoFmt+'</h1><div class="sub">CNPJ '+cnpjFmt+' | '+munFmt+'/'+ufFmt+'</div>'+(phoneFmt?'<div class="ph" data-field="phone">'+phoneFmt+'</div>':'')+'</div><main><h2>Informa&ccedil;&otilde;es Cadastrais</h2>'+infoBlock+phoneBlock+'<h2>Canal WhatsApp Business</h2>'+wabaInline+'<h2>Sobre</h2><p>'+sob+'</p><h2>Atendimento</h2>'+rulesInline+'<h2>Privacidade</h2><p>'+priv+'</p><h2>Termos</h2><p>'+term+'</p></main><footer>'+razaoFmt+' &mdash; '+cnpjFmt+'</footer>'+domScript+'</body></html>';
  }

  // ══════ LAYOUT 21: NEWSPAPER ══════
  else if (layoutType === 21) {
    var css='*{margin:0;padding:0;box-sizing:border-box}body{font-family:Georgia,serif;background:#fefce8;color:#1c1917;line-height:1.9;font-size:16px}.page{max-width:700px;margin:0 auto;padding:48px 28px;border-left:1px solid #d6d3d1;border-right:1px solid #d6d3d1;background:#fff}h1{font-size:2rem;font-weight:700;text-align:center;border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:8px}.dateline{text-align:center;font-size:12px;color:#78716c;margin-bottom:28px;font-family:sans-serif}h2{font-size:1.1rem;color:#111;margin:28px 0 8px;font-weight:600}p{margin-bottom:10px}strong{color:#000}ul{margin:8px 0 8px 20px}li{margin-bottom:6px}.ph{font-family:monospace;font-size:1.1rem;color:#92400e;font-weight:700}footer{text-align:center;font-size:11px;color:#a8a29e;margin-top:32px;padding-top:14px;border-top:2px solid #111;font-family:sans-serif}';
    return headHtml+'<style>'+css+'</style></head><body><div class="page"><h1 data-field="razao">'+razaoFmt+'</h1><div class="dateline">CNPJ '+cnpjFmt+' &mdash; '+munFmt+'/'+ufFmt+' &mdash; Empresa '+situacaoFmt+'</div><h2>Dados Empresariais</h2>'+infoBlock+phoneBlock+(phoneFmt?'<p>Telefone: <span class="ph" data-field="phone">'+phoneFmt+'</span></p>':'')+'<h2>Canal WhatsApp</h2>'+wabaInline+'<h2>Sobre</h2><p>'+sob+'</p><h2>Pol&iacute;tica de Atendimento</h2>'+rulesInline+'<h2>Privacidade</h2><p>'+priv+'</p><h2>Termos</h2><p>'+term+'</p><footer>'+razaoFmt+' &mdash; '+cnpjFmt+'</footer></div>'+domScript+'</body></html>';
  }

  // ══════ LAYOUT 22: DARK NAVY ══════
  else if (layoutType === 22) {
    var css='*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#0c1222;color:#cbd5e1;line-height:1.8;font-size:15px}.wrap{max-width:720px;margin:0 auto;padding:36px 24px}h1{color:#f1f5f9;font-size:1.7rem;font-weight:800;margin-bottom:4px}.sub{font-size:12px;color:#64748b;margin-bottom:24px}h2{font-size:15px;color:#38bdf8;margin:24px 0 10px;font-weight:700}p{margin-bottom:10px}strong{color:#f1f5f9}ul{margin:8px 0 8px 20px}li{margin-bottom:6px}.ph{font-family:monospace;font-size:1.3rem;color:#38bdf8;font-weight:800;margin:12px 0;padding:12px;background:rgba(56,189,248,.08);border:1px solid rgba(56,189,248,.2);border-radius:6px;text-align:center}footer{text-align:center;font-size:11px;color:#475569;margin-top:28px;padding-top:14px;border-top:1px solid #1e293b}';
    return headHtml+'<style>'+css+'</style></head><body><div class="wrap"><h1 data-field="razao">'+razaoFmt+'</h1><div class="sub">CNPJ: '+cnpjFmt+' | '+munFmt+'/'+ufFmt+'</div>'+(phoneFmt?'<div class="ph" data-field="phone">'+phoneFmt+'</div>':'')+'<h2>Dados da Empresa</h2>'+infoBlock+phoneBlock+'<h2>WhatsApp Business</h2>'+wabaInline+'<h2>Sobre</h2><p>'+sob+'</p><h2>Regras</h2>'+rulesInline+'<h2>Privacidade</h2><p>'+priv+'</p><h2>Termos</h2><p>'+term+'</p><footer>'+razaoFmt+' &mdash; '+cnpjFmt+'</footer></div>'+domScript+'</body></html>';
  }

  // ══════ LAYOUT 23: ORANGE WARM ══════
  else if (layoutType === 23) {
    var css='*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#fff7ed;color:#333;line-height:1.8;font-size:15px}.bar{background:#9a3412;color:#fff;padding:18px 24px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px}.bar h1{font-size:1.1rem;font-weight:700}.bar .info{font-size:11px;opacity:.85}main{max-width:740px;margin:0 auto;padding:28px 24px}h2{font-size:16px;color:#9a3412;margin:24px 0 10px;font-weight:700}p{margin-bottom:10px}strong{color:#111}ul{margin:8px 0 8px 20px}li{margin-bottom:6px}.ph{font-family:monospace;font-size:1.2rem;color:#9a3412;font-weight:800;margin:10px 0}footer{background:#9a3412;color:rgba(255,255,255,.7);text-align:center;padding:14px;font-size:11px}';
    return headHtml+'<style>'+css+'</style></head><body><div class="bar"><h1 data-field="razao">'+razaoFmt+'</h1><div class="info" data-field="cnpj">'+cnpjFmt+'</div></div><main><h2>Dados Cadastrais</h2>'+infoBlock+phoneBlock+(phoneFmt?'<p class="ph" data-field="phone">WhatsApp: '+phoneFmt+'</p>':'')+'<h2>Canal de Atendimento</h2>'+wabaInline+'<h2>Sobre</h2><p>'+sob+'</p><h2>Diretrizes</h2>'+rulesInline+'<h2>Privacidade</h2><p>'+priv+'</p><h2>Termos</h2><p>'+term+'</p></main><footer>'+razaoFmt+' &mdash; CNPJ '+cnpjFmt+'</footer>'+domScript+'</body></html>';
  }

  // ══════ LAYOUT 24: CLEAN BORDERED ══════
  else if (layoutType === 24) {
    var css='*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#fff;color:#333;line-height:1.8;font-size:15px}.wrap{max-width:700px;margin:32px auto;padding:32px;border:1px solid #e5e7eb;border-radius:8px}h1{font-size:1.6rem;font-weight:800;color:#111;margin-bottom:4px}.meta{font-size:12px;color:#6b7280;margin-bottom:24px;padding-bottom:12px;border-bottom:1px solid #e5e7eb}h2{font-size:15px;color:'+ac+';margin:24px 0 10px;font-weight:700}p{margin-bottom:10px}strong{color:#111}ul{margin:8px 0 8px 20px}li{margin-bottom:6px}.ph{font-family:monospace;font-size:1.2rem;color:'+ac+';font-weight:800;margin:10px 0}footer{text-align:center;font-size:10px;color:#9ca3af;margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb}';
    return headHtml+'<style>'+css+'</style></head><body><div class="wrap"><h1 data-field="razao">'+razaoFmt+'</h1><div class="meta">CNPJ: '+cnpjFmt+' &bull; '+munFmt+'/'+ufFmt+' &bull; '+situacaoFmt+'</div>'+infoBlock+phoneBlock+(phoneFmt?'<p class="ph" data-field="phone">'+phoneFmt+'</p>':'')+'<h2>Canal WhatsApp</h2>'+wabaInline+'<h2>Sobre</h2><p>'+sob+'</p><h2>Atendimento</h2>'+rulesInline+'<h2>Privacidade</h2><p>'+priv+'</p><h2>Termos</h2><p>'+term+'</p><footer>'+razaoFmt+' &mdash; '+cnpjFmt+'</footer></div>'+domScript+'</body></html>';
  }

  // ══════ LAYOUT 25: WIDE HEADER ══════
  else if (layoutType === 25) {
    var css='*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#f8fafc;color:#333;line-height:1.8;font-size:15px}.hdr{background:#fff;padding:32px 24px;text-align:center;border-bottom:3px solid '+ac+'}.hdr h1{font-size:1.8rem;font-weight:800;color:#111}.hdr .sub{font-size:13px;color:#6b7280;margin-top:4px}.hdr .ph{font-family:monospace;font-size:1.3rem;color:'+ac+';font-weight:800;margin-top:10px}main{max-width:740px;margin:0 auto;padding:28px 24px}h2{font-size:16px;color:'+ac+';margin:24px 0 10px;font-weight:700}p{margin-bottom:10px}strong{color:#111}ul{margin:8px 0 8px 20px}li{margin-bottom:6px}footer{text-align:center;font-size:11px;color:#6b7280;padding:16px;background:#fff;border-top:3px solid '+ac+'}';
    return headHtml+'<style>'+css+'</style></head><body><div class="hdr"><h1 data-field="razao">'+razaoFmt+'</h1><div class="sub">CNPJ: '+cnpjFmt+' &mdash; '+munFmt+'/'+ufFmt+'</div>'+(phoneFmt?'<div class="ph" data-field="phone">'+phoneFmt+'</div>':'')+'</div><main><h2>Dados da Empresa</h2>'+infoBlock+phoneBlock+'<h2>Canal WhatsApp</h2>'+wabaInline+'<h2>Sobre</h2><p>'+sob+'</p><h2>Atendimento</h2>'+rulesInline+'<h2>Privacidade</h2><p>'+priv+'</p><h2>Termos</h2><p>'+term+'</p></main><footer>'+razaoFmt+' &mdash; '+cnpjFmt+'</footer>'+domScript+'</body></html>';
  }

  // ══════ LAYOUT 26-35: VARIAÇÕES RÁPIDAS ══════
  else if (layoutType >= 26 && layoutType <= 35) {
    var bgColors = ['#fff','#f9fafb','#fffbeb','#f0fdfa','#fdf2f8','#f5f3ff','#ecfdf5','#fff1f2','#f0f9ff','#fefce8'];
    var hdrColors = ['#1f2937','#064e3b','#7c2d12','#1e1b4b','#831843','#4c1d95','#14532d','#9f1239','#0c4a6e','#713f12'];
    var vi2 = layoutType - 26;
    var bgC = bgColors[vi2];
    var hdC = hdrColors[vi2];
    var css='*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:'+bgC+';color:#333;line-height:1.8;font-size:15px}.hdr{background:'+hdC+';color:#fff;padding:24px;text-align:center}.hdr h1{font-size:1.6rem;font-weight:700}.hdr p{font-size:12px;opacity:.85;margin-top:4px}main{max-width:740px;margin:0 auto;padding:28px 24px}h2{font-size:16px;color:'+hdC+';margin:24px 0 10px;font-weight:700}p{margin-bottom:10px}strong{color:#111}ul{margin:8px 0 8px 20px}li{margin-bottom:6px}.ph{font-family:monospace;font-size:1.2rem;color:'+hdC+';font-weight:800;margin:10px 0}footer{background:'+hdC+';color:rgba(255,255,255,.7);text-align:center;padding:14px;font-size:11px}';
    return headHtml+'<style>'+css+'</style></head><body><div class="hdr"><h1 data-field="razao">'+razaoFmt+'</h1><p>CNPJ: '+cnpjFmt+' &mdash; '+munFmt+'/'+ufFmt+'</p></div><main>'+(phoneFmt?'<p class="ph" data-field="phone">Telefone: '+phoneFmt+'</p>':'')+'<h2>Dados Cadastrais</h2>'+infoBlock+phoneBlock+'<h2>Canal WhatsApp Business</h2>'+wabaInline+'<h2>Sobre a Empresa</h2><p>'+sob+'</p><h2>Regras de Atendimento</h2>'+rulesInline+'<h2>Privacidade</h2><p>'+priv+'</p><h2>Termos de Uso</h2><p>'+term+'</p></main><footer>'+razaoFmt+' &mdash; CNPJ '+cnpjFmt+'</footer>'+domScript+'</body></html>';
  }

  // ══════ FALLBACK / GERADOR COMBINATÓRIO (layouts 36-71) ══════
  else {
    // Seed baseada no templateIndex pra gerar combinações determinísticas
    var seed = templateIndex * 7 + 13;
    var pick = function(arr) { return arr[seed++ % arr.length]; };

    // HEADERS (6 estilos)
    var headers = [
      // 0: gradient full
      function(){ return '<div style="background:linear-gradient(135deg,'+ac+','+ac+'bb);color:#fff;padding:36px 24px;text-align:center"><h1 style="font-size:1.8rem;font-weight:800;margin:0" data-field="razao">'+razaoFmt+'</h1><p style="font-size:13px;opacity:.85;margin-top:6px">CNPJ: '+cnpjFmt+' &mdash; '+munFmt+'/'+ufFmt+'</p>'+(phoneFmt?'<p style="font-family:monospace;font-size:1.3rem;font-weight:800;margin-top:12px;background:rgba(0,0,0,.15);display:inline-block;padding:8px 20px;border-radius:20px" data-field="phone">'+phoneFmt+'</p>':'')+'</div>'; },
      // 1: dark solid
      function(){ return '<div style="background:#111827;color:#fff;padding:24px 28px"><h1 style="font-size:1.4rem;font-weight:700;margin:0" data-field="razao">'+razaoFmt+'</h1><p style="font-size:12px;color:#9ca3af;margin-top:4px" data-field="cnpj">CNPJ '+cnpjFmt+' | '+munFmt+'/'+ufFmt+'</p>'+(phoneFmt?'<p style="font-family:monospace;color:'+ac+';font-weight:700;font-size:13px;margin-top:6px" data-field="phone">'+phoneFmt+'</p>':'')+'</div>'; },
      // 2: white clean border bottom
      function(){ return '<div style="background:#fff;border-bottom:3px solid '+ac+';padding:28px 24px;text-align:center"><h1 style="font-size:1.7rem;font-weight:800;color:#111;margin:0" data-field="razao">'+razaoFmt+'</h1><p style="font-size:12px;color:#6b7280;margin-top:4px">CNPJ: '+cnpjFmt+' &mdash; '+munFmt+'/'+ufFmt+' &mdash; '+situacaoFmt+'</p>'+(phoneFmt?'<p style="font-family:monospace;font-size:1.2rem;color:'+ac+';font-weight:800;margin-top:10px" data-field="phone">'+phoneFmt+'</p>':'')+'</div>'; },
      // 3: colored bar compact
      function(){ return '<div style="background:'+ac+';color:#fff;padding:16px 24px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><h1 style="font-size:1.1rem;font-weight:700;margin:0" data-field="razao">'+razaoFmt+'</h1><span style="font-size:11px;opacity:.9" data-field="cnpj">CNPJ '+cnpjFmt+(phoneFmt?' | '+phoneFmt:'')+'</span></div>'; },
      // 4: hero grande
      function(){ return '<div style="background:linear-gradient(160deg,#0f172a,#1e293b);color:#fff;padding:48px 24px;text-align:center"><h1 style="font-size:2.2rem;font-weight:900;margin:0;letter-spacing:-.5px" data-field="razao">'+razaoFmt+'</h1><p style="font-size:14px;color:#94a3b8;margin-top:8px">Empresa registrada &mdash; CNPJ '+cnpjFmt+'</p><p style="font-size:13px;color:#64748b;margin-top:4px">'+munFmt+'/'+ufFmt+' &mdash; Situa&ccedil;&atilde;o: '+situacaoFmt+'</p>'+(phoneFmt?'<p style="font-family:monospace;font-size:1.4rem;color:'+ac+';font-weight:900;margin-top:14px" data-field="phone">'+phoneFmt+'</p>':'')+'</div>'; },
      // 5: minimal no-bg
      function(){ return '<div style="padding:32px 24px;max-width:760px;margin:0 auto"><h1 style="font-size:1.6rem;font-weight:800;color:#111;margin:0" data-field="razao">'+razaoFmt+'</h1><p style="font-size:13px;color:#6b7280;margin-top:4px">CNPJ '+cnpjFmt+' &bull; '+munFmt+'/'+ufFmt+' &bull; '+situacaoFmt+'</p>'+(phoneFmt?'<p style="font-family:monospace;font-size:1.2rem;color:'+ac+';font-weight:800;margin-top:8px" data-field="phone">'+phoneFmt+'</p>':'')+'</div>'; },
    ];

    // BODY STYLES (6 estilos de seção)
    var bodyStyles = [
      // 0: seções com h2 + borda inferior
      'h2{font-size:16px;color:'+ac+';margin:28px 0 10px;font-weight:700;padding-bottom:8px;border-bottom:1px solid #e5e7eb}',
      // 1: seções com h2 colorido sem borda
      'h2{font-size:17px;color:#111;margin:28px 0 10px;font-weight:700}',
      // 2: h2 uppercase com letter-spacing
      'h2{font-size:13px;color:'+ac+';margin:28px 0 10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px}',
      // 3: h2 com background sutil
      'h2{font-size:15px;color:#111;margin:28px 0 10px;font-weight:700;background:#f8fafc;padding:8px 12px;border-radius:4px}',
      // 4: h2 com borda esquerda
      'h2{font-size:15px;color:'+ac+';margin:28px 0 10px;font-weight:700;padding-left:12px;border-left:3px solid '+ac+'}',
      // 5: h2 grande editorial
      'h2{font-size:1.2rem;color:#111;margin:32px 0 12px;font-weight:600}',
    ];

    // BACKGROUNDS (6)
    var bgs = ['#fff','#f9fafb','#f8fafc','#fffbeb','#f0fdfa','#fdf2f8'];

    // PHONE DISPLAY (4 estilos)
    var phoneDivs = [
      phoneFmt ? '<div style="font-family:monospace;font-size:1.3rem;color:'+ac+';font-weight:800;text-align:center;margin:16px 0;padding:14px;background:'+ac+'08;border:1px solid '+ac+'20;border-radius:8px" data-field="phone">'+phoneFmt+'</div>' : '',
      phoneFmt ? '<p style="font-family:monospace;font-size:1.2rem;color:'+ac+';font-weight:800;margin:12px 0" data-field="phone">&#9742; '+phoneFmt+'</p>' : '',
      phoneFmt ? '<div style="background:'+ac+';color:#fff;padding:12px;border-radius:6px;text-align:center;font-family:monospace;font-size:1.2rem;font-weight:700;margin:14px 0" data-field="phone">'+phoneFmt+'</div>' : '',
      phoneFmt ? '<p style="font-family:monospace;color:'+ac+';font-weight:700;font-size:1.1rem;margin:10px 0" data-field="phone">WhatsApp: '+phoneFmt+'</p>' : '',
    ];

    // FOOTER (4 estilos)
    var footers = [
      '<div style="background:#111827;color:#9ca3af;text-align:center;padding:14px;font-size:11px;margin-top:24px">'+razaoFmt+' &mdash; CNPJ '+cnpjFmt+'</div>',
      '<div style="text-align:center;font-size:11px;color:#9ca3af;margin-top:28px;padding-top:14px;border-top:1px solid #e5e7eb">'+razaoFmt+' &mdash; '+cnpjFmt+' &mdash; Todos os direitos reservados.</div>',
      '<div style="background:'+ac+';color:#fff;text-align:center;padding:12px;font-size:11px;margin-top:24px">&copy; '+razaoFmt+' &mdash; Canal receptivo WhatsApp Business</div>',
      '<div style="text-align:center;font-size:10px;color:#6b7280;margin-top:24px;padding:14px">'+razaoFmt+' &mdash; CNPJ '+cnpjFmt+' &mdash; '+munFmt+'/'+ufFmt+'</div>',
    ];

    var chosenHeader = pick(headers)();
    var chosenBodyStyle = pick(bodyStyles);
    var chosenBg = pick(bgs);
    var chosenPhone = pick(phoneDivs);
    var chosenFooter = pick(footers);

    var genCss = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:'+chosenBg+';color:#333;line-height:1.8;font-size:15px}main{max-width:760px;margin:0 auto;padding:28px 24px}p{margin-bottom:10px}strong{color:#111}ul{margin:8px 0 8px 20px}li{margin-bottom:6px}'+chosenBodyStyle;

    return headHtml+'<style>'+genCss+'</style></head><body>'+chosenHeader+'<main>'+chosenPhone+'<h2>Dados da Empresa</h2>'+infoBlock+phoneBlock+'<h2>Canal WhatsApp Business</h2>'+wabaInline+'<h2>Sobre a Empresa</h2><p>'+sob+'</p><h2>Regras de Atendimento</h2>'+rulesInline+'<h2>Privacidade e LGPD</h2><p>'+priv+'</p><h2>Termos de Uso</h2><p>'+term+'</p></main>'+chosenFooter+domScript+'</body></html>';
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

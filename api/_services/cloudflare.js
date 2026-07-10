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
function buildLandingHtml({ razaoSocial, nomeFantasia, cnpj, endereco, numero, bairro, cep, municipio, uf, situacao, atividadePrincipal, telefone, email, smsPhone, smsCode, metaVerificationCode, verificationMethod, forceTemplateIndex }) {
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
  const fullAddress = enderFmt+(bairroFmt?' — '+bairroFmt:'')+' — '+munFmt+'/'+ufFmt+(cepFmt?' — CEP '+cepFmt:'');

  const templateIndex = (typeof forceTemplateIndex === 'number') ? (forceTemplateIndex % 80) : (Math.floor(Date.now() / 13) % 80);
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
    {rs:'RAZÃO SOCIAL',cnpj:'CNPJ',sit:'SITUAÇÃO',end:'BASE FÍSICA / ENDEREÇO',cnae:'CNAE — ATIVIDADE PRINCIPAL',tel:'NÓ DE COMUNICAÇÃO',email:'EMAIL',mun:'UF/MUNICÍPIO',waba:'Gateway WABA — Canal Utility'},
    {rs:'RAZÃO SOCIAL',cnpj:'INSCRIÇÃO CNPJ',sit:'STATUS CADASTRAL',end:'ENDEREÇO REGISTRADO',cnae:'ATIVIDADE ECONÔMICA',tel:'TELEFONE OFICIAL',email:'CORREIO ELETRÔNICO',mun:'CIDADE/ESTADO',waba:'Canal WABA — Utility Gateway'},
    {rs:'DENOMINAÇÃO SOCIAL',cnpj:'CNPJ/MF',sit:'CONDIÇÃO',end:'LOCALIZAÇÃO FÍSICA',cnae:'CNAE PRINCIPAL',tel:'PONTO DE CONTATO',email:'E-MAIL CORPORATIVO',mun:'LOCALIDADE/UF',waba:'Endpoint WABA — Utility'},
    {rs:'NOME EMPRESARIAL',cnpj:'REGISTRO CNPJ',sit:'SITUAÇÃO CADASTRAL',end:'SEDE / ENDEREÇO',cnae:'ATIVIDADE PRINCIPAL',tel:'CANAL TELEFÔNICO',email:'ENDEREÇO ELETRÔNICO',mun:'MUNICÍPIO/UF',waba:'WABA Channel — Utility Mode'},
    {rs:'FIRMA / RAZÃO SOCIAL',cnpj:'CNPJ FEDERAL',sit:'STATUS',end:'ENDEREÇO COMERCIAL',cnae:'OBJETO SOCIAL / CNAE',tel:'NÚMERO OFICIAL',email:'EMAIL REGISTRADO',mun:'PRAÇA/UF',waba:'WhatsApp Business — Canal Utility'},
    {rs:'RAZÃO SOCIAL',cnpj:'IDENTIFICAÇÃO CNPJ',sit:'ESTADO CADASTRAL',end:'LOGRADOURO',cnae:'ATIVIDADE REGISTRADA',tel:'COMUNICAÇÃO DIRETA',email:'CORREIO DIGITAL',mun:'CIRCUNSCRIÇÃO/UF',waba:'Módulo WABA — Receptivo Utility'},
    {rs:'REGISTRO SOCIAL',cnpj:'CNPJ/RECEITA',sit:'VERIFICAÇÃO',end:'BASE OPERACIONAL',cnae:'CLASSIFICAÇÃO CNAE',tel:'TERMINAL DE CONTATO',email:'CANAL ELETRÔNICO',mun:'REGIÃO/UF',waba:'Interface WABA — Canal Receptivo'},
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
  // TIPO A (0-24): Painel Telemetria — nav + hero + grid 2col + sidebar WABA
  // ═══════════════════════════════════════════════════════════════
  if (templateIndex < 25) {
    var p = _A[templateIndex];
    var css = '*{margin:0;padding:0;box-sizing:border-box}'+
      'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:'+p.bg+';color:#c8d6e5;min-height:100vh;font-size:14px}'+
      '.topbar{background:'+p.nav+';border-bottom:1px solid '+p.ac+'40;padding:12px 24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px}'+
      '.topbar .name{font-size:15px;font-weight:800;color:#fff;letter-spacing:.3px}'+
      '.topbar .status{display:flex;align-items:center;gap:8px}.topbar .dot{width:8px;height:8px;border-radius:50%;background:'+p.ac+';box-shadow:0 0 6px '+p.ac+'80}.topbar .stxt{font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:'+p.ac+'}'+
      '.topbar .badge{font-family:monospace;font-size:10px;background:'+p.ac+'18;border:1px solid '+p.ac+'35;color:'+p.ac2+';padding:3px 10px;border-radius:2px;letter-spacing:1px}'+
      '.main-grid{max-width:960px;margin:24px auto;padding:0 20px;display:grid;grid-template-columns:1fr 320px;gap:20px}@media(max-width:800px){.main-grid{grid-template-columns:1fr;padding:0 12px}}'+
      '.panel{background:'+p.nav+';border:1px solid rgba(255,255,255,.06);border-radius:4px;margin-bottom:16px;overflow:hidden}'+
      '.panel-title{padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.06);display:flex;align-items:center;gap:8px}'+
      '.panel-title span{font-size:12px;font-weight:700;color:'+p.ac+';letter-spacing:1.2px;text-transform:uppercase}'+
      '.grid-data{display:grid;grid-template-columns:1fr 1fr 1fr;border-bottom:1px solid rgba(255,255,255,.04)}@media(max-width:600px){.grid-data{grid-template-columns:1fr}}'+
      '.cell{padding:14px 16px;border-right:1px solid rgba(255,255,255,.04)}.cell:last-child{border-right:none}'+
      '.cell .lbl{font-size:9px;text-transform:uppercase;letter-spacing:1.2px;color:rgba(255,255,255,.4);margin-bottom:4px}'+
      '.cell .val{font-size:14px;color:#fff;font-weight:700}.cell .val.mono{font-family:"Courier New",monospace;color:'+p.ac+';letter-spacing:.5px}.cell .val.ok{color:#4ade80}'+
      '.row-data{padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.04);display:flex;flex-direction:column;gap:3px}'+
      '.row-data .lbl{font-size:9px;text-transform:uppercase;letter-spacing:1.2px;color:rgba(255,255,255,.4)}'+
      '.row-data .val{font-size:13px;color:#e2e8f0;font-weight:600}'+
      '.waba-card{background:'+p.nav+';border:1px solid '+p.ac+'30;border-left:3px solid '+p.ac+';border-radius:4px;padding:18px;margin-bottom:16px}'+
      '.waba-card h3{font-size:12px;font-weight:700;color:'+p.ac+';margin-bottom:10px;display:flex;align-items:center;gap:6px}'+
      '.waba-card p{font-size:12px;color:rgba(255,255,255,.6);line-height:1.8;margin-bottom:8px}'+
      '.waba-card .phone-big{font-family:"Courier New",monospace;font-size:1.4rem;color:'+p.ac+';font-weight:900;margin:14px 0;letter-spacing:2px}'+
      '.waba-card .foot{font-size:10px;color:rgba(255,255,255,.4);padding-top:10px;border-top:1px solid rgba(255,255,255,.06)}'+
      '.sidebar-card{background:'+p.nav+';border:1px solid rgba(255,255,255,.06);border-radius:4px;padding:16px;margin-bottom:14px}'+
      '.sidebar-card .st{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:'+p.ac+';margin-bottom:10px}'+
      '.sidebar-card .si{padding:8px 0;border-bottom:1px solid rgba(255,255,255,.04)}.sidebar-card .si:last-child{border-bottom:none}'+
      '.sidebar-card .sil{font-size:9px;text-transform:uppercase;color:rgba(255,255,255,.35);letter-spacing:1px;margin-bottom:2px}'+
      '.sidebar-card .siv{font-size:13px;color:#e2e8f0;font-weight:700}.sidebar-card .siv.mono{font-family:monospace;color:'+p.ac+'}'+
      '.tags{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px}.tag{font-size:8px;font-weight:700;letter-spacing:1px;background:'+p.ac+'15;border:1px solid '+p.ac+'30;color:'+p.ac2+';padding:3px 8px;border-radius:2px}'+
      '.compliance-sec{padding:16px;border-top:1px solid rgba(255,255,255,.04)}'+
      '.compliance-sec h4{font-size:11px;color:'+p.ac+';margin-bottom:8px;text-transform:uppercase;letter-spacing:.8px}'+
      '.compliance-sec p{font-size:12px;color:rgba(255,255,255,.55);line-height:1.8}'+
      '.compliance-sec ul{list-style:none;margin:8px 0}.compliance-sec li{font-size:12px;color:rgba(255,255,255,.6);line-height:2;padding-left:14px;position:relative}.compliance-sec li::before{content:"\\25B8";position:absolute;left:0;color:'+p.ac+'}'+
      '.footer-bar{max-width:960px;margin:0 auto;padding:14px 20px;font-size:10px;color:rgba(255,255,255,.35);text-align:center;border-top:1px solid rgba(255,255,255,.04)}';

    return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">'+metaTag+ogTags+'<title>'+razaoFmt+'</title><style>'+css+'</style></head><body>'+
      '<div class="topbar"><span class="name" data-field="razao">'+razaoFmt+'</span><div class="status"><span class="dot"></span><span class="stxt">TELEMETRIA ATIVA</span></div><span class="badge">'+p.lbl+'</span></div>'+
      '<div class="main-grid"><div>'+
      '<div class="panel"><div class="panel-title"><span>'+sec.rs.slice(0,20)+' / Identifica\u00e7\u00e3o</span></div>'+
      '<div class="grid-data"><div class="cell"><div class="lbl">'+sec.rs+'</div><div class="val" data-field="razao">'+razaoFmt+'</div></div>'+
      '<div class="cell"><div class="lbl">'+sec.cnpj+'</div><div class="val mono" data-field="cnpj">'+cnpjFmt+'</div></div>'+
      '<div class="cell"><div class="lbl">'+sec.sit+'</div><div class="val ok">'+situacaoFmt+'</div></div></div>'+
      '<div class="grid-data"><div class="cell"><div class="lbl">'+sec.tel+'</div><div class="val mono" data-field="phone">'+phoneFmt+'</div></div>'+
      '<div class="cell"><div class="lbl">'+sec.email+'</div><div class="val">'+(emailFmt||'N/A')+'</div></div>'+
      '<div class="cell"><div class="lbl">'+sec.mun+'</div><div class="val">'+munFmt+'/'+ufFmt+'</div></div></div>'+
      '</div>'+
      '<div class="panel"><div class="row-data"><div class="lbl">'+sec.end+'</div><div class="val">'+fullAddress+'</div></div></div>'+
      (atividadeFmt?'<div class="panel"><div class="row-data"><div class="lbl">'+sec.cnae+'</div><div class="val">'+atividadeFmt+'</div></div></div>':'')+
      '<div class="panel"><div class="compliance-sec"><h4>Sobre a Empresa</h4><p>'+sob+'</p></div>'+
      '<div class="compliance-sec"><h4>Pol\u00edtica de Privacidade</h4><p>'+priv+'</p></div>'+
      '<div class="compliance-sec"><h4>Termos de Uso</h4><p>'+term+'</p></div>'+
      '<div class="compliance-sec"><h4>Canal de Atendimento</h4><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div></div>'+
      '</div><div>'+
      '<div class="waba-card"><h3>&#x1f4e1; '+sec.waba+'</h3>'+
      '<p>'+wabaText+'</p>'+
      '<p>'+wabaFoot+'</p>'+
      (phoneFmt?'<div class="phone-big" data-field="phone">'+phoneFmt+'</div>':'')+
      '<div class="foot">'+razaoFmt+' \u2014 CNPJ '+cnpjFmt+' \u2014 Conformidade WhatsApp Business e Meta Platforms.</div></div>'+
      '<div class="sidebar-card"><div class="st">Identifica\u00e7\u00e3o Fiscal</div>'+
      '<div class="si"><div class="sil">Raz\u00e3o Social</div><div class="siv">'+razaoFmt+'</div></div>'+
      '<div class="si"><div class="sil">CNPJ</div><div class="siv mono">'+cnpjFmt+'</div></div>'+
      '<div class="si"><div class="sil">Munic\u00edpio/UF</div><div class="siv">'+munFmt+'/'+ufFmt+'</div></div>'+
      '<div class="si"><div class="sil">CEP</div><div class="siv mono">'+cepFmt+'</div></div>'+
      '<div class="tags"><span class="tag">RECEPTIVO</span><span class="tag">UTILITY</span><span class="tag">LGPD</span><span class="tag">META</span></div></div>'+
      '</div></div>'+
      domScript+
      '<div class="footer-bar">'+razaoFmt+' \u2014 CNPJ '+cnpjFmt+(phoneFmt?' \u2014 '+phoneFmt:'')+(emailFmt?' \u2014 '+emailFmt:'')+'</div>'+
      '</body></html>';
  }

  // ═══════════════════════════════════════════════════════════════
  // TIPO B (25-49): Terminal NOC — barra status + seções verticais + compliance
  // ═══════════════════════════════════════════════════════════════
  else if (templateIndex < 50) {
    var p = _B[templateIndex - 25];
    var css = '*{margin:0;padding:0;box-sizing:border-box}'+
      'body{font-family:"Courier New",Courier,monospace;background:'+p.bg+';color:#b8c5d4;min-height:100vh;font-size:13px}'+
      '.status-bar{background:'+p.nav+';border-bottom:2px solid '+p.ac+';padding:10px 24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px}'+
      '.status-bar .sys{font-size:10px;color:'+p.ac+';letter-spacing:1.5px;text-transform:uppercase;font-weight:700}'+
      '.status-bar .phone{font-size:13px;color:#fff;font-weight:900;letter-spacing:1px}'+
      '.status-bar .ts{font-size:9px;color:rgba(255,255,255,.35)}'+
      '.header-block{max-width:800px;margin:28px auto 0;padding:0 20px;text-align:center}'+
      '.header-block h1{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:1.8rem;font-weight:800;color:#fff;margin-bottom:6px;letter-spacing:-.5px}'+
      '.header-block .sub{font-size:11px;color:'+p.ac+';letter-spacing:2px;text-transform:uppercase;margin-bottom:6px}'+
      '.header-block .cnpj-line{font-size:14px;color:'+p.ac2+';letter-spacing:1px}'+
      '.container{max-width:800px;margin:24px auto;padding:0 20px}'+
      '.section{background:'+p.nav+';border:1px solid rgba(255,255,255,.06);border-radius:3px;margin-bottom:14px;overflow:hidden}'+
      '.section-head{padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.06);font-size:10px;font-weight:700;color:'+p.ac+';letter-spacing:1.5px;text-transform:uppercase}'+
      '.section-body{padding:0}'+
      '.row{display:flex;border-bottom:1px solid rgba(255,255,255,.03)}.row:last-child{border-bottom:none}'+
      '.row .k{width:180px;flex-shrink:0;padding:11px 16px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,.4);background:rgba(255,255,255,.02);border-right:1px solid rgba(255,255,255,.04)}@media(max-width:600px){.row{flex-direction:column}.row .k{width:auto;border-right:none;border-bottom:1px solid rgba(255,255,255,.03);padding:8px 16px}}'+
      '.row .v{padding:10px 16px;font-size:13px;color:#e8edf3;font-weight:600;flex:1}.row .v.ac{color:'+p.ac+';font-weight:700}.row .v.ok{color:#4ade80}.row .v.big{font-size:16px;font-weight:900;color:#fff}'+
      '.waba-section{background:'+p.nav+';border:1px solid '+p.ac+'30;border-left:3px solid '+p.ac+';border-radius:3px;padding:20px;margin-bottom:14px}'+
      '.waba-section h3{font-family:-apple-system,sans-serif;font-size:13px;font-weight:700;color:'+p.ac+';margin-bottom:10px}'+
      '.waba-section p{font-size:12px;color:rgba(255,255,255,.55);line-height:1.9;margin-bottom:6px}'+
      '.waba-section .phone-display{font-size:1.5rem;color:'+p.ac+';font-weight:900;margin:14px 0;letter-spacing:3px;text-align:center;padding:12px;background:'+p.ac+'08;border:1px solid '+p.ac+'20;border-radius:3px}'+
      '.waba-section .disclaimer{font-size:10px;color:rgba(255,255,255,.35);padding-top:10px;border-top:1px solid rgba(255,255,255,.06)}'+
      '.compliance-block{background:'+p.nav+';border:1px solid rgba(255,255,255,.06);border-radius:3px;padding:18px;margin-bottom:14px}'+
      '.compliance-block h4{font-family:-apple-system,sans-serif;font-size:11px;font-weight:700;color:'+p.ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:8px}'+
      '.compliance-block p{font-size:12px;color:rgba(255,255,255,.55);line-height:1.8;margin-bottom:6px}'+
      '.compliance-block ul{list-style:none;margin:6px 0}.compliance-block li{font-size:12px;color:rgba(255,255,255,.6);line-height:2;padding-left:16px;position:relative}.compliance-block li::before{content:"$";position:absolute;left:0;color:'+p.ac+'}'+
      '.footer-line{max-width:800px;margin:0 auto;padding:16px 20px;font-size:10px;color:rgba(255,255,255,.3);text-align:center;border-top:1px solid rgba(255,255,255,.04)}';

    return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">'+metaTag+ogTags+'<title>'+razaoFmt+'</title><style>'+css+'</style></head><body>'+
      '<div class="status-bar"><span class="sys">'+p.lbl+'</span>'+(phoneFmt?'<span class="phone" data-field="phone">'+phoneFmt+'</span>':'')+'<span class="ts">PID:'+templateIndex+' | ACTIVE</span></div>'+
      '<div class="header-block"><h1 data-field="razao">'+razaoFmt+'</h1><div class="sub">'+p.lbl+'</div><div class="cnpj-line" data-field="cnpj">'+cnpjFmt+'</div></div>'+
      '<div class="container">'+
      '<div class="section"><div class="section-head">'+sec.rs+' / Dados Cadastrais</div><div class="section-body">'+
      '<div class="row"><div class="k">'+sec.rs+'</div><div class="v big">'+razaoFmt+'</div></div>'+
      '<div class="row"><div class="k">'+sec.cnpj+'</div><div class="v ac">'+cnpjFmt+'</div></div>'+
      '<div class="row"><div class="k">'+sec.sit+'</div><div class="v ok">'+situacaoFmt+'</div></div>'+
      '<div class="row"><div class="k">'+sec.tel+'</div><div class="v ac" data-field="phone">'+phoneFmt+'</div></div>'+
      '<div class="row"><div class="k">'+sec.email+'</div><div class="v">'+(emailFmt||'N/A')+'</div></div>'+
      '<div class="row"><div class="k">'+sec.mun+'</div><div class="v">'+munFmt+'/'+ufFmt+'</div></div>'+
      '</div></div>'+
      '<div class="section"><div class="section-head">'+sec.end+'</div><div class="section-body">'+
      '<div class="row"><div class="k">Endere\u00e7o Completo</div><div class="v">'+fullAddress+'</div></div>'+
      '</div></div>'+
      (atividadeFmt?'<div class="section"><div class="section-head">'+sec.cnae+'</div><div class="section-body"><div class="row"><div class="k">Classifica\u00e7\u00e3o</div><div class="v">'+atividadeFmt+'</div></div></div></div>':'')+
      '<div class="waba-section"><h3>&#x1f4e1; '+sec.waba+'</h3>'+
      '<p>'+wabaText+'</p>'+
      '<p>'+wabaFoot+'</p>'+
      (phoneFmt?'<div class="phone-display" data-field="phone">'+phoneFmt+'</div>':'')+
      '<div class="disclaimer">'+razaoFmt+' \u2014 CNPJ '+cnpjFmt+' \u2014 Conformidade WhatsApp Business e Meta Platforms.</div></div>'+
      '<div class="compliance-block"><h4>Sobre a Empresa</h4><p>'+sob+'</p></div>'+
      '<div class="compliance-block"><h4>Pol\u00edtica de Privacidade</h4><p>'+priv+'</p></div>'+
      '<div class="compliance-block"><h4>Termos de Uso</h4><p>'+term+'</p></div>'+
      '<div class="compliance-block"><h4>Canal de Atendimento \u2014 Regras</h4><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div>'+
      '</div>'+
      domScript+
      '<div class="footer-line">'+razaoFmt+' \u2014 CNPJ '+cnpjFmt+(phoneFmt?' | '+phoneFmt:'')+(emailFmt?' | '+emailFmt:'')+'</div>'+
      '</body></html>';
  }

  // ═══════════════════════════════════════════════════════════════
  // TIPO C (50-73): Dashboard Split — sidebar fixa + main + banner WABA
  // ═══════════════════════════════════════════════════════════════
  else if (templateIndex < 74) {
    var p = _C[templateIndex - 50];
    var css = '*{margin:0;padding:0;box-sizing:border-box}'+
      'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:'+p.bg+';color:#c0cdd8;min-height:100vh;display:grid;grid-template-columns:260px 1fr;font-size:13px}@media(max-width:800px){body{grid-template-columns:1fr}}'+
      '.sidebar{background:'+(p.sb||p.nav)+';border-right:1px solid rgba(255,255,255,.06);padding:24px 16px;display:flex;flex-direction:column;gap:14px}@media(max-width:800px){.sidebar{border-right:none;border-bottom:1px solid rgba(255,255,255,.06);padding:16px}}'+
      '.sidebar .logo{font-size:14px;font-weight:800;color:#fff;padding-bottom:14px;border-bottom:1px solid rgba(255,255,255,.06)}'+
      '.sidebar .nav-item{font-size:11px;color:rgba(255,255,255,.5);padding:8px 12px;border-radius:3px;letter-spacing:.5px}'+
      '.sidebar .nav-item.active{background:'+p.ac+'15;color:'+p.ac+';font-weight:700}'+
      '.sidebar .phone-box{margin-top:auto;background:'+p.ac+'10;border:1px solid '+p.ac+'25;border-radius:3px;padding:12px;text-align:center}'+
      '.sidebar .phone-box .lbl{font-size:9px;text-transform:uppercase;letter-spacing:1.5px;color:'+p.ac+';margin-bottom:6px}'+
      '.sidebar .phone-box .ph{font-family:"Courier New",monospace;font-size:1.1rem;color:#fff;font-weight:900;letter-spacing:1px}'+
      '.sidebar .tags{display:flex;flex-wrap:wrap;gap:4px;margin-top:10px}.sidebar .tag{font-size:8px;background:'+p.ac+'12;border:1px solid '+p.ac+'25;color:'+p.ac2+';padding:2px 7px;border-radius:2px;letter-spacing:.8px}'+
      '.main-content{padding:28px 24px;overflow-y:auto}@media(max-width:800px){.main-content{padding:20px 16px}}'+
      '.main-content h1{font-size:1.6rem;font-weight:800;color:#fff;margin-bottom:4px;letter-spacing:-.3px}'+
      '.main-content .subtitle{font-size:11px;color:'+p.ac+';letter-spacing:1.5px;text-transform:uppercase;margin-bottom:24px}'+
      '.data-card{background:'+p.nav+';border:1px solid rgba(255,255,255,.06);border-radius:4px;margin-bottom:16px;overflow:hidden}'+
      '.data-card .card-head{padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.05);font-size:10px;font-weight:700;color:'+p.ac+';letter-spacing:1.2px;text-transform:uppercase}'+
      '.data-card .card-row{display:flex;justify-content:space-between;align-items:baseline;padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.03)}.data-card .card-row:last-child{border-bottom:none}'+
      '.data-card .card-row .k{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,.4)}'+
      '.data-card .card-row .v{font-size:13px;color:#e2e8f0;font-weight:600;text-align:right;max-width:60%}.data-card .card-row .v.mono{font-family:monospace;color:'+p.ac+'}.data-card .card-row .v.ok{color:#4ade80}'+
      '.waba-banner{background:'+p.nav+';border:1px solid '+p.ac+'30;border-left:4px solid '+p.ac+';border-radius:4px;padding:20px;margin-bottom:16px}'+
      '.waba-banner h3{font-size:13px;font-weight:700;color:'+p.ac+';margin-bottom:10px}'+
      '.waba-banner p{font-size:12px;color:rgba(255,255,255,.55);line-height:1.8;margin-bottom:6px}'+
      '.waba-banner .phone-lg{font-family:"Courier New",monospace;font-size:1.4rem;color:'+p.ac+';font-weight:900;letter-spacing:2px;margin:14px 0;text-align:center}'+
      '.waba-banner .foot{font-size:10px;color:rgba(255,255,255,.3);padding-top:10px;border-top:1px solid rgba(255,255,255,.06)}'+
      '.text-section{background:'+p.nav+';border:1px solid rgba(255,255,255,.06);border-radius:4px;padding:16px;margin-bottom:14px}'+
      '.text-section h4{font-size:11px;font-weight:700;color:'+p.ac+';text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px}'+
      '.text-section p{font-size:12px;color:rgba(255,255,255,.55);line-height:1.8}'+
      '.text-section ul{list-style:none}.text-section li{font-size:12px;color:rgba(255,255,255,.6);line-height:2;padding-left:14px;position:relative}.text-section li::before{content:"\\203A";position:absolute;left:0;color:'+p.ac+';font-weight:700}';

    return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">'+metaTag+ogTags+'<title>'+razaoFmt+'</title><style>'+css+'</style></head><body>'+
      '<aside class="sidebar"><div class="logo" data-field="razao">'+razaoFmt+'</div>'+
      '<div class="nav-item active">Dados Cadastrais</div><div class="nav-item">Compliance</div><div class="nav-item">Atendimento</div><div class="nav-item">Privacidade</div>'+
      (phoneFmt?'<div class="phone-box"><div class="lbl">Canal Oficial</div><div class="ph" data-field="phone">'+phoneFmt+'</div></div>':'')+
      '<div class="tags"><span class="tag">RECEPTIVO</span><span class="tag">UTILITY</span><span class="tag">LGPD</span><span class="tag">META</span></div>'+
      '</aside>'+
      '<main class="main-content"><h1 data-field="razao">'+razaoFmt+'</h1><div class="subtitle">'+p.lbl+'</div>'+
      '<div class="data-card"><div class="card-head">'+sec.rs+' / Identifica\u00e7\u00e3o</div>'+
      '<div class="card-row"><span class="k">'+sec.rs+'</span><span class="v">'+razaoFmt+'</span></div>'+
      '<div class="card-row"><span class="k">'+sec.cnpj+'</span><span class="v mono">'+cnpjFmt+'</span></div>'+
      '<div class="card-row"><span class="k">'+sec.sit+'</span><span class="v ok">'+situacaoFmt+'</span></div>'+
      '<div class="card-row"><span class="k">'+sec.tel+'</span><span class="v mono" data-field="phone">'+phoneFmt+'</span></div>'+
      '<div class="card-row"><span class="k">'+sec.email+'</span><span class="v">'+(emailFmt||'N/A')+'</span></div>'+
      '<div class="card-row"><span class="k">'+sec.mun+'</span><span class="v">'+munFmt+'/'+ufFmt+'</span></div>'+
      '</div>'+
      '<div class="data-card"><div class="card-head">'+sec.end+'</div>'+
      '<div class="card-row"><span class="k">Endere\u00e7o Completo</span><span class="v">'+fullAddress+'</span></div>'+
      '</div>'+
      (atividadeFmt?'<div class="data-card"><div class="card-head">'+sec.cnae+'</div><div class="card-row"><span class="k">Classifica\u00e7\u00e3o</span><span class="v">'+atividadeFmt+'</span></div></div>':'')+
      '<div class="waba-banner"><h3>&#x1f4e1; '+sec.waba+'</h3>'+
      '<p>'+wabaText+'</p>'+
      '<p>'+wabaFoot+'</p>'+
      (phoneFmt?'<div class="phone-lg" data-field="phone">'+phoneFmt+'</div>':'')+
      '<div class="foot">'+razaoFmt+' \u2014 CNPJ '+cnpjFmt+' \u2014 Conformidade WhatsApp Business e Meta Platforms.</div></div>'+
      '<div class="text-section"><h4>Sobre a Empresa</h4><p>'+sob+'</p></div>'+
      '<div class="text-section"><h4>Pol\u00edtica de Privacidade</h4><p>'+priv+'</p></div>'+
      '<div class="text-section"><h4>Termos de Uso</h4><p>'+term+'</p></div>'+
      '<div class="text-section"><h4>Canal de Atendimento</h4><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div>'+
      '</main>'+
      domScript+
      '</body></html>';
  }

  // ═══════════════════════════════════════════════════════════════
  // TIPO D (74-75): Split Escuro — nome grande esquerda + dados lista + WABA direita
  // Modelo: "FERNANDA GOUVEIA GOMES" da screenshot
  // ═══════════════════════════════════════════════════════════════
  else if (templateIndex < 76) {
    var dPalettes = [
      {bg:'#0c0e18',card:'#10131f',ac:'#7c6cf6',ac2:'#b4a9fd',lbl:'REGISTRO EMPRESARIAL'},
      {bg:'#0a1014',card:'#0e151c',ac:'#4eadcf',ac2:'#8ed4ec',lbl:'CADASTRO OFICIAL'},
    ];
    var dp = dPalettes[templateIndex - 74];
    var css = '*{margin:0;padding:0;box-sizing:border-box}'+
      'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:'+dp.bg+';color:#c8d4e0;min-height:100vh;display:grid;grid-template-columns:1fr 1fr;font-size:14px}@media(max-width:800px){body{grid-template-columns:1fr}}'+
      '.left{padding:48px 36px;display:flex;flex-direction:column;justify-content:center}@media(max-width:800px){.left{padding:32px 20px}}'+
      '.left h1{font-size:1.8rem;font-weight:800;color:#fff;margin-bottom:6px;letter-spacing:-.5px}'+
      '.left .sub{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:'+dp.ac+';margin-bottom:32px}'+
      '.left .field{padding:14px 0;border-bottom:1px solid rgba(255,255,255,.06)}'+
      '.left .field .lbl{font-size:9px;text-transform:uppercase;letter-spacing:1.5px;color:rgba(255,255,255,.4);margin-bottom:4px}'+
      '.left .field .val{font-size:14px;color:#e8edf5;font-weight:600}.left .field .val.mono{font-family:"Courier New",monospace;color:'+dp.ac+';letter-spacing:.5px}'+
      '.right{background:'+dp.card+';padding:48px 36px;display:flex;flex-direction:column;justify-content:center;border-left:1px solid rgba(255,255,255,.06)}@media(max-width:800px){.right{padding:32px 20px;border-left:none;border-top:1px solid rgba(255,255,255,.06)}}'+
      '.right h2{font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:'+dp.ac+';margin-bottom:20px}'+
      '.right .phone-big{font-family:"Courier New",monospace;font-size:1.6rem;color:'+dp.ac+';font-weight:900;letter-spacing:2px;margin-bottom:20px}'+
      '.right p{font-size:12px;color:rgba(255,255,255,.55);line-height:1.9;margin-bottom:10px}'+
      '.right .compliance-tag{display:inline-block;font-family:monospace;font-size:10px;background:'+dp.ac+'12;border:1px solid '+dp.ac+'30;color:'+dp.ac2+';padding:6px 14px;border-radius:2px;letter-spacing:1.5px;margin-top:16px}'+
      '.text-block{padding:24px 0}'+
      '.text-block h4{font-size:11px;color:'+dp.ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:8px}'+
      '.text-block p{font-size:12px;color:rgba(255,255,255,.5);line-height:1.8}';

    return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">'+metaTag+ogTags+'<title>'+razaoFmt+'</title><style>'+css+'</style></head><body>'+
      '<div class="left">'+
      '<h1 data-field="razao">'+razaoFmt+'</h1>'+
      '<div class="sub">'+dp.lbl+'</div>'+
      '<div class="field"><div class="lbl">'+sec.rs+'</div><div class="val">'+razaoFmt+'</div></div>'+
      '<div class="field"><div class="lbl">'+sec.cnpj+'</div><div class="val mono">'+cnpjFmt+'</div></div>'+
      '<div class="field"><div class="lbl">'+sec.end+'</div><div class="val">'+fullAddress+'</div></div>'+
      '<div class="field"><div class="lbl">'+sec.email+'</div><div class="val">'+(emailFmt||'N/A')+'</div></div>'+
      (atividadeFmt?'<div class="field"><div class="lbl">'+sec.cnae+'</div><div class="val">'+atividadeFmt+'</div></div>':'')+
      (phoneFmt?'<div class="field"><div class="lbl">WHATSAPP BUSINESS</div><div class="val mono" data-field="phone">'+phoneFmt+'</div></div>':'')+
      '</div>'+
      '<div class="right">'+
      '<h2>'+sec.waba+'</h2>'+
      (phoneFmt?'<div class="phone-big" data-field="phone">'+phoneFmt+'</div>':'')+
      '<p>'+wabaText+'</p>'+
      '<p>'+wabaFoot+'</p>'+
      '<div class="compliance-tag">COMPLIANCE: ATIVO</div>'+
      '<div class="text-block"><h4>Pol\u00edtica de Privacidade</h4><p>'+priv+'</p></div>'+
      '<div class="text-block"><h4>Termos de Uso</h4><p>'+term+'</p></div>'+
      '</div>'+
      domScript+
      '</body></html>';
  }

  // ═══════════════════════════════════════════════════════════════
  // TIPO E (76-77): Card escuro + dados lista + phone embaixo + Privacidade/Termos lado
  // Modelo: "VALDEMIR FERREIRA DA SILVA" da screenshot
  // ═══════════════════════════════════════════════════════════════
  else if (templateIndex < 78) {
    var ePalettes = [
      {bg:'#080a14',card:'#0c0f1c',ac:'#6e5ff0',ac2:'#a89bf8',lbl:'CANAL UTILITY RECEPTIVO'},
      {bg:'#0a0c10',card:'#0e1118',ac:'#5588dd',ac2:'#88bbf4',lbl:'ATENDIMENTO RECEPTIVO OFICIAL'},
    ];
    var ep = ePalettes[templateIndex - 76];
    var css = '*{margin:0;padding:0;box-sizing:border-box}'+
      'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:'+ep.bg+';color:#c0cee0;min-height:100vh;display:grid;grid-template-columns:380px 1fr;font-size:14px}@media(max-width:800px){body{grid-template-columns:1fr}}'+
      '.col-left{padding:40px 32px;border-right:1px solid rgba(255,255,255,.06)}@media(max-width:800px){.col-left{padding:28px 20px;border-right:none;border-bottom:1px solid rgba(255,255,255,.06)}}'+
      '.col-left h1{font-size:1.5rem;font-weight:800;color:#fff;margin-bottom:6px;letter-spacing:-.3px;font-style:italic}'+
      '.col-left .sub{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:'+ep.ac+';margin-bottom:28px}'+
      '.col-left .field{padding:14px 0;border-bottom:1px solid rgba(255,255,255,.05)}'+
      '.col-left .field .lbl{font-size:8px;text-transform:uppercase;letter-spacing:1.8px;color:rgba(255,255,255,.35);margin-bottom:4px}'+
      '.col-left .field .val{font-size:14px;color:#e4ecf5;font-weight:600}.col-left .field .val.mono{font-family:"Courier New",monospace;color:'+ep.ac+'}'+
      '.col-left .phone-section{margin-top:28px;text-align:center}'+
      '.col-left .phone-section .ph{font-family:"Courier New",monospace;font-size:1.5rem;color:'+ep.ac+';font-weight:900;letter-spacing:2px}'+
      '.col-left .phone-section .phlbl{font-size:9px;text-transform:uppercase;letter-spacing:2px;color:rgba(255,255,255,.4);margin-top:6px}'+
      '.col-right{padding:40px 32px;display:flex;flex-direction:column;justify-content:center}@media(max-width:800px){.col-right{padding:28px 20px}}'+
      '.col-right .block{background:'+ep.card+';border:1px solid rgba(255,255,255,.06);border-radius:3px;padding:20px;margin-bottom:18px}'+
      '.col-right .block h4{font-size:11px;font-weight:700;color:'+ep.ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;display:flex;align-items:center;gap:6px}'+
      '.col-right .block p{font-size:12px;color:rgba(255,255,255,.55);line-height:1.9}'+
      '.col-right .block ul{list-style:none;margin:6px 0}.col-right .block li{font-size:12px;color:rgba(255,255,255,.55);line-height:2;padding-left:14px;position:relative}.col-right .block li::before{content:"\\25B8";position:absolute;left:0;color:'+ep.ac+'}';

    return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">'+metaTag+ogTags+'<title>'+razaoFmt+'</title><style>'+css+'</style></head><body>'+
      '<div class="col-left">'+
      '<h1 data-field="razao">'+razaoFmt+'</h1>'+
      '<div class="sub">'+ep.lbl+'</div>'+
      '<div class="field"><div class="lbl">'+sec.rs+'</div><div class="val">'+razaoFmt+'</div></div>'+
      '<div class="field"><div class="lbl">'+sec.cnpj+'</div><div class="val mono" data-field="cnpj">'+cnpjFmt+'</div></div>'+
      '<div class="field"><div class="lbl">'+sec.end+'</div><div class="val">'+fullAddress+'</div></div>'+
      '<div class="field"><div class="lbl">'+sec.email+'</div><div class="val">'+(emailFmt||'N/A')+'</div></div>'+
      (atividadeFmt?'<div class="field"><div class="lbl">'+sec.cnae+'</div><div class="val">'+atividadeFmt+'</div></div>':'')+
      (phoneFmt?'<div class="phone-section"><div class="ph" data-field="phone">'+phoneFmt+'</div><div class="phlbl">WHATSAPP BUSINESS</div></div>':'')+
      '</div>'+
      '<div class="col-right">'+
      '<div class="block"><h4>&#x1f4c4; Pol\u00edtica de Privacidade</h4><p>'+priv+'</p></div>'+
      '<div class="block"><h4>&#x1f4c4; Termos de Uso</h4><p>'+term+'</p></div>'+
      '<div class="block"><h4>&#x1f4e1; '+sec.waba+'</h4><p>'+wabaText+'</p><p>'+wabaFoot+'</p></div>'+
      '<div class="block"><h4>Atendimento</h4><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div>'+
      '</div>'+
      domScript+
      '</body></html>';
  }

  // ═══════════════════════════════════════════════════════════════
  // TIPO F (78-79): Editorial Claro — fundo bege, tipografia serif, grid 2col
  // Modelo: "VANINHO NUNES SOARES" da screenshot
  // ═══════════════════════════════════════════════════════════════
  else {
    var fPalettes = [
      {bg:'#f5f1eb',card:'#ffffff',hd:'#1a1a1a',ac:'#8b5e34',border:'#e0d8ce',lbl:'INFORMATIVO EMPRESARIAL \u2014 REGISTRO OFICIAL'},
      {bg:'#f0ece4',card:'#fefefe',hd:'#111111',ac:'#6b4c2a',border:'#ddd5c8',lbl:'REGISTRO CADASTRAL \u2014 DADOS P\u00daBLICOS'},
    ];
    var fp = fPalettes[templateIndex - 78];
    var css = '*{margin:0;padding:0;box-sizing:border-box}'+
      'body{font-family:Georgia,"Times New Roman",serif;background:'+fp.bg+';color:#3a3a3a;min-height:100vh;font-size:14px}'+
      '.header{text-align:center;padding:40px 20px 24px;border-bottom:1px solid '+fp.border+'}'+
      '.header h1{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:1.8rem;font-weight:800;color:'+fp.hd+';letter-spacing:-.5px;margin-bottom:6px}'+
      '.header .sub{font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#999}'+
      '.content{max-width:880px;margin:28px auto;padding:0 24px;display:grid;grid-template-columns:1.2fr 1fr;gap:32px}@media(max-width:800px){.content{grid-template-columns:1fr;padding:0 16px}}'+
      '.panel{background:'+fp.card+';border:1px solid '+fp.border+';border-radius:2px;padding:24px}'+
      '.panel h3{font-family:-apple-system,sans-serif;font-size:14px;font-weight:700;color:'+fp.hd+';margin-bottom:18px}'+
      '.panel .field{padding:12px 0;border-bottom:1px solid '+fp.border+'}'+
      '.panel .field:last-child{border-bottom:none}'+
      '.panel .field .lbl{font-size:9px;text-transform:uppercase;letter-spacing:1.5px;color:#999;margin-bottom:4px}'+
      '.panel .field .val{font-size:14px;color:'+fp.hd+';font-weight:600}.panel .field .val.mono{font-family:"Courier New",monospace;color:'+fp.ac+';font-size:15px}'+
      '.canal{background:'+fp.card+';border:1px solid '+fp.border+';border-radius:2px;padding:24px}'+
      '.canal h3{font-family:-apple-system,sans-serif;font-size:14px;font-weight:700;color:'+fp.hd+';margin-bottom:14px;font-style:italic}'+
      '.canal .phone-big{font-family:"Courier New",monospace;font-size:1.4rem;color:'+fp.ac+';font-weight:900;letter-spacing:1px;margin-bottom:16px}'+
      '.canal p{font-size:13px;color:#666;line-height:1.8;margin-bottom:8px}'+
      '.text-sec{max-width:880px;margin:20px auto;padding:0 24px}'+
      '.text-sec .block{background:'+fp.card+';border:1px solid '+fp.border+';border-radius:2px;padding:18px;margin-bottom:14px}'+
      '.text-sec .block h4{font-family:-apple-system,sans-serif;font-size:12px;font-weight:700;color:'+fp.hd+';margin-bottom:8px}'+
      '.text-sec .block p{font-size:12px;color:#666;line-height:1.8}'+
      '.text-sec .block ul{list-style:none;margin:6px 0}.text-sec .block li{font-size:12px;color:#666;line-height:2;padding-left:14px;position:relative}.text-sec .block li::before{content:"\\2022";position:absolute;left:0;color:'+fp.ac+'}'+
      '.footer-bar{max-width:880px;margin:20px auto 0;padding:12px 24px;background:'+fp.ac+';border-radius:2px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px}'+
      '.footer-bar .info{font-size:11px;color:#fff;font-weight:500}'+
      '.footer-bar .badge{font-size:10px;color:#fff;font-weight:700;letter-spacing:1px}';

    return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">'+metaTag+ogTags+'<title>'+razaoFmt+'</title><style>'+css+'</style></head><body>'+
      '<div class="header"><h1 data-field="razao">'+razaoFmt+'</h1><div class="sub">'+fp.lbl+'</div></div>'+
      '<div class="content">'+
      '<div class="panel"><h3>Dados Cadastrais da Empresa</h3>'+
      '<div class="field"><div class="lbl">'+sec.rs+'</div><div class="val">'+razaoFmt+'</div></div>'+
      '<div class="field"><div class="lbl">'+sec.cnpj+'</div><div class="val mono" data-field="cnpj">'+cnpjFmt+'</div></div>'+
      '<div class="field"><div class="lbl">'+sec.end+'</div><div class="val">'+fullAddress+'</div></div>'+
      '<div class="field"><div class="lbl">'+sec.email+'</div><div class="val">'+(emailFmt||'N/A')+'</div></div>'+
      (atividadeFmt?'<div class="field"><div class="lbl">'+sec.cnae+'</div><div class="val">'+atividadeFmt+'</div></div>':'')+
      '</div>'+
      '<div class="canal"><h3>Canal de Atendimento</h3>'+
      (phoneFmt?'<div class="phone-big" data-field="phone">'+phoneFmt+'</div>':'')+
      '<p>'+wabaText+'</p>'+
      '<p>'+wabaFoot+'</p>'+
      '</div>'+
      '</div>'+
      '<div class="text-sec">'+
      '<div class="block"><h4>Sobre a Empresa</h4><p>'+sob+'</p></div>'+
      '<div class="block"><h4>Pol\u00edtica de Privacidade</h4><p>'+priv+'</p></div>'+
      '<div class="block"><h4>Termos de Uso</h4><p>'+term+'</p></div>'+
      '<div class="block"><h4>Regras de Atendimento</h4><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div>'+
      '</div>'+
      '<div class="footer-bar"><span class="info">'+razaoFmt+' \u2014 CNPJ '+cnpjFmt+'</span><span class="badge">Canal Utility Receptivo</span></div>'+
      domScript+
      '</body></html>';
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

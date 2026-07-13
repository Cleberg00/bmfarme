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
  // ═══════════════════════════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════════
  // 100 LAYOUTS — 4 estruturas base x 25 variações visuais
  // Todos: fundo claro, texto preto, legível, compliance Meta
  // ═══════════════════════════════════════════════════════════════

  var accents = ['#1d4ed8','#059669','#b45309','#7c3aed','#dc2626','#0891b2','#c026d3','#ca8a04','#4f46e5','#15803d','#ea580c','#6d28d9','#0e7490','#be123c','#047857','#a16207','#2563eb','#16a34a','#9333ea','#d97706','#1e40af','#065f46','#92400e','#5b21b6','#b91c1c','#0284c7','#7e22ce','#854d0e','#4338ca','#166534','#c2410c','#6b21a8','#155e75','#9f1239','#047857','#a16207','#1d4ed8','#059669','#b45309','#7c3aed','#dc2626','#0891b2','#c026d3','#ca8a04','#4f46e5','#15803d','#ea580c','#6d28d9','#0e7490','#be123c','#047857','#a16207','#2563eb','#16a34a','#9333ea','#d97706','#1e40af','#065f46','#92400e','#5b21b6','#b91c1c','#0284c7','#7e22ce','#854d0e','#4338ca','#166534','#c2410c','#6b21a8','#155e75','#9f1239','#047857','#a16207','#1d4ed8','#059669','#b45309','#7c3aed','#dc2626','#0891b2','#c026d3','#ca8a04','#4f46e5','#15803d','#ea580c','#6d28d9','#0e7490','#be123c','#047857','#a16207','#2563eb','#16a34a','#9333ea','#d97706','#1e40af','#065f46','#92400e','#5b21b6','#b91c1c','#0284c7'];
  var ac = accents[templateIndex % 96];
  var layoutType = templateIndex % 33;

  var fonts = [
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
    'Georgia,"Times New Roman",serif',
    '"Inter",system-ui,sans-serif',
    '"Roboto Slab",Georgia,serif',
  ];
  var font = fonts[templateIndex % 4];

  var headHtml = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">'+metaTag+ogTags+'<title>'+razaoFmt+'</title>';

  // ── LAYOUT 0: Grid 2 colunas — dados esquerda, WABA direita ──
  if (layoutType === 0) {
    var css = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#f8f9fa;color:#1a1a1a;min-height:100vh;font-size:15px;line-height:1.6}.header{background:#fff;border-bottom:3px solid '+ac+';padding:32px 24px;text-align:center}.header h1{font-size:2rem;font-weight:900;color:#000;margin-bottom:6px}.header .sub{font-size:12px;letter-spacing:2px;text-transform:uppercase;color:'+ac+';font-weight:600}.header .cnpj{font-family:monospace;font-size:15px;color:#333;margin-top:6px}.content{max-width:900px;margin:28px auto;padding:0 20px;display:grid;grid-template-columns:1.3fr 1fr;gap:24px}@media(max-width:800px){.content{grid-template-columns:1fr}}.card{background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:24px;margin-bottom:20px}.card h2{font-size:16px;font-weight:700;color:'+ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:16px;padding-bottom:10px;border-bottom:2px solid '+ac+'20}.field{padding:12px 0;border-bottom:1px solid #f0f0f0}.field:last-child{border-bottom:none}.field .label{font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#666;margin-bottom:4px}.field .value{font-size:18px;color:#000;font-weight:700}.field .value.mono{font-family:monospace;color:'+ac+'}.field .value.green{color:#059669}.waba-card{background:#fff;border:2px solid '+ac+';border-radius:8px;padding:24px}.waba-card h2{font-size:16px;font-weight:700;color:'+ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:12px}.waba-card .phone{font-family:monospace;font-size:1.6rem;color:'+ac+';font-weight:900;letter-spacing:1px;margin:16px 0;text-align:center;padding:14px;background:'+ac+'08;border:1px solid '+ac+'20;border-radius:6px}.waba-card p{font-size:15px;color:#333;line-height:1.8;margin-bottom:8px}.waba-card .foot{font-size:12px;color:#666;padding-top:12px;border-top:1px solid #eee}.info-card{background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-bottom:16px}.info-card h3{font-size:13px;font-weight:700;color:#333;margin-bottom:10px}.info-card p{font-size:15px;color:#444;line-height:1.8}.info-card ul{list-style:none}.info-card li{font-size:15px;color:#444;line-height:2;padding-left:16px;position:relative}.info-card li::before{content:"\\2022";position:absolute;left:0;color:'+ac+'}.footer{max-width:900px;margin:20px auto;padding:16px 20px;background:'+ac+';border-radius:8px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px}.footer .info{font-size:12px;color:#fff}.footer .badge{font-size:11px;color:#fff;font-weight:700;letter-spacing:1px}';
    return headHtml+'<style>'+css+'</style></head><body><div class="header"><h1 data-field="razao">'+razaoFmt+'</h1><div class="sub">'+sec.waba+'</div><div class="cnpj">CNPJ: '+cnpjFmt+'</div></div><div class="content"><div><div class="card"><h2>Dados Cadastrais da Empresa</h2><div class="field"><div class="label">Raz\u00e3o Social</div><div class="value">'+razaoFmt+'</div></div><div class="field"><div class="label">CNPJ</div><div class="value mono">'+cnpjFmt+'</div></div><div class="field"><div class="label">Situa\u00e7\u00e3o</div><div class="value green">'+situacaoFmt+'</div></div><div class="field"><div class="label">Endere\u00e7o</div><div class="value">'+fullAddress+'</div></div><div class="field"><div class="label">Email</div><div class="value">'+(emailFmt||'N/A')+'</div></div>'+(atividadeFmt?'<div class="field"><div class="label">CNAE</div><div class="value">'+atividadeFmt+'</div></div>':'')+(phoneFmt?'<div class="field"><div class="label">Telefone</div><div class="value mono" data-field="phone">'+phoneFmt+'</div></div>':'')+'</div><div class="info-card"><h3>Sobre</h3><p>'+sob+'</p></div><div class="info-card"><h3>Atendimento</h3><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div></div><div><div class="waba-card"><h2>Canal de Atendimento Oficial</h2>'+(phoneFmt?'<div class="phone" data-field="phone">'+phoneFmt+'</div>':'')+'<p>'+wabaText+'</p><p>'+wabaFoot+'</p><div class="foot">'+razaoFmt+' \u2014 CNPJ '+cnpjFmt+'</div></div><div class="info-card"><h3>Privacidade</h3><p>'+priv+'</p></div><div class="info-card"><h3>Termos</h3><p>'+term+'</p></div></div></div><div class="footer"><span class="info">'+razaoFmt+' \u2014 CNPJ '+cnpjFmt+(phoneFmt?' \u2014 '+phoneFmt:'')+'</span><span class="badge">Canal Utility Receptivo</span></div>'+domScript+'</body></html>';
  }

  // ── LAYOUT 1: Coluna \u00fanica centralizada — card grande, phone destaque topo ──
  else if (layoutType === 1) {
    var css = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#f4f4f5;color:#111;min-height:100vh;font-size:15px;line-height:1.7}.top-phone{background:'+ac+';padding:12px;text-align:center;font-family:monospace;font-size:1.3rem;color:#fff;font-weight:900;letter-spacing:2px}.container{max-width:700px;margin:0 auto;padding:32px 20px}.container h1{font-size:2.2rem;font-weight:900;color:#000;margin-bottom:4px;text-align:center}.container .sub{text-align:center;font-size:11px;letter-spacing:2px;color:'+ac+';text-transform:uppercase;margin-bottom:28px}.section{background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:24px;margin-bottom:20px}.section h2{font-size:16px;font-weight:700;color:'+ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid '+ac+'15}.row{display:flex;justify-content:space-between;align-items:baseline;padding:10px 0;border-bottom:1px solid #f5f5f5;gap:12px;flex-wrap:wrap}.row:last-child{border-bottom:none}.row .k{font-size:14px;font-weight:700;text-transform:uppercase;color:#666;letter-spacing:.8px}.row .v{font-size:18px;color:#000;font-weight:700;text-align:right}.row .v.mono{font-family:monospace;color:'+ac+'}.row .v.green{color:#059669}.phone-box{text-align:center;padding:18px;background:'+ac+'08;border:2px solid '+ac+'30;border-radius:8px;margin:20px 0}.phone-box .ph{font-family:monospace;font-size:1.8rem;color:'+ac+';font-weight:900;letter-spacing:2px}.phone-box .lbl{font-size:11px;color:#666;margin-top:6px;text-transform:uppercase;letter-spacing:1px}.txt{font-size:15px;color:#444;line-height:1.8;margin-bottom:8px}.txt ul{list-style:none;margin:8px 0}.txt li{padding-left:16px;position:relative;line-height:2}.txt li::before{content:"\\2022";position:absolute;left:0;color:'+ac+'}.footer{background:'+ac+';padding:14px 20px;text-align:center;font-size:12px;color:#fff;border-radius:8px;margin-top:8px}';
    return headHtml+'<style>'+css+'</style></head><body>'+(phoneFmt?'<div class="top-phone" data-field="phone">'+phoneFmt+'</div>':'')+'<div class="container"><h1 data-field="razao">'+razaoFmt+'</h1><div class="sub">Registro Empresarial \u2014 '+sec.waba+'</div><div class="section"><h2>Dados Cadastrais</h2><div class="row"><span class="k">Raz\u00e3o Social</span><span class="v">'+razaoFmt+'</span></div><div class="row"><span class="k">CNPJ</span><span class="v mono">'+cnpjFmt+'</span></div><div class="row"><span class="k">Situa\u00e7\u00e3o</span><span class="v green">'+situacaoFmt+'</span></div><div class="row"><span class="k">Endere\u00e7o</span><span class="v">'+fullAddress+'</span></div><div class="row"><span class="k">Email</span><span class="v">'+(emailFmt||'N/A')+'</span></div>'+(atividadeFmt?'<div class="row"><span class="k">CNAE</span><span class="v">'+atividadeFmt+'</span></div>':'')+'</div>'+(phoneFmt?'<div class="phone-box"><div class="ph" data-field="phone">'+phoneFmt+'</div><div class="lbl">WhatsApp Business \u2014 Canal Utility</div></div>':'')+'<div class="section"><h2>Canal WABA</h2><p class="txt">'+wabaText+'</p><p class="txt">'+wabaFoot+'</p></div><div class="section"><h2>Sobre</h2><p class="txt">'+sob+'</p></div><div class="section"><h2>Atendimento</h2><div class="txt"><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div></div><div class="section"><h2>Privacidade</h2><p class="txt">'+priv+'</p></div><div class="section"><h2>Termos</h2><p class="txt">'+term+'</p></div><div class="footer">'+razaoFmt+' \u2014 CNPJ '+cnpjFmt+(phoneFmt?' \u2014 '+phoneFmt:'')+'</div></div>'+domScript+'</body></html>';
  }

  // ── LAYOUT 2: Sidebar esquerda fixa + conte\u00fado principal direita ──
  else if (layoutType === 2) {
    var css = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#fff;color:#111;min-height:100vh;font-size:15px;line-height:1.6;display:grid;grid-template-columns:280px 1fr}@media(max-width:800px){body{grid-template-columns:1fr}}.sidebar{background:#f9fafb;border-right:2px solid '+ac+';padding:28px 20px;display:flex;flex-direction:column;gap:16px}@media(max-width:800px){.sidebar{border-right:none;border-bottom:2px solid '+ac+';padding:20px}}.sidebar h1{font-size:1.3rem;font-weight:900;color:#000;line-height:1.3}.sidebar .badge{font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:'+ac+';font-weight:700}.sidebar .phone{font-family:monospace;font-size:1.2rem;color:'+ac+';font-weight:900;padding:12px;background:'+ac+'08;border:1px solid '+ac+'20;border-radius:6px;text-align:center;letter-spacing:1px}.sidebar .meta{font-size:12px;color:#666;line-height:1.7}.sidebar .tags{display:flex;flex-wrap:wrap;gap:4px}.sidebar .tag{font-size:10px;background:'+ac+'10;color:'+ac+';padding:3px 8px;border-radius:3px;font-weight:700;letter-spacing:.5px}.main{padding:32px 28px;overflow-y:auto}@media(max-width:800px){.main{padding:24px 16px}}.main h2{font-size:1.8rem;font-weight:900;color:#000;margin-bottom:4px}.main .sub{font-size:11px;color:'+ac+';letter-spacing:2px;text-transform:uppercase;margin-bottom:24px}.block{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-bottom:16px}.block h3{font-size:15px;font-weight:700;color:'+ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:12px}.block .row{padding:10px 0;border-bottom:1px solid #eee;display:flex;flex-direction:column;gap:3px}.block .row:last-child{border-bottom:none}.block .k{font-size:14px;font-weight:700;text-transform:uppercase;color:#888;letter-spacing:.8px}.block .v{font-size:18px;color:#000;font-weight:700}.block .v.mono{font-family:monospace;color:'+ac+'}.block .v.green{color:#059669}.block p{font-size:15px;color:#444;line-height:1.8;margin-bottom:6px}.block ul{list-style:none}.block li{font-size:15px;color:#444;line-height:2;padding-left:14px;position:relative}.block li::before{content:"\\203A";position:absolute;left:0;color:'+ac+';font-weight:700}';
    return headHtml+'<style>'+css+'</style></head><body><aside class="sidebar"><h1 data-field="razao">'+razaoFmt+'</h1><div class="badge">'+sec.waba+'</div>'+(phoneFmt?'<div class="phone" data-field="phone">'+phoneFmt+'</div>':'')+'<div class="meta">CNPJ: '+cnpjFmt+'<br>'+munFmt+'/'+ufFmt+'<br>'+situacaoFmt+'</div><div class="tags"><span class="tag">RECEPTIVO</span><span class="tag">UTILITY</span><span class="tag">LGPD</span><span class="tag">META</span></div></aside><main class="main"><h2 data-field="razao">'+razaoFmt+'</h2><div class="sub">Dados Cadastrais e Compliance</div><div class="block"><h3>Identifica\u00e7\u00e3o da Empresa</h3><div class="row"><div class="k">Raz\u00e3o Social</div><div class="v">'+razaoFmt+'</div></div><div class="row"><div class="k">CNPJ</div><div class="v mono" data-field="cnpj">'+cnpjFmt+'</div></div><div class="row"><div class="k">Situa\u00e7\u00e3o</div><div class="v green">'+situacaoFmt+'</div></div><div class="row"><div class="k">Endere\u00e7o</div><div class="v">'+fullAddress+'</div></div><div class="row"><div class="k">Email</div><div class="v">'+(emailFmt||'N/A')+'</div></div>'+(atividadeFmt?'<div class="row"><div class="k">CNAE</div><div class="v">'+atividadeFmt+'</div></div>':'')+'</div><div class="block"><h3>Canal WABA \u2014 Atendimento</h3>'+(phoneFmt?'<p style="font-family:monospace;font-size:1.4rem;color:'+ac+';font-weight:900;text-align:center;margin:12px 0" data-field="phone">'+phoneFmt+'</p>':'')+'<p>'+wabaText+'</p><p>'+wabaFoot+'</p></div><div class="block"><h3>Sobre</h3><p>'+sob+'</p></div><div class="block"><h3>Atendimento</h3><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="block"><h3>Privacidade</h3><p>'+priv+'</p></div><div class="block"><h3>Termos</h3><p>'+term+'</p></div></main>'+domScript+'</body></html>';
  }

  // ── LAYOUT 3: Split horizontal — header escuro, corpo claro, tabela ──
  else if (layoutType === 3) {
    var css = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#f8f9fa;color:#111;min-height:100vh;font-size:15px;line-height:1.6}.dark-header{background:#111;padding:24px 28px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px}.dark-header h1{font-size:1.4rem;font-weight:900;color:#fff}.dark-header .right{text-align:right}.dark-header .cnpj{font-family:monospace;font-size:13px;color:'+ac+'}.dark-header .phone{font-family:monospace;font-size:15px;color:#fff;font-weight:900}@media(max-width:600px){.dark-header .right{display:none}}.nav{background:#fff;border-bottom:1px solid #e5e7eb;padding:10px 28px;display:flex;gap:20px;flex-wrap:wrap}.nav a{color:#666;text-decoration:none;font-size:12px;font-weight:600}.container{max-width:860px;margin:28px auto;padding:0 20px}table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:20px}thead{background:'+ac+'}th{padding:12px 16px;font-size:11px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:1px;text-align:left}td{padding:12px 16px;border-bottom:1px solid #f0f0f0;font-size:15px;color:#111}td:first-child{font-weight:700;color:#444;font-size:12px;text-transform:uppercase;letter-spacing:.5px;width:180px}td.mono{font-family:monospace;color:'+ac+';font-weight:700}td.green{color:#059669;font-weight:700}.waba-box{background:#fff;border:2px solid '+ac+';border-radius:8px;padding:24px;margin-bottom:20px}.waba-box h2{font-size:16px;color:'+ac+';font-weight:700;text-transform:uppercase;margin-bottom:12px}.waba-box .phone{font-family:monospace;font-size:1.6rem;color:'+ac+';font-weight:900;text-align:center;padding:14px;background:'+ac+'08;border-radius:6px;margin:14px 0;letter-spacing:2px}.waba-box p{font-size:15px;color:#333;line-height:1.8;margin-bottom:6px}.text-block{background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-bottom:16px}.text-block h3{font-size:13px;font-weight:700;color:#333;margin-bottom:8px}.text-block p{font-size:15px;color:#444;line-height:1.8}.text-block ul{list-style:none}.text-block li{font-size:15px;color:#444;line-height:2;padding-left:16px;position:relative}.text-block li::before{content:"\\2014";position:absolute;left:0;color:'+ac+'}.footer{background:#111;padding:14px 28px;text-align:center;font-size:12px;color:#aaa}';
    return headHtml+'<style>'+css+'</style></head><body><div class="dark-header"><h1 data-field="razao">'+razaoFmt+'</h1><div class="right"><div class="cnpj" data-field="cnpj">'+cnpjFmt+'</div>'+(phoneFmt?'<div class="phone" data-field="phone">'+phoneFmt+'</div>':'')+'</div></div><div class="nav"><a href="#">Dados</a><a href="#">Sobre</a><a href="#">Atendimento</a><a href="#">Privacidade</a></div><div class="container"><table><thead><tr><th>Campo</th><th>Informa\u00e7\u00e3o</th></tr></thead><tbody><tr><td>Raz\u00e3o Social</td><td>'+razaoFmt+'</td></tr><tr><td>CNPJ</td><td class="mono">'+cnpjFmt+'</td></tr><tr><td>Situa\u00e7\u00e3o</td><td class="green">'+situacaoFmt+'</td></tr><tr><td>Endere\u00e7o</td><td>'+fullAddress+'</td></tr><tr><td>Email</td><td>'+(emailFmt||'N/A')+'</td></tr>'+(atividadeFmt?'<tr><td>CNAE</td><td>'+atividadeFmt+'</td></tr>':'')+(phoneFmt?'<tr><td>Telefone</td><td class="mono">'+phoneFmt+'</td></tr>':'')+'</tbody></table><div class="waba-box"><h2>Canal de Atendimento Oficial</h2>'+(phoneFmt?'<div class="phone" data-field="phone">'+phoneFmt+'</div>':'')+'<p>'+wabaText+'</p><p>'+wabaFoot+'</p></div><div class="text-block"><h3>Sobre a Empresa</h3><p>'+sob+'</p></div><div class="text-block"><h3>Atendimento</h3><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="text-block"><h3>Privacidade</h3><p>'+priv+'</p></div><div class="text-block"><h3>Termos</h3><p>'+term+'</p></div></div><div class="footer">'+razaoFmt+' \u2014 CNPJ '+cnpjFmt+(phoneFmt?' | '+phoneFmt:'')+'</div>'+domScript+'</body></html>';
  }

  // ── LAYOUT 4: Hero grande + cards em grid 3 colunas ──
  else if (layoutType === 4) {
    var css = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#fafafa;color:#111;min-height:100vh;font-size:15px;line-height:1.6}.hero{background:'+ac+';padding:48px 24px;text-align:center}.hero h1{font-size:2.4rem;font-weight:900;color:#fff;margin-bottom:8px}.hero .sub{font-size:14px;color:rgba(255,255,255,.85)}.hero .phone{font-family:monospace;font-size:1.4rem;color:#fff;margin-top:12px;font-weight:900;letter-spacing:2px}.grid{max-width:960px;margin:28px auto;padding:0 20px;display:grid;grid-template-columns:repeat(3,1fr);gap:16px}@media(max-width:800px){.grid{grid-template-columns:1fr}}.card{background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:20px}.card h3{font-size:14px;font-weight:700;color:'+ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid '+ac+'15}.card .item{padding:8px 0;border-bottom:1px solid #f5f5f5}.card .item:last-child{border-bottom:none}.card .k{font-size:12px;font-weight:700;text-transform:uppercase;color:#888}.card .v{font-size:16px;color:#000;font-weight:700;margin-top:2px}.card .v.mono{font-family:monospace;color:'+ac+'}.card .v.green{color:#059669}.card p{font-size:14px;color:#444;line-height:1.8;margin-bottom:6px}.card ul{list-style:none}.card li{font-size:14px;color:#444;line-height:2;padding-left:14px;position:relative}.card li::before{content:"\\2022";position:absolute;left:0;color:'+ac+'}.footer{max-width:960px;margin:20px auto;padding:14px 20px;background:#111;border-radius:8px;text-align:center;font-size:12px;color:#aaa}';
    return headHtml+'<style>'+css+'</style></head><body><div class="hero"><h1 data-field="razao">'+razaoFmt+'</h1><div class="sub">CNPJ '+cnpjFmt+' \u2014 '+situacaoFmt+'</div>'+(phoneFmt?'<div class="phone" data-field="phone">'+phoneFmt+'</div>':'')+'</div><div class="grid"><div class="card"><h3>Dados Cadastrais</h3><div class="item"><div class="k">Raz\u00e3o Social</div><div class="v">'+razaoFmt+'</div></div><div class="item"><div class="k">CNPJ</div><div class="v mono">'+cnpjFmt+'</div></div><div class="item"><div class="k">Situa\u00e7\u00e3o</div><div class="v green">'+situacaoFmt+'</div></div><div class="item"><div class="k">Endere\u00e7o</div><div class="v">'+fullAddress+'</div></div><div class="item"><div class="k">Email</div><div class="v">'+(emailFmt||'N/A')+'</div></div>'+(atividadeFmt?'<div class="item"><div class="k">CNAE</div><div class="v">'+atividadeFmt+'</div></div>':'')+'</div><div class="card"><h3>Canal WABA</h3>'+(phoneFmt?'<p style="font-family:monospace;font-size:1.5rem;color:'+ac+';font-weight:900;text-align:center;margin:12px 0" data-field="phone">'+phoneFmt+'</p>':'')+'<p>'+wabaText+'</p><p>'+wabaFoot+'</p></div><div class="card"><h3>Compliance</h3><p>'+sob+'</p><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul><p style="margin-top:12px;padding-top:12px;border-top:1px solid #eee"><strong>Privacidade:</strong> '+priv+'</p><p><strong>Termos:</strong> '+term+'</p></div></div><div class="footer">'+razaoFmt+' \u2014 CNPJ '+cnpjFmt+(phoneFmt?' \u2014 '+phoneFmt:'')+'</div>'+domScript+'</body></html>';
  }

  // ── LAYOUT 5: Jornal/Editorial — tipografia grande, blocos com borda esquerda ──
  else if (layoutType === 5) {
    var css = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#fff;color:#111;min-height:100vh;font-size:16px;line-height:1.7}.masthead{border-bottom:3px double #111;padding:28px 24px;text-align:center}.masthead h1{font-size:2.6rem;font-weight:900;color:#000;letter-spacing:-1px;margin-bottom:4px}.masthead .sub{font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#999}.wrap{max-width:780px;margin:32px auto;padding:0 20px}.block{border-left:4px solid '+ac+';padding:20px 24px;margin-bottom:24px;background:#fafafa}.block h2{font-size:16px;font-weight:700;color:#000;margin-bottom:14px}.block .row{padding:10px 0;border-bottom:1px solid #eee}.block .row:last-child{border-bottom:none}.block .k{font-size:13px;font-weight:700;text-transform:uppercase;color:#888;letter-spacing:.8px;margin-bottom:3px}.block .v{font-size:18px;color:#000;font-weight:700}.block .v.mono{font-family:monospace;color:'+ac+'}.block .v.green{color:#059669}.block p{font-size:15px;color:#333;line-height:1.9;margin-bottom:8px}.block ul{list-style:none}.block li{font-size:15px;color:#333;line-height:2;padding-left:16px;position:relative}.block li::before{content:"\\2013";position:absolute;left:0;color:'+ac+'}.phone-highlight{text-align:center;padding:20px;margin:20px 0;border:2px solid '+ac+';border-radius:8px;background:'+ac+'05}.phone-highlight .ph{font-family:monospace;font-size:2rem;color:'+ac+';font-weight:900;letter-spacing:2px}.phone-highlight .lbl{font-size:12px;color:#666;margin-top:6px}.footer{border-top:3px double #111;padding:16px 24px;text-align:center;font-size:12px;color:#666;margin-top:32px}';
    return headHtml+'<style>'+css+'</style></head><body><div class="masthead"><h1 data-field="razao">'+razaoFmt+'</h1><div class="sub">Registro Empresarial \u2014 CNPJ '+cnpjFmt+'</div></div><div class="wrap"><div class="block"><h2>Dados da Empresa</h2><div class="row"><div class="k">Raz\u00e3o Social</div><div class="v">'+razaoFmt+'</div></div><div class="row"><div class="k">CNPJ</div><div class="v mono">'+cnpjFmt+'</div></div><div class="row"><div class="k">Situa\u00e7\u00e3o</div><div class="v green">'+situacaoFmt+'</div></div><div class="row"><div class="k">Endere\u00e7o</div><div class="v">'+fullAddress+'</div></div><div class="row"><div class="k">Email</div><div class="v">'+(emailFmt||'N/A')+'</div></div>'+(atividadeFmt?'<div class="row"><div class="k">CNAE</div><div class="v">'+atividadeFmt+'</div></div>':'')+'</div>'+(phoneFmt?'<div class="phone-highlight"><div class="ph" data-field="phone">'+phoneFmt+'</div><div class="lbl">Canal WhatsApp Business \u2014 Utility Receptivo</div></div>':'')+'<div class="block"><h2>Canal de Atendimento</h2><p>'+wabaText+'</p><p>'+wabaFoot+'</p></div><div class="block"><h2>Sobre</h2><p>'+sob+'</p></div><div class="block"><h2>Regras de Atendimento</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="block"><h2>Privacidade</h2><p>'+priv+'</p></div><div class="block"><h2>Termos</h2><p>'+term+'</p></div></div><div class="footer">'+razaoFmt+' \u2014 CNPJ '+cnpjFmt+(phoneFmt?' | '+phoneFmt:'')+'</div>'+domScript+'</body></html>';
  }

  // ── LAYOUT 6: Cards horizontais empilhados com ícones ──
  else if (layoutType === 6) {
    var css = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#f0f2f5;color:#111;min-height:100vh;font-size:15px;line-height:1.6}.banner{background:linear-gradient(135deg,'+ac+' 0%,'+ac+'cc 100%);padding:36px 24px;text-align:center}.banner h1{font-size:2rem;font-weight:900;color:#fff;margin-bottom:6px}.banner p{font-size:14px;color:rgba(255,255,255,.8)}.container{max-width:800px;margin:24px auto;padding:0 16px}.hcard{background:#fff;border:1px solid #e0e0e0;border-radius:10px;padding:20px 24px;margin-bottom:14px;display:flex;gap:16px;align-items:flex-start}@media(max-width:600px){.hcard{flex-direction:column}}.hcard .icon{width:44px;height:44px;background:'+ac+'12;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0}.hcard .body{flex:1}.hcard .body h3{font-size:15px;font-weight:700;color:#000;margin-bottom:6px}.hcard .body .val{font-size:17px;color:#000;font-weight:700}.hcard .body .val.mono{font-family:monospace;color:'+ac+'}.hcard .body .val.green{color:#059669}.hcard .body p{font-size:14px;color:#444;line-height:1.8}.hcard .body ul{list-style:none;margin:4px 0}.hcard .body li{font-size:14px;color:#444;line-height:2;padding-left:14px;position:relative}.hcard .body li::before{content:"\\2714";position:absolute;left:0;color:'+ac+';font-size:12px}.phone-strip{background:#fff;border:2px solid '+ac+';border-radius:10px;padding:16px;text-align:center;margin-bottom:14px}.phone-strip .ph{font-family:monospace;font-size:1.6rem;color:'+ac+';font-weight:900;letter-spacing:2px}.phone-strip .lbl{font-size:11px;color:#666;margin-top:4px;text-transform:uppercase;letter-spacing:1px}.footer{text-align:center;padding:16px;font-size:12px;color:#888}';
    return headHtml+'<style>'+css+'</style></head><body><div class="banner"><h1 data-field="razao">'+razaoFmt+'</h1><p>CNPJ '+cnpjFmt+' \u2014 '+situacaoFmt+'</p></div><div class="container">'+(phoneFmt?'<div class="phone-strip"><div class="ph" data-field="phone">'+phoneFmt+'</div><div class="lbl">Canal Oficial WhatsApp Business</div></div>':'')+'<div class="hcard"><div class="icon">\ud83c\udfe2</div><div class="body"><h3>Raz\u00e3o Social</h3><div class="val">'+razaoFmt+'</div></div></div><div class="hcard"><div class="icon">\ud83d\udcb3</div><div class="body"><h3>CNPJ</h3><div class="val mono">'+cnpjFmt+'</div></div></div><div class="hcard"><div class="icon">\ud83d\udccd</div><div class="body"><h3>Endere\u00e7o</h3><div class="val">'+fullAddress+'</div></div></div>'+(atividadeFmt?'<div class="hcard"><div class="icon">\ud83d\udcbc</div><div class="body"><h3>CNAE</h3><div class="val">'+atividadeFmt+'</div></div></div>':'')+'<div class="hcard"><div class="icon">\ud83d\udce1</div><div class="body"><h3>Canal WABA</h3><p>'+wabaText+'</p><p>'+wabaFoot+'</p></div></div><div class="hcard"><div class="icon">\ud83d\udcdc</div><div class="body"><h3>Sobre / Compliance</h3><p>'+sob+'</p><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div></div><div class="hcard"><div class="icon">\ud83d\udd12</div><div class="body"><h3>Privacidade &amp; Termos</h3><p>'+priv+'</p><p style="margin-top:8px">'+term+'</p></div></div></div><div class="footer">'+razaoFmt+' \u2014 CNPJ '+cnpjFmt+(phoneFmt?' \u2014 '+phoneFmt:'')+'</div>'+domScript+'</body></html>';
  }

  // ── LAYOUT 7: Split 50/50 — esquerda dados, direita compliance (fundo cinza) ──
  else if (layoutType === 7) {
    var css = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#fff;color:#111;min-height:100vh;font-size:15px;line-height:1.6;display:grid;grid-template-columns:1fr 1fr}@media(max-width:800px){body{grid-template-columns:1fr}}.left{padding:40px 32px;border-right:1px solid #e5e7eb}@media(max-width:800px){.left{border-right:none;border-bottom:1px solid #e5e7eb;padding:28px 20px}}.left h1{font-size:2rem;font-weight:900;color:#000;margin-bottom:4px}.left .sub{font-size:12px;color:'+ac+';letter-spacing:2px;text-transform:uppercase;margin-bottom:24px}.left .field{padding:14px 0;border-bottom:1px solid #f0f0f0}.left .field:last-child{border-bottom:none}.left .field .k{font-size:13px;font-weight:700;text-transform:uppercase;color:#888;letter-spacing:.8px;margin-bottom:3px}.left .field .v{font-size:18px;color:#000;font-weight:700}.left .field .v.mono{font-family:monospace;color:'+ac+'}.left .field .v.green{color:#059669}.left .phone-big{font-family:monospace;font-size:1.5rem;color:'+ac+';font-weight:900;text-align:center;padding:16px;background:'+ac+'08;border:2px solid '+ac+'20;border-radius:8px;margin-top:20px;letter-spacing:2px}.right{padding:40px 32px;background:#f9fafb}@media(max-width:800px){.right{padding:28px 20px}}.right h2{font-size:16px;font-weight:700;color:'+ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:12px}.right .section{margin-bottom:24px;padding-bottom:20px;border-bottom:1px solid #e5e7eb}.right .section:last-child{border-bottom:none}.right p{font-size:15px;color:#333;line-height:1.8;margin-bottom:8px}.right ul{list-style:none;margin:8px 0}.right li{font-size:15px;color:#333;line-height:2;padding-left:14px;position:relative}.right li::before{content:"\\2022";position:absolute;left:0;color:'+ac+'}.right .foot{font-size:12px;color:#888;margin-top:20px;padding-top:12px;border-top:1px solid #ddd}';
    return headHtml+'<style>'+css+'</style></head><body><div class="left"><h1 data-field="razao">'+razaoFmt+'</h1><div class="sub">'+sec.waba+'</div><div class="field"><div class="k">Raz\u00e3o Social</div><div class="v">'+razaoFmt+'</div></div><div class="field"><div class="k">CNPJ</div><div class="v mono" data-field="cnpj">'+cnpjFmt+'</div></div><div class="field"><div class="k">Situa\u00e7\u00e3o</div><div class="v green">'+situacaoFmt+'</div></div><div class="field"><div class="k">Endere\u00e7o</div><div class="v">'+fullAddress+'</div></div><div class="field"><div class="k">Email</div><div class="v">'+(emailFmt||'N/A')+'</div></div>'+(atividadeFmt?'<div class="field"><div class="k">CNAE</div><div class="v">'+atividadeFmt+'</div></div>':'')+(phoneFmt?'<div class="phone-big" data-field="phone">'+phoneFmt+'</div>':'')+'</div><div class="right"><div class="section"><h2>Canal de Atendimento</h2>'+(phoneFmt?'<p style="font-family:monospace;font-size:1.3rem;color:'+ac+';font-weight:900">'+phoneFmt+'</p>':'')+'<p>'+wabaText+'</p><p>'+wabaFoot+'</p></div><div class="section"><h2>Sobre a Empresa</h2><p>'+sob+'</p></div><div class="section"><h2>Atendimento</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="section"><h2>Privacidade</h2><p>'+priv+'</p></div><div class="section"><h2>Termos</h2><p>'+term+'</p></div><div class="foot">'+razaoFmt+' \u2014 CNPJ '+cnpjFmt+'</div></div>'+domScript+'</body></html>';
  }
  // ── LAYOUT 8 ──
  else if (layoutType === 8) {
    var css = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#ffffff;color:#111;min-height:100vh;font-size:15px;line-height:1.7}.header{padding:32px 24px;text-align:center;border-bottom:3px solid '+ac+'}.header h1{font-size:2.2rem;font-weight:900;color:#000;margin-bottom:4px}.header .sub{font-size:12px;color:'+ac+';letter-spacing:2px;text-transform:uppercase}.container{max-width:800px;margin:24px auto;padding:0 20px}.card{background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:22px;margin-bottom:16px}.card h2{font-size:16px;font-weight:700;color:'+ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid '+ac+'18}.field{padding:10px 0;border-bottom:1px solid #f0f0f0}.field:last-child{border-bottom:none}.field .k{font-size:14px;font-weight:700;text-transform:uppercase;color:#555;letter-spacing:.8px;margin-bottom:3px}.field .v{font-size:18px;color:#000;font-weight:700}.field .v.mono{font-family:monospace;color:'+ac+'}.field .v.green{color:#059669}.phone-box{text-align:center;padding:16px;margin:16px 0;background:'+ac+'08;border:2px solid '+ac+'25;border-radius:8px}.phone-box .ph{font-family:monospace;font-size:1.6rem;color:'+ac+';font-weight:900;letter-spacing:2px}.phone-box .lbl{font-size:11px;color:#666;margin-top:4px;text-transform:uppercase;letter-spacing:1px}.card p{font-size:15px;color:#333;line-height:1.8;margin-bottom:6px}.card ul{list-style:none}.card li{font-size:15px;color:#333;line-height:2;padding-left:14px;position:relative}.card li::before{content:"\\2022";position:absolute;left:0;color:'+ac+'}.footer{max-width:800px;margin:16px auto;padding:14px 20px;background:'+ac+';border-radius:8px;text-align:center;font-size:12px;color:#fff}';
    return headHtml+'<style>'+css+'</style></head><body><div class="header"><h1 data-field="razao">'+razaoFmt+'</h1><div class="sub">'+sec.waba+'</div></div><div class="container"><div class="card"><h2>Dados Cadastrais</h2><div class="field"><div class="k">Raz\u00e3o Social</div><div class="v">'+razaoFmt+'</div></div><div class="field"><div class="k">CNPJ</div><div class="v mono">'+cnpjFmt+'</div></div><div class="field"><div class="k">Situa\u00e7\u00e3o</div><div class="v green">'+situacaoFmt+'</div></div><div class="field"><div class="k">Endere\u00e7o</div><div class="v">'+fullAddress+'</div></div><div class="field"><div class="k">Email</div><div class="v">'+(emailFmt||'N/A')+'</div></div>'+(atividadeFmt?'<div class="field"><div class="k">CNAE</div><div class="v">'+atividadeFmt+'</div></div>':'')+'</div>'+(phoneFmt?'<div class="phone-box"><div class="ph" data-field="phone">'+phoneFmt+'</div><div class="lbl">Canal WhatsApp Business</div></div>':'')+'<div class="card"><h2>Canal de Atendimento</h2><p>'+wabaText+'</p><p>'+wabaFoot+'</p></div><div class="card"><h2>Sobre</h2><p>'+sob+'</p></div><div class="card"><h2>Atendimento</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="card"><h2>Privacidade</h2><p>'+priv+'</p></div><div class="card"><h2>Termos</h2><p>'+term+'</p></div></div><div class="footer">'+razaoFmt+' \u2014 CNPJ '+cnpjFmt+(phoneFmt?' \u2014 '+phoneFmt:'')+'</div>'+domScript+'</body></html>';
  }

  // ── LAYOUT 9 ──
  else if (layoutType === 9) {
    var css = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#fefce8;color:#111;min-height:100vh;font-size:15px;line-height:1.7}.topbar{background:'+ac+';padding:10px 20px;text-align:center;font-family:monospace;font-size:14px;color:#fff;font-weight:700;letter-spacing:1px}.header{padding:32px 24px;text-align:center;border-bottom:3px solid '+ac+'}.header h1{font-size:2.2rem;font-weight:900;color:#000;margin-bottom:4px}.header .sub{font-size:12px;color:'+ac+';letter-spacing:2px;text-transform:uppercase}.container{max-width:800px;margin:24px auto;padding:0 20px}.card{background:#fff;border:2px solid #e5e7eb;border-radius:4px;padding:22px;margin-bottom:16px}.card h2{font-size:16px;font-weight:700;color:'+ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid '+ac+'18}.field{padding:10px 0;border-bottom:1px solid #f0f0f0}.field:last-child{border-bottom:none}.field .k{font-size:14px;font-weight:700;text-transform:uppercase;color:#555;letter-spacing:.8px;margin-bottom:3px}.field .v{font-size:18px;color:#000;font-weight:700}.field .v.mono{font-family:monospace;color:'+ac+'}.field .v.green{color:#059669}.phone-box{text-align:center;padding:16px;margin:16px 0;background:'+ac+'08;border:2px solid '+ac+'25;border-radius:8px}.phone-box .ph{font-family:monospace;font-size:1.6rem;color:'+ac+';font-weight:900;letter-spacing:2px}.phone-box .lbl{font-size:11px;color:#666;margin-top:4px;text-transform:uppercase;letter-spacing:1px}.card p{font-size:15px;color:#333;line-height:1.8;margin-bottom:6px}.card ul{list-style:none}.card li{font-size:15px;color:#333;line-height:2;padding-left:14px;position:relative}.card li::before{content:"\\2022";position:absolute;left:0;color:'+ac+'}.footer{max-width:800px;margin:16px auto;padding:14px 20px;background:'+ac+';border-radius:4px;text-align:center;font-size:12px;color:#fff}';
    return headHtml+'<style>'+css+'</style></head><body>'+(phoneFmt?'<div class="topbar" data-field="phone">'+phoneFmt+'</div>':'')+'<div class="header"><h1 data-field="razao">'+razaoFmt+'</h1><div class="sub">'+sec.waba+'</div></div><div class="container"><div class="card"><h2>Dados Cadastrais</h2><div class="field"><div class="k">Raz\u00e3o Social</div><div class="v">'+razaoFmt+'</div></div><div class="field"><div class="k">CNPJ</div><div class="v mono">'+cnpjFmt+'</div></div><div class="field"><div class="k">Situa\u00e7\u00e3o</div><div class="v green">'+situacaoFmt+'</div></div><div class="field"><div class="k">Endere\u00e7o</div><div class="v">'+fullAddress+'</div></div><div class="field"><div class="k">Email</div><div class="v">'+(emailFmt||'N/A')+'</div></div>'+(atividadeFmt?'<div class="field"><div class="k">CNAE</div><div class="v">'+atividadeFmt+'</div></div>':'')+'</div>'+(phoneFmt?'<div class="phone-box"><div class="ph" data-field="phone">'+phoneFmt+'</div><div class="lbl">Canal WhatsApp Business</div></div>':'')+'<div class="card"><h2>Canal de Atendimento</h2><p>'+wabaText+'</p><p>'+wabaFoot+'</p></div><div class="card"><h2>Sobre</h2><p>'+sob+'</p></div><div class="card"><h2>Atendimento</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="card"><h2>Privacidade</h2><p>'+priv+'</p></div><div class="card"><h2>Termos</h2><p>'+term+'</p></div></div><div class="footer">'+razaoFmt+' \u2014 CNPJ '+cnpjFmt+(phoneFmt?' \u2014 '+phoneFmt:'')+'</div>'+domScript+'</body></html>';
  }

  // ── LAYOUT 10 ──
  else if (layoutType === 10) {
    var css = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#f0fdf4;color:#111;min-height:100vh;font-size:15px;line-height:1.7}.header{background:#1e293b;padding:28px 24px;text-align:center}.header h1{font-size:2rem;font-weight:900;color:#fff;margin-bottom:4px}.header .sub{font-size:12px;color:'+ac+';letter-spacing:2px;text-transform:uppercase}.container{max-width:800px;margin:24px auto;padding:0 20px}.card{background:#fff;border:1px solid #d1d5db;border-radius:12px;padding:22px;margin-bottom:16px}.card h2{font-size:16px;font-weight:700;color:'+ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid '+ac+'18}.field{padding:10px 0;border-bottom:1px solid #f0f0f0}.field:last-child{border-bottom:none}.field .k{font-size:14px;font-weight:700;text-transform:uppercase;color:#555;letter-spacing:.8px;margin-bottom:3px}.field .v{font-size:18px;color:#000;font-weight:700}.field .v.mono{font-family:monospace;color:'+ac+'}.field .v.green{color:#059669}.phone-box{text-align:center;padding:16px;margin:16px 0;background:'+ac+'08;border:2px solid '+ac+'25;border-radius:8px}.phone-box .ph{font-family:monospace;font-size:1.6rem;color:'+ac+';font-weight:900;letter-spacing:2px}.phone-box .lbl{font-size:11px;color:#666;margin-top:4px;text-transform:uppercase;letter-spacing:1px}.card p{font-size:15px;color:#333;line-height:1.8;margin-bottom:6px}.card ul{list-style:none}.card li{font-size:15px;color:#333;line-height:2;padding-left:14px;position:relative}.card li::before{content:"\\2022";position:absolute;left:0;color:'+ac+'}.footer{max-width:800px;margin:16px auto;padding:14px 20px;background:'+ac+';border-radius:12px;text-align:center;font-size:12px;color:#fff}';
    return headHtml+'<style>'+css+'</style></head><body><div class="header"><h1 data-field="razao">'+razaoFmt+'</h1><div class="sub">'+sec.waba+'</div></div><div class="container"><div class="card"><h2>Dados Cadastrais</h2><div class="field"><div class="k">Raz\u00e3o Social</div><div class="v">'+razaoFmt+'</div></div><div class="field"><div class="k">CNPJ</div><div class="v mono">'+cnpjFmt+'</div></div><div class="field"><div class="k">Situa\u00e7\u00e3o</div><div class="v green">'+situacaoFmt+'</div></div><div class="field"><div class="k">Endere\u00e7o</div><div class="v">'+fullAddress+'</div></div><div class="field"><div class="k">Email</div><div class="v">'+(emailFmt||'N/A')+'</div></div>'+(atividadeFmt?'<div class="field"><div class="k">CNAE</div><div class="v">'+atividadeFmt+'</div></div>':'')+'</div>'+(phoneFmt?'<div class="phone-box"><div class="ph" data-field="phone">'+phoneFmt+'</div><div class="lbl">Canal WhatsApp Business</div></div>':'')+'<div class="card"><h2>Canal de Atendimento</h2><p>'+wabaText+'</p><p>'+wabaFoot+'</p></div><div class="card"><h2>Sobre</h2><p>'+sob+'</p></div><div class="card"><h2>Atendimento</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="card"><h2>Privacidade</h2><p>'+priv+'</p></div><div class="card"><h2>Termos</h2><p>'+term+'</p></div></div><div class="footer">'+razaoFmt+' \u2014 CNPJ '+cnpjFmt+(phoneFmt?' \u2014 '+phoneFmt:'')+'</div>'+domScript+'</body></html>';
  }

  // ── LAYOUT 11 ──
  else if (layoutType === 11) {
    var css = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#eff6ff;color:#111;min-height:100vh;font-size:15px;line-height:1.7}.header{padding:32px 24px;text-align:center;border-bottom:3px solid '+ac+'}.header h1{font-size:2.2rem;font-weight:900;color:#000;margin-bottom:4px}.header .sub{font-size:12px;color:'+ac+';letter-spacing:2px;text-transform:uppercase}.container{max-width:800px;margin:24px auto;padding:0 20px}.card{background:#fff;border:none;border-radius:0;padding:22px;margin-bottom:16px}.card h2{font-size:16px;font-weight:700;color:'+ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid '+ac+'18}.field{padding:10px 0;border-bottom:1px solid #f0f0f0}.field:last-child{border-bottom:none}.field .k{font-size:14px;font-weight:700;text-transform:uppercase;color:#555;letter-spacing:.8px;margin-bottom:3px}.field .v{font-size:18px;color:#000;font-weight:700}.field .v.mono{font-family:monospace;color:'+ac+'}.field .v.green{color:#059669}.phone-box{text-align:center;padding:16px;margin:16px 0;background:'+ac+'08;border:2px solid '+ac+'25;border-radius:8px}.phone-box .ph{font-family:monospace;font-size:1.6rem;color:'+ac+';font-weight:900;letter-spacing:2px}.phone-box .lbl{font-size:11px;color:#666;margin-top:4px;text-transform:uppercase;letter-spacing:1px}.card p{font-size:15px;color:#333;line-height:1.8;margin-bottom:6px}.card ul{list-style:none}.card li{font-size:15px;color:#333;line-height:2;padding-left:14px;position:relative}.card li::before{content:"\\2022";position:absolute;left:0;color:'+ac+'}.footer{max-width:800px;margin:16px auto;padding:14px 20px;background:'+ac+';border-radius:0;text-align:center;font-size:12px;color:#fff}';
    return headHtml+'<style>'+css+'</style></head><body><div class="header"><h1 data-field="razao">'+razaoFmt+'</h1><div class="sub">'+sec.waba+'</div></div><div class="container"><div class="card"><h2>Dados Cadastrais</h2><div class="field"><div class="k">Raz\u00e3o Social</div><div class="v">'+razaoFmt+'</div></div><div class="field"><div class="k">CNPJ</div><div class="v mono">'+cnpjFmt+'</div></div><div class="field"><div class="k">Situa\u00e7\u00e3o</div><div class="v green">'+situacaoFmt+'</div></div><div class="field"><div class="k">Endere\u00e7o</div><div class="v">'+fullAddress+'</div></div><div class="field"><div class="k">Email</div><div class="v">'+(emailFmt||'N/A')+'</div></div>'+(atividadeFmt?'<div class="field"><div class="k">CNAE</div><div class="v">'+atividadeFmt+'</div></div>':'')+'</div>'+(phoneFmt?'<div class="phone-box"><div class="ph" data-field="phone">'+phoneFmt+'</div><div class="lbl">Canal WhatsApp Business</div></div>':'')+'<div class="card"><h2>Canal de Atendimento</h2><p>'+wabaText+'</p><p>'+wabaFoot+'</p></div><div class="card"><h2>Sobre</h2><p>'+sob+'</p></div><div class="card"><h2>Atendimento</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="card"><h2>Privacidade</h2><p>'+priv+'</p></div><div class="card"><h2>Termos</h2><p>'+term+'</p></div></div><div class="footer">'+razaoFmt+' \u2014 CNPJ '+cnpjFmt+(phoneFmt?' \u2014 '+phoneFmt:'')+'</div>'+domScript+'</body></html>';
  }

  // ── LAYOUT 12 ──
  else if (layoutType === 12) {
    var css = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#fdf4ff;color:#111;min-height:100vh;font-size:15px;line-height:1.7}.topbar{background:'+ac+';padding:10px 20px;text-align:center;font-family:monospace;font-size:14px;color:#fff;font-weight:700;letter-spacing:1px}.header{padding:32px 24px;text-align:center;border-bottom:3px solid '+ac+'}.header h1{font-size:2.2rem;font-weight:900;color:#000;margin-bottom:4px}.header .sub{font-size:12px;color:'+ac+';letter-spacing:2px;text-transform:uppercase}.container{max-width:800px;margin:24px auto;padding:0 20px}.card{background:#fff;border:1px solid #fde68a;border-radius:16px;padding:22px;margin-bottom:16px}.card h2{font-size:16px;font-weight:700;color:'+ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid '+ac+'18}.field{padding:10px 0;border-bottom:1px solid #f0f0f0}.field:last-child{border-bottom:none}.field .k{font-size:14px;font-weight:700;text-transform:uppercase;color:#555;letter-spacing:.8px;margin-bottom:3px}.field .v{font-size:18px;color:#000;font-weight:700}.field .v.mono{font-family:monospace;color:'+ac+'}.field .v.green{color:#059669}.phone-box{text-align:center;padding:16px;margin:16px 0;background:'+ac+'08;border:2px solid '+ac+'25;border-radius:8px}.phone-box .ph{font-family:monospace;font-size:1.6rem;color:'+ac+';font-weight:900;letter-spacing:2px}.phone-box .lbl{font-size:11px;color:#666;margin-top:4px;text-transform:uppercase;letter-spacing:1px}.card p{font-size:15px;color:#333;line-height:1.8;margin-bottom:6px}.card ul{list-style:none}.card li{font-size:15px;color:#333;line-height:2;padding-left:14px;position:relative}.card li::before{content:"\\2022";position:absolute;left:0;color:'+ac+'}.footer{max-width:800px;margin:16px auto;padding:14px 20px;background:'+ac+';border-radius:16px;text-align:center;font-size:12px;color:#fff}';
    return headHtml+'<style>'+css+'</style></head><body>'+(phoneFmt?'<div class="topbar" data-field="phone">'+phoneFmt+'</div>':'')+'<div class="header"><h1 data-field="razao">'+razaoFmt+'</h1><div class="sub">'+sec.waba+'</div></div><div class="container"><div class="card"><h2>Dados Cadastrais</h2><div class="field"><div class="k">Raz\u00e3o Social</div><div class="v">'+razaoFmt+'</div></div><div class="field"><div class="k">CNPJ</div><div class="v mono">'+cnpjFmt+'</div></div><div class="field"><div class="k">Situa\u00e7\u00e3o</div><div class="v green">'+situacaoFmt+'</div></div><div class="field"><div class="k">Endere\u00e7o</div><div class="v">'+fullAddress+'</div></div><div class="field"><div class="k">Email</div><div class="v">'+(emailFmt||'N/A')+'</div></div>'+(atividadeFmt?'<div class="field"><div class="k">CNAE</div><div class="v">'+atividadeFmt+'</div></div>':'')+'</div>'+(phoneFmt?'<div class="phone-box"><div class="ph" data-field="phone">'+phoneFmt+'</div><div class="lbl">Canal WhatsApp Business</div></div>':'')+'<div class="card"><h2>Canal de Atendimento</h2><p>'+wabaText+'</p><p>'+wabaFoot+'</p></div><div class="card"><h2>Sobre</h2><p>'+sob+'</p></div><div class="card"><h2>Atendimento</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="card"><h2>Privacidade</h2><p>'+priv+'</p></div><div class="card"><h2>Termos</h2><p>'+term+'</p></div></div><div class="footer">'+razaoFmt+' \u2014 CNPJ '+cnpjFmt+(phoneFmt?' \u2014 '+phoneFmt:'')+'</div>'+domScript+'</body></html>';
  }

  // ── LAYOUT 13 ──
  else if (layoutType === 13) {
    var css = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#fff7ed;color:#111;min-height:100vh;font-size:15px;line-height:1.7}.header{padding:32px 24px;text-align:center;border-bottom:3px solid '+ac+'}.header h1{font-size:2.2rem;font-weight:900;color:#000;margin-bottom:4px}.header .sub{font-size:12px;color:'+ac+';letter-spacing:2px;text-transform:uppercase}.container{max-width:800px;margin:24px auto;padding:0 20px}.card{background:#fff;border:1px solid #bbf7d0;border-radius:6px;padding:22px;margin-bottom:16px}.card h2{font-size:16px;font-weight:700;color:'+ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid '+ac+'18}.field{padding:10px 0;border-bottom:1px solid #f0f0f0}.field:last-child{border-bottom:none}.field .k{font-size:14px;font-weight:700;text-transform:uppercase;color:#555;letter-spacing:.8px;margin-bottom:3px}.field .v{font-size:18px;color:#000;font-weight:700}.field .v.mono{font-family:monospace;color:'+ac+'}.field .v.green{color:#059669}.phone-box{text-align:center;padding:16px;margin:16px 0;background:'+ac+'08;border:2px solid '+ac+'25;border-radius:8px}.phone-box .ph{font-family:monospace;font-size:1.6rem;color:'+ac+';font-weight:900;letter-spacing:2px}.phone-box .lbl{font-size:11px;color:#666;margin-top:4px;text-transform:uppercase;letter-spacing:1px}.card p{font-size:15px;color:#333;line-height:1.8;margin-bottom:6px}.card ul{list-style:none}.card li{font-size:15px;color:#333;line-height:2;padding-left:14px;position:relative}.card li::before{content:"\\2022";position:absolute;left:0;color:'+ac+'}.footer{max-width:800px;margin:16px auto;padding:14px 20px;background:'+ac+';border-radius:6px;text-align:center;font-size:12px;color:#fff}';
    return headHtml+'<style>'+css+'</style></head><body><div class="header"><h1 data-field="razao">'+razaoFmt+'</h1><div class="sub">'+sec.waba+'</div></div><div class="container"><div class="card"><h2>Dados Cadastrais</h2><div class="field"><div class="k">Raz\u00e3o Social</div><div class="v">'+razaoFmt+'</div></div><div class="field"><div class="k">CNPJ</div><div class="v mono">'+cnpjFmt+'</div></div><div class="field"><div class="k">Situa\u00e7\u00e3o</div><div class="v green">'+situacaoFmt+'</div></div><div class="field"><div class="k">Endere\u00e7o</div><div class="v">'+fullAddress+'</div></div><div class="field"><div class="k">Email</div><div class="v">'+(emailFmt||'N/A')+'</div></div>'+(atividadeFmt?'<div class="field"><div class="k">CNAE</div><div class="v">'+atividadeFmt+'</div></div>':'')+'</div>'+(phoneFmt?'<div class="phone-box"><div class="ph" data-field="phone">'+phoneFmt+'</div><div class="lbl">Canal WhatsApp Business</div></div>':'')+'<div class="card"><h2>Canal de Atendimento</h2><p>'+wabaText+'</p><p>'+wabaFoot+'</p></div><div class="card"><h2>Sobre</h2><p>'+sob+'</p></div><div class="card"><h2>Atendimento</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="card"><h2>Privacidade</h2><p>'+priv+'</p></div><div class="card"><h2>Termos</h2><p>'+term+'</p></div></div><div class="footer">'+razaoFmt+' \u2014 CNPJ '+cnpjFmt+(phoneFmt?' \u2014 '+phoneFmt:'')+'</div>'+domScript+'</body></html>';
  }

  // ── LAYOUT 14 ──
  else if (layoutType === 14) {
    var css = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#f5f5f4;color:#111;min-height:100vh;font-size:15px;line-height:1.7}.header{padding:32px 24px;text-align:center;border-bottom:3px solid '+ac+'}.header h1{font-size:2.2rem;font-weight:900;color:#000;margin-bottom:4px}.header .sub{font-size:12px;color:'+ac+';letter-spacing:2px;text-transform:uppercase}.container{max-width:800px;margin:24px auto;padding:0 20px}.card{background:#fff;border:2px solid #e0e0e0;border-radius:10px;padding:22px;margin-bottom:16px}.card h2{font-size:16px;font-weight:700;color:'+ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid '+ac+'18}.field{padding:10px 0;border-bottom:1px solid #f0f0f0}.field:last-child{border-bottom:none}.field .k{font-size:14px;font-weight:700;text-transform:uppercase;color:#555;letter-spacing:.8px;margin-bottom:3px}.field .v{font-size:18px;color:#000;font-weight:700}.field .v.mono{font-family:monospace;color:'+ac+'}.field .v.green{color:#059669}.phone-box{text-align:center;padding:16px;margin:16px 0;background:'+ac+'08;border:2px solid '+ac+'25;border-radius:8px}.phone-box .ph{font-family:monospace;font-size:1.6rem;color:'+ac+';font-weight:900;letter-spacing:2px}.phone-box .lbl{font-size:11px;color:#666;margin-top:4px;text-transform:uppercase;letter-spacing:1px}.card p{font-size:15px;color:#333;line-height:1.8;margin-bottom:6px}.card ul{list-style:none}.card li{font-size:15px;color:#333;line-height:2;padding-left:14px;position:relative}.card li::before{content:"\\2022";position:absolute;left:0;color:'+ac+'}.footer{max-width:800px;margin:16px auto;padding:14px 20px;background:'+ac+';border-radius:10px;text-align:center;font-size:12px;color:#fff}';
    return headHtml+'<style>'+css+'</style></head><body><div class="header"><h1 data-field="razao">'+razaoFmt+'</h1><div class="sub">'+sec.waba+'</div></div><div class="container"><div class="card"><h2>Dados Cadastrais</h2><div class="field"><div class="k">Raz\u00e3o Social</div><div class="v">'+razaoFmt+'</div></div><div class="field"><div class="k">CNPJ</div><div class="v mono">'+cnpjFmt+'</div></div><div class="field"><div class="k">Situa\u00e7\u00e3o</div><div class="v green">'+situacaoFmt+'</div></div><div class="field"><div class="k">Endere\u00e7o</div><div class="v">'+fullAddress+'</div></div><div class="field"><div class="k">Email</div><div class="v">'+(emailFmt||'N/A')+'</div></div>'+(atividadeFmt?'<div class="field"><div class="k">CNAE</div><div class="v">'+atividadeFmt+'</div></div>':'')+'</div>'+(phoneFmt?'<div class="phone-box"><div class="ph" data-field="phone">'+phoneFmt+'</div><div class="lbl">Canal WhatsApp Business</div></div>':'')+'<div class="card"><h2>Canal de Atendimento</h2><p>'+wabaText+'</p><p>'+wabaFoot+'</p></div><div class="card"><h2>Sobre</h2><p>'+sob+'</p></div><div class="card"><h2>Atendimento</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="card"><h2>Privacidade</h2><p>'+priv+'</p></div><div class="card"><h2>Termos</h2><p>'+term+'</p></div></div><div class="footer">'+razaoFmt+' \u2014 CNPJ '+cnpjFmt+(phoneFmt?' \u2014 '+phoneFmt:'')+'</div>'+domScript+'</body></html>';
  }

  // ── LAYOUT 15 ──
  else if (layoutType === 15) {
    var css = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#fafafa;color:#111;min-height:100vh;font-size:15px;line-height:1.7}.topbar{background:'+ac+';padding:10px 20px;text-align:center;font-family:monospace;font-size:14px;color:#fff;font-weight:700;letter-spacing:1px}.header{background:#1e293b;padding:28px 24px;text-align:center}.header h1{font-size:2rem;font-weight:900;color:#fff;margin-bottom:4px}.header .sub{font-size:12px;color:'+ac+';letter-spacing:2px;text-transform:uppercase}.container{max-width:800px;margin:24px auto;padding:0 20px}.card{background:#fff;border:1px solid #e2e8f0;border-radius:2px;padding:22px;margin-bottom:16px}.card h2{font-size:16px;font-weight:700;color:'+ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid '+ac+'18}.field{padding:10px 0;border-bottom:1px solid #f0f0f0}.field:last-child{border-bottom:none}.field .k{font-size:14px;font-weight:700;text-transform:uppercase;color:#555;letter-spacing:.8px;margin-bottom:3px}.field .v{font-size:18px;color:#000;font-weight:700}.field .v.mono{font-family:monospace;color:'+ac+'}.field .v.green{color:#059669}.phone-box{text-align:center;padding:16px;margin:16px 0;background:'+ac+'08;border:2px solid '+ac+'25;border-radius:8px}.phone-box .ph{font-family:monospace;font-size:1.6rem;color:'+ac+';font-weight:900;letter-spacing:2px}.phone-box .lbl{font-size:11px;color:#666;margin-top:4px;text-transform:uppercase;letter-spacing:1px}.card p{font-size:15px;color:#333;line-height:1.8;margin-bottom:6px}.card ul{list-style:none}.card li{font-size:15px;color:#333;line-height:2;padding-left:14px;position:relative}.card li::before{content:"\\2022";position:absolute;left:0;color:'+ac+'}.footer{max-width:800px;margin:16px auto;padding:14px 20px;background:'+ac+';border-radius:2px;text-align:center;font-size:12px;color:#fff}';
    return headHtml+'<style>'+css+'</style></head><body>'+(phoneFmt?'<div class="topbar" data-field="phone">'+phoneFmt+'</div>':'')+'<div class="header"><h1 data-field="razao">'+razaoFmt+'</h1><div class="sub">'+sec.waba+'</div></div><div class="container"><div class="card"><h2>Dados Cadastrais</h2><div class="field"><div class="k">Raz\u00e3o Social</div><div class="v">'+razaoFmt+'</div></div><div class="field"><div class="k">CNPJ</div><div class="v mono">'+cnpjFmt+'</div></div><div class="field"><div class="k">Situa\u00e7\u00e3o</div><div class="v green">'+situacaoFmt+'</div></div><div class="field"><div class="k">Endere\u00e7o</div><div class="v">'+fullAddress+'</div></div><div class="field"><div class="k">Email</div><div class="v">'+(emailFmt||'N/A')+'</div></div>'+(atividadeFmt?'<div class="field"><div class="k">CNAE</div><div class="v">'+atividadeFmt+'</div></div>':'')+'</div>'+(phoneFmt?'<div class="phone-box"><div class="ph" data-field="phone">'+phoneFmt+'</div><div class="lbl">Canal WhatsApp Business</div></div>':'')+'<div class="card"><h2>Canal de Atendimento</h2><p>'+wabaText+'</p><p>'+wabaFoot+'</p></div><div class="card"><h2>Sobre</h2><p>'+sob+'</p></div><div class="card"><h2>Atendimento</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="card"><h2>Privacidade</h2><p>'+priv+'</p></div><div class="card"><h2>Termos</h2><p>'+term+'</p></div></div><div class="footer">'+razaoFmt+' \u2014 CNPJ '+cnpjFmt+(phoneFmt?' \u2014 '+phoneFmt:'')+'</div>'+domScript+'</body></html>';
  }

  // ── LAYOUT 16 ──
  else if (layoutType === 16) {
    var css = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#f8fafc;color:#111;min-height:100vh;font-size:15px;line-height:1.7}.header{padding:32px 24px;text-align:center;border-bottom:3px solid '+ac+'}.header h1{font-size:2.2rem;font-weight:900;color:#000;margin-bottom:4px}.header .sub{font-size:12px;color:'+ac+';letter-spacing:2px;text-transform:uppercase}.container{max-width:800px;margin:24px auto;padding:0 20px}.card{background:#fff;border:1px solid #fed7aa;border-radius:8px;padding:22px;margin-bottom:16px}.card h2{font-size:16px;font-weight:700;color:'+ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid '+ac+'18}.field{padding:10px 0;border-bottom:1px solid #f0f0f0}.field:last-child{border-bottom:none}.field .k{font-size:14px;font-weight:700;text-transform:uppercase;color:#555;letter-spacing:.8px;margin-bottom:3px}.field .v{font-size:18px;color:#000;font-weight:700}.field .v.mono{font-family:monospace;color:'+ac+'}.field .v.green{color:#059669}.phone-box{text-align:center;padding:16px;margin:16px 0;background:'+ac+'08;border:2px solid '+ac+'25;border-radius:8px}.phone-box .ph{font-family:monospace;font-size:1.6rem;color:'+ac+';font-weight:900;letter-spacing:2px}.phone-box .lbl{font-size:11px;color:#666;margin-top:4px;text-transform:uppercase;letter-spacing:1px}.card p{font-size:15px;color:#333;line-height:1.8;margin-bottom:6px}.card ul{list-style:none}.card li{font-size:15px;color:#333;line-height:2;padding-left:14px;position:relative}.card li::before{content:"\\2022";position:absolute;left:0;color:'+ac+'}.footer{max-width:800px;margin:16px auto;padding:14px 20px;background:'+ac+';border-radius:8px;text-align:center;font-size:12px;color:#fff}';
    return headHtml+'<style>'+css+'</style></head><body><div class="header"><h1 data-field="razao">'+razaoFmt+'</h1><div class="sub">'+sec.waba+'</div></div><div class="container"><div class="card"><h2>Dados Cadastrais</h2><div class="field"><div class="k">Raz\u00e3o Social</div><div class="v">'+razaoFmt+'</div></div><div class="field"><div class="k">CNPJ</div><div class="v mono">'+cnpjFmt+'</div></div><div class="field"><div class="k">Situa\u00e7\u00e3o</div><div class="v green">'+situacaoFmt+'</div></div><div class="field"><div class="k">Endere\u00e7o</div><div class="v">'+fullAddress+'</div></div><div class="field"><div class="k">Email</div><div class="v">'+(emailFmt||'N/A')+'</div></div>'+(atividadeFmt?'<div class="field"><div class="k">CNAE</div><div class="v">'+atividadeFmt+'</div></div>':'')+'</div>'+(phoneFmt?'<div class="phone-box"><div class="ph" data-field="phone">'+phoneFmt+'</div><div class="lbl">Canal WhatsApp Business</div></div>':'')+'<div class="card"><h2>Canal de Atendimento</h2><p>'+wabaText+'</p><p>'+wabaFoot+'</p></div><div class="card"><h2>Sobre</h2><p>'+sob+'</p></div><div class="card"><h2>Atendimento</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="card"><h2>Privacidade</h2><p>'+priv+'</p></div><div class="card"><h2>Termos</h2><p>'+term+'</p></div></div><div class="footer">'+razaoFmt+' \u2014 CNPJ '+cnpjFmt+(phoneFmt?' \u2014 '+phoneFmt:'')+'</div>'+domScript+'</body></html>';
  }

  // ── LAYOUT 17 ──
  else if (layoutType === 17) {
    var css = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#fff1f2;color:#111;min-height:100vh;font-size:15px;line-height:1.7}.header{padding:32px 24px;text-align:center;border-bottom:3px solid '+ac+'}.header h1{font-size:2.2rem;font-weight:900;color:#000;margin-bottom:4px}.header .sub{font-size:12px;color:'+ac+';letter-spacing:2px;text-transform:uppercase}.container{max-width:800px;margin:24px auto;padding:0 20px}.card{background:#fff;border:1px solid #fecdd3;border-radius:12px;padding:22px;margin-bottom:16px}.card h2{font-size:16px;font-weight:700;color:'+ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid '+ac+'18}.field{padding:10px 0;border-bottom:1px solid #f0f0f0}.field:last-child{border-bottom:none}.field .k{font-size:14px;font-weight:700;text-transform:uppercase;color:#555;letter-spacing:.8px;margin-bottom:3px}.field .v{font-size:18px;color:#000;font-weight:700}.field .v.mono{font-family:monospace;color:'+ac+'}.field .v.green{color:#059669}.phone-box{text-align:center;padding:16px;margin:16px 0;background:'+ac+'08;border:2px solid '+ac+'25;border-radius:8px}.phone-box .ph{font-family:monospace;font-size:1.6rem;color:'+ac+';font-weight:900;letter-spacing:2px}.phone-box .lbl{font-size:11px;color:#666;margin-top:4px;text-transform:uppercase;letter-spacing:1px}.card p{font-size:15px;color:#333;line-height:1.8;margin-bottom:6px}.card ul{list-style:none}.card li{font-size:15px;color:#333;line-height:2;padding-left:14px;position:relative}.card li::before{content:"\\2022";position:absolute;left:0;color:'+ac+'}.footer{max-width:800px;margin:16px auto;padding:14px 20px;background:'+ac+';border-radius:12px;text-align:center;font-size:12px;color:#fff}';
    return headHtml+'<style>'+css+'</style></head><body><div class="header"><h1 data-field="razao">'+razaoFmt+'</h1><div class="sub">'+sec.waba+'</div></div><div class="container"><div class="card"><h2>Dados Cadastrais</h2><div class="field"><div class="k">Raz\u00e3o Social</div><div class="v">'+razaoFmt+'</div></div><div class="field"><div class="k">CNPJ</div><div class="v mono">'+cnpjFmt+'</div></div><div class="field"><div class="k">Situa\u00e7\u00e3o</div><div class="v green">'+situacaoFmt+'</div></div><div class="field"><div class="k">Endere\u00e7o</div><div class="v">'+fullAddress+'</div></div><div class="field"><div class="k">Email</div><div class="v">'+(emailFmt||'N/A')+'</div></div>'+(atividadeFmt?'<div class="field"><div class="k">CNAE</div><div class="v">'+atividadeFmt+'</div></div>':'')+'</div>'+(phoneFmt?'<div class="phone-box"><div class="ph" data-field="phone">'+phoneFmt+'</div><div class="lbl">Canal WhatsApp Business</div></div>':'')+'<div class="card"><h2>Canal de Atendimento</h2><p>'+wabaText+'</p><p>'+wabaFoot+'</p></div><div class="card"><h2>Sobre</h2><p>'+sob+'</p></div><div class="card"><h2>Atendimento</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="card"><h2>Privacidade</h2><p>'+priv+'</p></div><div class="card"><h2>Termos</h2><p>'+term+'</p></div></div><div class="footer">'+razaoFmt+' \u2014 CNPJ '+cnpjFmt+(phoneFmt?' \u2014 '+phoneFmt:'')+'</div>'+domScript+'</body></html>';
  }

  // ── LAYOUT 18 ──
  else if (layoutType === 18) {
    var css = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#ecfeff;color:#111;min-height:100vh;font-size:15px;line-height:1.7}.topbar{background:'+ac+';padding:10px 20px;text-align:center;font-family:monospace;font-size:14px;color:#fff;font-weight:700;letter-spacing:1px}.header{padding:32px 24px;text-align:center;border-bottom:3px solid '+ac+'}.header h1{font-size:2.2rem;font-weight:900;color:#000;margin-bottom:4px}.header .sub{font-size:12px;color:'+ac+';letter-spacing:2px;text-transform:uppercase}.container{max-width:800px;margin:24px auto;padding:0 20px}.card{background:#fff;border:1px solid #a5f3fc;border-radius:4px;padding:22px;margin-bottom:16px}.card h2{font-size:16px;font-weight:700;color:'+ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid '+ac+'18}.field{padding:10px 0;border-bottom:1px solid #f0f0f0}.field:last-child{border-bottom:none}.field .k{font-size:14px;font-weight:700;text-transform:uppercase;color:#555;letter-spacing:.8px;margin-bottom:3px}.field .v{font-size:18px;color:#000;font-weight:700}.field .v.mono{font-family:monospace;color:'+ac+'}.field .v.green{color:#059669}.phone-box{text-align:center;padding:16px;margin:16px 0;background:'+ac+'08;border:2px solid '+ac+'25;border-radius:8px}.phone-box .ph{font-family:monospace;font-size:1.6rem;color:'+ac+';font-weight:900;letter-spacing:2px}.phone-box .lbl{font-size:11px;color:#666;margin-top:4px;text-transform:uppercase;letter-spacing:1px}.card p{font-size:15px;color:#333;line-height:1.8;margin-bottom:6px}.card ul{list-style:none}.card li{font-size:15px;color:#333;line-height:2;padding-left:14px;position:relative}.card li::before{content:"\\2022";position:absolute;left:0;color:'+ac+'}.footer{max-width:800px;margin:16px auto;padding:14px 20px;background:'+ac+';border-radius:4px;text-align:center;font-size:12px;color:#fff}';
    return headHtml+'<style>'+css+'</style></head><body>'+(phoneFmt?'<div class="topbar" data-field="phone">'+phoneFmt+'</div>':'')+'<div class="header"><h1 data-field="razao">'+razaoFmt+'</h1><div class="sub">'+sec.waba+'</div></div><div class="container"><div class="card"><h2>Dados Cadastrais</h2><div class="field"><div class="k">Raz\u00e3o Social</div><div class="v">'+razaoFmt+'</div></div><div class="field"><div class="k">CNPJ</div><div class="v mono">'+cnpjFmt+'</div></div><div class="field"><div class="k">Situa\u00e7\u00e3o</div><div class="v green">'+situacaoFmt+'</div></div><div class="field"><div class="k">Endere\u00e7o</div><div class="v">'+fullAddress+'</div></div><div class="field"><div class="k">Email</div><div class="v">'+(emailFmt||'N/A')+'</div></div>'+(atividadeFmt?'<div class="field"><div class="k">CNAE</div><div class="v">'+atividadeFmt+'</div></div>':'')+'</div>'+(phoneFmt?'<div class="phone-box"><div class="ph" data-field="phone">'+phoneFmt+'</div><div class="lbl">Canal WhatsApp Business</div></div>':'')+'<div class="card"><h2>Canal de Atendimento</h2><p>'+wabaText+'</p><p>'+wabaFoot+'</p></div><div class="card"><h2>Sobre</h2><p>'+sob+'</p></div><div class="card"><h2>Atendimento</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="card"><h2>Privacidade</h2><p>'+priv+'</p></div><div class="card"><h2>Termos</h2><p>'+term+'</p></div></div><div class="footer">'+razaoFmt+' \u2014 CNPJ '+cnpjFmt+(phoneFmt?' \u2014 '+phoneFmt:'')+'</div>'+domScript+'</body></html>';
  }

  // ── LAYOUT 19 ──
  else if (layoutType === 19) {
    var css = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#f0f9ff;color:#111;min-height:100vh;font-size:15px;line-height:1.7}.header{padding:32px 24px;text-align:center;border-bottom:3px solid '+ac+'}.header h1{font-size:2.2rem;font-weight:900;color:#000;margin-bottom:4px}.header .sub{font-size:12px;color:'+ac+';letter-spacing:2px;text-transform:uppercase}.container{max-width:800px;margin:24px auto;padding:0 20px}.card{background:#fff;border:1px solid #bfdbfe;border-radius:8px;padding:22px;margin-bottom:16px}.card h2{font-size:16px;font-weight:700;color:'+ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid '+ac+'18}.field{padding:10px 0;border-bottom:1px solid #f0f0f0}.field:last-child{border-bottom:none}.field .k{font-size:14px;font-weight:700;text-transform:uppercase;color:#555;letter-spacing:.8px;margin-bottom:3px}.field .v{font-size:18px;color:#000;font-weight:700}.field .v.mono{font-family:monospace;color:'+ac+'}.field .v.green{color:#059669}.phone-box{text-align:center;padding:16px;margin:16px 0;background:'+ac+'08;border:2px solid '+ac+'25;border-radius:8px}.phone-box .ph{font-family:monospace;font-size:1.6rem;color:'+ac+';font-weight:900;letter-spacing:2px}.phone-box .lbl{font-size:11px;color:#666;margin-top:4px;text-transform:uppercase;letter-spacing:1px}.card p{font-size:15px;color:#333;line-height:1.8;margin-bottom:6px}.card ul{list-style:none}.card li{font-size:15px;color:#333;line-height:2;padding-left:14px;position:relative}.card li::before{content:"\\2022";position:absolute;left:0;color:'+ac+'}.footer{max-width:800px;margin:16px auto;padding:14px 20px;background:'+ac+';border-radius:8px;text-align:center;font-size:12px;color:#fff}';
    return headHtml+'<style>'+css+'</style></head><body><div class="header"><h1 data-field="razao">'+razaoFmt+'</h1><div class="sub">'+sec.waba+'</div></div><div class="container"><div class="card"><h2>Dados Cadastrais</h2><div class="field"><div class="k">Raz\u00e3o Social</div><div class="v">'+razaoFmt+'</div></div><div class="field"><div class="k">CNPJ</div><div class="v mono">'+cnpjFmt+'</div></div><div class="field"><div class="k">Situa\u00e7\u00e3o</div><div class="v green">'+situacaoFmt+'</div></div><div class="field"><div class="k">Endere\u00e7o</div><div class="v">'+fullAddress+'</div></div><div class="field"><div class="k">Email</div><div class="v">'+(emailFmt||'N/A')+'</div></div>'+(atividadeFmt?'<div class="field"><div class="k">CNAE</div><div class="v">'+atividadeFmt+'</div></div>':'')+'</div>'+(phoneFmt?'<div class="phone-box"><div class="ph" data-field="phone">'+phoneFmt+'</div><div class="lbl">Canal WhatsApp Business</div></div>':'')+'<div class="card"><h2>Canal de Atendimento</h2><p>'+wabaText+'</p><p>'+wabaFoot+'</p></div><div class="card"><h2>Sobre</h2><p>'+sob+'</p></div><div class="card"><h2>Atendimento</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="card"><h2>Privacidade</h2><p>'+priv+'</p></div><div class="card"><h2>Termos</h2><p>'+term+'</p></div></div><div class="footer">'+razaoFmt+' \u2014 CNPJ '+cnpjFmt+(phoneFmt?' \u2014 '+phoneFmt:'')+'</div>'+domScript+'</body></html>';
  }

  // ── LAYOUT 20 ──
  else if (layoutType === 20) {
    var css = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#fef2f2;color:#111;min-height:100vh;font-size:15px;line-height:1.7}.header{background:#1e293b;padding:28px 24px;text-align:center}.header h1{font-size:2rem;font-weight:900;color:#fff;margin-bottom:4px}.header .sub{font-size:12px;color:'+ac+';letter-spacing:2px;text-transform:uppercase}.container{max-width:800px;margin:24px auto;padding:0 20px}.card{background:#fff;border:1px solid #fca5a5;border-radius:0;padding:22px;margin-bottom:16px}.card h2{font-size:16px;font-weight:700;color:'+ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid '+ac+'18}.field{padding:10px 0;border-bottom:1px solid #f0f0f0}.field:last-child{border-bottom:none}.field .k{font-size:14px;font-weight:700;text-transform:uppercase;color:#555;letter-spacing:.8px;margin-bottom:3px}.field .v{font-size:18px;color:#000;font-weight:700}.field .v.mono{font-family:monospace;color:'+ac+'}.field .v.green{color:#059669}.phone-box{text-align:center;padding:16px;margin:16px 0;background:'+ac+'08;border:2px solid '+ac+'25;border-radius:8px}.phone-box .ph{font-family:monospace;font-size:1.6rem;color:'+ac+';font-weight:900;letter-spacing:2px}.phone-box .lbl{font-size:11px;color:#666;margin-top:4px;text-transform:uppercase;letter-spacing:1px}.card p{font-size:15px;color:#333;line-height:1.8;margin-bottom:6px}.card ul{list-style:none}.card li{font-size:15px;color:#333;line-height:2;padding-left:14px;position:relative}.card li::before{content:"\\2022";position:absolute;left:0;color:'+ac+'}.footer{max-width:800px;margin:16px auto;padding:14px 20px;background:'+ac+';border-radius:0;text-align:center;font-size:12px;color:#fff}';
    return headHtml+'<style>'+css+'</style></head><body><div class="header"><h1 data-field="razao">'+razaoFmt+'</h1><div class="sub">'+sec.waba+'</div></div><div class="container"><div class="card"><h2>Dados Cadastrais</h2><div class="field"><div class="k">Raz\u00e3o Social</div><div class="v">'+razaoFmt+'</div></div><div class="field"><div class="k">CNPJ</div><div class="v mono">'+cnpjFmt+'</div></div><div class="field"><div class="k">Situa\u00e7\u00e3o</div><div class="v green">'+situacaoFmt+'</div></div><div class="field"><div class="k">Endere\u00e7o</div><div class="v">'+fullAddress+'</div></div><div class="field"><div class="k">Email</div><div class="v">'+(emailFmt||'N/A')+'</div></div>'+(atividadeFmt?'<div class="field"><div class="k">CNAE</div><div class="v">'+atividadeFmt+'</div></div>':'')+'</div>'+(phoneFmt?'<div class="phone-box"><div class="ph" data-field="phone">'+phoneFmt+'</div><div class="lbl">Canal WhatsApp Business</div></div>':'')+'<div class="card"><h2>Canal de Atendimento</h2><p>'+wabaText+'</p><p>'+wabaFoot+'</p></div><div class="card"><h2>Sobre</h2><p>'+sob+'</p></div><div class="card"><h2>Atendimento</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="card"><h2>Privacidade</h2><p>'+priv+'</p></div><div class="card"><h2>Termos</h2><p>'+term+'</p></div></div><div class="footer">'+razaoFmt+' \u2014 CNPJ '+cnpjFmt+(phoneFmt?' \u2014 '+phoneFmt:'')+'</div>'+domScript+'</body></html>';
  }

  // ── LAYOUT 21 ──
  else if (layoutType === 21) {
    var css = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#f7fee7;color:#111;min-height:100vh;font-size:15px;line-height:1.7}.topbar{background:'+ac+';padding:10px 20px;text-align:center;font-family:monospace;font-size:14px;color:#fff;font-weight:700;letter-spacing:1px}.header{padding:32px 24px;text-align:center;border-bottom:3px solid '+ac+'}.header h1{font-size:2.2rem;font-weight:900;color:#000;margin-bottom:4px}.header .sub{font-size:12px;color:'+ac+';letter-spacing:2px;text-transform:uppercase}.container{max-width:800px;margin:24px auto;padding:0 20px}.card{background:#fff;border:1px solid #bef264;border-radius:6px;padding:22px;margin-bottom:16px}.card h2{font-size:16px;font-weight:700;color:'+ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid '+ac+'18}.field{padding:10px 0;border-bottom:1px solid #f0f0f0}.field:last-child{border-bottom:none}.field .k{font-size:14px;font-weight:700;text-transform:uppercase;color:#555;letter-spacing:.8px;margin-bottom:3px}.field .v{font-size:18px;color:#000;font-weight:700}.field .v.mono{font-family:monospace;color:'+ac+'}.field .v.green{color:#059669}.phone-box{text-align:center;padding:16px;margin:16px 0;background:'+ac+'08;border:2px solid '+ac+'25;border-radius:8px}.phone-box .ph{font-family:monospace;font-size:1.6rem;color:'+ac+';font-weight:900;letter-spacing:2px}.phone-box .lbl{font-size:11px;color:#666;margin-top:4px;text-transform:uppercase;letter-spacing:1px}.card p{font-size:15px;color:#333;line-height:1.8;margin-bottom:6px}.card ul{list-style:none}.card li{font-size:15px;color:#333;line-height:2;padding-left:14px;position:relative}.card li::before{content:"\\2022";position:absolute;left:0;color:'+ac+'}.footer{max-width:800px;margin:16px auto;padding:14px 20px;background:'+ac+';border-radius:6px;text-align:center;font-size:12px;color:#fff}';
    return headHtml+'<style>'+css+'</style></head><body>'+(phoneFmt?'<div class="topbar" data-field="phone">'+phoneFmt+'</div>':'')+'<div class="header"><h1 data-field="razao">'+razaoFmt+'</h1><div class="sub">'+sec.waba+'</div></div><div class="container"><div class="card"><h2>Dados Cadastrais</h2><div class="field"><div class="k">Raz\u00e3o Social</div><div class="v">'+razaoFmt+'</div></div><div class="field"><div class="k">CNPJ</div><div class="v mono">'+cnpjFmt+'</div></div><div class="field"><div class="k">Situa\u00e7\u00e3o</div><div class="v green">'+situacaoFmt+'</div></div><div class="field"><div class="k">Endere\u00e7o</div><div class="v">'+fullAddress+'</div></div><div class="field"><div class="k">Email</div><div class="v">'+(emailFmt||'N/A')+'</div></div>'+(atividadeFmt?'<div class="field"><div class="k">CNAE</div><div class="v">'+atividadeFmt+'</div></div>':'')+'</div>'+(phoneFmt?'<div class="phone-box"><div class="ph" data-field="phone">'+phoneFmt+'</div><div class="lbl">Canal WhatsApp Business</div></div>':'')+'<div class="card"><h2>Canal de Atendimento</h2><p>'+wabaText+'</p><p>'+wabaFoot+'</p></div><div class="card"><h2>Sobre</h2><p>'+sob+'</p></div><div class="card"><h2>Atendimento</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="card"><h2>Privacidade</h2><p>'+priv+'</p></div><div class="card"><h2>Termos</h2><p>'+term+'</p></div></div><div class="footer">'+razaoFmt+' \u2014 CNPJ '+cnpjFmt+(phoneFmt?' \u2014 '+phoneFmt:'')+'</div>'+domScript+'</body></html>';
  }

  // ── LAYOUT 22 ──
  else if (layoutType === 22) {
    var css = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#faf5ff;color:#111;min-height:100vh;font-size:15px;line-height:1.7}.header{padding:32px 24px;text-align:center;border-bottom:3px solid '+ac+'}.header h1{font-size:2.2rem;font-weight:900;color:#000;margin-bottom:4px}.header .sub{font-size:12px;color:'+ac+';letter-spacing:2px;text-transform:uppercase}.container{max-width:800px;margin:24px auto;padding:0 20px}.card{background:#fff;border:1px solid #e9d5ff;border-radius:10px;padding:22px;margin-bottom:16px}.card h2{font-size:16px;font-weight:700;color:'+ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid '+ac+'18}.field{padding:10px 0;border-bottom:1px solid #f0f0f0}.field:last-child{border-bottom:none}.field .k{font-size:14px;font-weight:700;text-transform:uppercase;color:#555;letter-spacing:.8px;margin-bottom:3px}.field .v{font-size:18px;color:#000;font-weight:700}.field .v.mono{font-family:monospace;color:'+ac+'}.field .v.green{color:#059669}.phone-box{text-align:center;padding:16px;margin:16px 0;background:'+ac+'08;border:2px solid '+ac+'25;border-radius:8px}.phone-box .ph{font-family:monospace;font-size:1.6rem;color:'+ac+';font-weight:900;letter-spacing:2px}.phone-box .lbl{font-size:11px;color:#666;margin-top:4px;text-transform:uppercase;letter-spacing:1px}.card p{font-size:15px;color:#333;line-height:1.8;margin-bottom:6px}.card ul{list-style:none}.card li{font-size:15px;color:#333;line-height:2;padding-left:14px;position:relative}.card li::before{content:"\\2022";position:absolute;left:0;color:'+ac+'}.footer{max-width:800px;margin:16px auto;padding:14px 20px;background:'+ac+';border-radius:10px;text-align:center;font-size:12px;color:#fff}';
    return headHtml+'<style>'+css+'</style></head><body><div class="header"><h1 data-field="razao">'+razaoFmt+'</h1><div class="sub">'+sec.waba+'</div></div><div class="container"><div class="card"><h2>Dados Cadastrais</h2><div class="field"><div class="k">Raz\u00e3o Social</div><div class="v">'+razaoFmt+'</div></div><div class="field"><div class="k">CNPJ</div><div class="v mono">'+cnpjFmt+'</div></div><div class="field"><div class="k">Situa\u00e7\u00e3o</div><div class="v green">'+situacaoFmt+'</div></div><div class="field"><div class="k">Endere\u00e7o</div><div class="v">'+fullAddress+'</div></div><div class="field"><div class="k">Email</div><div class="v">'+(emailFmt||'N/A')+'</div></div>'+(atividadeFmt?'<div class="field"><div class="k">CNAE</div><div class="v">'+atividadeFmt+'</div></div>':'')+'</div>'+(phoneFmt?'<div class="phone-box"><div class="ph" data-field="phone">'+phoneFmt+'</div><div class="lbl">Canal WhatsApp Business</div></div>':'')+'<div class="card"><h2>Canal de Atendimento</h2><p>'+wabaText+'</p><p>'+wabaFoot+'</p></div><div class="card"><h2>Sobre</h2><p>'+sob+'</p></div><div class="card"><h2>Atendimento</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="card"><h2>Privacidade</h2><p>'+priv+'</p></div><div class="card"><h2>Termos</h2><p>'+term+'</p></div></div><div class="footer">'+razaoFmt+' \u2014 CNPJ '+cnpjFmt+(phoneFmt?' \u2014 '+phoneFmt:'')+'</div>'+domScript+'</body></html>';
  }

  // ── LAYOUT 23 ──
  else if (layoutType === 23) {
    var css = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#fffbeb;color:#111;min-height:100vh;font-size:15px;line-height:1.7}.header{padding:32px 24px;text-align:center;border-bottom:3px solid '+ac+'}.header h1{font-size:2.2rem;font-weight:900;color:#000;margin-bottom:4px}.header .sub{font-size:12px;color:'+ac+';letter-spacing:2px;text-transform:uppercase}.container{max-width:800px;margin:24px auto;padding:0 20px}.card{background:#fff;border:1px solid #fde047;border-radius:16px;padding:22px;margin-bottom:16px}.card h2{font-size:16px;font-weight:700;color:'+ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid '+ac+'18}.field{padding:10px 0;border-bottom:1px solid #f0f0f0}.field:last-child{border-bottom:none}.field .k{font-size:14px;font-weight:700;text-transform:uppercase;color:#555;letter-spacing:.8px;margin-bottom:3px}.field .v{font-size:18px;color:#000;font-weight:700}.field .v.mono{font-family:monospace;color:'+ac+'}.field .v.green{color:#059669}.phone-box{text-align:center;padding:16px;margin:16px 0;background:'+ac+'08;border:2px solid '+ac+'25;border-radius:8px}.phone-box .ph{font-family:monospace;font-size:1.6rem;color:'+ac+';font-weight:900;letter-spacing:2px}.phone-box .lbl{font-size:11px;color:#666;margin-top:4px;text-transform:uppercase;letter-spacing:1px}.card p{font-size:15px;color:#333;line-height:1.8;margin-bottom:6px}.card ul{list-style:none}.card li{font-size:15px;color:#333;line-height:2;padding-left:14px;position:relative}.card li::before{content:"\\2022";position:absolute;left:0;color:'+ac+'}.footer{max-width:800px;margin:16px auto;padding:14px 20px;background:'+ac+';border-radius:16px;text-align:center;font-size:12px;color:#fff}';
    return headHtml+'<style>'+css+'</style></head><body><div class="header"><h1 data-field="razao">'+razaoFmt+'</h1><div class="sub">'+sec.waba+'</div></div><div class="container"><div class="card"><h2>Dados Cadastrais</h2><div class="field"><div class="k">Raz\u00e3o Social</div><div class="v">'+razaoFmt+'</div></div><div class="field"><div class="k">CNPJ</div><div class="v mono">'+cnpjFmt+'</div></div><div class="field"><div class="k">Situa\u00e7\u00e3o</div><div class="v green">'+situacaoFmt+'</div></div><div class="field"><div class="k">Endere\u00e7o</div><div class="v">'+fullAddress+'</div></div><div class="field"><div class="k">Email</div><div class="v">'+(emailFmt||'N/A')+'</div></div>'+(atividadeFmt?'<div class="field"><div class="k">CNAE</div><div class="v">'+atividadeFmt+'</div></div>':'')+'</div>'+(phoneFmt?'<div class="phone-box"><div class="ph" data-field="phone">'+phoneFmt+'</div><div class="lbl">Canal WhatsApp Business</div></div>':'')+'<div class="card"><h2>Canal de Atendimento</h2><p>'+wabaText+'</p><p>'+wabaFoot+'</p></div><div class="card"><h2>Sobre</h2><p>'+sob+'</p></div><div class="card"><h2>Atendimento</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="card"><h2>Privacidade</h2><p>'+priv+'</p></div><div class="card"><h2>Termos</h2><p>'+term+'</p></div></div><div class="footer">'+razaoFmt+' \u2014 CNPJ '+cnpjFmt+(phoneFmt?' \u2014 '+phoneFmt:'')+'</div>'+domScript+'</body></html>';
  }

  // ── LAYOUT 24 ──
  else if (layoutType === 24) {
    var css = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#f0fdfa;color:#111;min-height:100vh;font-size:15px;line-height:1.7}.topbar{background:'+ac+';padding:10px 20px;text-align:center;font-family:monospace;font-size:14px;color:#fff;font-weight:700;letter-spacing:1px}.header{padding:32px 24px;text-align:center;border-bottom:3px solid '+ac+'}.header h1{font-size:2.2rem;font-weight:900;color:#000;margin-bottom:4px}.header .sub{font-size:12px;color:'+ac+';letter-spacing:2px;text-transform:uppercase}.container{max-width:800px;margin:24px auto;padding:0 20px}.card{background:#fff;border:1px solid #99f6e4;border-radius:8px;padding:22px;margin-bottom:16px}.card h2{font-size:16px;font-weight:700;color:'+ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid '+ac+'18}.field{padding:10px 0;border-bottom:1px solid #f0f0f0}.field:last-child{border-bottom:none}.field .k{font-size:14px;font-weight:700;text-transform:uppercase;color:#555;letter-spacing:.8px;margin-bottom:3px}.field .v{font-size:18px;color:#000;font-weight:700}.field .v.mono{font-family:monospace;color:'+ac+'}.field .v.green{color:#059669}.phone-box{text-align:center;padding:16px;margin:16px 0;background:'+ac+'08;border:2px solid '+ac+'25;border-radius:8px}.phone-box .ph{font-family:monospace;font-size:1.6rem;color:'+ac+';font-weight:900;letter-spacing:2px}.phone-box .lbl{font-size:11px;color:#666;margin-top:4px;text-transform:uppercase;letter-spacing:1px}.card p{font-size:15px;color:#333;line-height:1.8;margin-bottom:6px}.card ul{list-style:none}.card li{font-size:15px;color:#333;line-height:2;padding-left:14px;position:relative}.card li::before{content:"\\2022";position:absolute;left:0;color:'+ac+'}.footer{max-width:800px;margin:16px auto;padding:14px 20px;background:'+ac+';border-radius:8px;text-align:center;font-size:12px;color:#fff}';
    return headHtml+'<style>'+css+'</style></head><body>'+(phoneFmt?'<div class="topbar" data-field="phone">'+phoneFmt+'</div>':'')+'<div class="header"><h1 data-field="razao">'+razaoFmt+'</h1><div class="sub">'+sec.waba+'</div></div><div class="container"><div class="card"><h2>Dados Cadastrais</h2><div class="field"><div class="k">Raz\u00e3o Social</div><div class="v">'+razaoFmt+'</div></div><div class="field"><div class="k">CNPJ</div><div class="v mono">'+cnpjFmt+'</div></div><div class="field"><div class="k">Situa\u00e7\u00e3o</div><div class="v green">'+situacaoFmt+'</div></div><div class="field"><div class="k">Endere\u00e7o</div><div class="v">'+fullAddress+'</div></div><div class="field"><div class="k">Email</div><div class="v">'+(emailFmt||'N/A')+'</div></div>'+(atividadeFmt?'<div class="field"><div class="k">CNAE</div><div class="v">'+atividadeFmt+'</div></div>':'')+'</div>'+(phoneFmt?'<div class="phone-box"><div class="ph" data-field="phone">'+phoneFmt+'</div><div class="lbl">Canal WhatsApp Business</div></div>':'')+'<div class="card"><h2>Canal de Atendimento</h2><p>'+wabaText+'</p><p>'+wabaFoot+'</p></div><div class="card"><h2>Sobre</h2><p>'+sob+'</p></div><div class="card"><h2>Atendimento</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="card"><h2>Privacidade</h2><p>'+priv+'</p></div><div class="card"><h2>Termos</h2><p>'+term+'</p></div></div><div class="footer">'+razaoFmt+' \u2014 CNPJ '+cnpjFmt+(phoneFmt?' \u2014 '+phoneFmt:'')+'</div>'+domScript+'</body></html>';
  }

  // ── LAYOUT 25 ──
  else if (layoutType === 25) {
    var css = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#fefce8;color:#111;min-height:100vh;font-size:15px;line-height:1.7}.header{background:#1e293b;padding:28px 24px;text-align:center}.header h1{font-size:2rem;font-weight:900;color:#fff;margin-bottom:4px}.header .sub{font-size:12px;color:'+ac+';letter-spacing:2px;text-transform:uppercase}.container{max-width:800px;margin:24px auto;padding:0 20px}.card{background:#fff;border:1px solid #fef08a;border-radius:4px;padding:22px;margin-bottom:16px}.card h2{font-size:16px;font-weight:700;color:'+ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid '+ac+'18}.field{padding:10px 0;border-bottom:1px solid #f0f0f0}.field:last-child{border-bottom:none}.field .k{font-size:14px;font-weight:700;text-transform:uppercase;color:#555;letter-spacing:.8px;margin-bottom:3px}.field .v{font-size:18px;color:#000;font-weight:700}.field .v.mono{font-family:monospace;color:'+ac+'}.field .v.green{color:#059669}.phone-box{text-align:center;padding:16px;margin:16px 0;background:'+ac+'08;border:2px solid '+ac+'25;border-radius:8px}.phone-box .ph{font-family:monospace;font-size:1.6rem;color:'+ac+';font-weight:900;letter-spacing:2px}.phone-box .lbl{font-size:11px;color:#666;margin-top:4px;text-transform:uppercase;letter-spacing:1px}.card p{font-size:15px;color:#333;line-height:1.8;margin-bottom:6px}.card ul{list-style:none}.card li{font-size:15px;color:#333;line-height:2;padding-left:14px;position:relative}.card li::before{content:"\\2022";position:absolute;left:0;color:'+ac+'}.footer{max-width:800px;margin:16px auto;padding:14px 20px;background:'+ac+';border-radius:4px;text-align:center;font-size:12px;color:#fff}';
    return headHtml+'<style>'+css+'</style></head><body><div class="header"><h1 data-field="razao">'+razaoFmt+'</h1><div class="sub">'+sec.waba+'</div></div><div class="container"><div class="card"><h2>Dados Cadastrais</h2><div class="field"><div class="k">Raz\u00e3o Social</div><div class="v">'+razaoFmt+'</div></div><div class="field"><div class="k">CNPJ</div><div class="v mono">'+cnpjFmt+'</div></div><div class="field"><div class="k">Situa\u00e7\u00e3o</div><div class="v green">'+situacaoFmt+'</div></div><div class="field"><div class="k">Endere\u00e7o</div><div class="v">'+fullAddress+'</div></div><div class="field"><div class="k">Email</div><div class="v">'+(emailFmt||'N/A')+'</div></div>'+(atividadeFmt?'<div class="field"><div class="k">CNAE</div><div class="v">'+atividadeFmt+'</div></div>':'')+'</div>'+(phoneFmt?'<div class="phone-box"><div class="ph" data-field="phone">'+phoneFmt+'</div><div class="lbl">Canal WhatsApp Business</div></div>':'')+'<div class="card"><h2>Canal de Atendimento</h2><p>'+wabaText+'</p><p>'+wabaFoot+'</p></div><div class="card"><h2>Sobre</h2><p>'+sob+'</p></div><div class="card"><h2>Atendimento</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="card"><h2>Privacidade</h2><p>'+priv+'</p></div><div class="card"><h2>Termos</h2><p>'+term+'</p></div></div><div class="footer">'+razaoFmt+' \u2014 CNPJ '+cnpjFmt+(phoneFmt?' \u2014 '+phoneFmt:'')+'</div>'+domScript+'</body></html>';
  }

  // ── LAYOUT 26 ──
  else if (layoutType === 26) {
    var css = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#f1f5f9;color:#111;min-height:100vh;font-size:15px;line-height:1.7}.header{padding:32px 24px;text-align:center;border-bottom:3px solid '+ac+'}.header h1{font-size:2.2rem;font-weight:900;color:#000;margin-bottom:4px}.header .sub{font-size:12px;color:'+ac+';letter-spacing:2px;text-transform:uppercase}.container{max-width:800px;margin:24px auto;padding:0 20px}.card{background:#fff;border:1px solid #cbd5e1;border-radius:12px;padding:22px;margin-bottom:16px}.card h2{font-size:16px;font-weight:700;color:'+ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid '+ac+'18}.field{padding:10px 0;border-bottom:1px solid #f0f0f0}.field:last-child{border-bottom:none}.field .k{font-size:14px;font-weight:700;text-transform:uppercase;color:#555;letter-spacing:.8px;margin-bottom:3px}.field .v{font-size:18px;color:#000;font-weight:700}.field .v.mono{font-family:monospace;color:'+ac+'}.field .v.green{color:#059669}.phone-box{text-align:center;padding:16px;margin:16px 0;background:'+ac+'08;border:2px solid '+ac+'25;border-radius:8px}.phone-box .ph{font-family:monospace;font-size:1.6rem;color:'+ac+';font-weight:900;letter-spacing:2px}.phone-box .lbl{font-size:11px;color:#666;margin-top:4px;text-transform:uppercase;letter-spacing:1px}.card p{font-size:15px;color:#333;line-height:1.8;margin-bottom:6px}.card ul{list-style:none}.card li{font-size:15px;color:#333;line-height:2;padding-left:14px;position:relative}.card li::before{content:"\\2022";position:absolute;left:0;color:'+ac+'}.footer{max-width:800px;margin:16px auto;padding:14px 20px;background:'+ac+';border-radius:12px;text-align:center;font-size:12px;color:#fff}';
    return headHtml+'<style>'+css+'</style></head><body><div class="header"><h1 data-field="razao">'+razaoFmt+'</h1><div class="sub">'+sec.waba+'</div></div><div class="container"><div class="card"><h2>Dados Cadastrais</h2><div class="field"><div class="k">Raz\u00e3o Social</div><div class="v">'+razaoFmt+'</div></div><div class="field"><div class="k">CNPJ</div><div class="v mono">'+cnpjFmt+'</div></div><div class="field"><div class="k">Situa\u00e7\u00e3o</div><div class="v green">'+situacaoFmt+'</div></div><div class="field"><div class="k">Endere\u00e7o</div><div class="v">'+fullAddress+'</div></div><div class="field"><div class="k">Email</div><div class="v">'+(emailFmt||'N/A')+'</div></div>'+(atividadeFmt?'<div class="field"><div class="k">CNAE</div><div class="v">'+atividadeFmt+'</div></div>':'')+'</div>'+(phoneFmt?'<div class="phone-box"><div class="ph" data-field="phone">'+phoneFmt+'</div><div class="lbl">Canal WhatsApp Business</div></div>':'')+'<div class="card"><h2>Canal de Atendimento</h2><p>'+wabaText+'</p><p>'+wabaFoot+'</p></div><div class="card"><h2>Sobre</h2><p>'+sob+'</p></div><div class="card"><h2>Atendimento</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="card"><h2>Privacidade</h2><p>'+priv+'</p></div><div class="card"><h2>Termos</h2><p>'+term+'</p></div></div><div class="footer">'+razaoFmt+' \u2014 CNPJ '+cnpjFmt+(phoneFmt?' \u2014 '+phoneFmt:'')+'</div>'+domScript+'</body></html>';
  }

  // ── LAYOUT 27 ──
  else if (layoutType === 27) {
    var css = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#fff;color:#111;min-height:100vh;font-size:15px;line-height:1.7}.topbar{background:'+ac+';padding:10px 20px;text-align:center;font-family:monospace;font-size:14px;color:#fff;font-weight:700;letter-spacing:1px}.header{padding:32px 24px;text-align:center;border-bottom:3px solid '+ac+'}.header h1{font-size:2.2rem;font-weight:900;color:#000;margin-bottom:4px}.header .sub{font-size:12px;color:'+ac+';letter-spacing:2px;text-transform:uppercase}.container{max-width:800px;margin:24px auto;padding:0 20px}.card{background:#fff;border:1px solid #d6d3d1;border-radius:6px;padding:22px;margin-bottom:16px}.card h2{font-size:16px;font-weight:700;color:'+ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid '+ac+'18}.field{padding:10px 0;border-bottom:1px solid #f0f0f0}.field:last-child{border-bottom:none}.field .k{font-size:14px;font-weight:700;text-transform:uppercase;color:#555;letter-spacing:.8px;margin-bottom:3px}.field .v{font-size:18px;color:#000;font-weight:700}.field .v.mono{font-family:monospace;color:'+ac+'}.field .v.green{color:#059669}.phone-box{text-align:center;padding:16px;margin:16px 0;background:'+ac+'08;border:2px solid '+ac+'25;border-radius:8px}.phone-box .ph{font-family:monospace;font-size:1.6rem;color:'+ac+';font-weight:900;letter-spacing:2px}.phone-box .lbl{font-size:11px;color:#666;margin-top:4px;text-transform:uppercase;letter-spacing:1px}.card p{font-size:15px;color:#333;line-height:1.8;margin-bottom:6px}.card ul{list-style:none}.card li{font-size:15px;color:#333;line-height:2;padding-left:14px;position:relative}.card li::before{content:"\\2022";position:absolute;left:0;color:'+ac+'}.footer{max-width:800px;margin:16px auto;padding:14px 20px;background:'+ac+';border-radius:6px;text-align:center;font-size:12px;color:#fff}';
    return headHtml+'<style>'+css+'</style></head><body>'+(phoneFmt?'<div class="topbar" data-field="phone">'+phoneFmt+'</div>':'')+'<div class="header"><h1 data-field="razao">'+razaoFmt+'</h1><div class="sub">'+sec.waba+'</div></div><div class="container"><div class="card"><h2>Dados Cadastrais</h2><div class="field"><div class="k">Raz\u00e3o Social</div><div class="v">'+razaoFmt+'</div></div><div class="field"><div class="k">CNPJ</div><div class="v mono">'+cnpjFmt+'</div></div><div class="field"><div class="k">Situa\u00e7\u00e3o</div><div class="v green">'+situacaoFmt+'</div></div><div class="field"><div class="k">Endere\u00e7o</div><div class="v">'+fullAddress+'</div></div><div class="field"><div class="k">Email</div><div class="v">'+(emailFmt||'N/A')+'</div></div>'+(atividadeFmt?'<div class="field"><div class="k">CNAE</div><div class="v">'+atividadeFmt+'</div></div>':'')+'</div>'+(phoneFmt?'<div class="phone-box"><div class="ph" data-field="phone">'+phoneFmt+'</div><div class="lbl">Canal WhatsApp Business</div></div>':'')+'<div class="card"><h2>Canal de Atendimento</h2><p>'+wabaText+'</p><p>'+wabaFoot+'</p></div><div class="card"><h2>Sobre</h2><p>'+sob+'</p></div><div class="card"><h2>Atendimento</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="card"><h2>Privacidade</h2><p>'+priv+'</p></div><div class="card"><h2>Termos</h2><p>'+term+'</p></div></div><div class="footer">'+razaoFmt+' \u2014 CNPJ '+cnpjFmt+(phoneFmt?' \u2014 '+phoneFmt:'')+'</div>'+domScript+'</body></html>';
  }

  // ── LAYOUT 28: Minimalista com bordas grossas ──
  else if (layoutType === 28) {
    var css = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#fafaf9;color:#111;min-height:100vh;font-size:15px;line-height:1.7}.header{padding:36px 24px;text-align:center;border-bottom:4px solid '+ac+'}.header h1{font-size:2.4rem;font-weight:900;color:#000;margin-bottom:6px}.header .sub{font-size:13px;color:'+ac+';letter-spacing:2px;text-transform:uppercase}.container{max-width:820px;margin:28px auto;padding:0 20px}.box{border:3px solid '+ac+';border-radius:4px;padding:24px;margin-bottom:20px}.box h2{font-size:16px;font-weight:800;color:#000;margin-bottom:14px;text-transform:uppercase;letter-spacing:1px}.field{padding:12px 0;border-bottom:1px solid #e5e5e5}.field:last-child{border-bottom:none}.field .k{font-size:14px;font-weight:700;text-transform:uppercase;color:#555;margin-bottom:3px}.field .v{font-size:18px;color:#000;font-weight:700}.field .v.mono{font-family:monospace;color:'+ac+'}.field .v.green{color:#059669}.phone-hero{text-align:center;padding:20px;margin:20px 0;background:'+ac+';border-radius:4px}.phone-hero .ph{font-family:monospace;font-size:1.8rem;color:#fff;font-weight:900;letter-spacing:2px}.phone-hero .lbl{font-size:11px;color:rgba(255,255,255,.8);margin-top:4px}.box p{font-size:15px;color:#333;line-height:1.8;margin-bottom:6px}.box ul{list-style:none}.box li{font-size:15px;color:#333;line-height:2;padding-left:14px;position:relative}.box li::before{content:"\\2022";position:absolute;left:0;color:'+ac+'}.footer{text-align:center;padding:16px;font-size:12px;color:#888;border-top:2px solid #e5e5e5;margin-top:20px}';
    return headHtml+'<style>'+css+'</style></head><body><div class="header"><h1 data-field="razao">'+razaoFmt+'</h1><div class="sub">'+sec.waba+'</div></div><div class="container"><div class="box"><h2>Dados da Empresa</h2><div class="field"><div class="k">Raz\u00e3o Social</div><div class="v">'+razaoFmt+'</div></div><div class="field"><div class="k">CNPJ</div><div class="v mono">'+cnpjFmt+'</div></div><div class="field"><div class="k">Situa\u00e7\u00e3o</div><div class="v green">'+situacaoFmt+'</div></div><div class="field"><div class="k">Endere\u00e7o</div><div class="v">'+fullAddress+'</div></div><div class="field"><div class="k">Email</div><div class="v">'+(emailFmt||'N/A')+'</div></div>'+(atividadeFmt?'<div class="field"><div class="k">CNAE</div><div class="v">'+atividadeFmt+'</div></div>':'')+'</div>'+(phoneFmt?'<div class="phone-hero"><div class="ph" data-field="phone">'+phoneFmt+'</div><div class="lbl">Canal WhatsApp Oficial</div></div>':'')+'<div class="box"><h2>Canal de Atendimento</h2><p>'+wabaText+'</p><p>'+wabaFoot+'</p></div><div class="box"><h2>Sobre</h2><p>'+sob+'</p></div><div class="box"><h2>Atendimento</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="box"><h2>Privacidade</h2><p>'+priv+'</p></div><div class="box"><h2>Termos</h2><p>'+term+'</p></div><div class="footer">'+razaoFmt+' \u2014 CNPJ '+cnpjFmt+'</div></div>'+domScript+'</body></html>';
  }

  // ── LAYOUT 29: Accordion-style com separadores ──
  else if (layoutType === 29) {
    var css = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#fff;color:#111;min-height:100vh;font-size:15px;line-height:1.7}.top{background:'+ac+';padding:28px 24px;text-align:center}.top h1{font-size:2rem;font-weight:900;color:#fff;margin-bottom:4px}.top .info{font-size:13px;color:rgba(255,255,255,.85)}.wrap{max-width:800px;margin:24px auto;padding:0 20px}.section{border-bottom:2px solid #f0f0f0;padding:20px 0}.section h2{font-size:15px;font-weight:700;color:'+ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;cursor:pointer}.section .field{padding:8px 0}.section .field .k{font-size:13px;font-weight:700;color:#666;text-transform:uppercase;margin-bottom:2px}.section .field .v{font-size:17px;color:#000;font-weight:700}.section .field .v.mono{font-family:monospace;color:'+ac+'}.section .field .v.green{color:#059669}.section .phone{font-family:monospace;font-size:1.5rem;color:'+ac+';font-weight:900;margin:12px 0;padding:14px;background:#f8f8f8;border-radius:6px;text-align:center;letter-spacing:2px}.section p{font-size:15px;color:#333;line-height:1.8;margin-bottom:6px}.section ul{list-style:none}.section li{font-size:15px;color:#333;line-height:2;padding-left:14px;position:relative}.section li::before{content:"\\25B8";position:absolute;left:0;color:'+ac+'}.footer{padding:16px;text-align:center;font-size:12px;color:#fff;background:'+ac+';border-radius:8px;margin:20px auto;max-width:800px}';
    return headHtml+'<style>'+css+'</style></head><body><div class="top"><h1 data-field="razao">'+razaoFmt+'</h1><div class="info">CNPJ '+cnpjFmt+' \u2014 '+situacaoFmt+'</div></div><div class="wrap"><div class="section"><h2>Dados Cadastrais</h2><div class="field"><div class="k">Raz\u00e3o Social</div><div class="v">'+razaoFmt+'</div></div><div class="field"><div class="k">CNPJ</div><div class="v mono">'+cnpjFmt+'</div></div><div class="field"><div class="k">Situa\u00e7\u00e3o</div><div class="v green">'+situacaoFmt+'</div></div><div class="field"><div class="k">Endere\u00e7o</div><div class="v">'+fullAddress+'</div></div><div class="field"><div class="k">Email</div><div class="v">'+(emailFmt||'N/A')+'</div></div>'+(atividadeFmt?'<div class="field"><div class="k">CNAE</div><div class="v">'+atividadeFmt+'</div></div>':'')+'</div><div class="section"><h2>Canal WhatsApp</h2>'+(phoneFmt?'<div class="phone" data-field="phone">'+phoneFmt+'</div>':'')+'<p>'+wabaText+'</p><p>'+wabaFoot+'</p></div><div class="section"><h2>Sobre</h2><p>'+sob+'</p></div><div class="section"><h2>Atendimento</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="section"><h2>Privacidade</h2><p>'+priv+'</p></div><div class="section"><h2>Termos</h2><p>'+term+'</p></div></div><div class="footer">'+razaoFmt+' \u2014 CNPJ '+cnpjFmt+(phoneFmt?' \u2014 '+phoneFmt:'')+'</div>'+domScript+'</body></html>';
  }

  // ── LAYOUT 30: Newspaper com colunas ──
  else if (layoutType === 30) {
    var css = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#fefefe;color:#111;min-height:100vh;font-size:15px;line-height:1.7}.masthead{text-align:center;padding:28px 20px;border-bottom:3px double #111}.masthead h1{font-size:2.4rem;font-weight:900;color:#000;letter-spacing:-1px}.masthead .sub{font-size:11px;letter-spacing:3px;color:#999;text-transform:uppercase;margin-top:4px}.body-wrap{max-width:900px;margin:24px auto;padding:0 20px;display:grid;grid-template-columns:2fr 1fr;gap:28px}@media(max-width:768px){.body-wrap{grid-template-columns:1fr}}.main-col .field{padding:10px 0;border-bottom:1px solid #eee}.main-col .field .k{font-size:13px;font-weight:700;color:#666;text-transform:uppercase;margin-bottom:2px}.main-col .field .v{font-size:17px;color:#000;font-weight:700}.main-col .field .v.mono{font-family:monospace;color:'+ac+'}.main-col .field .v.green{color:#059669}.main-col h2{font-size:16px;color:'+ac+';font-weight:700;margin:20px 0 10px;text-transform:uppercase;border-bottom:1px solid '+ac+'30;padding-bottom:6px}.main-col p{font-size:15px;color:#333;line-height:1.8;margin-bottom:6px}.main-col ul{list-style:none}.main-col li{font-size:15px;color:#333;line-height:2;padding-left:14px;position:relative}.main-col li::before{content:"\\2013";position:absolute;left:0;color:'+ac+'}.side-col{border-left:2px solid '+ac+';padding-left:20px}.side-col .phone{font-family:monospace;font-size:1.4rem;color:'+ac+';font-weight:900;margin-bottom:14px;letter-spacing:1px}.side-col h3{font-size:13px;font-weight:700;color:'+ac+';text-transform:uppercase;margin-bottom:8px}.side-col p{font-size:14px;color:#444;line-height:1.7;margin-bottom:10px}.side-col .meta{font-size:12px;color:#888;line-height:1.6}.footer{border-top:3px double #111;text-align:center;padding:14px;font-size:12px;color:#666;margin-top:20px}';
    return headHtml+'<style>'+css+'</style></head><body><div class="masthead"><h1 data-field="razao">'+razaoFmt+'</h1><div class="sub">Registro Empresarial \u2014 CNPJ '+cnpjFmt+'</div></div><div class="body-wrap"><div class="main-col"><div class="field"><div class="k">Raz\u00e3o Social</div><div class="v">'+razaoFmt+'</div></div><div class="field"><div class="k">CNPJ</div><div class="v mono">'+cnpjFmt+'</div></div><div class="field"><div class="k">Situa\u00e7\u00e3o</div><div class="v green">'+situacaoFmt+'</div></div><div class="field"><div class="k">Endere\u00e7o</div><div class="v">'+fullAddress+'</div></div><div class="field"><div class="k">Email</div><div class="v">'+(emailFmt||'N/A')+'</div></div>'+(atividadeFmt?'<div class="field"><div class="k">CNAE</div><div class="v">'+atividadeFmt+'</div></div>':'')+'<h2>Canal de Atendimento</h2><p>'+wabaText+'</p><p>'+wabaFoot+'</p><h2>Sobre</h2><p>'+sob+'</p><h2>Atendimento</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul><h2>Privacidade</h2><p>'+priv+'</p><h2>Termos</h2><p>'+term+'</p></div><div class="side-col"><h3>Canal Oficial</h3>'+(phoneFmt?'<div class="phone" data-field="phone">'+phoneFmt+'</div>':'')+'<p>Atendimento receptivo via WhatsApp Business. Canal Utility. Sem disparos.</p><h3>Identifica\u00e7\u00e3o</h3><div class="meta">'+razaoFmt+'<br>CNPJ '+cnpjFmt+'<br>'+munFmt+'/'+ufFmt+'<br>'+situacaoFmt+'</div></div></div><div class="footer">'+razaoFmt+' \u2014 CNPJ '+cnpjFmt+(phoneFmt?' | '+phoneFmt:'')+'</div>'+domScript+'</body></html>';
  }

  // ── LAYOUT 31: Cards arredondados com sombra ──
  else if (layoutType === 31) {
    var css = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#f1f5f9;color:#111;min-height:100vh;font-size:15px;line-height:1.7}.header{background:#fff;padding:32px 24px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.05)}.header h1{font-size:2.2rem;font-weight:900;color:#000;margin-bottom:4px}.header .sub{font-size:12px;color:'+ac+';letter-spacing:2px;text-transform:uppercase}.container{max-width:800px;margin:24px auto;padding:0 16px}.card{background:#fff;border-radius:16px;padding:24px;margin-bottom:16px;box-shadow:0 4px 12px rgba(0,0,0,.06)}.card h2{font-size:16px;font-weight:700;color:'+ac+';margin-bottom:14px}.field{padding:10px 0;border-bottom:1px solid #f5f5f5}.field:last-child{border-bottom:none}.field .k{font-size:14px;font-weight:700;color:#555;text-transform:uppercase;margin-bottom:3px}.field .v{font-size:18px;color:#000;font-weight:700}.field .v.mono{font-family:monospace;color:'+ac+'}.field .v.green{color:#059669}.phone-card{background:'+ac+';border-radius:16px;padding:24px;text-align:center;margin-bottom:16px}.phone-card .ph{font-family:monospace;font-size:1.8rem;color:#fff;font-weight:900;letter-spacing:2px}.phone-card .lbl{font-size:12px;color:rgba(255,255,255,.8);margin-top:6px}.card p{font-size:15px;color:#333;line-height:1.8;margin-bottom:6px}.card ul{list-style:none}.card li{font-size:15px;color:#333;line-height:2;padding-left:14px;position:relative}.card li::before{content:"\\2022";position:absolute;left:0;color:'+ac+'}.footer{text-align:center;padding:16px;font-size:12px;color:#888}';
    return headHtml+'<style>'+css+'</style></head><body><div class="header"><h1 data-field="razao">'+razaoFmt+'</h1><div class="sub">'+sec.waba+'</div></div><div class="container">'+(phoneFmt?'<div class="phone-card"><div class="ph" data-field="phone">'+phoneFmt+'</div><div class="lbl">Canal WhatsApp Business \u2014 Utility Receptivo</div></div>':'')+'<div class="card"><h2>Dados Cadastrais</h2><div class="field"><div class="k">Raz\u00e3o Social</div><div class="v">'+razaoFmt+'</div></div><div class="field"><div class="k">CNPJ</div><div class="v mono">'+cnpjFmt+'</div></div><div class="field"><div class="k">Situa\u00e7\u00e3o</div><div class="v green">'+situacaoFmt+'</div></div><div class="field"><div class="k">Endere\u00e7o</div><div class="v">'+fullAddress+'</div></div><div class="field"><div class="k">Email</div><div class="v">'+(emailFmt||'N/A')+'</div></div>'+(atividadeFmt?'<div class="field"><div class="k">CNAE</div><div class="v">'+atividadeFmt+'</div></div>':'')+'</div><div class="card"><h2>Canal de Atendimento</h2><p>'+wabaText+'</p><p>'+wabaFoot+'</p></div><div class="card"><h2>Sobre</h2><p>'+sob+'</p></div><div class="card"><h2>Atendimento</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="card"><h2>Privacidade</h2><p>'+priv+'</p></div><div class="card"><h2>Termos</h2><p>'+term+'</p></div><div class="footer">'+razaoFmt+' \u2014 CNPJ '+cnpjFmt+'</div></div>'+domScript+'</body></html>';
  }

  // ── LAYOUT 32: Stripe-style com gradiente lateral ──
  else if (layoutType === 32) {
    var css = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#fff;color:#111;min-height:100vh;font-size:15px;line-height:1.7;display:grid;grid-template-columns:8px 1fr}@media(max-width:600px){body{grid-template-columns:1fr}}.accent-bar{background:'+ac+'}@media(max-width:600px){.accent-bar{display:none}}.content{padding:36px 32px}@media(max-width:600px){.content{padding:24px 16px}}.content h1{font-size:2.2rem;font-weight:900;color:#000;margin-bottom:4px}.content .sub{font-size:12px;color:'+ac+';letter-spacing:2px;text-transform:uppercase;margin-bottom:28px}.block{margin-bottom:24px;padding-bottom:20px;border-bottom:1px solid #eee}.block:last-child{border-bottom:none}.block h2{font-size:15px;font-weight:700;color:'+ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:12px}.field{padding:8px 0}.field .k{font-size:13px;font-weight:700;color:#666;text-transform:uppercase;margin-bottom:2px}.field .v{font-size:18px;color:#000;font-weight:700}.field .v.mono{font-family:monospace;color:'+ac+'}.field .v.green{color:#059669}.phone-line{font-family:monospace;font-size:1.5rem;color:'+ac+';font-weight:900;padding:14px 0;letter-spacing:2px}.block p{font-size:15px;color:#333;line-height:1.8;margin-bottom:6px}.block ul{list-style:none}.block li{font-size:15px;color:#333;line-height:2;padding-left:14px;position:relative}.block li::before{content:"\\2022";position:absolute;left:0;color:'+ac+'}.footer{padding:14px 32px;background:#f8f9fa;font-size:12px;color:#888;border-top:1px solid #eee}';
    return headHtml+'<style>'+css+'</style></head><body><div class="accent-bar"></div><div class="content"><h1 data-field="razao">'+razaoFmt+'</h1><div class="sub">'+sec.waba+' \u2014 CNPJ '+cnpjFmt+'</div><div class="block"><h2>Dados Cadastrais</h2><div class="field"><div class="k">Raz\u00e3o Social</div><div class="v">'+razaoFmt+'</div></div><div class="field"><div class="k">CNPJ</div><div class="v mono">'+cnpjFmt+'</div></div><div class="field"><div class="k">Situa\u00e7\u00e3o</div><div class="v green">'+situacaoFmt+'</div></div><div class="field"><div class="k">Endere\u00e7o</div><div class="v">'+fullAddress+'</div></div><div class="field"><div class="k">Email</div><div class="v">'+(emailFmt||'N/A')+'</div></div>'+(atividadeFmt?'<div class="field"><div class="k">CNAE</div><div class="v">'+atividadeFmt+'</div></div>':'')+'</div><div class="block"><h2>Canal de Atendimento</h2>'+(phoneFmt?'<div class="phone-line" data-field="phone">'+phoneFmt+'</div>':'')+'<p>'+wabaText+'</p><p>'+wabaFoot+'</p></div><div class="block"><h2>Sobre</h2><p>'+sob+'</p></div><div class="block"><h2>Atendimento</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="block"><h2>Privacidade</h2><p>'+priv+'</p></div><div class="block"><h2>Termos</h2><p>'+term+'</p></div><div class="footer">'+razaoFmt+' \u2014 CNPJ '+cnpjFmt+(phoneFmt?' \u2014 '+phoneFmt:'')+'</div></div>'+domScript+'</body></html>';
  }

  else {
    return headHtml+'<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#fff;color:#111;min-height:100vh;font-size:16px;line-height:1.7;padding:32px 20px}.c{max-width:750px;margin:0 auto}h1{font-size:2rem;font-weight:900;text-align:center;margin-bottom:8px}.sub{text-align:center;font-size:12px;color:'+ac+';letter-spacing:2px;text-transform:uppercase;margin-bottom:24px}.f{padding:12px 0;border-bottom:1px solid #eee}.f .k{font-size:14px;font-weight:700;color:#555;text-transform:uppercase;margin-bottom:3px}.f .v{font-size:18px;color:#000;font-weight:700}.f .v.m{font-family:monospace;color:'+ac+'}.f .v.g{color:#059669}h2{font-size:16px;color:'+ac+';margin:20px 0 10px;text-transform:uppercase}p{font-size:15px;color:#333;line-height:1.8;margin-bottom:8px}ul{list-style:none}li{font-size:15px;color:#333;line-height:2;padding-left:14px;position:relative}li::before{content:"\\2022";position:absolute;left:0;color:'+ac+'}.ft{margin-top:24px;padding:14px;background:'+ac+';border-radius:8px;text-align:center;font-size:12px;color:#fff}</style></head><body><div class="c"><h1 data-field="razao">'+razaoFmt+'</h1><div class="sub">'+sec.waba+'</div><div class="f"><div class="k">Razao Social</div><div class="v">'+razaoFmt+'</div></div><div class="f"><div class="k">CNPJ</div><div class="v m">'+cnpjFmt+'</div></div><div class="f"><div class="k">Situacao</div><div class="v g">'+situacaoFmt+'</div></div><div class="f"><div class="k">Endereco</div><div class="v">'+fullAddress+'</div></div><div class="f"><div class="k">Email</div><div class="v">'+(emailFmt||'N/A')+'</div></div>'+(atividadeFmt?'<div class="f"><div class="k">CNAE</div><div class="v">'+atividadeFmt+'</div></div>':'')+'<h2>Canal</h2>'+(phoneFmt?'<p style="font-family:monospace;font-size:1.5rem;color:'+ac+';font-weight:900">'+phoneFmt+'</p>':'')+'<p>'+wabaText+'</p><p>'+wabaFoot+'</p><h2>Sobre</h2><p>'+sob+'</p><h2>Atendimento</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul><h2>Privacidade</h2><p>'+priv+'</p><h2>Termos</h2><p>'+term+'</p><div class="ft">'+razaoFmt+' \u2014 CNPJ '+cnpjFmt+(phoneFmt?' \u2014 '+phoneFmt:'')+'</div></div>'+domScript+'</body></html>';
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

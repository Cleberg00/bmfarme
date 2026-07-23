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

  var layoutType = templateIndex % 30;

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

  // ═══════════════════════════════════════════════════════════════
  // 18 LAYOUTS ÚNICOS — cada um com estrutura, ordem e estilo diferentes
  // ═══════════════════════════════════════════════════════════════

  // ── LAYOUT 0: PORTAL CORPORATIVO — sidebar dark esquerda, conteudo principal em blocos ──
  if (layoutType === 0) {
    var css0 = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#f4f6f8;color:#1a1a2e;min-height:100vh;font-size:15px;line-height:1.6;display:grid;grid-template-columns:260px 1fr}@media(max-width:860px){body{grid-template-columns:1fr}}.sb{background:#1a1a2e;padding:28px 18px;display:flex;flex-direction:column;gap:14px;border-right:4px solid '+pal.ac+'}@media(max-width:860px){.sb{border-right:none;border-bottom:4px solid '+pal.ac+';padding:20px 16px}}.sb .brand{font-size:1.1rem;font-weight:900;color:#fff;line-height:1.2}.sb .tag{font-size:9px;letter-spacing:2px;color:'+pal.ac+';font-weight:700;text-transform:uppercase;margin-top:-8px}.sb .ph-box{font-family:"Courier New",monospace;font-size:1.1rem;color:'+pal.ac+';font-weight:900;padding:12px;background:rgba(255,255,255,.03);border:1px solid '+pal.ac+'30;border-radius:5px;text-align:center;letter-spacing:1.5px}.sb .mini{font-size:10px;color:#6b7280;text-align:center;text-transform:uppercase;letter-spacing:1px;margin-top:-8px}.sb .info{font-size:11px;color:#9ca3af;line-height:1.6;margin-top:auto;padding-top:12px;border-top:1px solid #2d2d4a}.main{padding:32px 28px;overflow-y:auto}@media(max-width:860px){.main{padding:20px 16px}}.main h1{font-size:1.7rem;font-weight:900;color:#1a1a2e;margin-bottom:2px}.main .sub{font-size:10px;color:'+pal.ac+';letter-spacing:2.5px;text-transform:uppercase;margin-bottom:22px;font-weight:700}.blk{background:#fff;border:1px solid #e2e6ea;border-radius:10px;padding:20px;margin-bottom:16px;box-shadow:0 1px 4px rgba(0,0,0,.03)}.blk h2{font-size:14px;font-weight:800;color:'+pal.ac+';text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid '+pal.ac+'12}.rw{padding:9px 0;border-bottom:1px solid #f2f4f6;display:flex;flex-direction:column;gap:2px}.rw:last-child{border-bottom:none}.rk{font-size:12px;font-weight:700;text-transform:uppercase;color:#7c8a97;letter-spacing:.6px}.rv{font-size:16px;color:#1a1a2e;font-weight:700}.rv.mono{font-family:"Courier New",monospace;color:'+pal.ac+'}.rv.grn{color:#10b981}.blk p{font-size:14px;color:#4a5568;line-height:1.8;margin-bottom:5px}.blk ul{list-style:none}.blk li{font-size:14px;color:#4a5568;line-height:2;padding-left:16px;position:relative}.blk li::before{content:"\\25B8";position:absolute;left:0;color:'+pal.ac+';font-size:10px;top:4px}';
    return headHtml+'<style>'+css0+'</style></head><body><aside class="sb"><div class="brand" data-field="razao">'+razaoFmt+'</div><div class="tag">Portal Institucional</div>'+(phoneFmt?'<div class="ph-box" data-field="phone">'+phoneFmt+'</div><div class="mini">Linha Direta</div>':'')+'<div class="info">CNPJ: <span data-field="cnpj">'+cnpjFmt+'</span><br>'+munFmt+'/'+ufFmt+'<br>Status: '+situacaoFmt+'</div></aside><main class="main"><h1 data-field="razao">'+razaoFmt+'</h1><div class="sub">Registro P&uacute;blico Empresarial</div><div class="blk"><h2>Ficha T&eacute;cnica</h2><div class="rw"><div class="rk">Denomina&ccedil;&atilde;o</div><div class="rv" data-field="razao">'+razaoFmt+'</div></div><div class="rw"><div class="rk">Inscri&ccedil;&atilde;o Federal</div><div class="rv mono" data-field="cnpj">'+cnpjFmt+'</div></div><div class="rw"><div class="rk">Status</div><div class="rv grn">'+situacaoFmt+'</div></div><div class="rw"><div class="rk">Sede</div><div class="rv">'+enderFmt+'</div></div><div class="rw"><div class="rk">Distrito</div><div class="rv">'+bairroFmt+'</div></div><div class="rw"><div class="rk">Localidade</div><div class="rv">'+munFmt+'/'+ufFmt+'</div></div><div class="rw"><div class="rk">C&oacute;digo Postal</div><div class="rv">'+cepFmt+'</div></div><div class="rw"><div class="rk">Correio</div><div class="rv">'+(emailFmt||'N/D')+'</div></div>'+(atividadeFmt?'<div class="rw"><div class="rk">Atividade Econ&ocirc;mica</div><div class="rv">'+atividadeFmt+'</div></div>':'')+'</div><div class="blk"><h2>Atendimento via WhatsApp</h2>'+(phoneFmt?'<p style="font-family:monospace;font-size:1.3rem;color:'+pal.ac+';font-weight:900;text-align:center;margin:10px 0;padding:10px;background:'+pal.ac+'06;border-radius:5px" data-field="phone">'+phoneFmt+'</p>':'')+'<p>'+wabaText+'</p><p style="margin-top:8px;font-size:12px;color:#6b7280">'+wabaFoot+'</p></div><div class="blk"><h2>Quem Somos</h2><p>'+sob+'</p></div><div class="blk"><h2>Diretrizes de Atendimento</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="blk"><h2>Pol&iacute;tica de Privacidade</h2><p>'+priv+'</p></div><div class="blk"><h2>Condi&ccedil;&otilde;es de Uso</h2><p>'+term+'</p></div></main>'+domScript+'</body></html>';
  }


  // ── LAYOUT 1: BANNER INSTITUCIONAL — hero gradient + grid 3 colunas ──
  else if (layoutType === 1) {
    var css1 = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#fefefe;color:#222;min-height:100vh;font-size:15px;line-height:1.65}.bn{background:linear-gradient(160deg,#0f172a 0%,'+pal.ac+' 100%);padding:56px 28px 40px;text-align:center}.bn h1{font-size:2.2rem;font-weight:900;color:#fff;margin-bottom:6px;letter-spacing:-.3px}.bn .desc{font-size:14px;color:rgba(255,255,255,.82);max-width:540px;margin:0 auto}.bn .ph{font-family:"Courier New",monospace;font-size:1.4rem;color:#fff;font-weight:900;margin-top:16px;padding:8px 22px;background:rgba(0,0,0,.2);border-radius:20px;display:inline-block;letter-spacing:1.5px}.bn .lbl{font-size:9px;color:rgba(255,255,255,.6);text-transform:uppercase;letter-spacing:2px;margin-top:6px}.gr{max-width:1060px;margin:32px auto;padding:0 20px;display:grid;grid-template-columns:repeat(3,1fr);gap:18px}@media(max-width:900px){.gr{grid-template-columns:1fr}}.cd{background:#fff;border:1px solid #eaecf0;border-radius:12px;padding:22px;box-shadow:0 2px 6px rgba(0,0,0,.03)}.cd h3{font-size:12px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:1.2px;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid '+pal.ac+'10}.cd .rw{padding:7px 0;border-bottom:1px solid #f5f6f8}.cd .rw:last-child{border-bottom:none}.cd .rk{font-size:10px;font-weight:700;color:#8896a4;text-transform:uppercase;letter-spacing:.5px}.cd .rv{font-size:14px;font-weight:700;color:#1a2332;margin-top:1px}.cd .mono{font-family:"Courier New",monospace;color:'+pal.ac+'}.cd .grn{color:#10b981}.cd p{font-size:13px;color:#4b5e71;line-height:1.8;margin-bottom:4px}.cd ul{list-style:none}.cd li{font-size:13px;color:#4b5e71;line-height:2;padding-left:14px;position:relative}.cd li::before{content:"\\2714";position:absolute;left:0;color:'+pal.ac+';font-size:10px}.ft{text-align:center;padding:20px;font-size:11px;color:#8896a4;margin-top:8px}';
    return headHtml+'<style>'+css1+'</style></head><body><div class="bn"><h1 data-field="razao">'+razaoFmt+'</h1><div class="desc">Empresa regularmente constitu&iacute;da com canal de atendimento receptivo via WhatsApp Business</div>'+(phoneFmt?'<div class="ph" data-field="phone">'+phoneFmt+'</div><div class="lbl">Atendimento Receptivo</div>':'')+'</div><div class="gr"><div class="cd"><h3>Registro Federal</h3><div class="rw"><div class="rk">Raz&atilde;o Social</div><div class="rv" data-field="razao">'+razaoFmt+'</div></div><div class="rw"><div class="rk">CNPJ</div><div class="rv mono" data-field="cnpj">'+cnpjFmt+'</div></div><div class="rw"><div class="rk">Condi&ccedil;&atilde;o</div><div class="rv grn">'+situacaoFmt+'</div></div><div class="rw"><div class="rk">Classifica&ccedil;&atilde;o</div><div class="rv">'+porteFmt+'</div></div></div><div class="cd"><h3>Endere&ccedil;o</h3><div class="rw"><div class="rk">Logradouro</div><div class="rv">'+enderFmt+'</div></div><div class="rw"><div class="rk">Bairro</div><div class="rv">'+bairroFmt+'</div></div><div class="rw"><div class="rk">Cidade/UF</div><div class="rv">'+munFmt+'/'+ufFmt+'</div></div><div class="rw"><div class="rk">CEP</div><div class="rv">'+cepFmt+'</div></div><div class="rw"><div class="rk">Contato</div><div class="rv">'+(emailFmt||'N/A')+'</div></div>'+(atividadeFmt?'<div class="rw"><div class="rk">Setor</div><div class="rv">'+atividadeFmt+'</div></div>':'')+'</div><div class="cd"><h3>Canal WhatsApp</h3>'+(phoneFmt?'<p style="font-family:monospace;font-size:1.2rem;color:'+pal.ac+';font-weight:900;text-align:center;padding:10px;border:1px dashed '+pal.ac+'40;border-radius:6px;margin-bottom:10px" data-field="phone">'+phoneFmt+'</p>':'')+'<p>'+wabaText+'</p><p style="font-size:11px;color:#6b7280;margin-top:6px">'+wabaFoot+'</p></div><div class="cd"><h3>Apresenta&ccedil;&atilde;o</h3><p>'+sob+'</p></div><div class="cd"><h3>Pol&iacute;tica de Compliance</h3><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="cd"><h3>LGPD &amp; Termos</h3><p>'+priv+'</p><p style="margin-top:10px;padding-top:10px;border-top:1px solid #eaecf0">'+term+'</p></div></div><div class="ft">'+razaoFmt+' &mdash; CNPJ '+cnpjFmt+'</div>'+domScript+'</body></html>';
  }

  // ── LAYOUT 2: DOCUMENTO OFICIAL — estilo certidao/ficha, tabela centralizada, tipografia serif ──
  else if (layoutType === 2) {
    var css2 = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:Georgia,"Times New Roman",serif;background:#fffdf8;color:#2c2416;min-height:100vh;font-size:15px;line-height:1.7}.doc{max-width:780px;margin:0 auto;padding:48px 36px;border:1px solid #e8e0d0;border-top:6px solid '+pal.ac+';background:#fff;min-height:100vh}@media(max-width:640px){.doc{padding:28px 16px;border:none}}.hdr{text-align:center;margin-bottom:32px;padding-bottom:22px;border-bottom:2px double #d4c9b4}.hdr h1{font-size:1.9rem;font-weight:700;color:#1a1206;margin-bottom:4px}.hdr .sub{font-size:11px;color:#8c7a5c;letter-spacing:3px;text-transform:uppercase}.hdr .cnpj{font-family:"Courier New",monospace;font-size:14px;color:'+pal.ac+';margin-top:6px}.phb{text-align:center;margin-bottom:28px;padding:14px;border:1px solid #e8e0d0;background:#faf7f0;border-radius:4px}.phb .num{font-family:"Courier New",monospace;font-size:1.4rem;color:'+pal.ac+';font-weight:700;letter-spacing:1.5px}.phb .lb{font-size:9px;color:#8c7a5c;text-transform:uppercase;letter-spacing:2px;margin-top:3px}.tbl{width:100%;border-collapse:collapse;margin-bottom:28px}.tbl caption{font-size:12px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:1.5px;text-align:left;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #e8e0d0}.tbl td{padding:10px 8px;vertical-align:top;border-bottom:1px solid #f0ebe0;font-size:14px}.tbl td:first-child{font-weight:700;color:#6b5c42;width:160px;font-size:12px;text-transform:uppercase;letter-spacing:.4px}.tbl td:last-child{color:#1a1206;font-weight:600}.tbl .mono{font-family:"Courier New",monospace;color:'+pal.ac+'}.tbl .grn{color:#2d8659}.sec{margin-bottom:26px}.sec h2{font-size:13px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:1.5px;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid #e8e0d0}.sec p{font-size:14px;color:#3d3225;line-height:1.85}.sec ul{list-style:none;margin:6px 0}.sec li{font-size:14px;color:#3d3225;line-height:2.1;padding-left:18px;position:relative}.sec li::before{content:"\\00A7";position:absolute;left:0;color:'+pal.ac+';font-weight:700}.ftr{text-align:center;padding:20px 0;margin-top:28px;border-top:2px double #d4c9b4;font-size:11px;color:#8c7a5c}';
    return headHtml+'<style>'+css2+'</style></head><body><div class="doc"><div class="hdr"><h1 data-field="razao">'+razaoFmt+'</h1><div class="sub">Ficha de Registro Empresarial</div><div class="cnpj" data-field="cnpj">'+cnpjFmt+'</div></div>'+(phoneFmt?'<div class="phb"><div class="num" data-field="phone">'+phoneFmt+'</div><div class="lb">Canal de Atendimento Oficial</div></div>':'')+'<table class="tbl"><caption>Dados de Identifica&ccedil;&atilde;o</caption><tr><td>Raz&atilde;o Social</td><td data-field="razao">'+razaoFmt+'</td></tr><tr><td>CNPJ</td><td class="mono" data-field="cnpj">'+cnpjFmt+'</td></tr><tr><td>Situa&ccedil;&atilde;o</td><td class="grn">'+situacaoFmt+'</td></tr><tr><td>Porte</td><td>'+porteFmt+'</td></tr><tr><td>Nat. Jur&iacute;dica</td><td>'+natJurFmt+'</td></tr><tr><td>Logradouro</td><td>'+enderFmt+'</td></tr><tr><td>Bairro</td><td>'+bairroFmt+'</td></tr><tr><td>Munic&iacute;pio/UF</td><td>'+munFmt+'/'+ufFmt+'</td></tr><tr><td>CEP</td><td>'+cepFmt+'</td></tr><tr><td>Email</td><td>'+(emailFmt||'N/D')+'</td></tr>'+(atividadeFmt?'<tr><td>CNAE</td><td>'+atividadeFmt+'</td></tr>':'')+'</table><div class="sec"><h2>Canal de Comunica&ccedil;&atilde;o</h2>'+(phoneFmt?'<p style="font-family:monospace;font-size:1.2rem;color:'+pal.ac+';font-weight:700;margin-bottom:8px" data-field="phone">'+phoneFmt+'</p>':'')+'<p>'+wabaText+'</p><p style="font-size:12px;color:#6b5c42;margin-top:6px">'+wabaFoot+'</p></div><div class="sec"><h2>Hist&oacute;rico Institucional</h2><p>'+sob+'</p></div><div class="sec"><h2>Normas de Atendimento</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="sec"><h2>Prote&ccedil;&atilde;o de Dados</h2><p>'+priv+'</p></div><div class="sec"><h2>Termos e Condi&ccedil;&otilde;es</h2><p>'+term+'</p></div><div class="ftr">'+razaoFmt+' &mdash; CNPJ '+cnpjFmt+' &mdash; Documento P&uacute;blico</div></div>'+domScript+'</body></html>';
  }

  // ── LAYOUT 3: DASHBOARD MODERNO — topbar + grid de stat cards + conteudo ──
  else if (layoutType === 3) {
    var css3 = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#f0f4f8;color:#1e293b;min-height:100vh;font-size:15px;line-height:1.6}.nav{background:#fff;padding:14px 24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;border-bottom:1px solid #e2e8f0;box-shadow:0 1px 2px rgba(0,0,0,.04)}.nav .nm{font-size:1rem;font-weight:800;color:#0f172a}.nav .badge{font-size:9px;font-weight:700;letter-spacing:1.2px;color:#fff;background:'+pal.ac+';padding:3px 9px;border-radius:3px;text-transform:uppercase}.nav .rt{font-family:"Courier New",monospace;font-size:12px;color:#64748b}.stats{max-width:1020px;margin:22px auto;padding:0 18px;display:grid;grid-template-columns:repeat(4,1fr);gap:14px}@media(max-width:800px){.stats{grid-template-columns:repeat(2,1fr)}}@media(max-width:500px){.stats{grid-template-columns:1fr}}.st{background:#fff;border-radius:10px;padding:16px 18px;border:1px solid #e2e8f0;text-align:center}.st .sv{font-size:1.1rem;font-weight:900;color:'+pal.ac+'}.st .sl{font-size:9px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-top:2px}.body{max-width:1020px;margin:0 auto;padding:0 18px 28px;display:grid;grid-template-columns:2fr 1fr;gap:18px}@media(max-width:800px){.body{grid-template-columns:1fr}}.pnl{background:#fff;border-radius:10px;padding:22px;border:1px solid #e2e8f0}.pnl h2{font-size:13px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #f1f5f9}.pnl .rw{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f8fafc;flex-wrap:wrap;gap:3px}.pnl .rw:last-child{border-bottom:none}.pnl .rk{font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase}.pnl .rv{font-size:14px;font-weight:600;color:#1e293b}.pnl .mono{font-family:"Courier New",monospace;color:'+pal.ac+'}.pnl .grn{color:#059669}.pnl p{font-size:13px;color:#475569;line-height:1.8}.pnl ul{list-style:none}.pnl li{font-size:13px;color:#475569;line-height:2;padding-left:12px;position:relative}.pnl li::before{content:"\\2713";position:absolute;left:0;color:'+pal.ac+';font-size:10px}.side .pnl{margin-bottom:14px}.phc{background:'+pal.ac+';border-radius:10px;padding:20px;text-align:center;color:#fff}.phc .pv{font-family:"Courier New",monospace;font-size:1.3rem;font-weight:900;letter-spacing:1.5px}.phc .pl{font-size:9px;text-transform:uppercase;letter-spacing:1.5px;opacity:.8;margin-top:4px}.ft{text-align:center;padding:16px;font-size:11px;color:#94a3b8}';
    return headHtml+'<style>'+css3+'</style></head><body><div class="nav"><div style="display:flex;align-items:center;gap:10px"><span class="nm" data-field="razao">'+displayName+'</span><span class="badge">Ativa</span></div><div class="rt" data-field="cnpj">'+cnpjFmt+'</div></div><div class="stats"><div class="st"><div class="sv" data-field="cnpj">'+cnpjFmt+'</div><div class="sl">CNPJ</div></div><div class="st"><div class="sv grn" style="color:#059669">'+situacaoFmt+'</div><div class="sl">Status</div></div><div class="st"><div class="sv">'+munFmt+'/'+ufFmt+'</div><div class="sl">Localiza&ccedil;&atilde;o</div></div>'+(phoneFmt?'<div class="st"><div class="sv" style="color:'+pal.ac+'" data-field="phone">'+phoneFmt+'</div><div class="sl">WhatsApp</div></div>':'<div class="st"><div class="sv">'+porteFmt+'</div><div class="sl">Porte</div></div>')+'</div><div class="body"><div class="main-col"><div class="pnl"><h2>Cadastro Completo</h2><div class="rw"><span class="rk">Raz&atilde;o Social</span><span class="rv" data-field="razao">'+razaoFmt+'</span></div><div class="rw"><span class="rk">CNPJ</span><span class="rv mono" data-field="cnpj">'+cnpjFmt+'</span></div><div class="rw"><span class="rk">Natureza</span><span class="rv">'+natJurFmt+'</span></div><div class="rw"><span class="rk">Endere&ccedil;o</span><span class="rv">'+enderFmt+'</span></div><div class="rw"><span class="rk">Bairro</span><span class="rv">'+bairroFmt+'</span></div><div class="rw"><span class="rk">CEP</span><span class="rv">'+cepFmt+'</span></div><div class="rw"><span class="rk">Email</span><span class="rv">'+(emailFmt||'N/A')+'</span></div>'+(atividadeFmt?'<div class="rw"><span class="rk">CNAE</span><span class="rv">'+atividadeFmt+'</span></div>':'')+'</div><div class="pnl" style="margin-top:14px"><h2>Sobre &amp; Compliance</h2><p>'+sob+'</p><ul style="margin-top:12px">'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="pnl" style="margin-top:14px"><h2>LGPD &amp; Termos</h2><p>'+priv+'</p><p style="margin-top:10px;padding-top:10px;border-top:1px solid #f1f5f9">'+term+'</p></div></div><div class="side">'+(phoneFmt?'<div class="phc"><div class="pv" data-field="phone">'+phoneFmt+'</div><div class="pl">Canal Oficial</div></div>':'')+'<div class="pnl"><h2>Comunica&ccedil;&atilde;o WABA</h2><p>'+wabaText+'</p><p style="font-size:11px;color:#64748b;margin-top:8px">'+wabaFoot+'</p></div></div></div><div class="ft">'+razaoFmt+' &mdash; '+cnpjFmt+'</div>'+domScript+'</body></html>';
  }

  // ── LAYOUT 4: SPLIT HORIZONTAL — metade esquerda dados, metade direita compliance, header fino ──
  else if (layoutType === 4) {
    var css4 = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#fff;color:#1f2937;min-height:100vh;font-size:15px;line-height:1.65}.tp{background:#fff;border-bottom:3px solid '+pal.ac+';padding:16px 28px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px}.tp h1{font-size:1.2rem;font-weight:800;color:#111}.tp .inf{font-size:11px;color:#6b7280}.tp .ph{font-family:"Courier New",monospace;font-size:13px;color:'+pal.ac+';font-weight:700}.sp{display:grid;grid-template-columns:1fr 1fr;min-height:calc(100vh - 60px)}@media(max-width:860px){.sp{grid-template-columns:1fr}}.lft{padding:28px 24px;border-right:1px solid #f0f0f0}@media(max-width:860px){.lft{border-right:none;border-bottom:1px solid #f0f0f0}}.lft h2{font-size:14px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:.8px;margin-bottom:14px}.tbl{width:100%;border-collapse:collapse}.tbl tr{border-bottom:1px solid #f5f5f5}.tbl tr:last-child{border-bottom:none}.tbl td{padding:10px 6px;font-size:14px;vertical-align:top}.tbl td:first-child{font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.3px;width:130px;font-size:11px}.tbl td:last-child{color:#111;font-weight:600}.tbl .mono{font-family:"Courier New",monospace;color:'+pal.ac+'}.tbl .grn{color:#059669}.phbox{margin-top:18px;padding:14px;background:'+pal.ac+'06;border:2px solid '+pal.ac+'20;border-radius:8px;text-align:center}.phbox .pv{font-family:"Courier New",monospace;font-size:1.4rem;color:'+pal.ac+';font-weight:900;letter-spacing:1.5px}.phbox .pl{font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:1.5px;margin-top:3px}.rgt{padding:28px 24px;background:#f9fafb}@media(max-width:860px){.rgt{padding:24px 20px}}.rgt .blk{margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #e5e7eb}.rgt .blk:last-child{border-bottom:none}.rgt h2{font-size:14px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px}.rgt p{font-size:14px;color:#374151;line-height:1.8;margin-bottom:5px}.rgt ul{list-style:none;margin:4px 0}.rgt li{font-size:14px;color:#374151;line-height:2;padding-left:14px;position:relative}.rgt li::before{content:"\\2022";position:absolute;left:0;color:'+pal.ac+'}.bot{background:'+pal.ac+';padding:10px 28px;text-align:center;font-size:11px;color:#fff;font-weight:600;letter-spacing:.3px}';
    return headHtml+'<style>'+css4+'</style></head><body><div class="tp"><h1 data-field="razao">'+razaoFmt+'</h1><div><span class="inf" data-field="cnpj">CNPJ '+cnpjFmt+'</span>'+(phoneFmt?' | <span class="ph" data-field="phone">'+phoneFmt+'</span>':'')+'</div></div><div class="sp"><div class="lft"><h2>Identifica&ccedil;&atilde;o Empresarial</h2><table class="tbl"><tr><td>Denomina&ccedil;&atilde;o</td><td data-field="razao">'+razaoFmt+'</td></tr><tr><td>CNPJ</td><td class="mono" data-field="cnpj">'+cnpjFmt+'</td></tr><tr><td>Status</td><td class="grn">'+situacaoFmt+'</td></tr><tr><td>Classifica&ccedil;&atilde;o</td><td>'+porteFmt+'</td></tr><tr><td>Forma Jur&iacute;dica</td><td>'+natJurFmt+'</td></tr><tr><td>Sede</td><td>'+enderFmt+'</td></tr><tr><td>Bairro</td><td>'+bairroFmt+'</td></tr><tr><td>Pra&ccedil;a/UF</td><td>'+munFmt+'/'+ufFmt+'</td></tr><tr><td>CEP</td><td>'+cepFmt+'</td></tr><tr><td>Correio</td><td>'+(emailFmt||'N/D')+'</td></tr>'+(atividadeFmt?'<tr><td>Atividade</td><td>'+atividadeFmt+'</td></tr>':'')+'</table>'+(phoneFmt?'<div class="phbox"><div class="pv" data-field="phone">'+phoneFmt+'</div><div class="pl">Central de Atendimento</div></div>':'')+'</div><div class="rgt"><div class="blk"><h2>Gateway WABA</h2>'+(phoneFmt?'<p style="font-family:monospace;font-size:1.1rem;color:'+pal.ac+';font-weight:700;margin-bottom:8px" data-field="phone">'+phoneFmt+'</p>':'')+'<p>'+wabaText+'</p><p style="font-size:12px;color:#6b7280;margin-top:6px">'+wabaFoot+'</p></div><div class="blk"><h2>A Empresa</h2><p>'+sob+'</p></div><div class="blk"><h2>Regras Operacionais</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="blk"><h2>Privacidade</h2><p>'+priv+'</p></div><div class="blk"><h2>Termos</h2><p>'+term+'</p></div></div></div><div class="bot">'+razaoFmt+' &mdash; CNPJ '+cnpjFmt+'</div>'+domScript+'</body></html>';
  }

  // ── LAYOUT 5: TIMELINE VERTICAL — linha conectora lateral, pontos por secao ──
  else if (layoutType === 5) {
    var css5 = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#f1f5f9;color:#1e293b;min-height:100vh;font-size:15px;line-height:1.65}.hero{background:'+pal.ac+';padding:36px 24px;text-align:center;color:#fff}.hero h1{font-size:2rem;font-weight:900;letter-spacing:-.3px}.hero .sub{font-size:12px;opacity:.85;margin-top:4px;font-family:"Courier New",monospace}.wrap{max-width:720px;margin:0 auto;padding:32px 20px;position:relative}.wrap::before{content:"";position:absolute;left:24px;top:0;bottom:0;width:3px;background:'+pal.ac+'25;border-radius:2px}@media(max-width:640px){.wrap::before{left:14px}}.item{position:relative;padding-left:52px;margin-bottom:26px}@media(max-width:640px){.item{padding-left:38px}}.item::before{content:"";position:absolute;left:16px;top:6px;width:20px;height:20px;border-radius:50%;background:'+pal.ac+';border:4px solid #f1f5f9;box-shadow:0 0 0 2px '+pal.ac+'30}@media(max-width:640px){.item::before{left:6px;width:18px;height:18px}}.item h2{font-size:13px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:8px}.card{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.03)}.card .rw{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f8fafc;flex-wrap:wrap;gap:3px}.card .rw:last-child{border-bottom:none}.card .rk{font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase}.card .rv{font-size:14px;font-weight:700;color:#0f172a}.card .mono{font-family:"Courier New",monospace;color:'+pal.ac+'}.card .grn{color:#059669}.card p{font-size:13px;color:#475569;line-height:1.8;margin-bottom:4px}.card ul{list-style:none}.card li{font-size:13px;color:#475569;line-height:2;padding-left:12px;position:relative}.card li::before{content:"\\203A";position:absolute;left:0;color:'+pal.ac+';font-weight:700}.phbar{text-align:center;font-family:"Courier New",monospace;font-size:1.3rem;color:'+pal.ac+';font-weight:900;padding:12px;background:'+pal.ac+'08;border-radius:6px;margin:6px 0}.ft{text-align:center;padding:18px;font-size:11px;color:#64748b}';
    return headHtml+'<style>'+css5+'</style></head><body><div class="hero"><h1 data-field="razao">'+razaoFmt+'</h1><div class="sub" data-field="cnpj">'+cnpjFmt+'</div></div><div class="wrap">'+(phoneFmt?'<div class="phbar" data-field="phone">'+phoneFmt+'</div>':'')+'<div class="item"><h2>Identifica&ccedil;&atilde;o</h2><div class="card"><div class="rw"><span class="rk">Empresa</span><span class="rv" data-field="razao">'+razaoFmt+'</span></div><div class="rw"><span class="rk">CNPJ</span><span class="rv mono" data-field="cnpj">'+cnpjFmt+'</span></div><div class="rw"><span class="rk">Condi&ccedil;&atilde;o</span><span class="rv grn">'+situacaoFmt+'</span></div><div class="rw"><span class="rk">Sede</span><span class="rv">'+enderFmt+'</span></div><div class="rw"><span class="rk">Bairro</span><span class="rv">'+bairroFmt+'</span></div><div class="rw"><span class="rk">Cidade/UF</span><span class="rv">'+munFmt+'/'+ufFmt+'</span></div><div class="rw"><span class="rk">CEP</span><span class="rv">'+cepFmt+'</span></div>'+(atividadeFmt?'<div class="rw"><span class="rk">CNAE</span><span class="rv">'+atividadeFmt+'</span></div>':'')+'</div></div><div class="item"><h2>Comunica&ccedil;&atilde;o</h2><div class="card">'+(phoneFmt?'<div class="phbar" data-field="phone">'+phoneFmt+'</div>':'')+'<p>'+wabaText+'</p><p style="font-size:11px;color:#64748b;margin-top:6px">'+wabaFoot+'</p></div></div><div class="item"><h2>Institucional</h2><div class="card"><p>'+sob+'</p></div></div><div class="item"><h2>Diretrizes</h2><div class="card"><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div></div><div class="item"><h2>Privacidade &amp; Termos</h2><div class="card"><p>'+priv+'</p><p style="margin-top:10px;padding-top:10px;border-top:1px solid #f1f5f9">'+term+'</p></div></div></div><div class="ft">'+razaoFmt+' &mdash; '+cnpjFmt+'</div>'+domScript+'</body></html>';
  }

  // ── LAYOUT 6: PAINEL LATERAL COLORIDA — coluna esquerda accent, conteudo branco direita ──
  else if (layoutType === 6) {
    var css6 = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#f8f9fa;color:#212529;min-height:100vh;font-size:15px;line-height:1.6;display:grid;grid-template-columns:240px 1fr}@media(max-width:768px){body{grid-template-columns:1fr}}.pan{background:'+pal.ac+';padding:32px 18px;display:flex;flex-direction:column;gap:16px;color:#fff}@media(max-width:768px){.pan{padding:22px 16px}}.pan h1{font-size:1.15rem;font-weight:900;line-height:1.25}.pan .id{font-family:"Courier New",monospace;font-size:12px;opacity:.8}.pan .phb{font-family:"Courier New",monospace;font-size:1.1rem;font-weight:900;background:rgba(255,255,255,.12);padding:10px;border-radius:5px;text-align:center}.pan .links{list-style:none;margin-top:10px;border-top:1px solid rgba(255,255,255,.2);padding-top:10px}.pan .links li{font-size:11px;padding:5px 0;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid rgba(255,255,255,.1)}.cnt{padding:32px 26px;overflow-y:auto}@media(max-width:768px){.cnt{padding:22px 16px}}.sec{margin-bottom:24px}.sec h2{font-size:12px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:1.2px;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #dee2e6}.rw{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f1f3f5;flex-wrap:wrap;gap:3px}.rw:last-child{border-bottom:none}.rk{font-size:10px;font-weight:700;color:#868e96;text-transform:uppercase}.rv{font-size:14px;font-weight:600;color:#212529}.mono{font-family:"Courier New",monospace;color:'+pal.ac+'}.grn{color:#099268}.sec p{font-size:13px;color:#495057;line-height:1.8}.sec ul{list-style:none}.sec li{font-size:13px;color:#495057;line-height:2;padding-left:14px;position:relative}.sec li::before{content:"\\25AA";position:absolute;left:0;color:'+pal.ac+';font-size:8px;top:6px}.phv{font-family:"Courier New",monospace;font-size:1.2rem;color:'+pal.ac+';font-weight:900}.ft{text-align:center;padding:14px;font-size:10px;color:#adb5bd;border-top:1px solid #dee2e6;margin-top:16px}';
    return headHtml+'<style>'+css6+'</style></head><body><aside class="pan"><h1 data-field="razao">'+razaoFmt+'</h1><div class="id" data-field="cnpj">'+cnpjFmt+'</div>'+(phoneFmt?'<div class="phb" data-field="phone">'+phoneFmt+'</div>':'')+'<ul class="links"><li>Cadastro</li><li>Atendimento</li><li>Compliance</li><li>LGPD</li></ul></aside><main class="cnt"><div class="sec"><h2>Registro Empresarial</h2><div class="rw"><span class="rk">Raz&atilde;o Social</span><span class="rv" data-field="razao">'+razaoFmt+'</span></div><div class="rw"><span class="rk">CNPJ</span><span class="rv mono" data-field="cnpj">'+cnpjFmt+'</span></div><div class="rw"><span class="rk">Condi&ccedil;&atilde;o</span><span class="rv grn">'+situacaoFmt+'</span></div><div class="rw"><span class="rk">Sede</span><span class="rv">'+enderFmt+'</span></div><div class="rw"><span class="rk">Bairro</span><span class="rv">'+bairroFmt+'</span></div><div class="rw"><span class="rk">Cidade/UF</span><span class="rv">'+munFmt+'/'+ufFmt+'</span></div><div class="rw"><span class="rk">CEP</span><span class="rv">'+cepFmt+'</span></div><div class="rw"><span class="rk">Email</span><span class="rv">'+(emailFmt||'N/A')+'</span></div>'+(atividadeFmt?'<div class="rw"><span class="rk">Atividade</span><span class="rv">'+atividadeFmt+'</span></div>':'')+'</div><div class="sec"><h2>Canal WABA</h2>'+(phoneFmt?'<p class="phv" data-field="phone">'+phoneFmt+'</p>':'')+'<p>'+wabaText+'</p><p style="font-size:11px;color:#868e96;margin-top:6px">'+wabaFoot+'</p></div><div class="sec"><h2>Apresenta&ccedil;&atilde;o</h2><p>'+sob+'</p></div><div class="sec"><h2>Regras</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="sec"><h2>Privacidade</h2><p>'+priv+'</p></div><div class="sec"><h2>Termos</h2><p>'+term+'</p></div><div class="ft">'+razaoFmt+' &mdash; '+cnpjFmt+'</div></main>'+domScript+'</body></html>';
  }

  // ── LAYOUT 7: DARK TERMINAL — fundo #0c1222, neon accent, estilo hacker/dev ──
  else if (layoutType === 7) {
    var css7 = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:"Courier New",monospace;background:#0c1222;color:#a0b4c8;min-height:100vh;font-size:14px;line-height:1.7}.hdr{background:#0a0f1c;padding:20px 24px;border-bottom:1px solid #1e2d42;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px}.hdr .nm{font-size:1rem;font-weight:700;color:#e2e8f0}.hdr .tag{font-size:9px;color:'+pal.ac+';letter-spacing:2px;text-transform:uppercase;background:'+pal.ac+'12;padding:3px 8px;border-radius:3px;border:1px solid '+pal.ac+'30}.wrap{max-width:820px;margin:0 auto;padding:28px 20px}.phb{text-align:center;font-size:1.4rem;color:'+pal.ac+';font-weight:900;padding:16px;background:#0a0f1c;border:1px solid '+pal.ac+'30;border-radius:6px;margin-bottom:22px;letter-spacing:2px;text-shadow:0 0 8px '+pal.ac+'40}.blk{background:#0a0f1c;border:1px solid #1e2d42;border-radius:6px;padding:18px;margin-bottom:16px}.blk h2{font-size:11px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:2px;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid #1e2d42}.blk .rw{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #111c2e;flex-wrap:wrap;gap:3px}.blk .rw:last-child{border-bottom:none}.blk .rk{font-size:10px;color:#5a7a96;text-transform:uppercase;letter-spacing:1px}.blk .rv{font-size:13px;color:#e2e8f0;font-weight:600}.blk .ac{color:'+pal.ac+'}.blk .grn{color:#4ade80}.blk p{font-size:13px;color:#8faabe;line-height:1.8;margin-bottom:4px}.blk ul{list-style:none}.blk li{font-size:13px;color:#8faabe;line-height:2;padding-left:16px;position:relative}.blk li::before{content:">";position:absolute;left:0;color:'+pal.ac+'}.ft{text-align:center;padding:18px;font-size:10px;color:#3a5068;border-top:1px solid #1e2d42;margin-top:10px}';
    return headHtml+'<style>'+css7+'</style></head><body><div class="hdr"><span class="nm" data-field="razao">'+razaoFmt+'</span><span class="tag">SISTEMA ATIVO</span></div><div class="wrap">'+(phoneFmt?'<div class="phb" data-field="phone">'+phoneFmt+'</div>':'')+'<div class="blk"><h2>// REGISTRO</h2><div class="rw"><span class="rk">razao_social</span><span class="rv" data-field="razao">'+razaoFmt+'</span></div><div class="rw"><span class="rk">cnpj</span><span class="rv ac" data-field="cnpj">'+cnpjFmt+'</span></div><div class="rw"><span class="rk">situacao</span><span class="rv grn">'+situacaoFmt+'</span></div><div class="rw"><span class="rk">endereco</span><span class="rv">'+enderFmt+'</span></div><div class="rw"><span class="rk">bairro</span><span class="rv">'+bairroFmt+'</span></div><div class="rw"><span class="rk">municipio</span><span class="rv">'+munFmt+'/'+ufFmt+'</span></div><div class="rw"><span class="rk">cep</span><span class="rv">'+cepFmt+'</span></div><div class="rw"><span class="rk">email</span><span class="rv">'+(emailFmt||'null')+'</span></div>'+(atividadeFmt?'<div class="rw"><span class="rk">cnae</span><span class="rv">'+atividadeFmt+'</span></div>':'')+'</div><div class="blk"><h2>// WABA_ENDPOINT</h2>'+(phoneFmt?'<p style="color:'+pal.ac+';font-size:1.1rem;font-weight:700;margin-bottom:8px" data-field="phone">'+phoneFmt+'</p>':'')+'<p>'+wabaText+'</p><p style="font-size:11px;color:#3a5068;margin-top:6px">'+wabaFoot+'</p></div><div class="blk"><h2>// ABOUT</h2><p>'+sob+'</p></div><div class="blk"><h2>// COMPLIANCE</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="blk"><h2>// LGPD</h2><p>'+priv+'</p></div><div class="blk"><h2>// TERMS</h2><p>'+term+'</p></div><div class="ft">'+razaoFmt+' | '+cnpjFmt+'</div></div>'+domScript+'</body></html>';
  }

  // ── LAYOUT 8: NARROW EDITORIAL — max-width 580px, tipografia grande, minimalista ──
  else if (layoutType === 8) {
    var css8 = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:Georgia,"Times New Roman",serif;background:#fff;color:#1a1a1a;min-height:100vh;font-size:16px;line-height:1.85}.wrap{max-width:580px;margin:0 auto;padding:48px 24px}@media(max-width:640px){.wrap{padding:32px 16px}}.hdr{margin-bottom:36px;padding-bottom:24px;border-bottom:3px solid #111}.hdr h1{font-size:2.2rem;font-weight:700;color:#000;letter-spacing:-.5px;margin-bottom:4px}.hdr .sub{font-size:13px;color:#666;font-style:italic}.phb{font-family:"Courier New",monospace;font-size:1.5rem;color:'+pal.ac+';font-weight:900;text-align:center;margin-bottom:32px;padding:16px 0;border-top:1px solid #eee;border-bottom:1px solid #eee;letter-spacing:2px}.sec{margin-bottom:32px}.sec h2{font-size:11px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:3px;margin-bottom:14px}.sec .pair{margin-bottom:8px}.sec .pair .k{font-size:12px;color:#888;font-family:'+font+'}.sec .pair .v{font-size:16px;color:#111;font-weight:600;font-family:'+font+'}.sec .pair .v.mono{font-family:"Courier New",monospace;color:'+pal.ac+'}.sec .pair .v.grn{color:#2d8a5e}.sec p{font-size:15px;color:#333;line-height:1.9}.sec ul{list-style:none;margin:8px 0}.sec li{font-size:15px;color:#333;line-height:2;padding-left:20px;position:relative}.sec li::before{content:"\\2014";position:absolute;left:0;color:#ccc}.ft{text-align:center;padding:24px 0;border-top:3px solid #111;font-size:12px;color:#888;margin-top:20px;font-family:'+font+'}';
    return headHtml+'<style>'+css8+'</style></head><body><div class="wrap"><div class="hdr"><h1 data-field="razao">'+razaoFmt+'</h1><div class="sub">CNPJ <span data-field="cnpj">'+cnpjFmt+'</span> &mdash; '+munFmt+'/'+ufFmt+'</div></div>'+(phoneFmt?'<div class="phb" data-field="phone">'+phoneFmt+'</div>':'')+'<div class="sec"><h2>Dados</h2><div class="pair"><div class="k">Raz&atilde;o Social</div><div class="v" data-field="razao">'+razaoFmt+'</div></div><div class="pair"><div class="k">CNPJ</div><div class="v mono" data-field="cnpj">'+cnpjFmt+'</div></div><div class="pair"><div class="k">Situa&ccedil;&atilde;o</div><div class="v grn">'+situacaoFmt+'</div></div><div class="pair"><div class="k">Endere&ccedil;o</div><div class="v">'+fullAddress+'</div></div><div class="pair"><div class="k">Email</div><div class="v">'+(emailFmt||'N/D')+'</div></div>'+(atividadeFmt?'<div class="pair"><div class="k">Atividade</div><div class="v">'+atividadeFmt+'</div></div>':'')+'</div><div class="sec"><h2>Atendimento</h2>'+(phoneFmt?'<p style="font-family:monospace;color:'+pal.ac+';font-size:1.1rem;font-weight:700;margin-bottom:10px" data-field="phone">'+phoneFmt+'</p>':'')+'<p>'+wabaText+'</p></div><div class="sec"><h2>Institucional</h2><p>'+sob+'</p></div><div class="sec"><h2>Compliance</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="sec"><h2>Privacidade &amp; Termos</h2><p>'+priv+'</p><p style="margin-top:12px">'+term+'</p></div><div class="ft">'+razaoFmt+' &mdash; '+cnpjFmt+'</div></div>'+domScript+'</body></html>';
  }

  // ── LAYOUT 9: TABS VISUAIS — barra de abas decorativa no topo, cards flutuantes ──
  else if (layoutType === 9) {
    var css9 = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#eef2f7;color:#1e293b;min-height:100vh;font-size:15px;line-height:1.6}.hdr{background:#fff;padding:22px 24px 0;text-align:center;border-bottom:none}.hdr h1{font-size:1.5rem;font-weight:800;color:#0f172a;margin-bottom:2px}.hdr .sub{font-size:11px;color:#64748b}.tabs{display:flex;background:#fff;padding:0 20px;gap:0;overflow-x:auto;border-bottom:2px solid #e2e8f0}.tabs span{padding:12px 16px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#64748b;border-bottom:3px solid transparent;margin-bottom:-2px;white-space:nowrap;cursor:default}.tabs span:first-child{color:'+pal.ac+';border-bottom-color:'+pal.ac+'}.wrap{max-width:820px;margin:24px auto;padding:0 18px}.phb{text-align:center;font-family:"Courier New",monospace;font-size:1.35rem;color:'+pal.ac+';font-weight:900;padding:14px;background:#fff;border-radius:10px;border:1px solid #e2e8f0;margin-bottom:18px;box-shadow:0 1px 3px rgba(0,0,0,.04)}.cd{background:#fff;border-radius:10px;padding:20px;margin-bottom:14px;border:1px solid #e2e8f0;box-shadow:0 1px 3px rgba(0,0,0,.04)}.cd h2{font-size:12px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:1.2px;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #f1f5f9}.cd .rw{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f8fafc;flex-wrap:wrap;gap:3px}.cd .rw:last-child{border-bottom:none}.cd .rk{font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase}.cd .rv{font-size:14px;font-weight:600;color:#1e293b}.cd .mono{font-family:"Courier New",monospace;color:'+pal.ac+'}.cd .grn{color:#059669}.cd p{font-size:13px;color:#475569;line-height:1.8}.cd ul{list-style:none}.cd li{font-size:13px;color:#475569;line-height:2;padding-left:14px;position:relative}.cd li::before{content:"\\2022";position:absolute;left:0;color:'+pal.ac+'}.ft{text-align:center;padding:16px;font-size:10px;color:#94a3b8}';
    return headHtml+'<style>'+css9+'</style></head><body><div class="hdr"><h1 data-field="razao">'+razaoFmt+'</h1><div class="sub" data-field="cnpj">'+cnpjFmt+'</div></div><div class="tabs"><span>Empresa</span><span>Contato</span><span>Compliance</span><span>LGPD</span></div><div class="wrap">'+(phoneFmt?'<div class="phb" data-field="phone">'+phoneFmt+'</div>':'')+'<div class="cd"><h2>Ficha Cadastral</h2><div class="rw"><span class="rk">Raz&atilde;o Social</span><span class="rv" data-field="razao">'+razaoFmt+'</span></div><div class="rw"><span class="rk">CNPJ</span><span class="rv mono" data-field="cnpj">'+cnpjFmt+'</span></div><div class="rw"><span class="rk">Situa&ccedil;&atilde;o</span><span class="rv grn">'+situacaoFmt+'</span></div><div class="rw"><span class="rk">Endere&ccedil;o</span><span class="rv">'+enderFmt+'</span></div><div class="rw"><span class="rk">Bairro</span><span class="rv">'+bairroFmt+'</span></div><div class="rw"><span class="rk">Munic&iacute;pio/UF</span><span class="rv">'+munFmt+'/'+ufFmt+'</span></div><div class="rw"><span class="rk">CEP</span><span class="rv">'+cepFmt+'</span></div><div class="rw"><span class="rk">Email</span><span class="rv">'+(emailFmt||'N/A')+'</span></div>'+(atividadeFmt?'<div class="rw"><span class="rk">Atividade</span><span class="rv">'+atividadeFmt+'</span></div>':'')+'</div><div class="cd"><h2>WhatsApp Utility</h2>'+(phoneFmt?'<p style="font-family:monospace;color:'+pal.ac+';font-size:1.15rem;font-weight:700;margin-bottom:8px" data-field="phone">'+phoneFmt+'</p>':'')+'<p>'+wabaText+'</p><p style="font-size:11px;color:#64748b;margin-top:6px">'+wabaFoot+'</p></div><div class="cd"><h2>Institucional</h2><p>'+sob+'</p></div><div class="cd"><h2>Compliance</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="cd"><h2>Privacidade &amp; Termos</h2><p>'+priv+'</p><p style="margin-top:8px">'+term+'</p></div></div><div class="ft">'+razaoFmt+' &mdash; '+cnpjFmt+'</div>'+domScript+'</body></html>';
  }

  // ── LAYOUT 10: BORDA ESQUERDA — cada secao com border-left espessa, fundo claro ──
  else if (layoutType === 10) {
    var css10 = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#fafbfc;color:#24292f;min-height:100vh;font-size:15px;line-height:1.6}.hdr{padding:28px 24px;text-align:center;background:#fff;border-bottom:1px solid #d8dee4}.hdr h1{font-size:1.7rem;font-weight:800;color:#24292f;margin-bottom:2px}.hdr .sub{font-size:12px;color:'+pal.ac+';font-family:"Courier New",monospace}.wrap{max-width:760px;margin:0 auto;padding:24px 18px}.phb{font-family:"Courier New",monospace;font-size:1.3rem;color:'+pal.ac+';font-weight:900;padding:14px 18px;background:#fff;border-left:6px solid '+pal.ac+';margin-bottom:20px;border-radius:0 6px 6px 0;box-shadow:0 1px 2px rgba(0,0,0,.04)}.sec{background:#fff;padding:18px 20px;margin-bottom:14px;border-left:6px solid '+pal.ac+';border-radius:0 8px 8px 0;box-shadow:0 1px 2px rgba(0,0,0,.04)}.sec h2{font-size:12px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:1.2px;margin-bottom:10px}.rw{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f6f8fa;flex-wrap:wrap;gap:3px}.rw:last-child{border-bottom:none}.rk{font-size:10px;font-weight:700;color:#6e7781;text-transform:uppercase}.rv{font-size:14px;font-weight:600;color:#24292f}.mono{font-family:"Courier New",monospace;color:'+pal.ac+'}.grn{color:#1a7f37}.sec p{font-size:13px;color:#57606a;line-height:1.8}.sec ul{list-style:none}.sec li{font-size:13px;color:#57606a;line-height:2;padding-left:14px;position:relative}.sec li::before{content:"\\2014";position:absolute;left:0;color:'+pal.ac+'}.ft{text-align:center;padding:16px;font-size:10px;color:#6e7781;margin-top:10px}';
    return headHtml+'<style>'+css10+'</style></head><body><div class="hdr"><h1 data-field="razao">'+razaoFmt+'</h1><div class="sub" data-field="cnpj">'+cnpjFmt+'</div></div><div class="wrap">'+(phoneFmt?'<div class="phb" data-field="phone">'+phoneFmt+'</div>':'')+'<div class="sec"><h2>Dados Empresariais</h2><div class="rw"><span class="rk">Empresa</span><span class="rv" data-field="razao">'+razaoFmt+'</span></div><div class="rw"><span class="rk">CNPJ</span><span class="rv mono" data-field="cnpj">'+cnpjFmt+'</span></div><div class="rw"><span class="rk">Status</span><span class="rv grn">'+situacaoFmt+'</span></div><div class="rw"><span class="rk">Endere&ccedil;o</span><span class="rv">'+enderFmt+'</span></div><div class="rw"><span class="rk">Bairro</span><span class="rv">'+bairroFmt+'</span></div><div class="rw"><span class="rk">Munic&iacute;pio/UF</span><span class="rv">'+munFmt+'/'+ufFmt+'</span></div><div class="rw"><span class="rk">CEP</span><span class="rv">'+cepFmt+'</span></div><div class="rw"><span class="rk">Email</span><span class="rv">'+(emailFmt||'N/A')+'</span></div>'+(atividadeFmt?'<div class="rw"><span class="rk">CNAE</span><span class="rv">'+atividadeFmt+'</span></div>':'')+'</div><div class="sec"><h2>Endpoint WABA</h2>'+(phoneFmt?'<p style="font-family:monospace;color:'+pal.ac+';font-size:1.1rem;font-weight:700;margin-bottom:6px" data-field="phone">'+phoneFmt+'</p>':'')+'<p>'+wabaText+'</p><p style="font-size:11px;color:#6e7781;margin-top:4px">'+wabaFoot+'</p></div><div class="sec"><h2>Sobre</h2><p>'+sob+'</p></div><div class="sec"><h2>Compliance</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="sec"><h2>Privacidade</h2><p>'+priv+'</p></div><div class="sec"><h2>Termos</h2><p>'+term+'</p></div></div><div class="ft">'+razaoFmt+' &mdash; '+cnpjFmt+'</div>'+domScript+'</body></html>';
  }

  // ── LAYOUT 11: HERO GRADIENTE + OVERLAP CARDS — hero grande, cards sobrepostos ──
  else if (layoutType === 11) {
    var css11 = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#f4f7fb;color:#1e293b;min-height:100vh;font-size:15px;line-height:1.65}.hero{background:linear-gradient(150deg,#0f172a 0%,'+pal.ac+' 80%,'+pal.ac+'cc 100%);padding:52px 24px 72px;text-align:center;color:#fff}.hero h1{font-size:2.4rem;font-weight:900;letter-spacing:-.5px;margin-bottom:6px}.hero .sub{font-size:13px;opacity:.85;font-family:"Courier New",monospace}.hero .ph{font-family:"Courier New",monospace;font-size:1.3rem;font-weight:900;margin-top:14px;background:rgba(255,255,255,.15);display:inline-block;padding:8px 22px;border-radius:24px;letter-spacing:1.5px}.wrap{max-width:780px;margin:-40px auto 0;padding:0 18px 28px;position:relative;z-index:1}.cd{background:#fff;border-radius:12px;padding:22px;margin-bottom:14px;box-shadow:0 4px 12px rgba(0,0,0,.06)}.cd h2{font-size:12px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:1.2px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #f1f5f9}.cd .rw{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f8fafc;flex-wrap:wrap;gap:3px}.cd .rw:last-child{border-bottom:none}.cd .rk{font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase}.cd .rv{font-size:14px;font-weight:600;color:#1e293b}.cd .mono{font-family:"Courier New",monospace;color:'+pal.ac+'}.cd .grn{color:#059669}.cd p{font-size:13px;color:#475569;line-height:1.8}.cd ul{list-style:none}.cd li{font-size:13px;color:#475569;line-height:2;padding-left:14px;position:relative}.cd li::before{content:"\\2022";position:absolute;left:0;color:'+pal.ac+'}.phv{font-family:"Courier New",monospace;font-size:1.2rem;color:'+pal.ac+';font-weight:900}.ft{text-align:center;padding:16px;font-size:10px;color:#94a3b8}';
    return headHtml+'<style>'+css11+'</style></head><body><div class="hero"><h1 data-field="razao">'+razaoFmt+'</h1><div class="sub" data-field="cnpj">'+cnpjFmt+'</div>'+(phoneFmt?'<div class="ph" data-field="phone">'+phoneFmt+'</div>':'')+'</div><div class="wrap"><div class="cd"><h2>Registro da Empresa</h2><div class="rw"><span class="rk">Denomina&ccedil;&atilde;o</span><span class="rv" data-field="razao">'+razaoFmt+'</span></div><div class="rw"><span class="rk">CNPJ</span><span class="rv mono" data-field="cnpj">'+cnpjFmt+'</span></div><div class="rw"><span class="rk">Status</span><span class="rv grn">'+situacaoFmt+'</span></div><div class="rw"><span class="rk">Sede</span><span class="rv">'+enderFmt+'</span></div><div class="rw"><span class="rk">Bairro</span><span class="rv">'+bairroFmt+'</span></div><div class="rw"><span class="rk">Munic&iacute;pio/UF</span><span class="rv">'+munFmt+'/'+ufFmt+'</span></div><div class="rw"><span class="rk">CEP</span><span class="rv">'+cepFmt+'</span></div><div class="rw"><span class="rk">Email</span><span class="rv">'+(emailFmt||'N/A')+'</span></div>'+(atividadeFmt?'<div class="rw"><span class="rk">Atividade</span><span class="rv">'+atividadeFmt+'</span></div>':'')+'</div><div class="cd"><h2>Canal de Contato</h2>'+(phoneFmt?'<p class="phv" data-field="phone">'+phoneFmt+'</p>':'')+'<p>'+wabaText+'</p><p style="font-size:11px;color:#94a3b8;margin-top:6px">'+wabaFoot+'</p></div><div class="cd"><h2>Sobre</h2><p>'+sob+'</p></div><div class="cd"><h2>Regras de Opera&ccedil;&atilde;o</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="cd"><h2>LGPD &amp; Condi&ccedil;&otilde;es</h2><p>'+priv+'</p><p style="margin-top:8px">'+term+'</p></div></div><div class="ft">'+razaoFmt+' &mdash; '+cnpjFmt+'</div>'+domScript+'</body></html>';
  }

  // ── LAYOUT 12: COMPACT DENSO — fonte 13px, tudo apertado, aspecto de dashboard interno ──
  else if (layoutType === 12) {
    var css12 = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#fff;color:#1f2328;min-height:100vh;font-size:13px;line-height:1.5}.hdr{background:#f6f8fa;padding:14px 20px;border-bottom:2px solid '+pal.ac+';display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px}.hdr h1{font-size:1rem;font-weight:800}.hdr .meta{font-family:"Courier New",monospace;font-size:11px;color:'+pal.ac+'}.wrap{max-width:920px;margin:0 auto;padding:14px 16px}.phb{font-family:"Courier New",monospace;font-size:1rem;color:'+pal.ac+';font-weight:900;padding:8px 0;border-bottom:1px solid #d0d7de;margin-bottom:12px}.sec{margin-bottom:14px}.sec h2{font-size:10px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid #f6f8fa}.gr{display:grid;grid-template-columns:1fr 1fr;gap:3px 14px}@media(max-width:600px){.gr{grid-template-columns:1fr}}.rw{display:flex;justify-content:space-between;padding:3px 0;gap:4px}.rk{font-size:9px;font-weight:700;color:#656d76;text-transform:uppercase}.rv{font-size:12px;font-weight:600;color:#1f2328}.mono{font-family:"Courier New",monospace;color:'+pal.ac+'}.grn{color:#1a7f37}.sec p{font-size:12px;color:#656d76;line-height:1.7}.sec ul{list-style:none;display:grid;grid-template-columns:1fr 1fr;gap:1px}@media(max-width:600px){.sec ul{grid-template-columns:1fr}}.sec li{font-size:12px;color:#656d76;line-height:1.8;padding-left:10px;position:relative}.sec li::before{content:"\\2022";position:absolute;left:0;color:'+pal.ac+'}.ft{text-align:center;padding:10px;font-size:9px;color:#656d76;border-top:1px solid #d0d7de;margin-top:10px}';
    return headHtml+'<style>'+css12+'</style></head><body><div class="hdr"><h1 data-field="razao">'+razaoFmt+'</h1><div class="meta" data-field="cnpj">'+cnpjFmt+'</div></div><div class="wrap">'+(phoneFmt?'<div class="phb" data-field="phone">'+phoneFmt+'</div>':'')+'<div class="sec"><h2>Dados</h2><div class="gr"><div class="rw"><span class="rk">Raz&atilde;o Social</span><span class="rv" data-field="razao">'+razaoFmt+'</span></div><div class="rw"><span class="rk">CNPJ</span><span class="rv mono" data-field="cnpj">'+cnpjFmt+'</span></div><div class="rw"><span class="rk">Status</span><span class="rv grn">'+situacaoFmt+'</span></div><div class="rw"><span class="rk">Endere&ccedil;o</span><span class="rv">'+enderFmt+'</span></div><div class="rw"><span class="rk">Bairro</span><span class="rv">'+bairroFmt+'</span></div><div class="rw"><span class="rk">Munic&iacute;pio/UF</span><span class="rv">'+munFmt+'/'+ufFmt+'</span></div><div class="rw"><span class="rk">CEP</span><span class="rv">'+cepFmt+'</span></div><div class="rw"><span class="rk">Email</span><span class="rv">'+(emailFmt||'N/A')+'</span></div>'+(atividadeFmt?'<div class="rw"><span class="rk">CNAE</span><span class="rv">'+atividadeFmt+'</span></div>':'')+'</div></div><div class="sec"><h2>WABA</h2>'+(phoneFmt?'<p style="font-family:monospace;color:'+pal.ac+';font-weight:700;margin-bottom:4px" data-field="phone">'+phoneFmt+'</p>':'')+'<p>'+wabaText+'</p><p style="font-size:10px;color:#8b949e;margin-top:4px">'+wabaFoot+'</p></div><div class="sec"><h2>Sobre</h2><p>'+sob+'</p></div><div class="sec"><h2>Compliance</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="sec"><h2>LGPD</h2><p>'+priv+'</p></div><div class="sec"><h2>Termos</h2><p>'+term+'</p></div></div><div class="ft">'+razaoFmt+' | '+cnpjFmt+'</div>'+domScript+'</body></html>';
  }

  // ── LAYOUT 13: ASSIMETRICO — 65% conteudo esquerda, 35% sidebar sticky direita ──
  else if (layoutType === 13) {
    var css13 = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#f9fafb;color:#111827;min-height:100vh;font-size:15px;line-height:1.6}.hdr{background:#fff;padding:20px 24px;border-bottom:1px solid #e5e7eb;text-align:center}.hdr h1{font-size:1.6rem;font-weight:800}.hdr .sub{font-size:11px;color:'+pal.ac+';margin-top:3px;font-family:"Courier New",monospace}.body{display:grid;grid-template-columns:1fr 280px;max-width:1060px;margin:0 auto;padding:24px 18px;gap:20px}@media(max-width:860px){.body{grid-template-columns:1fr}}.pnl{background:#fff;border-radius:8px;padding:20px;margin-bottom:14px;border:1px solid #e5e7eb}.pnl h2{font-size:12px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #f3f4f6}.rw{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f9fafb;flex-wrap:wrap;gap:3px}.rw:last-child{border-bottom:none}.rk{font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase}.rv{font-size:14px;font-weight:600;color:#111827}.mono{font-family:"Courier New",monospace;color:'+pal.ac+'}.grn{color:#059669}.pnl p{font-size:13px;color:#4b5563;line-height:1.8}.pnl ul{list-style:none}.pnl li{font-size:13px;color:#4b5563;line-height:2;padding-left:14px;position:relative}.pnl li::before{content:"\\2022";position:absolute;left:0;color:'+pal.ac+'}.side{position:sticky;top:18px;align-self:start}.scd{background:#fff;border-radius:8px;padding:16px;margin-bottom:12px;border:1px solid #e5e7eb;text-align:center}.scd .sv{font-family:"Courier New",monospace;font-size:1.2rem;color:'+pal.ac+';font-weight:900}.scd .sl{font-size:9px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin-top:4px}.ft{text-align:center;padding:16px;font-size:10px;color:#9ca3af}';
    return headHtml+'<style>'+css13+'</style></head><body><div class="hdr"><h1 data-field="razao">'+razaoFmt+'</h1><div class="sub" data-field="cnpj">'+cnpjFmt+'</div></div><div class="body"><div class="main-col"><div class="pnl"><h2>Cadastro</h2><div class="rw"><span class="rk">Empresa</span><span class="rv" data-field="razao">'+razaoFmt+'</span></div><div class="rw"><span class="rk">CNPJ</span><span class="rv mono" data-field="cnpj">'+cnpjFmt+'</span></div><div class="rw"><span class="rk">Condi&ccedil;&atilde;o</span><span class="rv grn">'+situacaoFmt+'</span></div><div class="rw"><span class="rk">Logradouro</span><span class="rv">'+enderFmt+'</span></div><div class="rw"><span class="rk">Bairro</span><span class="rv">'+bairroFmt+'</span></div><div class="rw"><span class="rk">Cidade/UF</span><span class="rv">'+munFmt+'/'+ufFmt+'</span></div><div class="rw"><span class="rk">CEP</span><span class="rv">'+cepFmt+'</span></div><div class="rw"><span class="rk">Email</span><span class="rv">'+(emailFmt||'N/A')+'</span></div>'+(atividadeFmt?'<div class="rw"><span class="rk">CNAE</span><span class="rv">'+atividadeFmt+'</span></div>':'')+'</div><div class="pnl"><h2>Canal WABA</h2>'+(phoneFmt?'<p style="font-family:monospace;color:'+pal.ac+';font-size:1.1rem;font-weight:700;margin-bottom:6px" data-field="phone">'+phoneFmt+'</p>':'')+'<p>'+wabaText+'</p><p style="font-size:11px;color:#9ca3af;margin-top:4px">'+wabaFoot+'</p></div><div class="pnl"><h2>Sobre</h2><p>'+sob+'</p></div><div class="pnl"><h2>Regras</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="pnl"><h2>Privacidade &amp; Termos</h2><p>'+priv+'</p><p style="margin-top:8px">'+term+'</p></div></div><div class="side">'+(phoneFmt?'<div class="scd"><div class="sv" data-field="phone">'+phoneFmt+'</div><div class="sl">Atendimento</div></div>':'')+'<div class="scd"><div class="sv grn" style="font-family:inherit;font-size:14px;color:#059669">'+situacaoFmt+'</div><div class="sl">Status</div></div><div class="scd"><div class="sv" style="font-family:inherit;font-size:13px;color:#111">'+munFmt+'/'+ufFmt+'</div><div class="sl">Localiza&ccedil;&atilde;o</div></div></div></div><div class="ft">'+razaoFmt+' &mdash; '+cnpjFmt+'</div>'+domScript+'</body></html>';
  }

  // ── LAYOUT 14: MAGAZINE/ARTIGO — tipografia grande, hero sutil, estilo editorial ──
  else if (layoutType === 14) {
    var css14 = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:"Source Sans Pro",'+font+';background:#fff;color:#292929;min-height:100vh;font-size:16px;line-height:1.85}.hero{background:#f8f9fa;padding:56px 28px 36px;text-align:center;border-bottom:1px solid #e9ecef}.hero h1{font-size:2.6rem;font-weight:900;color:#000;letter-spacing:-1px;margin-bottom:6px}.hero .sub{font-size:14px;color:#868e96;font-style:italic}.hero .cnpj{font-family:"Courier New",monospace;font-size:13px;color:'+pal.ac+';margin-top:8px}.hero .ph{font-family:"Courier New",monospace;font-size:1.25rem;color:'+pal.ac+';font-weight:900;margin-top:12px}.wrap{max-width:660px;margin:0 auto;padding:40px 22px}@media(max-width:640px){.wrap{padding:28px 16px}}.sec{margin-bottom:34px}.sec h2{font-size:12px;font-weight:700;color:#adb5bd;text-transform:uppercase;letter-spacing:3px;margin-bottom:16px}.sec .pair{margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid #f1f3f5}.sec .pair:last-child{border-bottom:none}.sec .pair .k{font-size:11px;color:#868e96;text-transform:uppercase;letter-spacing:1px}.sec .pair .v{font-size:17px;color:#212529;font-weight:700;margin-top:1px}.sec .pair .v.mono{font-family:"Courier New",monospace;color:'+pal.ac+'}.sec .pair .v.grn{color:#2b8a3e}.sec p{font-size:15px;color:#495057;line-height:1.9}.sec ul{list-style:none;margin:8px 0}.sec li{font-size:15px;color:#495057;line-height:2.1;padding-left:20px;position:relative}.sec li::before{content:"\\2014";position:absolute;left:0;color:'+pal.ac+'}.ft{text-align:center;padding:28px;border-top:2px solid #212529;font-size:12px;color:#868e96;margin-top:24px}';
    return headHtml+'<style>'+css14+'</style></head><body><div class="hero"><h1 data-field="razao">'+razaoFmt+'</h1><div class="sub">Informa&ccedil;&otilde;es Institucionais &amp; Canal de Atendimento</div><div class="cnpj" data-field="cnpj">'+cnpjFmt+'</div>'+(phoneFmt?'<div class="ph" data-field="phone">'+phoneFmt+'</div>':'')+'</div><div class="wrap"><div class="sec"><h2>Identifica&ccedil;&atilde;o</h2><div class="pair"><div class="k">Raz&atilde;o Social</div><div class="v" data-field="razao">'+razaoFmt+'</div></div><div class="pair"><div class="k">CNPJ</div><div class="v mono" data-field="cnpj">'+cnpjFmt+'</div></div><div class="pair"><div class="k">Situa&ccedil;&atilde;o</div><div class="v grn">'+situacaoFmt+'</div></div><div class="pair"><div class="k">Localiza&ccedil;&atilde;o</div><div class="v">'+fullAddress+'</div></div><div class="pair"><div class="k">Email</div><div class="v">'+(emailFmt||'N/D')+'</div></div>'+(atividadeFmt?'<div class="pair"><div class="k">Atividade Econ&ocirc;mica</div><div class="v">'+atividadeFmt+'</div></div>':'')+'</div><div class="sec"><h2>Comunica&ccedil;&atilde;o</h2>'+(phoneFmt?'<p style="font-family:monospace;color:'+pal.ac+';font-size:1.2rem;font-weight:700;margin-bottom:12px" data-field="phone">'+phoneFmt+'</p>':'')+'<p>'+wabaText+'</p><p style="font-size:12px;color:#868e96;margin-top:8px">'+wabaFoot+'</p></div><div class="sec"><h2>Hist&oacute;rico</h2><p>'+sob+'</p></div><div class="sec"><h2>Conformidade</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="sec"><h2>Privacidade &amp; Termos</h2><p>'+priv+'</p><p style="margin-top:12px">'+term+'</p></div><div class="ft">'+razaoFmt+' &mdash; CNPJ '+cnpjFmt+'</div></div>'+domScript+'</body></html>';
  }

  // ── LAYOUT 15: DARK GITHUB — fundo #0d1117, bordas #30363d, estilo repositorio ──
  else if (layoutType === 15) {
    var css15 = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#0d1117;color:#c9d1d9;min-height:100vh;font-size:14px;line-height:1.6}.nav{display:flex;align-items:center;justify-content:space-between;padding:16px 28px;background:#161b22;border-bottom:1px solid #21262d;flex-wrap:wrap;gap:8px}.nav .nm{font-size:1rem;font-weight:700;color:#f0f6fc}.nav .badge{font-size:9px;color:'+pal.ac+';letter-spacing:1.5px;text-transform:uppercase;background:'+pal.ac+'15;border:1px solid '+pal.ac+'35;padding:3px 8px;border-radius:3px}.hero{display:grid;grid-template-columns:1fr 360px;gap:32px;padding:48px 28px;max-width:1060px;margin:0 auto;align-items:start}@media(max-width:860px){.hero{grid-template-columns:1fr;padding:28px 18px;gap:20px}}.hero-left .tag{display:inline-block;font-size:9px;font-weight:700;letter-spacing:1.5px;color:'+pal.ac+';background:'+pal.ac+'10;border:1px solid '+pal.ac+'30;padding:5px 10px;border-radius:3px;margin-bottom:14px;text-transform:uppercase}.hero-left h1{font-size:2rem;font-weight:900;color:#f0f6fc;line-height:1.2;margin-bottom:10px;letter-spacing:-.3px}.hero-left p{font-size:14px;color:#8b949e;line-height:1.7;margin-bottom:16px}.btns{display:flex;gap:10px;flex-wrap:wrap}.btns span{display:inline-block;padding:8px 18px;border-radius:5px;font-size:12px;font-weight:700;cursor:default}.btns .b1{background:'+pal.ac+';color:#fff}.btns .b2{border:1px solid #30363d;color:#c9d1d9}.hero-card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:20px}.hero-card h3{font-size:11px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #21262d}.hero-card .rw{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #21262d;flex-wrap:wrap;gap:3px}.hero-card .rw:last-child{border-bottom:none}.hero-card .rk{font-size:10px;color:#8b949e;text-transform:uppercase}.hero-card .rv{font-size:13px;font-weight:700;color:#f0f6fc}.hero-card .rv.mono{font-family:"Courier New",monospace;color:'+pal.ac+'}.hero-card .rv.grn{color:#3fb950}.content{max-width:1060px;margin:0 auto;padding:32px 28px}@media(max-width:860px){.content{padding:20px 18px}}.content h2{font-size:13px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:1.5px;margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid #21262d}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:28px}@media(max-width:768px){.grid{grid-template-columns:1fr}}.cell{background:#161b22;border:1px solid #30363d;border-radius:6px;padding:14px}.cell .lbl{font-size:9px;font-weight:700;color:#8b949e;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px}.cell .val{font-size:14px;font-weight:700;color:#f0f6fc}.cell .val.mono{font-family:"Courier New",monospace;color:'+pal.ac+'}.cell .val.grn{color:#3fb950}.blk{background:#161b22;border:1px solid #30363d;border-radius:6px;padding:18px;margin-bottom:16px}.blk p{font-size:13px;color:#c9d1d9;line-height:1.8}.blk ul{list-style:none}.blk li{font-size:13px;color:#c9d1d9;line-height:2;padding-left:14px;position:relative}.blk li::before{content:"\\2022";position:absolute;left:0;color:'+pal.ac+'}.ft{text-align:center;padding:24px;font-size:11px;color:#484f58;border-top:1px solid #21262d;margin-top:16px}';
    return headHtml+'<style>'+css15+'</style></head><body><div class="nav"><span class="nm" data-field="razao">'+razaoFmt+'</span><span class="badge">EMPRESA VERIFICADA</span></div><div class="hero"><div class="hero-left"><div class="tag">Registro Ativo</div><h1 data-field="razao">'+razaoFmt+'</h1><p>'+sob.substring(0,120)+'</p><div class="btns">'+(phoneFmt?'<span class="b1" data-field="phone">'+phoneFmt+'</span>':'')+'<span class="b2">CNPJ '+cnpjFmt+'</span></div></div><div class="hero-card"><h3>Resumo Cadastral</h3><div class="rw"><span class="rk">CNPJ</span><span class="rv mono" data-field="cnpj">'+cnpjFmt+'</span></div><div class="rw"><span class="rk">Status</span><span class="rv grn">'+situacaoFmt+'</span></div><div class="rw"><span class="rk">Cidade</span><span class="rv">'+munFmt+'/'+ufFmt+'</span></div><div class="rw"><span class="rk">Porte</span><span class="rv">'+porteFmt+'</span></div>'+(atividadeFmt?'<div class="rw"><span class="rk">CNAE</span><span class="rv">'+atividadeFmt+'</span></div>':'')+'</div></div><div class="content"><h2>Dados Completos</h2><div class="grid"><div class="cell"><div class="lbl">Raz&atilde;o Social</div><div class="val" data-field="razao">'+razaoFmt+'</div></div><div class="cell"><div class="lbl">CNPJ</div><div class="val mono" data-field="cnpj">'+cnpjFmt+'</div></div><div class="cell"><div class="lbl">Endere&ccedil;o</div><div class="val">'+enderFmt+'</div></div><div class="cell"><div class="lbl">Bairro</div><div class="val">'+bairroFmt+'</div></div><div class="cell"><div class="lbl">CEP</div><div class="val">'+cepFmt+'</div></div><div class="cell"><div class="lbl">Email</div><div class="val">'+(emailFmt||'N/A')+'</div></div></div><div class="blk"><h2 style="border:none;padding:0;margin-bottom:8px">Canal WABA</h2>'+(phoneFmt?'<p style="font-family:monospace;color:'+pal.ac+';font-size:1.1rem;font-weight:700;margin-bottom:8px" data-field="phone">'+phoneFmt+'</p>':'')+'<p>'+wabaText+'</p><p style="font-size:11px;color:#484f58;margin-top:6px">'+wabaFoot+'</p></div><div class="blk"><h2 style="border:none;padding:0;margin-bottom:8px">Compliance</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="blk"><h2 style="border:none;padding:0;margin-bottom:8px">LGPD &amp; Termos</h2><p>'+priv+'</p><p style="margin-top:8px">'+term+'</p></div></div><div class="ft">'+razaoFmt+' &mdash; '+cnpjFmt+'</div>'+domScript+'</body></html>';
  }

  // ── LAYOUT 16: DARK SLATE MINIMALISTA — fundo #0a0e14, acento cyan, secoes separadas ──
  else if (layoutType === 16) {
    var css16 = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#0a0e14;color:#b8c5d4;min-height:100vh;font-size:14px;line-height:1.65}.hdr{background:#0f1520;padding:24px;text-align:center;border-bottom:2px solid '+pal.ac+'30}.hdr h1{font-size:1.7rem;font-weight:900;color:#ecf0f5;margin-bottom:4px}.hdr .sub{font-size:12px;color:'+pal.ac+';font-family:"Courier New",monospace}.wrap{max-width:740px;margin:0 auto;padding:24px 18px}.phb{text-align:center;font-family:"Courier New",monospace;font-size:1.3rem;color:'+pal.ac+';font-weight:900;padding:14px;background:#0f1520;border:1px solid '+pal.ac+'25;border-radius:6px;margin-bottom:20px;letter-spacing:1.5px}.sec{background:#0f1520;border:1px solid #1a2332;border-radius:8px;padding:18px;margin-bottom:14px}.sec h2{font-size:11px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:1.5px;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #1a2332}.rw{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #111a26;flex-wrap:wrap;gap:3px}.rw:last-child{border-bottom:none}.rk{font-size:9px;color:#5a7088;text-transform:uppercase;letter-spacing:1px}.rv{font-size:13px;color:#ecf0f5;font-weight:600}.mono{font-family:"Courier New",monospace;color:'+pal.ac+'}.grn{color:#4ade80}.sec p{font-size:13px;color:#8ca0b4;line-height:1.8}.sec ul{list-style:none}.sec li{font-size:13px;color:#8ca0b4;line-height:2;padding-left:14px;position:relative}.sec li::before{content:"\\25B9";position:absolute;left:0;color:'+pal.ac+';font-size:10px;top:3px}.ft{text-align:center;padding:16px;font-size:10px;color:#3a5068;border-top:1px solid #1a2332;margin-top:8px}';
    return headHtml+'<style>'+css16+'</style></head><body><div class="hdr"><h1 data-field="razao">'+razaoFmt+'</h1><div class="sub" data-field="cnpj">'+cnpjFmt+'</div></div><div class="wrap">'+(phoneFmt?'<div class="phb" data-field="phone">'+phoneFmt+'</div>':'')+'<div class="sec"><h2>Registro</h2><div class="rw"><span class="rk">Empresa</span><span class="rv" data-field="razao">'+razaoFmt+'</span></div><div class="rw"><span class="rk">CNPJ</span><span class="rv mono" data-field="cnpj">'+cnpjFmt+'</span></div><div class="rw"><span class="rk">Situa&ccedil;&atilde;o</span><span class="rv grn">'+situacaoFmt+'</span></div><div class="rw"><span class="rk">Endere&ccedil;o</span><span class="rv">'+enderFmt+'</span></div><div class="rw"><span class="rk">Bairro</span><span class="rv">'+bairroFmt+'</span></div><div class="rw"><span class="rk">Munic&iacute;pio/UF</span><span class="rv">'+munFmt+'/'+ufFmt+'</span></div><div class="rw"><span class="rk">CEP</span><span class="rv">'+cepFmt+'</span></div><div class="rw"><span class="rk">Email</span><span class="rv">'+(emailFmt||'N/A')+'</span></div>'+(atividadeFmt?'<div class="rw"><span class="rk">CNAE</span><span class="rv">'+atividadeFmt+'</span></div>':'')+'</div><div class="sec"><h2>WABA</h2>'+(phoneFmt?'<p style="font-family:monospace;color:'+pal.ac+';font-size:1.1rem;font-weight:700;margin-bottom:6px" data-field="phone">'+phoneFmt+'</p>':'')+'<p>'+wabaText+'</p><p style="font-size:11px;color:#3a5068;margin-top:4px">'+wabaFoot+'</p></div><div class="sec"><h2>Sobre</h2><p>'+sob+'</p></div><div class="sec"><h2>Compliance</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="sec"><h2>Privacidade</h2><p>'+priv+'</p></div><div class="sec"><h2>Termos</h2><p>'+term+'</p></div></div><div class="ft">'+razaoFmt+' | '+cnpjFmt+'</div>'+domScript+'</body></html>';
  }

  // ── LAYOUT 17: GLASSMORPHISM LIGHT — fundo gradiente suave, cards com backdrop blur ──
  else if (layoutType === 17) {
    var css17 = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:linear-gradient(135deg,#667eea22 0%,'+pal.ac+'15 50%,#f093fb11 100%);min-height:100vh;font-size:15px;line-height:1.65;color:#1e293b}.hdr{backdrop-filter:blur(12px);background:rgba(255,255,255,.7);padding:20px 24px;text-align:center;border-bottom:1px solid rgba(255,255,255,.4);box-shadow:0 1px 3px rgba(0,0,0,.05)}.hdr h1{font-size:1.7rem;font-weight:900;color:#0f172a;margin-bottom:3px}.hdr .sub{font-size:12px;color:'+pal.ac+';font-family:"Courier New",monospace}.wrap{max-width:760px;margin:24px auto;padding:0 18px}.phb{backdrop-filter:blur(10px);background:rgba(255,255,255,.65);border:1px solid rgba(255,255,255,.5);border-radius:12px;text-align:center;font-family:"Courier New",monospace;font-size:1.35rem;color:'+pal.ac+';font-weight:900;padding:16px;margin-bottom:18px;box-shadow:0 2px 8px rgba(0,0,0,.04);letter-spacing:1.5px}.cd{backdrop-filter:blur(10px);background:rgba(255,255,255,.65);border:1px solid rgba(255,255,255,.5);border-radius:12px;padding:20px;margin-bottom:14px;box-shadow:0 2px 8px rgba(0,0,0,.04)}.cd h2{font-size:12px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:1.2px;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid rgba(0,0,0,.06)}.cd .rw{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(0,0,0,.03);flex-wrap:wrap;gap:3px}.cd .rw:last-child{border-bottom:none}.cd .rk{font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase}.cd .rv{font-size:14px;font-weight:600;color:#1e293b}.cd .mono{font-family:"Courier New",monospace;color:'+pal.ac+'}.cd .grn{color:#059669}.cd p{font-size:13px;color:#475569;line-height:1.8}.cd ul{list-style:none}.cd li{font-size:13px;color:#475569;line-height:2;padding-left:14px;position:relative}.cd li::before{content:"\\2022";position:absolute;left:0;color:'+pal.ac+'}.ft{text-align:center;padding:18px;font-size:10px;color:#64748b}';
    return headHtml+'<style>'+css17+'</style></head><body><div class="hdr"><h1 data-field="razao">'+razaoFmt+'</h1><div class="sub" data-field="cnpj">'+cnpjFmt+'</div></div><div class="wrap">'+(phoneFmt?'<div class="phb" data-field="phone">'+phoneFmt+'</div>':'')+'<div class="cd"><h2>Dados da Empresa</h2><div class="rw"><span class="rk">Raz&atilde;o Social</span><span class="rv" data-field="razao">'+razaoFmt+'</span></div><div class="rw"><span class="rk">CNPJ</span><span class="rv mono" data-field="cnpj">'+cnpjFmt+'</span></div><div class="rw"><span class="rk">Status</span><span class="rv grn">'+situacaoFmt+'</span></div><div class="rw"><span class="rk">Endere&ccedil;o</span><span class="rv">'+enderFmt+'</span></div><div class="rw"><span class="rk">Bairro</span><span class="rv">'+bairroFmt+'</span></div><div class="rw"><span class="rk">Munic&iacute;pio/UF</span><span class="rv">'+munFmt+'/'+ufFmt+'</span></div><div class="rw"><span class="rk">CEP</span><span class="rv">'+cepFmt+'</span></div><div class="rw"><span class="rk">Email</span><span class="rv">'+(emailFmt||'N/A')+'</span></div>'+(atividadeFmt?'<div class="rw"><span class="rk">Atividade</span><span class="rv">'+atividadeFmt+'</span></div>':'')+'</div><div class="cd"><h2>Canal WhatsApp</h2>'+(phoneFmt?'<p style="font-family:monospace;color:'+pal.ac+';font-size:1.1rem;font-weight:700;margin-bottom:6px" data-field="phone">'+phoneFmt+'</p>':'')+'<p>'+wabaText+'</p><p style="font-size:11px;color:#64748b;margin-top:4px">'+wabaFoot+'</p></div><div class="cd"><h2>Sobre</h2><p>'+sob+'</p></div><div class="cd"><h2>Compliance</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="cd"><h2>Privacidade &amp; Termos</h2><p>'+priv+'</p><p style="margin-top:8px">'+term+'</p></div></div><div class="ft">'+razaoFmt+' &mdash; '+cnpjFmt+'</div>'+domScript+'</body></html>';
  }

  // -- FALLBACK: layout simples --
  else {
    var cssFb = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:'+font+';background:#fff;color:#111;min-height:100vh;font-size:15px;line-height:1.7}.fb-wrap{max-width:700px;margin:0 auto;padding:36px 24px}.fb-hdr{text-align:center;margin-bottom:28px;padding-bottom:18px;border-bottom:2px solid '+pal.ac+'}.fb-hdr h1{font-size:1.8rem;font-weight:900}.fb-hdr .fb-sub{font-family:"Courier New",monospace;font-size:13px;color:'+pal.ac+';margin-top:4px}.fb-phone{text-align:center;font-family:"Courier New",monospace;font-size:1.4rem;color:'+pal.ac+';font-weight:900;margin-bottom:24px}.fb-sec{margin-bottom:22px}.fb-sec h2{font-size:13px;font-weight:700;color:'+pal.ac+';text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #e5e7eb}.fb-row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f3f4f6;flex-wrap:wrap;gap:4px}.fb-row:last-child{border-bottom:none}.fb-rk{font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase}.fb-rv{font-size:14px;font-weight:600;color:#111}.fb-mono{font-family:"Courier New",monospace;color:'+pal.ac+'}.fb-grn{color:#059669}.fb-sec p{font-size:14px;color:#374151;line-height:1.8}.fb-sec ul{list-style:none}.fb-sec li{font-size:14px;color:#374151;line-height:2;padding-left:14px;position:relative}.fb-sec li::before{content:"\\2022";position:absolute;left:0;color:'+pal.ac+'}.fb-foot{text-align:center;padding:16px;font-size:11px;color:#6b7280;border-top:1px solid #e5e7eb;margin-top:16px}';
    return headHtml+'<style>'+cssFb+'</style></head><body><div class="fb-wrap"><div class="fb-hdr"><h1 data-field="razao">'+razaoFmt+'</h1><div class="fb-sub" data-field="cnpj">'+cnpjFmt+'</div></div>'+(phoneFmt?'<div class="fb-phone" data-field="phone">'+phoneFmt+'</div>':'')+'<div class="fb-sec"><h2>Dados</h2><div class="fb-row"><span class="fb-rk">Raz&atilde;o Social</span><span class="fb-rv" data-field="razao">'+razaoFmt+'</span></div><div class="fb-row"><span class="fb-rk">CNPJ</span><span class="fb-rv fb-mono" data-field="cnpj">'+cnpjFmt+'</span></div><div class="fb-row"><span class="fb-rk">Situa&ccedil;&atilde;o</span><span class="fb-rv fb-grn">'+situacaoFmt+'</span></div><div class="fb-row"><span class="fb-rk">Endere&ccedil;o</span><span class="fb-rv">'+enderFmt+'</span></div><div class="fb-row"><span class="fb-rk">Bairro</span><span class="fb-rv">'+bairroFmt+'</span></div><div class="fb-row"><span class="fb-rk">Munic&iacute;pio/UF</span><span class="fb-rv">'+munFmt+'/'+ufFmt+'</span></div><div class="fb-row"><span class="fb-rk">CEP</span><span class="fb-rv">'+cepFmt+'</span></div><div class="fb-row"><span class="fb-rk">Email</span><span class="fb-rv">'+(emailFmt||'N/A')+'</span></div>'+(atividadeFmt?'<div class="fb-row"><span class="fb-rk">CNAE</span><span class="fb-rv">'+atividadeFmt+'</span></div>':'')+'</div><div class="fb-sec"><h2>Canal WABA</h2>'+(phoneFmt?'<p style="font-family:monospace;color:'+pal.ac+';font-weight:700;margin-bottom:6px" data-field="phone">'+phoneFmt+'</p>':'')+'<p>'+wabaText+'</p><p style="font-size:11px;color:#6b7280;margin-top:4px">'+wabaFoot+'</p></div><div class="fb-sec"><h2>Sobre</h2><p>'+sob+'</p></div><div class="fb-sec"><h2>Compliance</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div><div class="fb-sec"><h2>Privacidade</h2><p>'+priv+'</p></div><div class="fb-sec"><h2>Termos</h2><p>'+term+'</p></div><div class="fb-foot">'+razaoFmt+' &mdash; '+cnpjFmt+'</div></div>'+domScript+'</body></html>';
  }
}


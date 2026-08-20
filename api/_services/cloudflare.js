const axios = require('axios');
const env = require('../_lib/env');

// â”€â”€â”€ Cloudflare Workers AI â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Gera texto personalizado para a landing page usando Llama via Workers AI.
 * Retorna objeto { tagline, descricao, antiSpam } ou valores padrÃ£o se falhar.
 */
async function generateAiContent({ razaoSocial, atividadePrincipal, municipio, uf, smsPhone }) {
  try {
    const prompt = `VocÃª Ã© um especialista em comunicaÃ§Ã£o corporativa brasileira.
Crie conteÃºdo para uma landing page institucional da empresa "${razaoSocial}" (${atividadePrincipal || 'empresa'}) localizada em ${municipio || 'Brasil'}${uf ? `/${uf}` : ''}.
${smsPhone ? `O nÃºmero oficial de WhatsApp Ã© ${smsPhone}.` : ''}

Retorne APENAS um JSON vÃ¡lido com exatamente estas 3 chaves (sem markdown, sem explicaÃ§Ãµes):
{
  "tagline": "slogan curto e profissional da empresa (mÃ¡x 10 palavras)",
  "descricao": "frase de apresentaÃ§Ã£o institucional (mÃ¡x 20 palavras, formal)",
  "antiSpam": "texto de 2 frases explicando que o WhatsApp Ã© apenas para atendimento receptivo e nÃ£o faz spam"
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
        tagline:  parsed.tagline  || 'Portal de Autoatendimento e InformaÃ§Ãµes Cadastrais',
        descricao: parsed.descricao || 'SoluÃ§Ãµes empresariais com transparÃªncia e qualidade.',
        antiSpam: parsed.antiSpam  || 'Nosso canal Ã© exclusivo para atendimento receptivo. NÃ£o realizamos spam ou telemarketing.',
      };
    }
  } catch { /* fallback se IA falhar */ }

  return {
    tagline:  'Portal de Autoatendimento e InformaÃ§Ãµes Cadastrais',
    descricao: 'Atendimento receptivo e soluÃ§Ãµes empresariais com transparÃªncia.',
    antiSpam: 'Nosso canal de WhatsApp destina-se exclusivamente ao atendimento receptivo de clientes. NÃ£o realizamos spam ou contatos nÃ£o solicitados.',
  };
}

// â”€â”€â”€ Gerador de site COMPLETO via IA (layout Ãºnico a cada chamada) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function generateFullSiteHtml(params) {
  // Usa diretamente os templates estÃ¡ticos novos (validados pela Meta)
  // Gemini desabilitado â€” gerava templates inconsistentes que nÃ£o passavam na verificaÃ§Ã£o
  return buildLandingHtml(params);
}

// â”€â”€â”€ Templates de cores â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = n => { const k = (n + h / 30) % 12; const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1); return Math.round(255 * c).toString(16).padStart(2, '0'); };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function getTemplate() {
  // Gera paleta de cores 100% aleatÃ³ria a cada chamada (nunca repete)
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

// â”€â”€â”€ API Client â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€â”€ Zones (legado, mantido para compatibilidade) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€â”€ Workers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Gera o slug do subdomÃ­nio a partir da razÃ£o social.
 * Adiciona sufixo aleatÃ³rio de 3 chars pra garantir unicidade.
 * Ex: "ROBERTA PORTO DE ANDRADE" â†’ "robertaporto-x7k"
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
 * Regras de validaÃ§Ã£o Meta aplicadas:
 *  - Telefone exibido em 3 locais distintos (nav, hero/grid, seÃ§Ã£o WABA)
 *  - DOM injetado via JS (data-attributes + createElement)
 *  - Variabilidade total (cores, textos, labels, ordem, nomes de seÃ§Ãµes)
 *  - Compliance (WABA Utility, receptivo, LGPD, sem spam, Meta Platforms)
 *
 * FamÃ­lias visuais:
 *  A (0-24):  Painel Telemetria â€” nav + hero centralizado + grid 2col + sidebar WABA
 *  B (25-49): Terminal NOC â€” barra status + grid dados + seÃ§Ã£o compliance + footer
 *  C (50-73): Dashboard Split â€” sidebar fixa + main scrollable + banner WABA
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
  const enderFmt = esc((endereco||'') + (numero ? ', nÂº '+numero : ''));
  const bairroFmt = esc(bairro||'');
  const munFmt = esc(municipio||'');
  const ufFmt = esc(uf||'');
  const porteFmt = esc(porte || '');
  const natJurFmt = esc(naturezaJuridica || '');
  const cnaeCodeFmt = esc(cnaeCode || '');
  const cnaeDescFmt = esc(cnaeDesc || '');
  const areaLabel = atividadeFmt || cnaeDescFmt || 'Atividade Empresarial';
  const fullAddress = enderFmt+(bairroFmt?' â€” '+bairroFmt:'')+' â€” '+munFmt+'/'+ufFmt+(cepFmt?' â€” CEP '+cepFmt:'');

  const templateIndex = (typeof forceTemplateIndex === 'number') ? forceTemplateIndex : Math.floor(Math.random() * 8);
  console.log('[buildLandingHtml] CNPJ='+cnpj+' templateIndex='+templateIndex+' forced='+(typeof forceTemplateIndex === 'number'));

  const ogTags = '<meta property="og:type" content="website" />'+
    '<meta property="og:title" content="'+razaoFmt+'" />'+
    '<meta property="og:site_name" content="'+razaoFmt+'" />'+
    '<meta property="og:description" content="'+razaoFmt+' â€” CNPJ '+cnpjFmt+'. Empresa registrada, canal oficial de atendimento receptivo." />'+
    '<meta name="description" content="'+razaoFmt+' â€” CNPJ '+cnpjFmt+'. Empresa regularmente constituÃ­da." />'+
    '<meta name="author" content="'+razaoFmt+'" />'+
    '<meta name="company" content="'+razaoFmt+'" />';

  const vi = templateIndex % 7;

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // TEXTOS VARIÃVEIS â€” 7 versÃµes pra mÃ¡xima variabilidade
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  const _sobreV = [
    function(n){ return n+' conduz suas atividades com compromisso Ã©tico e profissionalismo, disponibilizando canal verificado de WhatsApp Business exclusivamente para demandas originadas pelo consumidor final, em total aderÃªncia Ã s normas da Meta Platforms.'; },
    function(n){ return 'A organizaÃ§Ã£o '+n+' promove atendimento consultivo e receptivo por meio de EMAIL certificado, obedecendo integralmente Ã s polÃ­ticas vigentes da Meta e Ã  legislaÃ§Ã£o brasileira de proteÃ§Ã£o de dados.'; },
    function(n){ return n+' possui registro ativo junto aos Ã³rgÃ£os competentes, operando canal de mensageria WhatsApp Business destinado Ã  resoluÃ§Ã£o de consultas e prestaÃ§Ã£o de informaÃ§Ãµes sob demanda do cliente.'; },
    function(n){ return 'ConstituÃ­da nos termos da legislaÃ§Ã£o vigente, '+n+' mantÃ©m ponto de contato digital via WhatsApp Business para atendimento consultivo, sem qualquer prÃ¡tica de comunicaÃ§Ã£o ativa nÃ£o autorizada.'; },
    function(n){ return n+' viabiliza canal institucional de suporte ao consumidor, restrito a interaÃ§Ãµes iniciadas voluntariamente pelo titular, sem envio de comunicaÃ§Ãµes promocionais ou nÃ£o requisitadas.'; },
    function(n){ return 'Atuando de forma regular e transparente, '+n+' oferece ponto de atendimento receptivo via WhatsApp Business API, direcionado exclusivamente a solicitaÃ§Ãµes espontÃ¢neas de clientes e parceiros.'; },
    function(n){ return n+' gerencia canal corporativo de WhatsApp Business orientado ao suporte informativo e operacional, atendendo exclusivamente chamados voluntÃ¡rios do consumidor, conforme regulamento Meta e LGPD.'; },
  ];
  const _atendV = [
    ['Toda interaÃ§Ã£o parte do prÃ³prio consumidor.','Respondemos exclusivamente nos canais homologados.','Vedado qualquer disparo ou abordagem ativa.','Conformidade integral com WhatsApp Business API e Meta.'],
    ['Modalidade de atendimento 100% receptiva.','Processamos somente chamados originados pelo titular.','Proibida utilizaÃ§Ã£o de bases externas ou compradas.','AderÃªncia Ã s diretrizes Meta Platforms e LGPD.'],
    ['O consumidor detÃ©m a iniciativa do contato.','Canal voltado a consultas informativas e suporte.','Nenhuma comunicaÃ§Ã£o enviada sem prÃ©via solicitaÃ§Ã£o.','Conformidade LGPD 13.709/2018 e Meta Platforms.'],
    ['Processamos unicamente requisiÃ§Ãµes recebidas.','OrientaÃ§Ã£o exclusiva para suporte e consultoria receptiva.','Bases de terceiros sÃ£o terminantemente vedadas.','Alinhamento pleno Ã s polÃ­ticas Meta Platforms.'],
    ['Fluxo comunicacional estritamente receptivo.','Respostas limitadas aos canais oficiais verificados.','InexistÃªncia de telemarketing ou envios em massa.','Conforme regulamento WhatsApp Business API.'],
    ['Funcionamento exclusivo sob provocaÃ§Ã£o do cliente.','Canal restrito a esclarecimentos previamente solicitados.','NÃ£o adquirimos mailings nem praticamos cold-outreach.','OperaÃ§Ã£o certificada conforme normas da Meta.'],
    ['InteraÃ§Ã£o condicionada Ã  iniciativa do consumidor.','Nosso protocolo de atendimento Ã© integralmente receptivo.','Zero mensagens expedidas sem consentimento explÃ­cito.','Conformidade plena Meta Platforms, LGPD e WhatsApp ToS.'],
  ];
  const _privV = [
    'InformaÃ§Ãµes fornecidas pelo usuÃ¡rio sÃ£o processadas com finalidade exclusiva de responder Ã  solicitaÃ§Ã£o originada. Vedado compartilhamento com entidades externas. Tratamento conforme LGPD â€” Lei 13.709/2018.',
    'O tratamento de dados pessoais restringe-se ao escopo da consulta efetuada pelo titular. NÃ£o hÃ¡ transferÃªncia a terceiros em nenhuma hipÃ³tese. Base legal: Art. 7, I â€” LGPD.',
    'Dados informados durante o atendimento sÃ£o armazenados com seguranÃ§a e utilizados apenas para a finalidade declarada. Proibido repasse externo. Conformidade Lei 13.709/2018.',
    'As informaÃ§Ãµes pessoais do consumidor recebem tratamento sigiloso, limitado Ã  prestaÃ§Ã£o do serviÃ§o requisitado. Inexiste compartilhamento com terceiros. LGPD vigente.',
    'Asseguramos proteÃ§Ã£o integral aos dados pessoais coletados, empregados unicamente no contexto da interaÃ§Ã£o solicitada pelo titular. Sem cessÃ£o a terceiros. LGPD 13.709/2018.',
    'Dados pessoais tratados exclusivamente para fins de atendimento receptivo ao titular. Compartilhamento externo vedado em qualquer circunstÃ¢ncia. FundamentaÃ§Ã£o: Art. 7, I e Art. 6, I â€” LGPD.',
    'Toda informaÃ§Ã£o disponibilizada pelo consumidor Ã© processada com sigilo absoluto, destinada unicamente ao atendimento da demanda apresentada. Sem repasse. Lei 13.709/2018 â€” LGPD.',
  ];
  const _termV = [
    'Ao acionar este canal, o consumidor ratifica que a comunicaÃ§Ã£o foi iniciada por sua livre vontade. A empresa nÃ£o pratica contatos proativos ou promocionais nÃ£o solicitados. Diretrizes Meta Platforms.',
    'O titular, ao interagir neste ambiente, confirma iniciativa prÃ³pria e voluntÃ¡ria. ComunicaÃ§Ãµes promocionais sem prÃ©via autorizaÃ§Ã£o sÃ£o terminantemente vedadas. PolÃ­ticas Meta e LGPD.',
    'A utilizaÃ§Ã£o deste canal pressupÃµe iniciativa espontÃ¢nea do usuÃ¡rio. NÃ£o sÃ£o realizadas abordagens ativas, disparos programados ou comunicaÃ§Ãµes nÃ£o requisitadas. Meta Platforms e WhatsApp ToS.',
    'Ao interagir conosco, o cliente declara que tomou a iniciativa do contato de forma voluntÃ¡ria. PromoÃ§Ãµes e mensagens nÃ£o solicitadas sÃ£o vedadas. Conformidade WhatsApp Business e Meta.',
    'O presente canal funciona exclusivamente em modo receptivo. O consumidor que o utiliza consente em receber apenas respostas pertinentes Ã  sua consulta. Vedado spam. Meta Platforms.',
    'O usuÃ¡rio que aciona este serviÃ§o o faz por deliberaÃ§Ã£o prÃ³pria. A organizaÃ§Ã£o nÃ£o efetua contatos ativos, remarketing ou campanhas nÃ£o autorizadas. Conforme polÃ­ticas Meta e LGPD.',
    'Qualquer interaÃ§Ã£o neste canal Ã© condicionada Ã  aÃ§Ã£o voluntÃ¡ria do consumidor final. Proibido envio proativo de ofertas, newsletters ou mensagens nÃ£o previamente solicitadas. Meta Platforms e LGPD.',
  ];

  const sob = _sobreV[vi](razaoFmt);
  const atn = _atendV[vi];
  const priv = _privV[vi];
  const term = _termV[vi];
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // PALETAS â€” 25 por famÃ­lia, todas dark, todas Ãºnicas
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // LABELS VARIÃVEIS pra seÃ§Ãµes (nunca repetidos na mesma posiÃ§Ã£o)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // WABA TEXT VARIANTS
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  var _wabaText = [
    'Infraestrutura de mensageria operando em modo Utility receptivo. Dedicada ao processamento de confirmaÃ§Ãµes transacionais, alertas de sistema e respostas a chamados do consumidor.',
    'Canal certificado para atendimento de solicitaÃ§Ãµes originadas pelo titular. Categoria Utility â€” proibido envio proativo de qualquer natureza. AderÃªncia total Ã s polÃ­ticas WhatsApp Business API.',
    'Endpoint de comunicaÃ§Ã£o receptiva homologado. Finalidade exclusiva: responder consultas voluntÃ¡rias do consumidor final. ComunicaÃ§Ãµes promocionais ou nÃ£o requisitadas sÃ£o bloqueadas.',
    'Rota Utility receptiva em operaÃ§Ã£o. TrÃ¡fego limitado a requisiÃ§Ãµes originadas pelo titular dos dados. Vedado marketing, cold-messaging e disparos automatizados.',
    'Canal direcionado ao suporte receptivo e notificaÃ§Ãµes transacionais autorizadas. Nenhuma mensagem Ã© expedida sem provocaÃ§Ã£o prÃ©via do consumidor. Protocolo Utility em vigor.',
    'Linha de comunicaÃ§Ã£o Utility â€” exclusiva para respostas a demandas do consumidor final. Campanhas B2C e envios nÃ£o consentidos sÃ£o terminantemente bloqueados. Conformidade Meta e LGPD.',
    'Ponto de atendimento receptivo certificado. Processamento restrito a solicitaÃ§Ãµes voluntÃ¡rias do titular. Canal Utility sem capacidade de broadcast. Conformidade WhatsApp Business API.',
  ];
  var _wabaFoot = [
    'Interdito envio massivo. Sem campanhas B2C ou remarketing. Conformidade LGPD e regulamento WhatsApp Business API.',
    'Proibido cold-messaging. Sem aquisiÃ§Ã£o de mailings. OperaÃ§Ã£o conforme diretrizes Meta Platforms e Lei 13.709/2018.',
    'Vedado envio ativo nÃ£o autorizado. Sem telemarketing digital. AderÃªncia plena a Meta Business e LGPD 13.709/2018.',
    'Zero broadcasts ativos. Sem comunicaÃ§Ã£o nÃ£o consentida. Conformidade WhatsApp Business API e legislaÃ§Ã£o LGPD.',
    'Sem notificaÃ§Ãµes push nÃ£o autorizadas. Sem marketing direto. LGPD e Meta Platforms em total conformidade.',
    'Bloqueado envio sem consentimento prÃ©vio. Canal integralmente receptivo. Conforme LGPD e Termos de ServiÃ§o Meta.',
    'Nenhuma expediÃ§Ã£o sem prÃ©via autorizaÃ§Ã£o do titular. Canal Utility regulamentado. Meta Platforms + LGPD vigente.',
  ];
  var wabaText = _wabaText[vi];
  var wabaFoot = _wabaFoot[vi];

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // SCRIPT DE DOM INJECTION (telefone + razÃ£o em data-attributes via JS)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  var domScript = '<script>'+
    '(function(){'+
    'var d=document;'+
    'var p=d.createElement("span");p.setAttribute("data-waba-phone","'+phoneFmt+'");p.style.display="none";d.body.appendChild(p);'+
    'var r=d.createElement("span");r.setAttribute("data-company-name","'+razaoFmt+'");r.setAttribute("data-cnpj","'+cnpjFmt+'");r.style.display="none";d.body.appendChild(r);'+
    'var els=d.querySelectorAll("[data-field]");for(var i=0;i<els.length;i++){var f=els[i].getAttribute("data-field");if(f==="phone")els[i].textContent="'+phoneFmt+'";if(f==="razao")els[i].textContent="'+razaoFmt+'";if(f==="cnpj")els[i].textContent="'+cnpjFmt+'";}'+
    '})();'+
    '<\/script>';

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // Texto institucional B2B
  // 5 LAYOUTS corporativos â€” rotaÃ§Ã£o por templateIndex % 5
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  var layoutType = templateIndex % 15; // 15 estruturas completamente diferentes (respeita forceTemplateIndex)

  var accents = ['#1e40af','#047857','#a16207','#6d28d9','#b91c1c','#0e7490','#a21caf','#d97706','#3730a3','#166534','#c2410c','#5b21b6','#155e75','#9f1239','#065f46','#92400e','#1d4ed8','#15803d','#7c3aed','#b45309','#0891b2','#4f46e5','#dc2626','#059669','#7e22ce','#ea580c','#0284c7','#be123c','#0d9488','#6366f1','#ca8a04','#db2777','#2563eb','#16a34a','#9333ea','#e11d48'];
  var ac = accents[Math.floor(Math.random() * accents.length)];
  var pal = {ac: ac, bg: '#ffffff', bg2: '#f8fafc', txt: '#111827'};

  var fonts = [
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
    'Georgia,"Times New Roman",serif',
    '"Inter",system-ui,sans-serif',
    '"Roboto Slab",Georgia,serif',
    '"Source Sans Pro","Helvetica Neue",system-ui,sans-serif',
    '"Playfair Display",Georgia,serif',
    '"Fira Sans","Segoe UI",system-ui,sans-serif',
    '"Merriweather",Georgia,serif',
    '"Nunito Sans","Helvetica Neue",system-ui,sans-serif',
    '"Montserrat",system-ui,sans-serif',
  ];
  var font = fonts[Math.floor(Math.random() * fonts.length)];

  // Dados extras pra validaÃ§Ã£o Meta
  var porteInfo = porteFmt ? '<div class="rw"><span class="rk">Porte</span><span class="rv">'+porteFmt+'</span></div>' : '';
  var natJurInfo = natJurFmt ? '<div class="rw"><span class="rk">Natureza Jur&iacute;dica</span><span class="rv">'+natJurFmt+'</span></div>' : '';
  var cnaeInfo = atividadeFmt ? '<div class="rw"><span class="rk">CNAE</span><span class="rv">'+atividadeFmt+'</span></div>' : '';
  var porteInfoTd = porteFmt ? '<tr><td>Porte</td><td>'+porteFmt+'</td></tr>' : '';
  var natJurInfoTd = natJurFmt ? '<tr><td>Natureza Jur&iacute;dica</td><td>'+natJurFmt+'</td></tr>' : '';
  var cnaeInfoTd = atividadeFmt ? '<tr><td>CNAE</td><td>'+atividadeFmt+'</td></tr>' : '';

  var headHtml = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">'+metaTag+ogTags+'<title>'+razaoFmt+'</title>';

  // Variantes de estrutura â€” dados aparecem de forma natural, nÃ£o como ficha
  var vi2 = templateIndex % 7;

  // SeÃ§Ã£o "sobre" que incorpora dados naturalmente
  var aboutNatural = [
    '<p>'+razaoFmt+' (CNPJ '+cnpjFmt+') &eacute; uma empresa com sede em '+munFmt+'/'+ufFmt+', inscrita e regular junto &agrave; Receita Federal, com situa&ccedil;&atilde;o cadastral '+situacaoFmt+'. '+(atividadeFmt?'Atua no segmento de '+atividadeFmt+'. ':'')+'Mant&eacute;m canal de atendimento via WhatsApp Business exclusivamente para demandas receptivas.</p>',
    '<p>Somos a '+razaoFmt+', empresa brasileira registrada sob o CNPJ '+cnpjFmt+', localizada em '+munFmt+' &mdash; '+ufFmt+'. '+(atividadeFmt?'Nossa atividade principal &eacute; '+atividadeFmt+'. ':'')+'Operamos em conformidade com a legisla&ccedil;&atilde;o vigente e as pol&iacute;ticas da Meta Platforms.</p>',
    '<p>A '+razaoFmt+' &eacute; pessoa jur&iacute;dica regularmente constitu&iacute;da (CNPJ '+cnpjFmt+'), com domic&iacute;lio em '+fullAddress+'. '+(atividadeFmt?'Segmento: '+atividadeFmt+'. ':'')+'Nosso canal digital destina-se ao suporte informativo e atendimento ao cliente.</p>',
    '<p>Fundada e sediada em '+munFmt+'/'+ufFmt+', a '+razaoFmt+' (CNPJ: '+cnpjFmt+') mant&eacute;m atividades regulares no mercado brasileiro. '+(atividadeFmt?'&Aacute;rea de atua&ccedil;&atilde;o: '+atividadeFmt+'. ':'')+'Disponibilizamos atendimento receptivo via WhatsApp para nossos clientes e parceiros.</p>',
    '<p>'+razaoFmt+' &mdash; CNPJ '+cnpjFmt+' &mdash; &eacute; empresa ativa, com base operacional em '+munFmt+'/'+ufFmt+'. '+(atividadeFmt?'Ramo: '+atividadeFmt+'. ':'')+'O contato via WhatsApp Business &eacute; destinado exclusivamente ao atendimento de solicita&ccedil;&otilde;es volunt&aacute;rias.</p>',
    '<p>Com registro ativo na Receita Federal sob CNPJ '+cnpjFmt+', a '+razaoFmt+' opera em '+munFmt+'/'+ufFmt+(atividadeFmt?' no segmento de '+atividadeFmt:'')+'. Nosso compromisso &eacute; oferecer atendimento transparente e receptivo atrav&eacute;s de canais digitais oficiais.</p>',
    '<p>Empresa '+razaoFmt+', inscrita no CNPJ '+cnpjFmt+', com endere&ccedil;o em '+fullAddress+'. '+(atividadeFmt?'Atividade econ&ocirc;mica: '+atividadeFmt+'. ':'')+'Atendemos exclusivamente por demanda do pr&oacute;prio cliente, sem pr&aacute;ticas de contato ativo.</p>',
  ][vi2];

  // SeÃ§Ã£o contato/whatsapp natural
  var contactNatural = (phoneFmt ? '<p>Para entrar em contato, utilize nosso WhatsApp Business: <strong>'+phoneFmt+'</strong>. Este canal opera exclusivamente de forma receptiva &mdash; apenas respondemos mensagens iniciadas pelo pr&oacute;prio cliente.</p>' : '')+'<p>'+wabaText+'</p><p><small>'+wabaFoot+'</small></p>';

  // Compliance compacto
  var complianceCompact = '<p>'+sob+'</p><p><em>Diretrizes: </em>'+atn.join(' ') +'</p><p><small>Privacidade: '+priv+'</small></p><p><small>Termos: '+term+'</small></p>';

  // Dados em formato de tabela (pra layouts que usam tabela)
  var tblData = '<table><tr><td>Raz&atilde;o Social</td><td>'+razaoFmt+'</td></tr><tr><td>CNPJ</td><td>'+cnpjFmt+'</td></tr><tr><td>Situa&ccedil;&atilde;o</td><td>'+situacaoFmt+'</td></tr>'+(porteFmt?'<tr><td>Porte</td><td>'+porteFmt+'</td></tr>':'')+(natJurFmt?'<tr><td>Natureza Jur&iacute;dica</td><td>'+natJurFmt+'</td></tr>':'')+'<tr><td>Endere&ccedil;o</td><td>'+fullAddress+'</td></tr>'+(emailFmt?'<tr><td>Email</td><td>'+emailFmt+'</td></tr>':'')+(atividadeFmt?'<tr><td>Atividade</td><td>'+atividadeFmt+'</td></tr>':'')+(phoneFmt?'<tr><td>WhatsApp</td><td>'+phoneFmt+'</td></tr>':'')+'</table>';

  // ═══════ 15 LAYOUTS PROFISSIONAIS DISTINTOS ═══════
  var rPick = function(arr) { return arr[Math.floor(Math.random() * arr.length)]; };
    var structType = layoutType;

    // ─── TEMPLATE 0: ESCRITÓRIO JURÍDICO ───
    if (structType === 0) {
      var css='*{margin:0;padding:0;box-sizing:border-box}body{font-family:Georgia,"Times New Roman",serif;background:#fff;color:#2d2d2d;line-height:1.8;font-size:17px}.header-jur{padding:48px 40px 36px;border-bottom:4px solid #8b6914;text-align:center}.header-jur h1{font-size:2.4rem;font-weight:700;color:#1a1a1a;letter-spacing:-1px;margin-bottom:8px}@media(max-width:768px){.header-jur h1{font-size:1.8rem}}.header-jur .sub{font-size:14px;color:#666;margin-bottom:16px}'+(phoneFmt?'.header-jur .phone-bar{margin-top:16px;font-size:1.2rem;color:#8b6914;font-weight:700}':'')+ '.main-jur{max-width:800px;margin:0 auto;padding:48px 32px}.section-jur{margin-bottom:40px;padding-bottom:32px;border-bottom:1px solid #e8e0d0}.section-jur:last-child{border-bottom:none}.section-jur h2{font-size:1.1rem;color:#8b6914;text-transform:uppercase;letter-spacing:2px;margin-bottom:16px;font-weight:600}p{margin-bottom:12px;color:#444}strong{color:#1a1a1a}small{color:#777;font-size:14px}table{width:100%;border-collapse:collapse;margin:12px 0}td{padding:12px 10px;border-bottom:1px solid #e8e0d0;font-size:15px;color:#333}td:first-child{font-weight:700;color:#8b6914;width:160px;font-size:12px;text-transform:uppercase;letter-spacing:.5px}footer{text-align:center;padding:32px;font-size:13px;color:#999;border-top:2px solid #8b6914}';
      return headHtml+'<style>'+css+'</style></head><body><div class="header-jur"><h1 data-field="razao">'+razaoFmt+'</h1><p class="sub">'+(atividadeFmt||'Assessoria Empresarial')+' &mdash; '+munFmt+'/'+ufFmt+'</p><p class="sub">CNPJ '+cnpjFmt+'</p>'+(phoneFmt?'<p class="phone-bar" data-field="phone">&#9742; '+phoneFmt+'</p>':'')+'</div><div class="main-jur"><div class="section-jur"><h2>Sobre a Empresa</h2>'+aboutNatural+'</div><div class="section-jur"><h2>Dados Cadastrais</h2>'+tblData+'</div><div class="section-jur"><h2>Canal de Atendimento</h2>'+contactNatural+'</div>'+(phoneFmt?'<div class="section-jur"><h2>WhatsApp Business</h2><p style="font-size:1.3rem;color:#8b6914;font-weight:700" data-field="phone">'+phoneFmt+'</p><p><small>Atendimento exclusivamente receptivo</small></p></div>':'')+'<div class="section-jur"><h2>Conformidade</h2>'+complianceCompact+'</div></div><footer>'+razaoFmt+' &mdash; CNPJ '+cnpjFmt+' &mdash; '+munFmt+'/'+ufFmt+'</footer>'+domScript+'</body></html>';
    }

    // ─── TEMPLATE 1: CLÍNICA MÉDICA ───
    else if (structType === 1) {
      var css='*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:linear-gradient(180deg,#f0f7ff 0%,#fff 40%);color:#1e293b;line-height:1.8;font-size:17px}.top-med{background:#fff;padding:24px 32px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e2e8f0;box-shadow:0 1px 3px rgba(0,0,0,.05)}.top-med .brand{font-size:1.2rem;font-weight:700;color:#1e40af}.top-med .contact{font-size:14px;color:#64748b}.hero-med{padding:64px 32px;text-align:center;background:linear-gradient(135deg,#eff6ff 0%,#dbeafe 100%);border-bottom:1px solid #bfdbfe}h1{font-size:2.4rem;font-weight:800;color:#1e293b;margin-bottom:10px}@media(max-width:768px){h1{font-size:1.8rem}}.hero-med .desc{color:#475569;font-size:1rem;margin-bottom:20px}'+(phoneFmt?'.hero-med .cta-phone{display:inline-block;background:#1e40af;color:#fff;padding:14px 36px;border-radius:8px;font-size:1.1rem;font-weight:700;text-decoration:none}':'')+ '.cards-med{max-width:900px;margin:0 auto;padding:48px 24px;display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px}.card-med{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:28px;box-shadow:0 2px 8px rgba(0,0,0,.04)}.card-med h2{font-size:13px;text-transform:uppercase;letter-spacing:1.5px;color:#1e40af;margin-bottom:14px;font-weight:700}p{margin-bottom:12px;color:#475569}strong{color:#1e293b}small{color:#64748b;font-size:14px}table{width:100%;border-collapse:collapse;margin:12px 0}td{padding:12px 10px;border-bottom:1px solid #f1f5f9;font-size:15px;color:#334155}td:first-child{font-weight:700;color:#1e40af;width:150px;font-size:12px;text-transform:uppercase;letter-spacing:.5px}footer{text-align:center;padding:32px;font-size:13px;color:#94a3b8;background:#f8fafc;border-top:1px solid #e2e8f0}';
      return headHtml+'<style>'+css+'</style></head><body><div class="top-med"><span class="brand">'+razaoFmt+'</span><span class="contact">'+(phoneFmt?'<span data-field="phone">'+phoneFmt+'</span>':'')+'</span></div><div class="hero-med"><h1 data-field="razao">'+razaoFmt+'</h1><p class="desc">'+(atividadeFmt||'Atendimento Especializado')+' &mdash; '+munFmt+'/'+ufFmt+'</p>'+(phoneFmt?'<a class="cta-phone" data-field="phone">&#9742; '+phoneFmt+'</a>':'')+'</div><div class="cards-med"><div class="card-med"><h2>&#127973; Sobre N&oacute;s</h2>'+aboutNatural+'</div><div class="card-med"><h2>&#128203; Dados Cadastrais</h2>'+tblData+'</div><div class="card-med"><h2>&#128222; Atendimento</h2>'+contactNatural+'</div><div class="card-med"><h2>&#128274; Privacidade</h2>'+complianceCompact+'</div></div><footer data-field="cnpj">'+razaoFmt+' &mdash; CNPJ '+cnpjFmt+' &mdash; '+munFmt+'/'+ufFmt+'</footer>'+domScript+'</body></html>';
    }

    // ─── TEMPLATE 2: CONSULTORIA EMPRESARIAL (DARK + VERDE ESMERALDA) ───
    else if (structType === 2) {
      var css='*{margin:0;padding:0;box-sizing:border-box}body{font-family:"Inter",system-ui,sans-serif;background:#0f1419;color:#e2e8f0;line-height:1.8;font-size:17px}.hero-cons{padding:80px 32px 60px;text-align:center;background:linear-gradient(160deg,#0f1419 0%,#064e3b22 50%,#0f1419 100%)}h1{font-size:3rem;font-weight:900;color:#fff;letter-spacing:-2px;margin-bottom:12px}@media(max-width:768px){h1{font-size:2rem}}.hero-cons .sub{color:#6ee7b7;font-size:1rem}'+(phoneFmt?'.hero-cons .phone-cta{display:inline-block;margin-top:24px;background:#059669;color:#fff;padding:16px 40px;border-radius:10px;font-size:1.2rem;font-weight:700;text-decoration:none;box-shadow:0 4px 20px rgba(5,150,105,.3)}':'')+ '.grid-cons{max-width:960px;margin:0 auto;padding:48px 24px;display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:24px}.glass-card{background:rgba(255,255,255,.03);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:32px}.glass-card h2{font-size:13px;text-transform:uppercase;letter-spacing:2px;color:#6ee7b7;margin-bottom:16px;font-weight:700}p{margin-bottom:12px;color:#94a3b8}strong{color:#e5e7eb}small{color:#475569;font-size:14px}table{width:100%;border-collapse:collapse;margin:12px 0}td{padding:12px 10px;border-bottom:1px solid rgba(255,255,255,.06);font-size:15px;color:#cbd5e1}td:first-child{font-weight:700;color:#6ee7b7;width:155px;font-size:12px;text-transform:uppercase;letter-spacing:.5px}footer{text-align:center;padding:32px;font-size:13px;color:#475569;border-top:1px solid #1e293b}';
      return headHtml+'<style>'+css+'</style></head><body><div class="hero-cons"><h1 data-field="razao">'+razaoFmt+'</h1><p class="sub">'+(atividadeFmt||'Consultoria Estrat&eacute;gica')+' &mdash; '+munFmt+'/'+ufFmt+' &mdash; CNPJ '+cnpjFmt+'</p>'+(phoneFmt?'<a class="phone-cta" data-field="phone">&#9742; '+phoneFmt+'</a>':'')+'</div><div class="grid-cons"><div class="glass-card"><h2>A Empresa</h2>'+aboutNatural+'</div><div class="glass-card"><h2>Dados Oficiais</h2>'+tblData+'</div><div class="glass-card"><h2>Canal WhatsApp</h2>'+contactNatural+'</div><div class="glass-card"><h2>Compliance &amp; LGPD</h2>'+complianceCompact+'</div></div>'+(phoneFmt?'<div style="text-align:center;padding:32px;color:#6ee7b7;font-size:1.1rem;font-weight:700"><span data-field="phone">&#9742; '+phoneFmt+'</span></div>':'')+'<footer>'+razaoFmt+' &mdash; CNPJ '+cnpjFmt+'</footer>'+domScript+'</body></html>';
    }

    // ─── TEMPLATE 3: CONTABILIDADE (CREME/BEGE + AZUL-MARINHO) ───
    else if (structType === 3) {
      var css='*{margin:0;padding:0;box-sizing:border-box}body{font-family:"Source Sans Pro","Helvetica Neue",sans-serif;background:#faf8f5;color:#1e293b;line-height:1.8;font-size:17px}.nav-cont{background:#1e3a5f;padding:16px 32px;display:flex;justify-content:space-between;align-items:center}.nav-cont .logo{color:#fff;font-weight:700;font-size:1.1rem}.nav-cont .info{color:#93c5fd;font-size:13px}.banner-cont{background:#f5f0e8;padding:48px 32px;text-align:center;border-bottom:2px solid #d4c5a9}h1{font-size:2.2rem;font-weight:800;color:#1e3a5f;margin-bottom:8px}@media(max-width:768px){h1{font-size:1.7rem}}.banner-cont .sub{color:#64748b;font-size:15px}'+(phoneFmt?'.banner-cont .phone-info{margin-top:16px;font-size:1.2rem;color:#1e3a5f;font-weight:700}':'')+ '.content-cont{max-width:860px;margin:0 auto;padding:48px 32px}.block-cont{background:#fff;border:1px solid #e8e0d0;border-radius:8px;padding:28px;margin-bottom:24px;box-shadow:0 1px 4px rgba(0,0,0,.04)}.block-cont h2{font-size:14px;text-transform:uppercase;letter-spacing:1.5px;color:#1e3a5f;margin-bottom:14px;font-weight:700;padding-bottom:10px;border-bottom:1px solid #e8e0d0}p{margin-bottom:12px;color:#475569}strong{color:#1e293b}small{color:#64748b;font-size:14px}table{width:100%;border-collapse:collapse;margin:12px 0}td{padding:12px 10px;border-bottom:1px solid #f0ebe3;font-size:15px;color:#334155}td:first-child{font-weight:700;color:#1e3a5f;width:160px;font-size:12px;text-transform:uppercase;letter-spacing:.5px}footer{background:#1e3a5f;color:#93c5fd;text-align:center;padding:28px;font-size:13px}';
      return headHtml+'<style>'+css+'</style></head><body><div class="nav-cont"><span class="logo">'+razaoFmt+'</span><span class="info">'+(phoneFmt?'<span data-field="phone">'+phoneFmt+'</span>':''+munFmt+'/'+ufFmt+'')+'</span></div><div class="banner-cont"><h1 data-field="razao">'+razaoFmt+'</h1><p class="sub">'+(atividadeFmt||'Servi&ccedil;os Cont&aacute;beis')+' &mdash; CNPJ '+cnpjFmt+'</p>'+(phoneFmt?'<p class="phone-info" data-field="phone">&#9742; '+phoneFmt+'</p>':'')+'</div><div class="content-cont"><div class="block-cont"><h2>Sobre a Empresa</h2>'+aboutNatural+'</div><div class="block-cont"><h2>Dados Cadastrais</h2>'+tblData+'</div><div class="block-cont"><h2>Atendimento</h2>'+contactNatural+'</div><div class="block-cont"><h2>Pol&iacute;tica de Privacidade</h2>'+complianceCompact+'</div></div><footer>'+razaoFmt+' &mdash; CNPJ '+cnpjFmt+' &mdash; '+munFmt+'/'+ufFmt+'</footer>'+domScript+'</body></html>';
    }

    // ─── TEMPLATE 4: IMOBILIÁRIA (HERO AZUL-ESCURO + ACCENT LARANJA) ───
    else if (structType === 4) {
      var css='*{margin:0;padding:0;box-sizing:border-box}body{font-family:"Nunito Sans","Helvetica Neue",sans-serif;background:#fff;color:#1e293b;line-height:1.8;font-size:17px}.hero-imob{padding:72px 32px;background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%);text-align:center;color:#fff}.hero-imob h1{font-size:2.8rem;font-weight:900;letter-spacing:-1.5px;margin-bottom:10px;color:#fff}@media(max-width:768px){.hero-imob h1{font-size:2rem}}.hero-imob .sub{color:#94a3b8;font-size:15px}'+(phoneFmt?'.hero-imob .cta{display:inline-block;margin-top:24px;background:#ea580c;color:#fff;padding:16px 40px;border-radius:8px;font-size:1.1rem;font-weight:700;text-decoration:none}':'')+ '.content-imob{max-width:960px;margin:0 auto;padding:48px 24px}.cards-imob{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px;margin-bottom:36px}.card-imob{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:28px;box-shadow:0 4px 12px rgba(0,0,0,.06);border-top:4px solid #ea580c}.card-imob h2{font-size:13px;text-transform:uppercase;letter-spacing:1.5px;color:#ea580c;margin-bottom:14px;font-weight:700}p{margin-bottom:12px;color:#475569}strong{color:#1e293b}small{color:#64748b;font-size:14px}table{width:100%;border-collapse:collapse;margin:12px 0}td{padding:12px 10px;border-bottom:1px solid #f1f5f9;font-size:15px;color:#334155}td:first-child{font-weight:700;color:#ea580c;width:155px;font-size:12px;text-transform:uppercase;letter-spacing:.5px}.phone-strip{background:#fff7ed;padding:20px;text-align:center;border-radius:10px;border:1px solid #fed7aa;margin-bottom:24px}.phone-strip span{font-size:1.3rem;color:#ea580c;font-weight:700}footer{background:#0f172a;color:#94a3b8;text-align:center;padding:32px;font-size:13px}';
      return headHtml+'<style>'+css+'</style></head><body><div class="hero-imob"><h1 data-field="razao">'+razaoFmt+'</h1><p class="sub">'+(atividadeFmt||'Neg&oacute;cios Imobili&aacute;rios')+' &mdash; '+munFmt+'/'+ufFmt+' &mdash; CNPJ '+cnpjFmt+'</p>'+(phoneFmt?'<a class="cta" data-field="phone">&#9742; '+phoneFmt+'</a>':'')+'</div><div class="content-imob">'+(phoneFmt?'<div class="phone-strip"><span data-field="phone">&#9742; '+phoneFmt+' &mdash; WhatsApp Business</span></div>':'')+'<div class="cards-imob"><div class="card-imob"><h2>A Empresa</h2>'+aboutNatural+'</div><div class="card-imob"><h2>Registro</h2>'+tblData+'</div><div class="card-imob"><h2>Contato</h2>'+contactNatural+'</div><div class="card-imob"><h2>Conformidade</h2>'+complianceCompact+'</div></div></div><footer>'+razaoFmt+' &mdash; CNPJ '+cnpjFmt+'</footer>'+domScript+'</body></html>';
    }

    // ─── TEMPLATE 5: TECNOLOGIA/STARTUP (DARK + NEON VIOLETA) ───
    else if (structType === 5) {
      var css='*{margin:0;padding:0;box-sizing:border-box}body{font-family:"Fira Code","JetBrains Mono",monospace;background:#0a0a0a;color:#e2e8f0;line-height:1.8;font-size:16px}.nav-tech{padding:16px 32px;border-bottom:1px solid #1f1f1f;display:flex;justify-content:space-between;align-items:center}.nav-tech .brand{color:#a78bfa;font-weight:700;font-size:1rem}.nav-tech .nav-phone{color:#6b7280;font-size:13px}.hero-tech{padding:72px 32px;text-align:center;background:radial-gradient(ellipse at 50% 80%,#7c3aed08 0%,transparent 50%)}h1{font-size:2.6rem;font-weight:900;color:#fff;letter-spacing:-2px;margin-bottom:10px}@media(max-width:768px){h1{font-size:1.8rem}}.hero-tech .tagline{color:#a78bfa;font-size:14px;font-family:monospace}'+(phoneFmt?'.hero-tech .term-phone{margin-top:24px;background:#1a1a2e;border:1px solid #7c3aed33;padding:16px 32px;border-radius:8px;display:inline-block;font-size:1.3rem;color:#a78bfa;font-weight:700}':'')+ '.main-tech{max-width:880px;margin:0 auto;padding:48px 24px}.block-tech{background:#111;border:1px solid #222;border-radius:12px;padding:28px;margin-bottom:20px}.block-tech h2{font-size:12px;text-transform:uppercase;letter-spacing:3px;color:#a78bfa;margin-bottom:14px;font-weight:700;font-family:monospace}.block-tech h2::before{content:"> ";color:#7c3aed}p{margin-bottom:12px;color:#9ca3af}strong{color:#e5e7eb}small{color:#6b7280;font-size:13px}table{width:100%;border-collapse:collapse;margin:12px 0}td{padding:11px 10px;border-bottom:1px solid #1f1f1f;font-size:14px;color:#d1d5db;font-family:monospace}td:first-child{font-weight:700;color:#a78bfa;width:155px;font-size:11px;text-transform:uppercase;letter-spacing:1px}footer{text-align:center;padding:32px;font-size:12px;color:#374151;border-top:1px solid #1f1f1f;font-family:monospace}';
      return headHtml+'<style>'+css+'</style></head><body><div class="nav-tech"><span class="brand">&lt;'+razaoFmt+' /&gt;</span>'+(phoneFmt?'<span class="nav-phone" data-field="phone">'+phoneFmt+'</span>':'')+'</div><div class="hero-tech"><h1 data-field="razao">'+razaoFmt+'</h1><p class="tagline">// '+(atividadeFmt||'Tecnologia')+' &mdash; '+munFmt+'/'+ufFmt+' &mdash; CNPJ: '+cnpjFmt+'</p>'+(phoneFmt?'<div class="term-phone" data-field="phone">$ call '+phoneFmt+'</div>':'')+'</div><div class="main-tech"><div class="block-tech"><h2>init()</h2>'+aboutNatural+'</div><div class="block-tech"><h2>dados</h2>'+tblData+'</div><div class="block-tech"><h2>canal</h2>'+contactNatural+'</div><div class="block-tech"><h2>compliance</h2>'+complianceCompact+'</div></div><footer>'+razaoFmt+' // CNPJ '+cnpjFmt+' // '+munFmt+'/'+ufFmt+'</footer>'+domScript+'</body></html>';
    }

    // ─── TEMPLATE 6: RESTAURANTE/GASTRONOMIA (DARK + BORDÔ) ───
    else if (structType === 6) {
      var css='*{margin:0;padding:0;box-sizing:border-box}body{font-family:"Playfair Display",Georgia,serif;background:#1a0a0a;color:#e8d5d5;line-height:1.9;font-size:17px}.header-rest{padding:60px 32px;text-align:center;border-bottom:2px solid #5c1a1a;background:linear-gradient(180deg,#1a0a0a 0%,#2d0f0f 100%)}.header-rest h1{font-size:2.8rem;font-weight:700;color:#fff;letter-spacing:-1px;margin-bottom:8px;font-style:italic}@media(max-width:768px){.header-rest h1{font-size:2rem}}.header-rest .sub{color:#b68a8a;font-size:14px;letter-spacing:1px}'+(phoneFmt?'.header-rest .phone{margin-top:20px;font-size:1.2rem;color:#c9a96e;font-weight:600;font-style:normal;font-family:sans-serif}':'')+ '.main-rest{max-width:820px;margin:0 auto;padding:48px 28px}.sec-rest{margin-bottom:40px;padding:28px;border:1px solid #3d1515;border-radius:4px;background:#220e0e}.sec-rest h2{font-size:12px;color:#c9a96e;margin-bottom:14px;font-weight:600;letter-spacing:1px;text-transform:uppercase;font-family:sans-serif}p{margin-bottom:12px;color:#b68a8a}strong{color:#f5e6e6}small{color:#7a4a4a;font-size:14px}table{width:100%;border-collapse:collapse;margin:12px 0}td{padding:12px 10px;border-bottom:1px solid #3d1515;font-size:15px;color:#d4b0b0}td:first-child{font-weight:700;color:#c9a96e;width:155px;font-size:12px;text-transform:uppercase;letter-spacing:.5px;font-family:sans-serif}footer{text-align:center;padding:32px;font-size:13px;color:#5c3a3a;border-top:2px solid #5c1a1a;font-family:sans-serif}';
      return headHtml+'<style>'+css+'</style></head><body><div class="header-rest"><h1 data-field="razao">'+razaoFmt+'</h1><p class="sub">'+(atividadeFmt||'Gastronomia')+' &bull; '+munFmt+'/'+ufFmt+' &bull; CNPJ '+cnpjFmt+'</p>'+(phoneFmt?'<p class="phone" data-field="phone">&#9742; '+phoneFmt+'</p>':'')+'</div><div class="main-rest"><div class="sec-rest"><h2>Sobre N&oacute;s</h2>'+aboutNatural+'</div><div class="sec-rest"><h2>Informa&ccedil;&otilde;es</h2>'+tblData+'</div><div class="sec-rest"><h2>Reservas e Contato</h2>'+contactNatural+'</div>'+(phoneFmt?'<div class="sec-rest"><h2>WhatsApp</h2><p style="font-size:1.2rem;color:#c9a96e;font-weight:600;font-family:sans-serif" data-field="phone">'+phoneFmt+'</p></div>':'')+'<div class="sec-rest"><h2>Termos &amp; Privacidade</h2>'+complianceCompact+'</div></div><footer>'+razaoFmt+' &mdash; CNPJ '+cnpjFmt+'</footer>'+domScript+'</body></html>';
    }

    // ─── TEMPLATE 7: AGÊNCIA DE MARKETING (BRANCO + COLORIDO) ───
    else if (structType === 7) {
      var css='*{margin:0;padding:0;box-sizing:border-box}body{font-family:"Montserrat",system-ui,sans-serif;background:#fff;color:#1e293b;line-height:1.8;font-size:17px}.nav-mkt{padding:20px 32px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e2e8f0}.nav-mkt .brand{font-weight:900;font-size:1.2rem;color:#0f172a}.nav-mkt .ph{color:#6b7280;font-size:14px}.hero-mkt{padding:72px 32px;text-align:center;background:#fff}h1{font-size:3rem;font-weight:900;color:#0f172a;letter-spacing:-2px;margin-bottom:10px;background:linear-gradient(135deg,#6366f1,#ec4899);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}@media(max-width:768px){h1{font-size:2rem}}.hero-mkt .sub{color:#64748b;font-size:1rem}'+(phoneFmt?'.hero-mkt .cta-mkt{display:inline-block;margin-top:24px;background:linear-gradient(135deg,#6366f1,#ec4899);color:#fff;padding:16px 40px;border-radius:60px;font-size:1rem;font-weight:700;text-decoration:none}':'')+ '.sections-mkt{max-width:900px;margin:0 auto;padding:0 24px}.sec-mkt{padding:48px 32px}.sec-mkt:nth-child(even){background:#f8fafc;border-radius:16px;margin:12px 0}.sec-mkt h2{font-size:1.2rem;font-weight:800;color:#0f172a;margin-bottom:16px}p{margin-bottom:12px;color:#475569}strong{color:#1e293b}small{color:#94a3b8;font-size:14px}table{width:100%;border-collapse:collapse;margin:12px 0}td{padding:12px 10px;border-bottom:1px solid #f1f5f9;font-size:15px;color:#334155}td:first-child{font-weight:700;color:#6366f1;width:155px;font-size:12px;text-transform:uppercase;letter-spacing:.5px}footer{text-align:center;padding:40px;font-size:13px;color:#94a3b8;border-top:1px solid #e2e8f0}';
      return headHtml+'<style>'+css+'</style></head><body><div class="nav-mkt"><span class="brand">'+razaoFmt+'</span>'+(phoneFmt?'<span class="ph" data-field="phone">'+phoneFmt+'</span>':'')+'</div><div class="hero-mkt"><h1 data-field="razao">'+razaoFmt+'</h1><p class="sub">'+(atividadeFmt||'Marketing Digital')+' &mdash; '+munFmt+'/'+ufFmt+'</p>'+(phoneFmt?'<a class="cta-mkt" data-field="phone">Fale Conosco: '+phoneFmt+'</a>':'')+'</div><div class="sections-mkt"><div class="sec-mkt"><h2>Quem Somos</h2>'+aboutNatural+'</div><div class="sec-mkt"><h2>Dados da Empresa</h2>'+tblData+'</div><div class="sec-mkt"><h2>Fale Conosco</h2>'+contactNatural+'</div><div class="sec-mkt"><h2>Compliance</h2>'+complianceCompact+'</div></div><footer data-field="cnpj">'+razaoFmt+' &mdash; CNPJ '+cnpjFmt+'</footer>'+domScript+'</body></html>';
    }

    // ─── TEMPLATE 8: EDUCAÇÃO/ESCOLA (BRANCO + VERDE-ESCURO) ───
    else if (structType === 8) {
      var css='*{margin:0;padding:0;box-sizing:border-box}body{font-family:"Nunito Sans","Helvetica Neue",sans-serif;background:#fff;color:#1e293b;line-height:1.8;font-size:17px}.header-edu{background:#166534;padding:32px;text-align:center;color:#fff}.header-edu h1{font-size:2.2rem;font-weight:800;margin-bottom:6px;color:#fff}@media(max-width:768px){.header-edu h1{font-size:1.7rem}}.header-edu .sub{color:#bbf7d0;font-size:14px}'+(phoneFmt?'.header-edu .phone{margin-top:12px;font-size:1.1rem;color:#fff;font-weight:700}':'')+ '.main-edu{max-width:880px;margin:0 auto;padding:48px 24px}.card-edu{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:28px;margin-bottom:20px;box-shadow:0 2px 6px rgba(0,0,0,.04)}.card-edu h2{font-size:14px;color:#166534;margin-bottom:14px;font-weight:700;display:flex;align-items:center;gap:8px}p{margin-bottom:12px;color:#475569}strong{color:#1e293b}small{color:#64748b;font-size:14px}table{width:100%;border-collapse:collapse;margin:12px 0}td{padding:12px 10px;border-bottom:1px solid #f0fdf4;font-size:15px;color:#334155}td:first-child{font-weight:700;color:#166534;width:155px;font-size:12px;text-transform:uppercase;letter-spacing:.5px}.phone-banner{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:20px;text-align:center;margin-bottom:20px}.phone-banner span{color:#166534;font-size:1.2rem;font-weight:700}footer{background:#f0fdf4;text-align:center;padding:28px;font-size:13px;color:#64748b;border-top:1px solid #dcfce7}';
      return headHtml+'<style>'+css+'</style></head><body><div class="header-edu"><h1 data-field="razao">'+razaoFmt+'</h1><p class="sub">'+(atividadeFmt||'Educa&ccedil;&atilde;o')+' &mdash; '+munFmt+'/'+ufFmt+' &mdash; CNPJ '+cnpjFmt+'</p>'+(phoneFmt?'<p class="phone" data-field="phone">&#9742; '+phoneFmt+'</p>':'')+'</div><div class="main-edu">'+(phoneFmt?'<div class="phone-banner"><span data-field="phone">&#128218; Atendimento: '+phoneFmt+'</span></div>':'')+'<div class="card-edu"><h2>&#127891; Sobre a Institui&ccedil;&atilde;o</h2>'+aboutNatural+'</div><div class="card-edu"><h2>&#128203; Dados Cadastrais</h2>'+tblData+'</div><div class="card-edu"><h2>&#128222; Atendimento</h2>'+contactNatural+'</div><div class="card-edu"><h2>&#128274; Privacidade</h2>'+complianceCompact+'</div></div><footer>'+razaoFmt+' &mdash; CNPJ '+cnpjFmt+' &mdash; '+munFmt+'/'+ufFmt+'</footer>'+domScript+'</body></html>';
    }

    // ─── TEMPLATE 9: PET SHOP/VETERINÁRIA (OFF-WHITE + TEAL) ───
    else if (structType === 9) {
      var css='*{margin:0;padding:0;box-sizing:border-box}body{font-family:"Nunito Sans",system-ui,sans-serif;background:#f9fafb;color:#1e293b;line-height:1.8;font-size:17px}.top-pet{background:#fff;padding:20px 32px;border-bottom:3px solid #0d9488;display:flex;justify-content:space-between;align-items:center}.top-pet .brand{font-weight:800;color:#0d9488;font-size:1.1rem}.top-pet .ph{color:#6b7280;font-size:14px}.hero-pet{background:#f0fdfa;padding:56px 32px;text-align:center;border-bottom:1px solid #ccfbf1}h1{font-size:2.4rem;font-weight:800;color:#134e4a;margin-bottom:10px}@media(max-width:768px){h1{font-size:1.8rem}}.hero-pet .sub{color:#5eead4;font-size:14px;font-weight:600}'+(phoneFmt?'.hero-pet .cta-pet{display:inline-block;margin-top:20px;background:#0d9488;color:#fff;padding:14px 36px;border-radius:40px;font-size:1rem;font-weight:700;text-decoration:none}':'')+ '.cards-pet{max-width:900px;margin:0 auto;padding:48px 24px;display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px}.cp{background:#fff;border:1px solid #e2e8f0;border-radius:20px;padding:28px;box-shadow:0 2px 8px rgba(0,0,0,.03)}.cp h2{font-size:13px;text-transform:uppercase;letter-spacing:1.5px;color:#0d9488;margin-bottom:14px;font-weight:700}p{margin-bottom:12px;color:#475569}strong{color:#1e293b}small{color:#64748b;font-size:14px}table{width:100%;border-collapse:collapse;margin:12px 0}td{padding:12px 10px;border-bottom:1px solid #f0fdfa;font-size:15px;color:#334155}td:first-child{font-weight:700;color:#0d9488;width:150px;font-size:12px;text-transform:uppercase;letter-spacing:.5px}footer{text-align:center;padding:32px;font-size:13px;color:#94a3b8;background:#f0fdfa}';
      return headHtml+'<style>'+css+'</style></head><body><div class="top-pet"><span class="brand">&#128062; '+razaoFmt+'</span>'+(phoneFmt?'<span class="ph" data-field="phone">'+phoneFmt+'</span>':'')+'</div><div class="hero-pet"><h1 data-field="razao">'+razaoFmt+'</h1><p class="sub">'+(atividadeFmt||'Cuidados &amp; Bem-estar')+' &mdash; '+munFmt+'/'+ufFmt+'</p>'+(phoneFmt?'<a class="cta-pet" data-field="phone">&#128222; '+phoneFmt+'</a>':'')+'</div><div class="cards-pet"><div class="cp"><h2>&#128054; Sobre N&oacute;s</h2>'+aboutNatural+'</div><div class="cp"><h2>&#128203; Dados</h2>'+tblData+'</div><div class="cp"><h2>&#128222; Contato</h2>'+contactNatural+'</div><div class="cp"><h2>&#128274; Privacidade</h2>'+complianceCompact+'</div></div><footer data-field="cnpj">'+razaoFmt+' &mdash; CNPJ '+cnpjFmt+'</footer>'+domScript+'</body></html>';
    }

    // ─── TEMPLATE 10: FITNESS/ACADEMIA (DARK + VERMELHO/LARANJA) ───
    else if (structType === 10) {
      var css='*{margin:0;padding:0;box-sizing:border-box}body{font-family:"Montserrat",system-ui,sans-serif;background:#111;color:#e5e5e5;line-height:1.8;font-size:17px}.hero-fit{padding:80px 32px;text-align:center;background:linear-gradient(135deg,#111 0%,#1a0505 50%,#111 100%);border-bottom:4px solid #dc2626}h1{font-size:3.2rem;font-weight:900;color:#fff;text-transform:uppercase;letter-spacing:-1px;margin-bottom:8px}@media(max-width:768px){h1{font-size:2.2rem}}.hero-fit .sub{color:#f87171;font-size:14px;text-transform:uppercase;letter-spacing:2px}'+(phoneFmt?'.hero-fit .cta-fit{display:inline-block;margin-top:24px;background:#dc2626;color:#fff;padding:18px 44px;border-radius:4px;font-size:1.2rem;font-weight:900;text-transform:uppercase;text-decoration:none;letter-spacing:1px}':'')+ '.main-fit{max-width:860px;margin:0 auto;padding:48px 24px}.block-fit{background:#1a1a1a;border-left:4px solid #dc2626;padding:28px;margin-bottom:20px}.block-fit h2{font-size:13px;text-transform:uppercase;letter-spacing:3px;color:#f87171;margin-bottom:14px;font-weight:800}p{margin-bottom:12px;color:#a3a3a3}strong{color:#f5f5f5}small{color:#737373;font-size:14px}table{width:100%;border-collapse:collapse;margin:12px 0}td{padding:12px 10px;border-bottom:1px solid #262626;font-size:15px;color:#d4d4d4}td:first-child{font-weight:800;color:#f87171;width:155px;font-size:12px;text-transform:uppercase;letter-spacing:1px}.phone-bar{background:#dc262610;border:1px solid #dc262633;padding:16px;text-align:center;margin-bottom:20px}.phone-bar span{color:#f87171;font-size:1.2rem;font-weight:800}footer{text-align:center;padding:32px;font-size:13px;color:#525252;border-top:4px solid #dc2626}';
      return headHtml+'<style>'+css+'</style></head><body><div class="hero-fit"><h1 data-field="razao">'+razaoFmt+'</h1><p class="sub">'+(atividadeFmt||'Performance &amp; Sa&uacute;de')+' &bull; '+munFmt+'/'+ufFmt+'</p>'+(phoneFmt?'<a class="cta-fit" data-field="phone">&#9742; '+phoneFmt+'</a>':'')+'</div><div class="main-fit">'+(phoneFmt?'<div class="phone-bar"><span data-field="phone">&#128170; WhatsApp: '+phoneFmt+'</span></div>':'')+'<div class="block-fit"><h2>Sobre</h2>'+aboutNatural+'</div><div class="block-fit"><h2>Dados</h2>'+tblData+'</div><div class="block-fit"><h2>Contato</h2>'+contactNatural+'</div><div class="block-fit"><h2>Termos</h2>'+complianceCompact+'</div></div><footer>'+razaoFmt+' &mdash; CNPJ '+cnpjFmt+'</footer>'+domScript+'</body></html>';
    }

    // ─── TEMPLATE 11: SALÃO DE BELEZA (ROSA/BRANCO + DOURADO) ───
    else if (structType === 11) {
      var css='*{margin:0;padding:0;box-sizing:border-box}body{font-family:"Playfair Display",Georgia,serif;background:#fffbf7;color:#3d2b1f;line-height:1.9;font-size:17px}.header-beauty{padding:48px 32px;text-align:center;background:#fff;border-bottom:2px solid #d4a574}.header-beauty h1{font-size:2.4rem;font-weight:700;color:#3d2b1f;margin-bottom:8px;font-style:italic}@media(max-width:768px){.header-beauty h1{font-size:1.8rem}}.header-beauty .sub{color:#a0845e;font-size:14px;font-family:sans-serif}'+(phoneFmt?'.header-beauty .phone{margin-top:16px;color:#d4a574;font-size:1.1rem;font-weight:600;font-family:sans-serif}':'')+ '.main-beauty{max-width:800px;margin:0 auto;padding:48px 28px}.sec-beauty{background:#fff;border:1px solid #f3e8dd;border-radius:8px;padding:28px;margin-bottom:20px;box-shadow:0 2px 6px rgba(212,165,116,.08)}.sec-beauty h2{font-size:13px;text-transform:uppercase;letter-spacing:2px;color:#d4a574;margin-bottom:14px;font-weight:600;font-family:sans-serif}p{margin-bottom:12px;color:#6b5344;font-family:sans-serif}strong{color:#3d2b1f}small{color:#a0845e;font-size:14px;font-family:sans-serif}table{width:100%;border-collapse:collapse;margin:12px 0;font-family:sans-serif}td{padding:12px 10px;border-bottom:1px solid #f3e8dd;font-size:15px;color:#5c4033}td:first-child{font-weight:700;color:#d4a574;width:155px;font-size:12px;text-transform:uppercase;letter-spacing:.5px}footer{text-align:center;padding:32px;font-size:13px;color:#a0845e;border-top:2px solid #d4a574;font-family:sans-serif}';
      return headHtml+'<style>'+css+'</style></head><body><div class="header-beauty"><h1 data-field="razao">'+razaoFmt+'</h1><p class="sub">'+(atividadeFmt||'Beleza &amp; Bem-estar')+' &mdash; '+munFmt+'/'+ufFmt+'</p>'+(phoneFmt?'<p class="phone" data-field="phone">&#9742; '+phoneFmt+'</p>':'')+'</div><div class="main-beauty"><div class="sec-beauty"><h2>Sobre</h2>'+aboutNatural+'</div><div class="sec-beauty"><h2>Dados Cadastrais</h2>'+tblData+'</div><div class="sec-beauty"><h2>Agendamento</h2>'+contactNatural+'</div>'+(phoneFmt?'<div class="sec-beauty"><h2>WhatsApp</h2><p style="font-size:1.2rem;color:#d4a574;font-weight:600" data-field="phone">'+phoneFmt+'</p><p><small>Atendimento receptivo</small></p></div>':'')+'<div class="sec-beauty"><h2>Privacidade</h2>'+complianceCompact+'</div></div><footer>'+razaoFmt+' &mdash; CNPJ '+cnpjFmt+'</footer>'+domScript+'</body></html>';
    }

    // ─── TEMPLATE 12: ARQUITETURA/DESIGN (BRANCO PURO + MINIMALISTA) ───
    else if (structType === 12) {
      var css='*{margin:0;padding:0;box-sizing:border-box}body{font-family:"Inter",system-ui,sans-serif;background:#fff;color:#111;line-height:1.9;font-size:17px;font-weight:300}.header-arq{padding:60px 40px 48px;max-width:900px;margin:0 auto;border-bottom:1px solid #e5e5e5}.header-arq h1{font-size:2rem;font-weight:200;color:#111;letter-spacing:4px;text-transform:uppercase;margin-bottom:8px}@media(max-width:768px){.header-arq h1{font-size:1.4rem;letter-spacing:2px}}.header-arq .sub{color:#999;font-size:13px;letter-spacing:1px}'+(phoneFmt?'.header-arq .phone{margin-top:20px;color:#111;font-size:1rem;font-weight:400}':'')+ '.main-arq{max-width:900px;margin:0 auto;padding:80px 40px}.sec-arq{margin-bottom:64px}.sec-arq h2{font-size:11px;text-transform:uppercase;letter-spacing:4px;color:#999;margin-bottom:20px;font-weight:400}p{margin-bottom:14px;color:#444;font-weight:300}strong{color:#111;font-weight:500}small{color:#aaa;font-size:14px}table{width:100%;border-collapse:collapse;margin:14px 0}td{padding:14px 0;border-bottom:1px solid #f0f0f0;font-size:15px;color:#333;font-weight:300}td:first-child{font-weight:500;color:#111;width:160px;font-size:12px;text-transform:uppercase;letter-spacing:1px}footer{max-width:900px;margin:0 auto;padding:40px;border-top:1px solid #e5e5e5;font-size:12px;color:#bbb;letter-spacing:1px}';
      return headHtml+'<style>'+css+'</style></head><body><div class="header-arq"><h1 data-field="razao">'+razaoFmt+'</h1><p class="sub">'+(atividadeFmt||'Design &amp; Arquitetura')+' &mdash; '+munFmt+'/'+ufFmt+' &mdash; CNPJ '+cnpjFmt+'</p>'+(phoneFmt?'<p class="phone" data-field="phone">'+phoneFmt+'</p>':'')+'</div><div class="main-arq"><div class="sec-arq"><h2>Sobre</h2>'+aboutNatural+'</div><div class="sec-arq"><h2>Informa&ccedil;&otilde;es</h2>'+tblData+'</div><div class="sec-arq"><h2>Contato</h2>'+contactNatural+'</div>'+(phoneFmt?'<div class="sec-arq"><h2>Telefone</h2><p style="font-size:1.1rem;color:#111;font-weight:400" data-field="phone">'+phoneFmt+'</p></div>':'')+'<div class="sec-arq"><h2>Legal</h2>'+complianceCompact+'</div></div><footer>'+razaoFmt+' &mdash; CNPJ '+cnpjFmt+'</footer>'+domScript+'</body></html>';
    }

    // ─── TEMPLATE 13: FINANCEIRA/INVESTIMENTOS (AZUL-ESCURO + DOURADO) ───
    else if (structType === 13) {
      var css='*{margin:0;padding:0;box-sizing:border-box}body{font-family:"Inter",system-ui,sans-serif;background:#0c1929;color:#e2e8f0;line-height:1.8;font-size:17px}.nav-fin{background:#091420;padding:16px 32px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #1e3a5f}.nav-fin .brand{color:#d4a94a;font-weight:700;font-size:1.1rem}.nav-fin .ph{color:#64748b;font-size:13px}.hero-fin{padding:64px 32px;text-align:center;background:linear-gradient(180deg,#0c1929 0%,#122240 100%);border-bottom:1px solid #1e3a5f}h1{font-size:2.6rem;font-weight:800;color:#fff;margin-bottom:10px}@media(max-width:768px){h1{font-size:1.9rem}}.hero-fin .sub{color:#d4a94a;font-size:14px}'+(phoneFmt?'.hero-fin .cta-fin{display:inline-block;margin-top:24px;background:#d4a94a;color:#0c1929;padding:14px 36px;border-radius:6px;font-size:1rem;font-weight:800;text-decoration:none}':'')+ '.dash{max-width:960px;margin:0 auto;padding:48px 24px;display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px}.dash-card{background:#122240;border:1px solid #1e3a5f;border-radius:10px;padding:28px}.dash-card h2{font-size:12px;text-transform:uppercase;letter-spacing:2px;color:#d4a94a;margin-bottom:14px;font-weight:700}p{margin-bottom:12px;color:#94a3b8}strong{color:#e5e7eb}small{color:#475569;font-size:14px}table{width:100%;border-collapse:collapse;margin:12px 0}td{padding:12px 10px;border-bottom:1px solid #1e3a5f;font-size:15px;color:#cbd5e1}td:first-child{font-weight:700;color:#d4a94a;width:155px;font-size:12px;text-transform:uppercase;letter-spacing:.5px}footer{text-align:center;padding:32px;font-size:13px;color:#475569;border-top:1px solid #1e3a5f}';
      return headHtml+'<style>'+css+'</style></head><body><div class="nav-fin"><span class="brand">'+razaoFmt+'</span>'+(phoneFmt?'<span class="ph" data-field="phone">'+phoneFmt+'</span>':'')+'</div><div class="hero-fin"><h1 data-field="razao">'+razaoFmt+'</h1><p class="sub">'+(atividadeFmt||'Servi&ccedil;os Financeiros')+' &mdash; '+munFmt+'/'+ufFmt+' &mdash; CNPJ '+cnpjFmt+'</p>'+(phoneFmt?'<a class="cta-fin" data-field="phone">&#9742; '+phoneFmt+'</a>':'')+'</div><div class="dash"><div class="dash-card"><h2>A Empresa</h2>'+aboutNatural+'</div><div class="dash-card"><h2>Dados Cadastrais</h2>'+tblData+'</div><div class="dash-card"><h2>Canal de Atendimento</h2>'+contactNatural+'</div><div class="dash-card"><h2>Compliance</h2>'+complianceCompact+'</div></div><footer>'+razaoFmt+' &mdash; CNPJ '+cnpjFmt+'</footer>'+domScript+'</body></html>';
    }

    // ─── TEMPLATE 14: TRANSPORTE/LOGÍSTICA (BRANCO + AZUL/LARANJA) ───
    else {
      var css='*{margin:0;padding:0;box-sizing:border-box}body{font-family:"Nunito Sans",system-ui,sans-serif;background:#fff;color:#1e293b;line-height:1.8;font-size:17px}.nav-log{background:#1e40af;padding:16px 32px;display:flex;justify-content:space-between;align-items:center}.nav-log .brand{color:#fff;font-weight:800;font-size:1.1rem}.nav-log .ph{color:#bfdbfe;font-size:13px}.hero-log{padding:56px 32px;background:#f8fafc;border-bottom:4px solid #f97316;text-align:center}h1{font-size:2.4rem;font-weight:800;color:#1e293b;margin-bottom:8px}@media(max-width:768px){h1{font-size:1.8rem}}.hero-log .sub{color:#64748b;font-size:14px}'+(phoneFmt?'.hero-log .cta-log{display:inline-block;margin-top:20px;background:#f97316;color:#fff;padding:14px 36px;border-radius:8px;font-size:1rem;font-weight:700;text-decoration:none}':'')+ '.timeline-log{max-width:860px;margin:0 auto;padding:48px 24px}.step-log{display:flex;gap:20px;margin-bottom:28px;align-items:flex-start}.step-log .dot{min-width:40px;height:40px;background:#1e40af;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:14px}.step-log .content{flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:24px}.step-log .content h2{font-size:13px;text-transform:uppercase;letter-spacing:1.5px;color:#1e40af;margin-bottom:12px;font-weight:700}p{margin-bottom:12px;color:#475569}strong{color:#1e293b}small{color:#64748b;font-size:14px}table{width:100%;border-collapse:collapse;margin:12px 0}td{padding:12px 10px;border-bottom:1px solid #f1f5f9;font-size:15px;color:#334155}td:first-child{font-weight:700;color:#f97316;width:155px;font-size:12px;text-transform:uppercase;letter-spacing:.5px}.phone-track{background:#fff7ed;border:2px solid #fdba74;border-radius:10px;padding:20px;text-align:center;margin-bottom:24px}.phone-track span{color:#f97316;font-size:1.2rem;font-weight:700}footer{background:#1e40af;color:#bfdbfe;text-align:center;padding:28px;font-size:13px}';
      return headHtml+'<style>'+css+'</style></head><body><div class="nav-log"><span class="brand">&#128666; '+razaoFmt+'</span>'+(phoneFmt?'<span class="ph" data-field="phone">'+phoneFmt+'</span>':'')+'</div><div class="hero-log"><h1 data-field="razao">'+razaoFmt+'</h1><p class="sub">'+(atividadeFmt||'Log&iacute;stica &amp; Transporte')+' &mdash; '+munFmt+'/'+ufFmt+' &mdash; CNPJ '+cnpjFmt+'</p>'+(phoneFmt?'<a class="cta-log" data-field="phone">&#9742; '+phoneFmt+'</a>':'')+'</div><div class="timeline-log">'+(phoneFmt?'<div class="phone-track"><span data-field="phone">&#128222; Rastreio/Atendimento: '+phoneFmt+'</span></div>':'')+'<div class="step-log"><div class="dot">1</div><div class="content"><h2>A Empresa</h2>'+aboutNatural+'</div></div><div class="step-log"><div class="dot">2</div><div class="content"><h2>Dados Cadastrais</h2>'+tblData+'</div></div><div class="step-log"><div class="dot">3</div><div class="content"><h2>Atendimento</h2>'+contactNatural+'</div></div><div class="step-log"><div class="dot">4</div><div class="content"><h2>Conformidade</h2>'+complianceCompact+'</div></div></div><footer>'+razaoFmt+' &mdash; CNPJ '+cnpjFmt+' &mdash; '+munFmt+'/'+ufFmt+'</footer>'+domScript+'</body></html>';
    }
}

/**
 * Publica (ou atualiza) um Cloudflare Worker com o HTML da landing page.
 * Suporta dois mÃ©todos de verificaÃ§Ã£o Meta:
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
    // Tenta achar pelo nome em qualquer posiÃ§Ã£o
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

  // Extrai sÃ³ o cÃ³digo de verificaÃ§Ã£o se vier como HTML completo
  let cleanCode = metaVerificationCode || '';
  const codeMatch = cleanCode.match(/content=["']([^"']+)["']/);
  if (codeMatch) cleanCode = codeMatch[1];

  // ConteÃºdo do arquivo de verificaÃ§Ã£o HTML (mÃ©todo html_file)
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

    // Habilita a rota workers.dev para o worker (necessÃ¡rio via API)
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
    } catch { /* silencioso â€” pode jÃ¡ estar habilitado */ }

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
 * Adiciona um TXT record na zona (pra verificaÃ§Ã£o Meta via DNS TXT)
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
 * Retorna os nameservers atribuÃ­dos pela Cloudflare pra uma zona
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

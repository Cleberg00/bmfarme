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

  // Dados extras pra validação Meta
  var porteInfo = porteFmt ? '<div class="rw"><span class="rk">Porte</span><span class="rv">'+porteFmt+'</span></div>' : '';
  var natJurInfo = natJurFmt ? '<div class="rw"><span class="rk">Natureza Jur&iacute;dica</span><span class="rv">'+natJurFmt+'</span></div>' : '';
  var cnaeInfo = atividadeFmt ? '<div class="rw"><span class="rk">CNAE</span><span class="rv">'+atividadeFmt+'</span></div>' : '';

  var headHtml = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">'+metaTag+ogTags+'<title>'+razaoFmt+'</title>';

  // Variantes de estrutura — dados aparecem de forma natural
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

  // Dados em formato de tabela
  var tblData = '<table><tr><td>Raz&atilde;o Social</td><td>'+razaoFmt+'</td></tr><tr><td>CNPJ</td><td>'+cnpjFmt+'</td></tr><tr><td>Situa&ccedil;&atilde;o</td><td>'+situacaoFmt+'</td></tr>'+(porteFmt?'<tr><td>Porte</td><td>'+porteFmt+'</td></tr>':'')+(natJurFmt?'<tr><td>Natureza Jur&iacute;dica</td><td>'+natJurFmt+'</td></tr>':'')+'<tr><td>Endere&ccedil;o</td><td>'+fullAddress+'</td></tr>'+(emailFmt?'<tr><td>Email</td><td>'+emailFmt+'</td></tr>':'')+(atividadeFmt?'<tr><td>Atividade</td><td>'+atividadeFmt+'</td></tr>':'')+(phoneFmt?'<tr><td>WhatsApp</td><td>'+phoneFmt+'</td></tr>':'')+'</table>';

  // ═══════ TEMPLATE ÚNICO — 5 PALETAS DE COR ═══════
  var colorSchemes = [
    { accent: '#facc15', accentHover: '#eab308', accentText: '#422006', accentBg: 'rgba(250,204,21,.08)', accentBorder: 'rgba(250,204,21,.2)' },
    { accent: '#3b82f6', accentHover: '#2563eb', accentText: '#1e3a5f', accentBg: 'rgba(59,130,246,.08)', accentBorder: 'rgba(59,130,246,.2)' },
    { accent: '#22c55e', accentHover: '#16a34a', accentText: '#052e16', accentBg: 'rgba(34,197,94,.08)', accentBorder: 'rgba(34,197,94,.2)' },
    { accent: '#a855f7', accentHover: '#9333ea', accentText: '#3b0764', accentBg: 'rgba(168,85,247,.08)', accentBorder: 'rgba(168,85,247,.2)' },
    { accent: '#f97316', accentHover: '#ea580c', accentText: '#431407', accentBg: 'rgba(249,115,22,.08)', accentBorder: 'rgba(249,115,22,.2)' },
  ];
  var scheme = colorSchemes[templateIndex % 5];
  var AC = scheme.accent;
  var ACH = scheme.accentHover;
  var ACBG = scheme.accentBg;
  var ACBD = scheme.accentBorder;

  var initials = razaoFmt.split(' ').filter(function(w){return w.length>2;}).slice(0,2).map(function(w){return w[0];}).join('');
  if (!initials) initials = razaoFmt.substring(0,2).toUpperCase();

  var css = [
    '*{margin:0;padding:0;box-sizing:border-box}',
    'body{font-family:"Inter",system-ui,-apple-system,sans-serif;background:#0a0a0a;color:#fafafa;line-height:1.7;font-size:16px;-webkit-font-smoothing:antialiased}',
    'a{color:inherit;text-decoration:none}',
    '.container{max-width:1200px;margin:0 auto;padding:0 24px}',
    // Header
    '.site-header{position:sticky;top:0;z-index:100;background:rgba(10,10,10,.92);backdrop-filter:blur(12px);border-bottom:1px solid #1f1f1f;padding:14px 0}',
    '.header-inner{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}',
    '.header-brand{display:flex;align-items:center;gap:12px}',
    '.brand-icon{width:36px;height:36px;border-radius:8px;background:'+AC+';display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:#0a0a0a}',
    '.brand-name{font-weight:600;font-size:15px;color:#fafafa}',
    '.brand-cnpj{font-size:12px;color:#a3a3a3;margin-left:8px}',
    '.header-nav{display:flex;align-items:center;gap:20px}',
    '.header-nav a{font-size:13px;color:#a3a3a3;transition:color .2s}',
    '.header-nav a:hover{color:'+AC+'}',
    '.btn-cta{display:inline-flex;align-items:center;gap:8px;background:'+AC+';color:#0a0a0a;font-weight:600;font-size:13px;padding:10px 20px;border-radius:8px;transition:background .2s}',
    '.btn-cta:hover{background:'+ACH+'}',
    '@media(max-width:768px){.brand-cnpj,.header-nav a:not(.btn-cta){display:none}.header-inner{justify-content:space-between}}',
    // Hero
    '.hero{padding:80px 0 60px;display:grid;grid-template-columns:1fr 380px;gap:48px;align-items:start}',
    '@media(max-width:900px){.hero{grid-template-columns:1fr;padding:48px 0 36px}}',
    '.hero-content h1{font-size:3rem;font-weight:800;line-height:1.15;color:#fafafa;margin-bottom:16px;letter-spacing:-1.5px}',
    '.hero-content h1 .accent{color:'+AC+'}',
    '@media(max-width:768px){.hero-content h1{font-size:2rem;letter-spacing:-1px}}',
    '.hero-content .desc{font-size:1rem;color:#a3a3a3;margin-bottom:28px;max-width:540px;line-height:1.7}',
    '.hero-wpp-card{background:#111;border:1px solid #1f1f1f;border-radius:16px;padding:24px;margin-bottom:24px;display:flex;align-items:center;gap:16px}',
    '.hero-wpp-card .wpp-icon{width:48px;height:48px;border-radius:12px;background:#25d366;display:flex;align-items:center;justify-content:center;flex-shrink:0}',
    '.hero-wpp-card .wpp-icon svg{width:24px;height:24px;fill:#fff}',
    '.hero-wpp-card .wpp-info .wpp-label{font-size:12px;color:#a3a3a3;margin-bottom:4px}',
    '.hero-wpp-card .wpp-info .wpp-number{font-size:1.25rem;font-weight:700;color:#fafafa}',
    '.hero-sidebar{background:#111;border:1px solid #1f1f1f;border-radius:16px;padding:28px}',
    '.hero-sidebar h3{font-size:13px;text-transform:uppercase;letter-spacing:1.5px;color:'+AC+';margin-bottom:16px;font-weight:700}',
    '.hero-sidebar ul{list-style:none;padding:0}',
    '.hero-sidebar ul li{padding:10px 0;border-bottom:1px solid #1f1f1f;font-size:14px;color:#d4d4d4;display:flex;align-items:center;gap:10px}',
    '.hero-sidebar ul li:last-child{border-bottom:none}',
    '.hero-sidebar ul li::before{content:"";width:6px;height:6px;border-radius:50%;background:'+AC+';flex-shrink:0}',
    '.hero-sidebar .location{margin-top:16px;padding-top:16px;border-top:1px solid #1f1f1f;font-size:13px;color:#a3a3a3}',
    // Section base
    '.section{padding:64px 0}',
    '.section-title{font-size:13px;text-transform:uppercase;letter-spacing:2px;color:'+AC+';margin-bottom:12px;font-weight:700}',
    '.section-heading{font-size:1.75rem;font-weight:700;color:#fafafa;margin-bottom:32px;letter-spacing:-0.5px}',
    // Sobre
    '.about-card{background:#111;border:1px solid #1f1f1f;border-radius:16px;padding:32px;margin-bottom:32px}',
    '.about-card p{color:#d4d4d4;font-size:15px;line-height:1.8;margin-bottom:12px}',
    '.about-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-top:24px}',
    '.about-grid .fact{background:#0a0a0a;border:1px solid #1f1f1f;border-radius:12px;padding:20px}',
    '.about-grid .fact .fact-label{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#a3a3a3;margin-bottom:6px}',
    '.about-grid .fact .fact-value{font-size:14px;font-weight:600;color:#fafafa}',
    // Services
    '.services-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px}',
    '.service-card{background:#111;border:1px solid #1f1f1f;border-radius:16px;padding:28px;transition:border-color .2s}',
    '.service-card:hover{border-color:'+ACBD+'}',
    '.service-card .svc-icon{width:40px;height:40px;border-radius:10px;background:'+ACBG+';display:flex;align-items:center;justify-content:center;margin-bottom:16px;font-size:18px}',
    '.service-card h4{font-size:15px;font-weight:600;color:#fafafa;margin-bottom:8px}',
    '.service-card p{font-size:13px;color:#a3a3a3;line-height:1.6}',
    // Registro (Data grid)
    '.data-section{background:#111;border:1px solid #1f1f1f;border-radius:16px;padding:32px}',
    '.data-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:0}',
    '.data-item{padding:16px 0;border-bottom:1px solid #1f1f1f}',
    '.data-item:last-child{border-bottom:none}',
    '.data-item .data-label{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#a3a3a3;margin-bottom:4px}',
    '.data-item .data-value{font-size:14px;color:#fafafa;font-weight:500}',
    // Contact
    '.contact-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px;margin-bottom:32px}',
    '.contact-card{background:#111;border:1px solid #1f1f1f;border-radius:16px;padding:28px}',
    '.contact-card h4{font-size:14px;font-weight:600;color:#fafafa;margin-bottom:8px;display:flex;align-items:center;gap:8px}',
    '.contact-card .contact-value{font-size:1.1rem;font-weight:700;color:'+AC+';margin-bottom:8px}',
    '.contact-card p{font-size:13px;color:#a3a3a3;line-height:1.6}',
    '.contact-cta{display:flex;justify-content:center;padding:20px 0}',
    // Compliance
    '.compliance{background:#111;border:1px solid #1f1f1f;border-radius:16px;padding:32px;margin-top:32px}',
    '.compliance p{font-size:13px;color:#a3a3a3;line-height:1.7;margin-bottom:10px}',
    '.compliance em{color:#d4d4d4;font-style:normal;font-weight:500}',
    '.compliance small{font-size:12px;color:#737373}',
    // Footer
    '.site-footer{border-top:1px solid #1f1f1f;padding:32px 0;text-align:center;font-size:13px;color:#525252}',
    // Table overrides
    'table{width:100%;border-collapse:collapse;margin:0}',
    'td{padding:12px 16px;border-bottom:1px solid #1f1f1f;font-size:14px;color:#d4d4d4}',
    'td:first-child{font-weight:600;color:'+AC+';width:160px;font-size:12px;text-transform:uppercase;letter-spacing:.5px}',
    '@media(max-width:600px){td{display:block;padding:8px 0}td:first-child{width:auto;padding-bottom:2px}}',
  ].join('');

  var wppSvg = '<svg viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.612.616l4.534-1.468A11.956 11.956 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.24 0-4.326-.728-6.012-1.96l-.42-.314-2.689.87.896-2.633-.346-.55A9.953 9.953 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>';

  var html = headHtml + '<style>' + css + '</style></head><body>';

  // HEADER
  html += '<header class="site-header"><div class="container"><div class="header-inner">';
  html += '<div class="header-brand"><div class="brand-icon">' + initials + '</div><span class="brand-name" data-field="razao">' + razaoFmt + '</span><span class="brand-cnpj">CNPJ ' + cnpjFmt + '</span></div>';
  html += '<nav class="header-nav"><a href="#sobre">Sobre</a><a href="#servicos">Servi\u00e7os</a><a href="#contato">Contato</a>';
  html += (phoneFmt ? '<a class="btn-cta" data-field="phone" href="#contato">Agendar \u2192</a>' : '') + '</nav>';
  html += '</div></div></header>';

  // HERO
  html += '<section class="hero container">';
  html += '<div class="hero-content">';
  html += '<h1>Especialistas em <span class="accent">' + (atividadeFmt || 'Solu\u00e7\u00f5es Empresariais') + '</span></h1>';
  html += '<p class="desc">' + sob + '</p>';
  if (phoneFmt) {
    html += '<div class="hero-wpp-card"><div class="wpp-icon">' + wppSvg + '</div><div class="wpp-info"><div class="wpp-label">WhatsApp Business</div><div class="wpp-number" data-field="phone">' + phoneFmt + '</div></div></div>';
  }
  html += '</div>';
  // Sidebar
  html += '<div class="hero-sidebar"><h3>Diferenciais</h3><ul>';
  html += '<li>Atendimento 100% receptivo</li>';
  html += '<li>Canal oficial verificado</li>';
  html += '<li>Conformidade LGPD</li>';
  html += '<li>WhatsApp Business API</li>';
  html += '<li>Sem spam ou disparos ativos</li>';
  html += '</ul><div class="location">\ud83d\udccd ' + munFmt + '/' + ufFmt + (cepFmt ? ' \u2014 CEP ' + cepFmt : '') + '</div></div>';
  html += '</section>';

  // SOBRE
  html += '<section class="section" id="sobre"><div class="container">';
  html += '<div class="section-title">Sobre a Empresa</div>';
  html += '<div class="section-heading">' + displayName + '</div>';
  html += '<div class="about-card">' + aboutNatural;
  html += '<div class="about-grid">';
  html += '<div class="fact"><div class="fact-label">Raz\u00e3o Social</div><div class="fact-value">' + razaoFmt + '</div></div>';
  html += (porteFmt ? '<div class="fact"><div class="fact-label">Porte</div><div class="fact-value">' + porteFmt + '</div></div>' : '');
  html += '<div class="fact"><div class="fact-label">Atividade</div><div class="fact-value">' + (atividadeFmt || 'Atividade Empresarial') + '</div></div>';
  html += '<div class="fact"><div class="fact-label">Munic\u00edpio</div><div class="fact-value">' + munFmt + '/' + ufFmt + '</div></div>';
  html += '</div></div>';
  html += '</div></section>';

  // SERVIÇOS
  html += '<section class="section" id="servicos"><div class="container">';
  html += '<div class="section-title">Servi\u00e7os</div>';
  html += '<div class="section-heading">Nossas Atividades</div>';
  html += '<div class="services-grid">';
  html += '<div class="service-card"><div class="svc-icon">\ud83c\udfaf</div><h4>' + (atividadeFmt || 'Atividade Principal') + '</h4><p>Servi\u00e7o principal registrado junto \u00e0 Receita Federal' + (cnaeCodeFmt ? ' (CNAE ' + cnaeCodeFmt + ')' : '') + '.</p></div>';
  html += '<div class="service-card"><div class="svc-icon">\ud83d\udcbc</div><h4>Consultoria Especializada</h4><p>Assessoria t\u00e9cnica e operacional voltada ao segmento de atua\u00e7\u00e3o da empresa.</p></div>';
  html += '<div class="service-card"><div class="svc-icon">\ud83e\udd1d</div><h4>Atendimento ao Cliente</h4><p>Suporte receptivo via WhatsApp Business para clientes e parceiros comerciais.</p></div>';
  html += '</div></div></section>';

  // REGISTRO
  html += '<section class="section" id="registro"><div class="container">';
  html += '<div class="section-title">Dados Cadastrais</div>';
  html += '<div class="section-heading">Informa\u00e7\u00f5es de Registro</div>';
  html += '<div class="data-section"><div class="data-grid">';
  html += '<div class="data-item"><div class="data-label">Raz\u00e3o Social</div><div class="data-value" data-field="razao">' + razaoFmt + '</div></div>';
  html += '<div class="data-item"><div class="data-label">CNPJ</div><div class="data-value" data-field="cnpj">' + cnpjFmt + '</div></div>';
  html += '<div class="data-item"><div class="data-label">Situa\u00e7\u00e3o Cadastral</div><div class="data-value">' + situacaoFmt + '</div></div>';
  html += (porteFmt ? '<div class="data-item"><div class="data-label">Porte</div><div class="data-value">' + porteFmt + '</div></div>' : '');
  html += (natJurFmt ? '<div class="data-item"><div class="data-label">Natureza Jur\u00eddica</div><div class="data-value">' + natJurFmt + '</div></div>' : '');
  html += '<div class="data-item"><div class="data-label">Endere\u00e7o</div><div class="data-value">' + fullAddress + '</div></div>';
  html += (atividadeFmt ? '<div class="data-item"><div class="data-label">Atividade Principal</div><div class="data-value">' + atividadeFmt + '</div></div>' : '');
  html += (emailFmt ? '<div class="data-item"><div class="data-label">Email</div><div class="data-value">' + emailFmt + '</div></div>' : '');
  html += (phoneFmt ? '<div class="data-item"><div class="data-label">WhatsApp</div><div class="data-value" data-field="phone">' + phoneFmt + '</div></div>' : '');
  html += '</div></div>';
  html += '</div></section>';

  // CONTATO
  html += '<section class="section" id="contato"><div class="container">';
  html += '<div class="section-title">Contato</div>';
  html += '<div class="section-heading">Fale Conosco</div>';
  html += '<div class="contact-grid">';
  if (phoneFmt) {
    html += '<div class="contact-card"><h4>' + wppSvg.replace('width:24px;height:24px','width:16px;height:16px') + ' WhatsApp Business</h4><div class="contact-value" data-field="phone">' + phoneFmt + '</div><p>Canal exclusivamente receptivo. Respondemos apenas mensagens iniciadas pelo cliente.</p></div>';
  }
  if (emailFmt) {
    html += '<div class="contact-card"><h4>\u2709\ufe0f Email</h4><div class="contact-value">' + emailFmt + '</div><p>Entre em contato por email para informa\u00e7\u00f5es comerciais e suporte.</p></div>';
  }
  html += '</div>';
  if (phoneFmt) {
    html += '<div class="contact-cta"><a class="btn-cta" data-field="phone">\ud83d\udcf1 Iniciar conversa: ' + phoneFmt + '</a></div>';
  }
  html += '<div class="compliance">' + complianceCompact + '</div>';
  html += '</div></section>';

  // FOOTER
  html += '<footer class="site-footer"><div class="container">';
  html += '\u00a9 ' + razaoFmt + ' \u2014 CNPJ ' + cnpjFmt + ' \u2014 ' + munFmt + '/' + ufFmt;
  html += '</div></footer>';

  html += domScript + '</body></html>';
  return html;
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

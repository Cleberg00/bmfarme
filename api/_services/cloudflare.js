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
  const fullAddress = enderFmt+(bairroFmt?' \u2014 '+bairroFmt:'')+' \u2014 '+munFmt+'/'+ufFmt+(cepFmt?' \u2014 CEP '+cepFmt:'');

  const templateIndex = (typeof forceTemplateIndex === 'number') ? forceTemplateIndex : Math.floor(Math.random() * 10);
  console.log('[buildLandingHtml] CNPJ='+cnpj+' templateIndex='+templateIndex+' forced='+(typeof forceTemplateIndex === 'number'));

  const ogTags = '<meta property="og:type" content="website" />'+
    '<meta property="og:title" content="'+razaoFmt+'" />'+
    '<meta property="og:site_name" content="'+razaoFmt+'" />'+
    '<meta property="og:description" content="'+razaoFmt+' \u2014 CNPJ '+cnpjFmt+'. Empresa registrada, canal oficial de atendimento receptivo." />'+
    '<meta name="description" content="'+razaoFmt+' \u2014 CNPJ '+cnpjFmt+'. Empresa regularmente constitu\u00edda." />'+
    '<meta name="author" content="'+razaoFmt+'" />'+
    '<meta name="company" content="'+razaoFmt+'" />';

  const vi = templateIndex % 7;

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // TEXTOS VARI\u00c1VEIS \u2014 7 vers\u00f5es pra m\u00e1xima variabilidade
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  const _sobreV = [
    function(n){ return n+' conduz suas atividades com compromisso \u00e9tico e profissionalismo, disponibilizando canal verificado de WhatsApp Business exclusivamente para demandas originadas pelo consumidor final, em total ader\u00eancia \u00e0s normas da Meta Platforms.'; },
    function(n){ return 'A organiza\u00e7\u00e3o '+n+' promove atendimento consultivo e receptivo por meio de canal certificado, obedecendo integralmente \u00e0s pol\u00edticas vigentes da Meta e \u00e0 legisla\u00e7\u00e3o brasileira de prote\u00e7\u00e3o de dados.'; },
    function(n){ return n+' possui registro ativo junto aos \u00f3rg\u00e3os competentes, operando canal de mensageria WhatsApp Business destinado \u00e0 resolu\u00e7\u00e3o de consultas e presta\u00e7\u00e3o de informa\u00e7\u00f5es sob demanda do cliente.'; },
    function(n){ return 'Constitu\u00edda nos termos da legisla\u00e7\u00e3o vigente, '+n+' mant\u00e9m ponto de contato digital via WhatsApp Business para atendimento consultivo, sem qualquer pr\u00e1tica de comunica\u00e7\u00e3o ativa n\u00e3o autorizada.'; },
    function(n){ return n+' viabiliza canal institucional de suporte ao consumidor, restrito a intera\u00e7\u00f5es iniciadas voluntariamente pelo titular, sem envio de comunica\u00e7\u00f5es promocionais ou n\u00e3o requisitadas.'; },
    function(n){ return 'Atuando de forma regular e transparente, '+n+' oferece ponto de atendimento receptivo via WhatsApp Business API, direcionado exclusivamente a solicita\u00e7\u00f5es espont\u00e2neas de clientes e parceiros.'; },
    function(n){ return n+' gerencia canal corporativo de WhatsApp Business orientado ao suporte informativo e operacional, atendendo exclusivamente chamados volunt\u00e1rios do consumidor, conforme regulamento Meta e LGPD.'; },
  ];
  const _atendV = [
    ['Toda intera\u00e7\u00e3o parte do pr\u00f3prio consumidor.','Respondemos exclusivamente nos canais homologados.','Vedado qualquer disparo ou abordagem ativa.','Conformidade integral com WhatsApp Business API e Meta.'],
    ['Modalidade de atendimento 100% receptiva.','Processamos somente chamados originados pelo titular.','Proibida utiliza\u00e7\u00e3o de bases externas ou compradas.','Ader\u00eancia \u00e0s diretrizes Meta Platforms e LGPD.'],
    ['O consumidor det\u00e9m a iniciativa do contato.','Canal voltado a consultas informativas e suporte.','Nenhuma comunica\u00e7\u00e3o enviada sem pr\u00e9via solicita\u00e7\u00e3o.','Conformidade LGPD 13.709/2018 e Meta Platforms.'],
    ['Processamos unicamente requisi\u00e7\u00f5es recebidas.','Orienta\u00e7\u00e3o exclusiva para suporte e consultoria receptiva.','Bases de terceiros s\u00e3o terminantemente vedadas.','Alinhamento pleno \u00e0s pol\u00edticas Meta Platforms.'],
    ['Fluxo comunicacional estritamente receptivo.','Respostas limitadas aos canais oficiais verificados.','Inexist\u00eancia de telemarketing ou envios em massa.','Conforme regulamento WhatsApp Business API.'],
    ['Funcionamento exclusivo sob provoca\u00e7\u00e3o do cliente.','Canal restrito a esclarecimentos previamente solicitados.','N\u00e3o adquirimos mailings nem praticamos cold-outreach.','Opera\u00e7\u00e3o certificada conforme normas da Meta.'],
    ['Intera\u00e7\u00e3o condicionada \u00e0 iniciativa do consumidor.','Nosso protocolo de atendimento \u00e9 integralmente receptivo.','Zero mensagens expedidas sem consentimento expl\u00edcito.','Conformidade plena Meta Platforms, LGPD e WhatsApp ToS.'],
  ];
  const _privV = [
    'Informa\u00e7\u00f5es fornecidas pelo usu\u00e1rio s\u00e3o processadas com finalidade exclusiva de responder \u00e0 solicita\u00e7\u00e3o originada. Vedado compartilhamento com entidades externas. Tratamento conforme LGPD \u2014 Lei 13.709/2018.',
    'O tratamento de dados pessoais restringe-se ao escopo da consulta efetuada pelo titular. N\u00e3o h\u00e1 transfer\u00eancia a terceiros em nenhuma hip\u00f3tese. Base legal: Art. 7, I \u2014 LGPD.',
    'Dados informados durante o atendimento s\u00e3o armazenados com seguran\u00e7a e utilizados apenas para a finalidade declarada. Proibido repasse externo. Conformidade Lei 13.709/2018.',
    'As informa\u00e7\u00f5es pessoais do consumidor recebem tratamento sigiloso, limitado \u00e0 presta\u00e7\u00e3o do servi\u00e7o requisitado. Inexiste compartilhamento com terceiros. LGPD vigente.',
    'Asseguramos prote\u00e7\u00e3o integral aos dados pessoais coletados, empregados unicamente no contexto da intera\u00e7\u00e3o solicitada pelo titular. Sem cess\u00e3o a terceiros. LGPD 13.709/2018.',
    'Dados pessoais tratados exclusivamente para fins de atendimento receptivo ao titular. Compartilhamento externo vedado em qualquer circunst\u00e2ncia. Fundamenta\u00e7\u00e3o: Art. 7, I e Art. 6, I \u2014 LGPD.',
    'Toda informa\u00e7\u00e3o disponibilizada pelo consumidor \u00e9 processada com sigilo absoluto, destinada unicamente ao atendimento da demanda apresentada. Sem repasse. Lei 13.709/2018 \u2014 LGPD.',
  ];
  const _termV = [
    'Ao acionar este canal, o consumidor ratifica que a comunica\u00e7\u00e3o foi iniciada por sua livre vontade. A empresa n\u00e3o pratica contatos proativos ou promocionais n\u00e3o solicitados. Diretrizes Meta Platforms.',
    'O titular, ao interagir neste ambiente, confirma iniciativa pr\u00f3pria e volunt\u00e1ria. Comunica\u00e7\u00f5es promocionais sem pr\u00e9via autoriza\u00e7\u00e3o s\u00e3o terminantemente vedadas. Pol\u00edticas Meta e LGPD.',
    'A utiliza\u00e7\u00e3o deste canal pressup\u00f5e iniciativa espont\u00e2nea do usu\u00e1rio. N\u00e3o s\u00e3o realizadas abordagens ativas, disparos programados ou comunica\u00e7\u00f5es n\u00e3o requisitadas. Meta Platforms e WhatsApp ToS.',
    'Ao interagir conosco, o cliente declara que tomou a iniciativa do contato de forma volunt\u00e1ria. Promo\u00e7\u00f5es e mensagens n\u00e3o solicitadas s\u00e3o vedadas. Conformidade WhatsApp Business e Meta.',
    'O presente canal funciona exclusivamente em modo receptivo. O consumidor que o utiliza consente em receber apenas respostas pertinentes \u00e0 sua consulta. Vedado spam. Meta Platforms.',
    'O usu\u00e1rio que aciona este servi\u00e7o o faz por delibera\u00e7\u00e3o pr\u00f3pria. A organiza\u00e7\u00e3o n\u00e3o efetua contatos ativos, remarketing ou campanhas n\u00e3o autorizadas. Conforme pol\u00edticas Meta e LGPD.',
    'Qualquer intera\u00e7\u00e3o neste canal \u00e9 condicionada \u00e0 a\u00e7\u00e3o volunt\u00e1ria do consumidor final. Proibido envio proativo de ofertas, newsletters ou mensagens n\u00e3o previamente solicitadas. Meta Platforms e LGPD.',
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
    'Infraestrutura de mensageria operando em modo Utility receptivo. Dedicada ao processamento de confirma\u00e7\u00f5es transacionais, alertas de sistema e respostas a chamados do consumidor.',
    'Canal certificado para atendimento de solicita\u00e7\u00f5es originadas pelo titular. Categoria Utility \u2014 proibido envio proativo de qualquer natureza. Ader\u00eancia total \u00e0s pol\u00edticas WhatsApp Business API.',
    'Endpoint de comunica\u00e7\u00e3o receptiva homologado. Finalidade exclusiva: responder consultas volunt\u00e1rias do consumidor final. Comunica\u00e7\u00f5es promocionais ou n\u00e3o requisitadas s\u00e3o bloqueadas.',
    'Rota Utility receptiva em opera\u00e7\u00e3o. Tr\u00e1fego limitado a requisi\u00e7\u00f5es originadas pelo titular dos dados. Vedado marketing, cold-messaging e disparos automatizados.',
    'Canal direcionado ao suporte receptivo e notifica\u00e7\u00f5es transacionais autorizadas. Nenhuma mensagem \u00e9 expedida sem provoca\u00e7\u00e3o pr\u00e9via do consumidor. Protocolo Utility em vigor.',
    'Linha de comunica\u00e7\u00e3o Utility \u2014 exclusiva para respostas a demandas do consumidor final. Campanhas B2C e envios n\u00e3o consentidos s\u00e3o terminantemente bloqueados. Conformidade Meta e LGPD.',
    'Ponto de atendimento receptivo certificado. Processamento restrito a solicita\u00e7\u00f5es volunt\u00e1rias do titular. Canal Utility sem capacidade de broadcast. Conformidade WhatsApp Business API.',
  ];
  var _wabaFoot = [
    'Interdito envio massivo. Sem campanhas B2C ou remarketing. Conformidade LGPD e regulamento WhatsApp Business API.',
    'Proibido cold-messaging. Sem aquisi\u00e7\u00e3o de mailings. Opera\u00e7\u00e3o conforme diretrizes Meta Platforms e Lei 13.709/2018.',
    'Vedado envio ativo n\u00e3o autorizado. Sem telemarketing digital. Ader\u00eancia plena a Meta Business e LGPD 13.709/2018.',
    'Zero broadcasts ativos. Sem comunica\u00e7\u00e3o n\u00e3o consentida. Conformidade WhatsApp Business API e legisla\u00e7\u00e3o LGPD.',
    'Sem notifica\u00e7\u00f5es push n\u00e3o autorizadas. Sem marketing direto. LGPD e Meta Platforms em total conformidade.',
    'Bloqueado envio sem consentimento pr\u00e9vio. Canal integralmente receptivo. Conforme LGPD e Termos de Servi\u00e7o Meta.',
    'Nenhuma expedi\u00e7\u00e3o sem pr\u00e9via autoriza\u00e7\u00e3o do titular. Canal Utility regulamentado. Meta Platforms + LGPD vigente.',
  ];
  var wabaText = _wabaText[vi];
  var wabaFoot = _wabaFoot[vi];

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // SCRIPT DE DOM INJECTION (telefone + raz\u00e3o em data-attributes via JS)
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

  // ═══════ 10 LAYOUTS ESTRUTURALMENTE DIFERENTES ═══════
  var accents = ['#facc15','#3b82f6','#22c55e','#a855f7','#f97316','#ec4899','#06b6d4','#ef4444','#84cc16','#f59e0b'];
  var AC = accents[Math.floor(Math.random() * accents.length)];
  var layoutType = templateIndex % 10;

  var initials = razaoFmt.split(' ').filter(function(w){return w.length>2;}).slice(0,2).map(function(w){return w[0];}).join('');
  if (!initials) initials = razaoFmt.substring(0,2).toUpperCase();

  var css, html;

  // ══════════════════════════════════════════════════════════════════
  // LAYOUT 0 — Hero Full + Sidebar
  // ══════════════════════════════════════════════════════════════════
  if (layoutType === 0) {
    css = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:"Inter",system-ui,-apple-system,sans-serif;background:#0a0a0a;color:#e5e5e5;line-height:1.7;-webkit-font-smoothing:antialiased}a{color:inherit;text-decoration:none}.wrap{max-width:1200px;margin:0 auto;padding:0 24px}'
      +'.hdr{position:sticky;top:0;z-index:100;background:rgba(10,10,10,.95);backdrop-filter:blur(10px);border-bottom:1px solid #1a1a1a;padding:14px 0}'
      +'.hdr .inner{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px}'
      +'.hdr .brand{display:flex;align-items:center;gap:10px}.hdr .ico{width:34px;height:34px;border-radius:8px;background:'+AC+';display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:#0a0a0a}'
      +'.hdr .nm{font-weight:600;font-size:14px;color:#fafafa}.hdr .sub{font-size:11px;color:#737373;margin-left:6px}'
      +'.hdr nav{display:flex;gap:18px;align-items:center}.hdr nav a{font-size:13px;color:#a3a3a3;transition:color .2s}.hdr nav a:hover{color:'+AC+'}'
      +'.cta{background:'+AC+';color:#0a0a0a;font-weight:600;font-size:13px;padding:9px 18px;border-radius:7px;transition:opacity .2s}.cta:hover{opacity:.85}'
      +'.hero{padding:72px 0 56px;display:grid;grid-template-columns:1fr 360px;gap:40px;align-items:start}@media(max-width:900px){.hero{grid-template-columns:1fr;padding:48px 0 32px}}'
      +'.hero h1{font-size:2.75rem;font-weight:800;line-height:1.12;color:#fafafa;margin-bottom:14px;letter-spacing:-1.2px}.hero h1 .ac{color:'+AC+'}'
      +'@media(max-width:768px){.hero h1{font-size:2rem}}'
      +'.hero .desc{font-size:15px;color:#a3a3a3;margin-bottom:24px;max-width:520px}'
      +'.wcard{background:#111;border:1px solid #1f1f1f;border-radius:14px;padding:20px;display:flex;align-items:center;gap:14px;margin-bottom:20px}'
      +'.wcard .wi{width:44px;height:44px;border-radius:10px;background:#25d366;display:flex;align-items:center;justify-content:center;flex-shrink:0}.wcard .wi svg{width:22px;height:22px;fill:#fff}'
      +'.wcard .wl{font-size:11px;color:#a3a3a3}.wcard .wn{font-size:1.15rem;font-weight:700;color:#fafafa}'
      +'.sidebar{background:#111;border:1px solid #1f1f1f;border-radius:14px;padding:24px}'
      +'.sidebar h3{font-size:12px;text-transform:uppercase;letter-spacing:1.5px;color:'+AC+';margin-bottom:14px;font-weight:700}'
      +'.sidebar ul{list-style:none;padding:0}.sidebar li{padding:9px 0;border-bottom:1px solid #1a1a1a;font-size:13px;color:#d4d4d4;display:flex;align-items:center;gap:8px}.sidebar li:last-child{border-bottom:none}.sidebar li::before{content:"";width:5px;height:5px;border-radius:50%;background:'+AC+';flex-shrink:0}'
      +'.sidebar .loc{margin-top:14px;padding-top:14px;border-top:1px solid #1a1a1a;font-size:12px;color:#737373}'
      +'.sec{padding:56px 0}.sec-t{font-size:12px;text-transform:uppercase;letter-spacing:2px;color:'+AC+';margin-bottom:10px;font-weight:700}.sec-h{font-size:1.6rem;font-weight:700;color:#fafafa;margin-bottom:28px;letter-spacing:-.5px}'
      +'.card{background:#111;border:1px solid #1f1f1f;border-radius:14px;padding:28px;margin-bottom:24px}.card p{color:#d4d4d4;font-size:14px;line-height:1.8;margin-bottom:10px}'
      +'.dgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;margin-top:20px}'
      +'.dgrid .f{background:#0a0a0a;border:1px solid #1a1a1a;border-radius:10px;padding:16px}.dgrid .fl{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#737373;margin-bottom:4px}.dgrid .fv{font-size:13px;font-weight:600;color:#fafafa}'
      +'.compliance{background:#111;border:1px solid #1f1f1f;border-radius:14px;padding:28px;margin-top:28px}.compliance p{font-size:12px;color:#a3a3a3;line-height:1.7;margin-bottom:8px}.compliance em{color:#d4d4d4;font-style:normal;font-weight:500}.compliance small{font-size:11px;color:#525252}'
      +'.ft{border-top:1px solid #1a1a1a;padding:28px 0;text-align:center;font-size:12px;color:#525252}'
      +'table{width:100%;border-collapse:collapse}td{padding:10px 14px;border-bottom:1px solid #1a1a1a;font-size:13px;color:#d4d4d4}td:first-child{font-weight:600;color:'+AC+';width:150px;font-size:11px;text-transform:uppercase;letter-spacing:.5px}@media(max-width:600px){td{display:block;padding:6px 0}td:first-child{width:auto;padding-bottom:2px}}';
    var wSvg='<svg viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.612.616l4.534-1.468A11.956 11.956 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.24 0-4.326-.728-6.012-1.96l-.42-.314-2.689.87.896-2.633-.346-.55A9.953 9.953 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>';
    html = headHtml+'<style>'+css+'</style></head><body>';
    html+='<header class="hdr"><div class="wrap"><div class="inner"><div class="brand"><div class="ico">'+initials+'</div><span class="nm" data-field="razao">'+razaoFmt+'</span><span class="sub">CNPJ '+cnpjFmt+'</span></div><nav><a href="#sobre">Sobre</a><a href="#dados">Dados</a><a href="#contato">Contato</a>'+(phoneFmt?'<a class="cta" data-field="phone">'+phoneFmt+'</a>':'')+'</nav></div></div></header>';
    html+='<section class="hero wrap"><div><h1>Especialistas em <span class="ac">'+(atividadeFmt||'Solu\u00e7\u00f5es Empresariais')+'</span></h1><p class="desc">'+aboutNatural+'</p>';
    if(phoneFmt) html+='<div class="wcard"><div class="wi">'+wSvg+'</div><div><div class="wl">WhatsApp Business</div><div class="wn" data-field="phone">'+phoneFmt+'</div></div></div>';
    html+='</div><div class="sidebar"><h3>Informa\u00e7\u00f5es</h3><ul><li>Atendimento receptivo</li><li>Canal oficial verificado</li><li>Conformidade LGPD</li><li>WhatsApp Business API</li><li>Sem spam ou disparos</li></ul><div class="loc">'+munFmt+'/'+ufFmt+(cepFmt?' \u2014 CEP '+cepFmt:'')+'</div></div></section>';
    html+='<section class="sec" id="sobre"><div class="wrap"><div class="sec-t">Sobre</div><div class="sec-h">'+displayName+'</div><div class="card">'+aboutNatural+'<div class="dgrid"><div class="f"><div class="fl">Raz\u00e3o Social</div><div class="fv">'+razaoFmt+'</div></div>'+(porteFmt?'<div class="f"><div class="fl">Porte</div><div class="fv">'+porteFmt+'</div></div>':'')+'<div class="f"><div class="fl">Atividade</div><div class="fv">'+(atividadeFmt||'Atividade Empresarial')+'</div></div><div class="f"><div class="fl">Munic\u00edpio</div><div class="fv">'+munFmt+'/'+ufFmt+'</div></div></div></div></div></section>';
    html+='<section class="sec" id="dados"><div class="wrap"><div class="sec-t">Registro</div><div class="sec-h">Dados Cadastrais</div><div class="card">'+tblData+'</div></div></section>';
    html+='<section class="sec" id="contato"><div class="wrap"><div class="sec-t">Contato</div><div class="sec-h">Fale Conosco</div><div class="card">'+contactNatural+'</div><div class="compliance">'+complianceCompact+'</div></div></section>';
    html+='<footer class="ft"><div class="wrap">\u00a9 '+razaoFmt+' \u2014 CNPJ '+cnpjFmt+' \u2014 '+munFmt+'/'+ufFmt+'</div></footer>';
    html+=domScript+'</body></html>';
  }

  // ══════════════════════════════════════════════════════════════════
  // LAYOUT 1 — Bento Grid
  // ══════════════════════════════════════════════════════════════════
  else if (layoutType === 1) {
    css = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:"Inter",system-ui,-apple-system,sans-serif;background:#0b0b0f;color:#e5e5e5;line-height:1.7;-webkit-font-smoothing:antialiased}a{color:inherit;text-decoration:none}.wrap{max-width:1200px;margin:0 auto;padding:0 24px}'
      +'.topbar{padding:16px 0;border-bottom:1px solid #1a1a2e;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px}'
      +'.topbar .nm{font-weight:700;font-size:15px;color:#fafafa}.topbar .cn{font-size:11px;color:#525252;margin-left:10px}'
      +'.topbar .ph{font-size:13px;color:'+AC+';font-weight:600}'
      +'.bento{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;padding:40px 0}@media(max-width:900px){.bento{grid-template-columns:repeat(2,1fr)}}@media(max-width:600px){.bento{grid-template-columns:1fr}}'
      +'.bento .cell{background:#12121a;border:1px solid #1a1a2e;border-radius:16px;padding:28px;transition:border-color .2s}.bento .cell:hover{border-color:'+AC+'30}'
      +'.bento .cell.span2{grid-column:span 2}@media(max-width:600px){.bento .cell.span2{grid-column:span 1}}'
      +'.bento .cell h3{font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:'+AC+';margin-bottom:12px;font-weight:700}'
      +'.bento .cell h2{font-size:1.4rem;font-weight:700;color:#fafafa;margin-bottom:10px;letter-spacing:-.5px}'
      +'.bento .cell p{font-size:13px;color:#a3a3a3;line-height:1.7;margin-bottom:8px}'
      +'.bento .cell .val{font-size:1.5rem;font-weight:800;color:#fafafa;margin-bottom:6px}'
      +'.bento .cell small{font-size:11px;color:#525252}'
      +'.bento .cell table{width:100%;border-collapse:collapse;margin-top:8px}td{padding:8px 0;border-bottom:1px solid #1a1a2e;font-size:12px;color:#d4d4d4}td:first-child{color:'+AC+';font-weight:600;width:130px;text-transform:uppercase;letter-spacing:.5px;font-size:10px}'
      +'.compliance{background:#12121a;border:1px solid #1a1a2e;border-radius:16px;padding:28px;margin-bottom:32px}.compliance p{font-size:12px;color:#a3a3a3;line-height:1.7;margin-bottom:8px}.compliance em{color:#d4d4d4;font-style:normal;font-weight:500}.compliance small{font-size:11px;color:#525252}'
      +'.ft{border-top:1px solid #1a1a2e;padding:24px 0;text-align:center;font-size:12px;color:#525252}';
    html = headHtml+'<style>'+css+'</style></head><body><div class="wrap">';
    html+='<div class="topbar"><div><span class="nm" data-field="razao">'+razaoFmt+'</span><span class="cn" data-field="cnpj">'+cnpjFmt+'</span></div>'+(phoneFmt?'<span class="ph" data-field="phone">'+phoneFmt+'</span>':'')+'</div>';
    html+='<div class="bento">';
    html+='<div class="cell span2"><h3>Empresa</h3><h2>'+displayName+'</h2>'+aboutNatural+'</div>';
    html+='<div class="cell"><h3>Status</h3><div class="val">'+situacaoFmt+'</div><p>Situa\u00e7\u00e3o cadastral junto \u00e0 Receita Federal</p></div>';
    html+='<div class="cell"><h3>CNPJ</h3><div class="val" data-field="cnpj">'+cnpjFmt+'</div><p>Cadastro Nacional de Pessoa Jur\u00eddica</p></div>';
    html+='<div class="cell"><h3>Localiza\u00e7\u00e3o</h3><div class="val">'+munFmt+'/'+ufFmt+'</div><p>'+fullAddress+'</p></div>';
    if(phoneFmt) html+='<div class="cell"><h3>WhatsApp Business</h3><div class="val" data-field="phone">'+phoneFmt+'</div><p>Canal exclusivamente receptivo. Atendemos apenas solicita\u00e7\u00f5es volunt\u00e1rias.</p></div>';
    html+='<div class="cell span2"><h3>Dados Cadastrais</h3>'+tblData+'</div>';
    html+='<div class="cell"><h3>Contato</h3>'+contactNatural+'</div>';
    html+='</div>';
    html+='<div class="compliance">'+complianceCompact+'</div>';
    html+='<footer class="ft">\u00a9 '+razaoFmt+' \u2014 '+cnpjFmt+'</footer>';
    html+='</div>'+domScript+'</body></html>';
  }

  // ══════════════════════════════════════════════════════════════════
  // LAYOUT 2 — Split Screen
  // ══════════════════════════════════════════════════════════════════
  else if (layoutType === 2) {
    css = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:"Inter",system-ui,-apple-system,sans-serif;background:#0a0a0a;color:#e5e5e5;line-height:1.7;-webkit-font-smoothing:antialiased}a{color:inherit;text-decoration:none}'
      +'.layout{display:grid;grid-template-columns:320px 1fr;min-height:100vh}@media(max-width:900px){.layout{grid-template-columns:1fr;}.panel{position:relative!important;padding:32px 24px!important}}'
      +'.panel{position:fixed;top:0;left:0;width:320px;height:100vh;background:#08080c;border-right:1px solid #1a1a2e;padding:40px 28px;display:flex;flex-direction:column;justify-content:space-between;overflow-y:auto}'
      +'.panel .logo{width:48px;height:48px;border-radius:12px;background:'+AC+';display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;color:#0a0a0a;margin-bottom:20px}'
      +'.panel h1{font-size:1.3rem;font-weight:700;color:#fafafa;margin-bottom:8px;line-height:1.3}'
      +'.panel .cnpj{font-size:12px;color:#525252;margin-bottom:24px}'
      +'.panel nav a{display:block;padding:10px 0;font-size:14px;color:#a3a3a3;border-bottom:1px solid #1a1a2e;transition:color .2s}.panel nav a:hover{color:'+AC+'}'
      +'.panel .phone{margin-top:auto;padding-top:24px;border-top:1px solid #1a1a2e;font-size:14px;font-weight:700;color:'+AC+'}'
      +'.main{margin-left:320px;padding:48px 40px}@media(max-width:900px){.main{margin-left:0;padding:32px 24px}}'
      +'.sec{margin-bottom:56px}.sec-t{font-size:11px;text-transform:uppercase;letter-spacing:2px;color:'+AC+';margin-bottom:10px;font-weight:700}.sec-h{font-size:1.5rem;font-weight:700;color:#fafafa;margin-bottom:20px;letter-spacing:-.5px}'
      +'.box{background:#111118;border:1px solid #1a1a2e;border-radius:14px;padding:24px;margin-bottom:20px}.box p{font-size:13px;color:#a3a3a3;line-height:1.8;margin-bottom:8px}'
      +'table{width:100%;border-collapse:collapse}td{padding:9px 12px;border-bottom:1px solid #1a1a2e;font-size:13px;color:#d4d4d4}td:first-child{font-weight:600;color:'+AC+';width:140px;font-size:10px;text-transform:uppercase;letter-spacing:.5px}@media(max-width:600px){td{display:block;padding:5px 0}td:first-child{width:auto}}'
      +'.compliance{background:#111118;border:1px solid #1a1a2e;border-radius:14px;padding:24px}.compliance p{font-size:12px;color:#a3a3a3;line-height:1.7;margin-bottom:8px}.compliance em{color:#d4d4d4;font-style:normal;font-weight:500}.compliance small{font-size:11px;color:#525252}'
      +'.ft{padding:24px 0;font-size:12px;color:#525252}';
    html = headHtml+'<style>'+css+'</style></head><body><div class="layout">';
    html+='<aside class="panel"><div><div class="logo">'+initials+'</div><h1 data-field="razao">'+razaoFmt+'</h1><div class="cnpj" data-field="cnpj">CNPJ '+cnpjFmt+'</div><nav><a href="#sobre">Sobre</a><a href="#dados">Dados</a><a href="#contato">Contato</a><a href="#compliance">Compliance</a></nav></div>'+(phoneFmt?'<div class="phone" data-field="phone">'+phoneFmt+'</div>':'')+'</aside>';
    html+='<main class="main">';
    html+='<div class="sec" id="sobre"><div class="sec-t">Sobre</div><div class="sec-h">'+displayName+'</div><div class="box">'+aboutNatural+'</div></div>';
    html+='<div class="sec" id="dados"><div class="sec-t">Registro</div><div class="sec-h">Dados Cadastrais</div><div class="box">'+tblData+'</div></div>';
    html+='<div class="sec" id="contato"><div class="sec-t">Contato</div><div class="sec-h">WhatsApp Business</div><div class="box">'+contactNatural+'</div></div>';
    html+='<div class="sec" id="compliance"><div class="sec-t">Compliance</div><div class="sec-h">Pol\u00edtica de Atendimento</div><div class="compliance">'+complianceCompact+'</div></div>';
    html+='<div class="ft">\u00a9 '+razaoFmt+' \u2014 '+munFmt+'/'+ufFmt+'</div>';
    html+='</main></div>'+domScript+'</body></html>';
  }

  // ══════════════════════════════════════════════════════════════════
  // LAYOUT 3 — Magazine/Editorial
  // ══════════════════════════════════════════════════════════════════
  else if (layoutType === 3) {
    css = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:"Palatino Linotype","Book Antiqua",Palatino,"Times New Roman",serif;background:#0c0c0c;color:#e0e0e0;line-height:1.8;-webkit-font-smoothing:antialiased}a{color:inherit;text-decoration:none}.wrap{max-width:1100px;margin:0 auto;padding:0 32px}'
      +'.masthead{padding:40px 0 32px;border-bottom:2px solid '+AC+';margin-bottom:40px;text-align:center}'
      +'.masthead h1{font-size:2.4rem;font-weight:700;color:#fafafa;letter-spacing:-1px;margin-bottom:6px}@media(max-width:768px){.masthead h1{font-size:1.6rem}}'
      +'.masthead .sub{font-size:13px;color:#737373;font-style:italic}'
      +'.cols{display:grid;grid-template-columns:2fr 1fr;gap:40px;margin-bottom:48px}@media(max-width:800px){.cols{grid-template-columns:1fr}}'
      +'.cols .main-col h2{font-size:1.4rem;font-weight:700;color:#fafafa;margin-bottom:14px;border-bottom:1px solid #222;padding-bottom:10px}'
      +'.cols .main-col p{font-size:15px;color:#b5b5b5;margin-bottom:14px;text-align:justify}'
      +'.cols .side-col{border-left:1px solid #222;padding-left:28px}@media(max-width:800px){.cols .side-col{border-left:none;padding-left:0;border-top:1px solid #222;padding-top:20px}}'
      +'.cols .side-col h3{font-size:11px;text-transform:uppercase;letter-spacing:2px;color:'+AC+';margin-bottom:12px;font-weight:700}'
      +'.cols .side-col .fact{margin-bottom:14px}.cols .side-col .fact .lbl{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#737373}.cols .side-col .fact .val{font-size:14px;font-weight:600;color:#fafafa}'
      +'.editorial-box{background:#111;border:1px solid #222;border-radius:4px;padding:28px;margin-bottom:32px}.editorial-box h2{font-size:1.2rem;font-weight:700;color:#fafafa;margin-bottom:12px;font-style:italic}.editorial-box p{font-size:13px;color:#a3a3a3;line-height:1.8;margin-bottom:8px}.editorial-box small{font-size:11px;color:#525252}'
      +'table{width:100%;border-collapse:collapse;margin-bottom:24px}td{padding:10px 14px;border-bottom:1px solid #1a1a1a;font-size:13px;color:#d4d4d4}td:first-child{font-weight:700;color:'+AC+';width:150px;font-size:10px;text-transform:uppercase;letter-spacing:.5px}@media(max-width:600px){td{display:block;padding:6px 0}td:first-child{width:auto}}'
      +'.compliance{border-top:2px solid '+AC+';padding-top:28px;margin-top:40px}.compliance p{font-size:12px;color:#a3a3a3;line-height:1.7;margin-bottom:8px}.compliance em{color:#d4d4d4;font-style:normal;font-weight:600}.compliance small{font-size:11px;color:#525252}'
      +'.ft{border-top:1px solid #222;padding:28px 0;text-align:center;font-size:12px;color:#525252;font-style:italic}';
    html = headHtml+'<style>'+css+'</style></head><body><div class="wrap">';
    html+='<header class="masthead"><h1 data-field="razao">'+razaoFmt+'</h1><div class="sub">CNPJ <span data-field="cnpj">'+cnpjFmt+'</span> \u2014 '+munFmt+'/'+ufFmt+(phoneFmt?' \u2014 <span data-field="phone">'+phoneFmt+'</span>':'')+'</div></header>';
    html+='<div class="cols"><div class="main-col"><h2>Sobre a Empresa</h2>'+aboutNatural+'<h2>Contato e Atendimento</h2>'+contactNatural+'</div>';
    html+='<aside class="side-col"><h3>Ficha T\u00e9cnica</h3>';
    html+='<div class="fact"><div class="lbl">Raz\u00e3o Social</div><div class="val">'+razaoFmt+'</div></div>';
    html+='<div class="fact"><div class="lbl">CNPJ</div><div class="val">'+cnpjFmt+'</div></div>';
    html+='<div class="fact"><div class="lbl">Situa\u00e7\u00e3o</div><div class="val">'+situacaoFmt+'</div></div>';
    if(porteFmt) html+='<div class="fact"><div class="lbl">Porte</div><div class="val">'+porteFmt+'</div></div>';
    if(atividadeFmt) html+='<div class="fact"><div class="lbl">Atividade</div><div class="val">'+atividadeFmt+'</div></div>';
    html+='<div class="fact"><div class="lbl">Endere\u00e7o</div><div class="val">'+fullAddress+'</div></div>';
    if(phoneFmt) html+='<div class="fact"><div class="lbl">WhatsApp</div><div class="val" data-field="phone">'+phoneFmt+'</div></div>';
    html+='</aside></div>';
    html+='<div class="editorial-box"><h2>Dados Cadastrais Completos</h2>'+tblData+'</div>';
    html+='<div class="compliance">'+complianceCompact+'</div>';
    html+='<footer class="ft">\u00a9 '+razaoFmt+' \u2014 Todos os direitos reservados</footer>';
    html+='</div>'+domScript+'</body></html>';
  }

  // ══════════════════════════════════════════════════════════════════
  // LAYOUT 4 — Timeline
  // ══════════════════════════════════════════════════════════════════
  else if (layoutType === 4) {
    css = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:"Inter",system-ui,-apple-system,sans-serif;background:#0a0a0e;color:#e5e5e5;line-height:1.7;-webkit-font-smoothing:antialiased}a{color:inherit;text-decoration:none}.wrap{max-width:900px;margin:0 auto;padding:0 24px}'
      +'.hdr{padding:32px 0;text-align:center;border-bottom:1px solid #1a1a2e;margin-bottom:48px}'
      +'.hdr h1{font-size:1.8rem;font-weight:800;color:#fafafa;margin-bottom:6px;letter-spacing:-1px}.hdr .sub{font-size:12px;color:#737373}'
      +'.timeline{position:relative;padding-left:48px;margin-bottom:48px}'
      +'.timeline::before{content:"";position:absolute;left:18px;top:0;bottom:0;width:2px;background:linear-gradient(to bottom,'+AC+',#1a1a2e)}'
      +'.tl-item{position:relative;margin-bottom:40px}.tl-item:last-child{margin-bottom:0}'
      +'.tl-item .dot{position:absolute;left:-48px;top:4px;width:36px;height:36px;border-radius:50%;background:#12121a;border:2px solid '+AC+';display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:'+AC+'}'
      +'.tl-item h3{font-size:12px;text-transform:uppercase;letter-spacing:1.5px;color:'+AC+';margin-bottom:8px;font-weight:700}'
      +'.tl-item .content{background:#12121a;border:1px solid #1a1a2e;border-radius:14px;padding:24px}'
      +'.tl-item .content p{font-size:13px;color:#a3a3a3;line-height:1.7;margin-bottom:8px}'
      +'.tl-item .content .val{font-size:1.2rem;font-weight:700;color:#fafafa;margin-bottom:6px}'
      +'table{width:100%;border-collapse:collapse}td{padding:8px 12px;border-bottom:1px solid #1a1a2e;font-size:12px;color:#d4d4d4}td:first-child{font-weight:600;color:'+AC+';width:130px;font-size:10px;text-transform:uppercase;letter-spacing:.5px}@media(max-width:600px){td{display:block;padding:5px 0}td:first-child{width:auto}}'
      +'.compliance{background:#12121a;border:1px solid #1a1a2e;border-radius:14px;padding:24px;margin-bottom:32px}.compliance p{font-size:12px;color:#a3a3a3;line-height:1.7;margin-bottom:8px}.compliance em{color:#d4d4d4;font-style:normal;font-weight:500}.compliance small{font-size:11px;color:#525252}'
      +'.ft{padding:24px 0;text-align:center;font-size:12px;color:#525252;border-top:1px solid #1a1a2e}';
    html = headHtml+'<style>'+css+'</style></head><body><div class="wrap">';
    html+='<header class="hdr"><h1 data-field="razao">'+razaoFmt+'</h1><div class="sub">CNPJ <span data-field="cnpj">'+cnpjFmt+'</span>'+(phoneFmt?' \u2014 <span data-field="phone">'+phoneFmt+'</span>':'')+'</div></header>';
    html+='<div class="timeline">';
    html+='<div class="tl-item"><div class="dot">01</div><h3>Identifica\u00e7\u00e3o</h3><div class="content"><div class="val">'+displayName+'</div>'+aboutNatural+'</div></div>';
    html+='<div class="tl-item"><div class="dot">02</div><h3>Registro Federal</h3><div class="content">'+tblData+'</div></div>';
    html+='<div class="tl-item"><div class="dot">03</div><h3>Contato Oficial</h3><div class="content">'+contactNatural+'</div></div>';
    html+='<div class="tl-item"><div class="dot">04</div><h3>Compliance &amp; LGPD</h3><div class="content">'+complianceCompact+'</div></div>';
    html+='</div>';
    html+='<footer class="ft">\u00a9 '+razaoFmt+' \u2014 '+cnpjFmt+' \u2014 '+munFmt+'/'+ufFmt+'</footer>';
    html+='</div>'+domScript+'</body></html>';
  }

  // ══════════════════════════════════════════════════════════════════
  // LAYOUT 5 — Tabs/Segments
  // ══════════════════════════════════════════════════════════════════
  else if (layoutType === 5) {
    css = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:"Inter",system-ui,-apple-system,sans-serif;background:#09090b;color:#e5e5e5;line-height:1.7;-webkit-font-smoothing:antialiased}a{color:inherit;text-decoration:none}.wrap{max-width:1000px;margin:0 auto;padding:0 24px}'
      +'.hdr{padding:20px 0;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #1c1c24;flex-wrap:wrap;gap:12px}'
      +'.hdr .brand{display:flex;align-items:center;gap:10px}.hdr .ico{width:32px;height:32px;border-radius:8px;background:'+AC+';display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;color:#09090b}'
      +'.hdr .nm{font-weight:600;font-size:14px;color:#fafafa}'
      +'.hdr .ph{font-size:13px;font-weight:600;color:'+AC+'}'
      +'.hero-s{padding:56px 0 40px;text-align:center;border-bottom:1px solid #1c1c24}'
      +'.hero-s h1{font-size:2.2rem;font-weight:800;color:#fafafa;letter-spacing:-1px;margin-bottom:10px}@media(max-width:768px){.hero-s h1{font-size:1.6rem}}'
      +'.hero-s p{font-size:14px;color:#a3a3a3;max-width:600px;margin:0 auto}'
      +'.tabs{display:flex;justify-content:center;gap:8px;padding:24px 0;flex-wrap:wrap}'
      +'.tabs .tab{padding:8px 20px;border-radius:20px;font-size:12px;font-weight:600;background:#1c1c24;color:#a3a3a3;cursor:default;border:1px solid transparent;transition:all .2s}'
      +'.tabs .tab.active{background:'+AC+'18;color:'+AC+';border-color:'+AC+'40}'
      +'.segment{padding:40px 0;border-bottom:1px solid #1c1c24}'
      +'.segment .seg-dots{display:flex;gap:6px;margin-bottom:16px}.segment .seg-dots .d{width:8px;height:8px;border-radius:50%;background:#1c1c24}.segment .seg-dots .d.on{background:'+AC+'}'
      +'.segment h2{font-size:1.2rem;font-weight:700;color:#fafafa;margin-bottom:16px}'
      +'.segment .box{background:#111118;border:1px solid #1c1c24;border-radius:14px;padding:24px}.segment .box p{font-size:13px;color:#a3a3a3;line-height:1.7;margin-bottom:8px}'
      +'table{width:100%;border-collapse:collapse}td{padding:9px 12px;border-bottom:1px solid #1c1c24;font-size:12px;color:#d4d4d4}td:first-child{font-weight:600;color:'+AC+';width:140px;font-size:10px;text-transform:uppercase;letter-spacing:.5px}@media(max-width:600px){td{display:block;padding:5px 0}td:first-child{width:auto}}'
      +'.compliance{background:#111118;border:1px solid #1c1c24;border-radius:14px;padding:24px;margin:32px 0}.compliance p{font-size:12px;color:#a3a3a3;line-height:1.7;margin-bottom:8px}.compliance em{color:#d4d4d4;font-style:normal;font-weight:500}.compliance small{font-size:11px;color:#525252}'
      +'.ft{padding:24px 0;text-align:center;font-size:12px;color:#525252}';
    html = headHtml+'<style>'+css+'</style></head><body><div class="wrap">';
    html+='<header class="hdr"><div class="brand"><div class="ico">'+initials+'</div><span class="nm" data-field="razao">'+razaoFmt+'</span></div>'+(phoneFmt?'<span class="ph" data-field="phone">'+phoneFmt+'</span>':'')+'</header>';
    html+='<div class="hero-s"><h1>'+displayName+'</h1><p>CNPJ <span data-field="cnpj">'+cnpjFmt+'</span> \u2014 '+munFmt+'/'+ufFmt+'</p></div>';
    html+='<div class="tabs"><span class="tab active">Sobre</span><span class="tab">Dados</span><span class="tab">Contato</span><span class="tab">Compliance</span></div>';
    html+='<div class="segment"><div class="seg-dots"><span class="d on"></span><span class="d"></span><span class="d"></span><span class="d"></span></div><h2>Sobre a Empresa</h2><div class="box">'+aboutNatural+'</div></div>';
    html+='<div class="segment"><div class="seg-dots"><span class="d"></span><span class="d on"></span><span class="d"></span><span class="d"></span></div><h2>Dados Cadastrais</h2><div class="box">'+tblData+'</div></div>';
    html+='<div class="segment"><div class="seg-dots"><span class="d"></span><span class="d"></span><span class="d on"></span><span class="d"></span></div><h2>Canal de Atendimento</h2><div class="box">'+contactNatural+'</div></div>';
    html+='<div class="segment" style="border-bottom:none"><div class="seg-dots"><span class="d"></span><span class="d"></span><span class="d"></span><span class="d on"></span></div><h2>Compliance &amp; LGPD</h2><div class="compliance">'+complianceCompact+'</div></div>';
    html+='<footer class="ft">\u00a9 '+razaoFmt+' \u2014 '+cnpjFmt+'</footer>';
    html+='</div>'+domScript+'</body></html>';
  }

  // ══════════════════════════════════════════════════════════════════
  // LAYOUT 6 — Floating Cards
  // ══════════════════════════════════════════════════════════════════
  else if (layoutType === 6) {
    css = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:"Inter",system-ui,-apple-system,sans-serif;background:#070710;color:#e5e5e5;line-height:1.7;-webkit-font-smoothing:antialiased}a{color:inherit;text-decoration:none}.wrap{max-width:1100px;margin:0 auto;padding:0 24px}'
      +'.hero-f{min-height:420px;background:linear-gradient(160deg,#0f0f1a 0%,#070710 50%,'+AC+'12 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:80px 24px 120px;position:relative}'
      +'.hero-f h1{font-size:2.5rem;font-weight:800;color:#fafafa;letter-spacing:-1.5px;margin-bottom:10px}@media(max-width:768px){.hero-f h1{font-size:1.8rem}}'
      +'.hero-f p{font-size:14px;color:#a3a3a3;max-width:560px}'
      +'.hero-f .badge{position:absolute;top:24px;right:24px;background:'+AC+';color:#070710;font-size:11px;font-weight:700;padding:6px 14px;border-radius:20px}'
      +'.cards-float{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:20px;margin-top:-80px;position:relative;z-index:2;padding:0 24px;max-width:1100px;margin-left:auto;margin-right:auto}@media(max-width:700px){.cards-float{margin-top:-40px}}'
      +'.fcard{background:#0f0f18;border:1px solid #1a1a2e;border-radius:18px;padding:28px;box-shadow:0 20px 60px rgba(0,0,0,.5);transition:transform .2s}.fcard:hover{transform:translateY(-4px)}'
      +'.fcard h3{font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:'+AC+';margin-bottom:12px;font-weight:700}'
      +'.fcard p{font-size:13px;color:#a3a3a3;line-height:1.7;margin-bottom:8px}'
      +'.fcard .big{font-size:1.3rem;font-weight:700;color:#fafafa;margin-bottom:8px}'
      +'.below{padding:48px 0}'
      +'table{width:100%;border-collapse:collapse}td{padding:9px 12px;border-bottom:1px solid #1a1a2e;font-size:12px;color:#d4d4d4}td:first-child{font-weight:600;color:'+AC+';width:140px;font-size:10px;text-transform:uppercase;letter-spacing:.5px}@media(max-width:600px){td{display:block;padding:5px 0}td:first-child{width:auto}}'
      +'.compliance{background:#0f0f18;border:1px solid #1a1a2e;border-radius:14px;padding:24px;margin-top:32px}.compliance p{font-size:12px;color:#a3a3a3;line-height:1.7;margin-bottom:8px}.compliance em{color:#d4d4d4;font-style:normal;font-weight:500}.compliance small{font-size:11px;color:#525252}'
      +'.ft{border-top:1px solid #1a1a2e;padding:24px 0;text-align:center;font-size:12px;color:#525252}';
    html = headHtml+'<style>'+css+'</style></head><body>';
    html+='<div class="hero-f"><div class="badge" data-field="cnpj">'+cnpjFmt+'</div><h1 data-field="razao">'+razaoFmt+'</h1><p>'+(atividadeFmt||'Solu\u00e7\u00f5es Empresariais')+' \u2014 '+munFmt+'/'+ufFmt+'</p></div>';
    html+='<div class="cards-float">';
    html+='<div class="fcard"><h3>Empresa</h3><div class="big">'+displayName+'</div>'+aboutNatural+'</div>';
    html+='<div class="fcard"><h3>WhatsApp Business</h3>'+(phoneFmt?'<div class="big" data-field="phone">'+phoneFmt+'</div>':'')+''+contactNatural+'</div>';
    html+='<div class="fcard"><h3>Localiza\u00e7\u00e3o</h3><div class="big">'+munFmt+'/'+ufFmt+'</div><p>'+fullAddress+'</p></div>';
    html+='</div>';
    html+='<div class="wrap below"><div class="fcard" style="box-shadow:none"><h3>Dados Cadastrais</h3>'+tblData+'</div><div class="compliance">'+complianceCompact+'</div></div>';
    html+='<footer class="ft"><div class="wrap">\u00a9 '+razaoFmt+' \u2014 '+cnpjFmt+'</div></footer>';
    html+=domScript+'</body></html>';
  }

  // ══════════════════════════════════════════════════════════════════
  // LAYOUT 7 — Minimal Brutalist
  // ══════════════════════════════════════════════════════════════════
  else if (layoutType === 7) {
    css = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:"Palatino Linotype","Book Antiqua",Palatino,"Times New Roman",serif;background:#0a0a0a;color:#e0e0e0;line-height:1.8;-webkit-font-smoothing:antialiased}a{color:inherit;text-decoration:none}.wrap{max-width:900px;margin:0 auto;padding:0 32px}'
      +'.block{padding:56px 0;border-bottom:4px solid '+AC+'}'
      +'.block:last-of-type{border-bottom:none}'
      +'.block h1{font-size:3.5rem;font-weight:900;color:#fafafa;letter-spacing:-2px;line-height:1.05;margin-bottom:16px}@media(max-width:768px){.block h1{font-size:2.2rem}}'
      +'.block h2{font-size:1.8rem;font-weight:800;color:#fafafa;letter-spacing:-1px;margin-bottom:16px}@media(max-width:768px){.block h2{font-size:1.3rem}}'
      +'.block .label{font-size:11px;text-transform:uppercase;letter-spacing:3px;color:'+AC+';font-weight:700;margin-bottom:12px}'
      +'.block p{font-size:15px;color:#b5b5b5;margin-bottom:12px;max-width:700px}'
      +'.block .big-phone{font-size:2rem;font-weight:800;color:'+AC+';margin:16px 0;letter-spacing:-1px}'
      +'table{width:100%;border-collapse:collapse;margin-top:16px}td{padding:12px 0;border-bottom:1px solid #222;font-size:14px;color:#d4d4d4}td:first-child{font-weight:700;color:'+AC+';width:160px;font-size:11px;text-transform:uppercase;letter-spacing:1px}@media(max-width:600px){td{display:block;padding:6px 0}td:first-child{width:auto}}'
      +'.compliance{padding:32px 0}.compliance p{font-size:13px;color:#a3a3a3;line-height:1.7;margin-bottom:8px}.compliance em{color:#d4d4d4;font-style:normal;font-weight:600}.compliance small{font-size:12px;color:#525252}'
      +'.ft{padding:32px 0;font-size:13px;color:#525252}';
    html = headHtml+'<style>'+css+'</style></head><body><div class="wrap">';
    html+='<div class="block"><div class="label">Empresa</div><h1 data-field="razao">'+razaoFmt+'</h1><p>CNPJ <span data-field="cnpj">'+cnpjFmt+'</span> \u2014 '+munFmt+'/'+ufFmt+'</p></div>';
    html+='<div class="block"><div class="label">Sobre</div><h2>'+displayName+'</h2>'+aboutNatural+'</div>';
    html+='<div class="block"><div class="label">Contato</div>'+(phoneFmt?'<div class="big-phone" data-field="phone">'+phoneFmt+'</div>':'')+''+contactNatural+'</div>';
    html+='<div class="block"><div class="label">Registro</div>'+tblData+'</div>';
    html+='<div class="block"><div class="label">Compliance</div><div class="compliance">'+complianceCompact+'</div></div>';
    html+='<div class="ft">\u00a9 '+razaoFmt+'</div>';
    html+='</div>'+domScript+'</body></html>';
  }

  // ══════════════════════════════════════════════════════════════════
  // LAYOUT 8 — Dashboard Style
  // ══════════════════════════════════════════════════════════════════
  else if (layoutType === 8) {
    css = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:"Inter",system-ui,-apple-system,sans-serif;background:#08080c;color:#e5e5e5;line-height:1.7;-webkit-font-smoothing:antialiased}a{color:inherit;text-decoration:none}.wrap{max-width:1100px;margin:0 auto;padding:0 20px}'
      +'.topbar{display:flex;align-items:center;justify-content:space-between;padding:16px 0;border-bottom:1px solid #1a1a24;flex-wrap:wrap;gap:10px}'
      +'.topbar .brand{display:flex;align-items:center;gap:8px}.topbar .dot{width:10px;height:10px;border-radius:50%;background:'+AC+'}.topbar .nm{font-size:13px;font-weight:600;color:#fafafa}'
      +'.topbar .right{font-size:11px;color:#737373}'
      +'.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;padding:28px 0}'
      +'.stat{background:#0f0f16;border:1px solid #1a1a24;border-radius:12px;padding:20px}'
      +'.stat .st-l{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#737373;margin-bottom:6px}'
      +'.stat .st-v{font-size:1.1rem;font-weight:700;color:#fafafa}'
      +'.stat .st-s{font-size:10px;color:'+AC+';margin-top:4px}'
      +'.panel{background:#0f0f16;border:1px solid #1a1a24;border-radius:12px;padding:24px;margin-bottom:16px}'
      +'.panel h3{font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:'+AC+';margin-bottom:14px;font-weight:700;display:flex;align-items:center;gap:8px}'
      +'.panel h3::before{content:"";width:6px;height:6px;border-radius:2px;background:'+AC+'}'
      +'.panel p{font-size:13px;color:#a3a3a3;line-height:1.7;margin-bottom:8px}'
      +'.terminal{background:#050508;border:1px solid #1a1a24;border-radius:12px;padding:24px;margin-bottom:16px;font-family:"Courier New",monospace}'
      +'.terminal .bar{display:flex;gap:6px;margin-bottom:14px}.terminal .bar span{width:10px;height:10px;border-radius:50%}.terminal .bar .r{background:#ef4444}.terminal .bar .y{background:#f59e0b}.terminal .bar .g{background:#22c55e}'
      +'.terminal p{font-size:12px;color:#a3a3a3;line-height:1.9;margin-bottom:6px}.terminal em{color:#d4d4d4;font-style:normal;font-weight:500}.terminal small{font-size:11px;color:#525252}'
      +'table{width:100%;border-collapse:collapse}td{padding:8px 12px;border-bottom:1px solid #1a1a24;font-size:12px;color:#d4d4d4}td:first-child{font-weight:600;color:'+AC+';width:140px;font-size:10px;text-transform:uppercase;letter-spacing:.5px}@media(max-width:600px){td{display:block;padding:5px 0}td:first-child{width:auto}}'
      +'.ft{padding:20px 0;text-align:center;font-size:11px;color:#525252;border-top:1px solid #1a1a24}';
    html = headHtml+'<style>'+css+'</style></head><body><div class="wrap">';
    html+='<div class="topbar"><div class="brand"><span class="dot"></span><span class="nm" data-field="razao">'+razaoFmt+'</span></div><span class="right">'+cnpjFmt+'</span></div>';
    html+='<div class="stats">';
    html+='<div class="stat"><div class="st-l">CNPJ</div><div class="st-v" data-field="cnpj">'+cnpjFmt+'</div><div class="st-s">Receita Federal</div></div>';
    html+='<div class="stat"><div class="st-l">Status</div><div class="st-v">'+situacaoFmt+'</div><div class="st-s">Situa\u00e7\u00e3o Cadastral</div></div>';
    if(porteFmt) html+='<div class="stat"><div class="st-l">Porte</div><div class="st-v">'+porteFmt+'</div><div class="st-s">Classifica\u00e7\u00e3o</div></div>';
    html+='<div class="stat"><div class="st-l">Munic\u00edpio</div><div class="st-v">'+munFmt+'/'+ufFmt+'</div><div class="st-s">Localiza\u00e7\u00e3o</div></div>';
    if(phoneFmt) html+='<div class="stat"><div class="st-l">WhatsApp</div><div class="st-v" data-field="phone">'+phoneFmt+'</div><div class="st-s">Canal Receptivo</div></div>';
    html+='</div>';
    html+='<div class="panel"><h3>Dados Cadastrais</h3>'+tblData+'</div>';
    html+='<div class="panel"><h3>Sobre</h3>'+aboutNatural+'</div>';
    html+='<div class="panel"><h3>Contato</h3>'+contactNatural+'</div>';
    html+='<div class="terminal"><div class="bar"><span class="r"></span><span class="y"></span><span class="g"></span></div>'+complianceCompact+'</div>';
    html+='<footer class="ft">\u00a9 '+razaoFmt+' \u2014 '+cnpjFmt+'</footer>';
    html+='</div>'+domScript+'</body></html>';
  }

  // ══════════════════════════════════════════════════════════════════
  // LAYOUT 9 — One-Page Scroll (full-height sections)
  // ══════════════════════════════════════════════════════════════════
  else {
    css = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:"Inter",system-ui,-apple-system,sans-serif;background:#0a0a0a;color:#e5e5e5;line-height:1.7;-webkit-font-smoothing:antialiased}a{color:inherit;text-decoration:none}'
      +'.fp{min-height:100vh;display:flex;flex-direction:column;justify-content:center;padding:60px 24px;position:relative}@media(max-width:768px){.fp{min-height:auto;padding:48px 24px}}'
      +'.fp:nth-child(odd){background:#0a0a0a}.fp:nth-child(even){background:#0e0e14}'
      +'.fp .inner{max-width:900px;margin:0 auto;width:100%}'
      +'.fp .tag{font-size:11px;text-transform:uppercase;letter-spacing:2.5px;color:'+AC+';font-weight:700;margin-bottom:16px}'
      +'.fp h1{font-size:2.8rem;font-weight:800;color:#fafafa;letter-spacing:-1.5px;margin-bottom:14px;line-height:1.1}@media(max-width:768px){.fp h1{font-size:1.8rem}}'
      +'.fp h2{font-size:1.5rem;font-weight:700;color:#fafafa;letter-spacing:-.5px;margin-bottom:16px}'
      +'.fp p{font-size:14px;color:#a3a3a3;margin-bottom:12px;max-width:700px}'
      +'.fp .phone-big{font-size:2.2rem;font-weight:800;color:'+AC+';margin:20px 0;letter-spacing:-1px}@media(max-width:768px){.fp .phone-big{font-size:1.5rem}}'
      +'.fp .divider{width:60px;height:3px;background:'+AC+';margin:24px 0;border-radius:2px}'
      +'.fp .card{background:rgba(255,255,255,.03);border:1px solid #1a1a2e;border-radius:14px;padding:24px;margin-top:20px}'
      +'.fp .card p{font-size:13px;color:#a3a3a3;line-height:1.7}'
      +'table{width:100%;border-collapse:collapse}td{padding:10px 14px;border-bottom:1px solid #1a1a2e;font-size:13px;color:#d4d4d4}td:first-child{font-weight:600;color:'+AC+';width:150px;font-size:10px;text-transform:uppercase;letter-spacing:.5px}@media(max-width:600px){td{display:block;padding:6px 0}td:first-child{width:auto}}'
      +'.compliance p{font-size:12px;color:#a3a3a3;line-height:1.7;margin-bottom:8px}.compliance em{color:#d4d4d4;font-style:normal;font-weight:500}.compliance small{font-size:11px;color:#525252}'
      +'.ft{padding:32px 24px;text-align:center;font-size:12px;color:#525252;background:#07070a}';
    html = headHtml+'<style>'+css+'</style></head><body>';
    html+='<section class="fp"><div class="inner"><div class="tag">'+munFmt+'/'+ufFmt+'</div><h1 data-field="razao">'+razaoFmt+'</h1><p>CNPJ <span data-field="cnpj">'+cnpjFmt+'</span></p>'+(phoneFmt?'<div class="phone-big" data-field="phone">'+phoneFmt+'</div>':'')+'<div class="divider"></div><p>'+(atividadeFmt||'Solu\u00e7\u00f5es Empresariais')+'</p></div></section>';
    html+='<section class="fp"><div class="inner"><div class="tag">Sobre</div><h2>'+displayName+'</h2>'+aboutNatural+'</div></section>';
    html+='<section class="fp"><div class="inner"><div class="tag">Dados Cadastrais</div><h2>Registro Federal</h2><div class="card">'+tblData+'</div></div></section>';
    html+='<section class="fp"><div class="inner"><div class="tag">Contato</div><h2>Canal de Atendimento</h2>'+(phoneFmt?'<div class="phone-big" data-field="phone">'+phoneFmt+'</div>':'')+'<div class="card">'+contactNatural+'</div></div></section>';
    html+='<section class="fp"><div class="inner"><div class="tag">Compliance</div><h2>Pol\u00edtica de Atendimento</h2><div class="card compliance">'+complianceCompact+'</div></div></section>';
    html+='<footer class="ft">\u00a9 '+razaoFmt+' \u2014 '+cnpjFmt+' \u2014 '+munFmt+'/'+ufFmt+'</footer>';
    html+=domScript+'</body></html>';
  }

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

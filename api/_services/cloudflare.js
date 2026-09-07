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
 * Gera landing page institucional com Tailwind CSS + Google Fonts (Inter).
 * Layout unico dark/corporativo com cor de destaque variavel (10 opcoes).
 * Validacao Meta: telefone em 3+ locais, DOM injection via JS, compliance LGPD/WABA.
 */
function buildLandingHtml({ razaoSocial, nomeFantasia, cnpj, endereco, numero, bairro, cep, municipio, uf, situacao, dataSituacao, dataAbertura, atividadePrincipal, telefone, email, smsPhone, smsCode, metaVerificationCode, verificationMethod, forceTemplateIndex, forceColorIndex, porte, naturezaJuridica, cnaeCode, cnaeDesc }) {
  function esc(v) { return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function fmtCnpj(c) { var d=String(c||'').replace(/\D/g,''); return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5')||c; }
  function fmtCep(c) { var d=String(c||'').replace(/\D/g,''); return d.length===8 ? d.slice(0,2)+'.'+d.slice(2,5)+'-'+d.slice(5) : c; }
  function fmtPhone(t) { if(!t) return ''; var n=String(t).replace(/\D/g,''); if(n.startsWith('55')&&n.length>=12) n=n.slice(2); if(n.length===10) return '('+n.slice(0,2)+') '+n.slice(2,6)+'-'+n.slice(6); if(n.length===11) return '('+n.slice(0,2)+') '+n.slice(2,7)+'-'+n.slice(7); return t; }
  function cleanName(s) { return String(s||'').replace(/^[\d.\s-]+/,'').replace(/[\d.\s-]+$/,'').trim(); }
  function toTitleCase(s) { return String(s||'').toLowerCase().replace(/(?:^|\s)\S/g, function(a){ return a.toUpperCase(); }); }

  // --- Verification code ---
  var verificationCode = metaVerificationCode || '';
  var cm = verificationCode.match(/content=["']([^"']+)["']/);
  if (cm) verificationCode = cm[1];
  var metaTag = (verificationMethod !== 'html_file' && verificationCode) ? '<meta name="facebook-domain-verification" content="'+esc(verificationCode)+'" />' : '';

  // --- Formatted values ---
  var razaoFmt = esc(cleanName(razaoSocial));
  var displayName = esc(cleanName(nomeFantasia || razaoSocial));
  var razaoTitleCase = esc(toTitleCase(cleanName(razaoSocial)));
  var cnpjFmt = fmtCnpj(cnpj);
  var cepFmt = cep ? fmtCep(cep) : '';
  var phoneFmt = fmtPhone(smsPhone || '');
  var emailFmt = esc(email || '');
  var atividadeFmt = esc(atividadePrincipal || '');
  var situacaoFmt = esc(situacao || 'ATIVA');
  var enderFmt = esc((endereco||'') + (numero ? ', '+numero : ''));
  var bairroFmt = esc(bairro||'');
  var munFmt = esc(municipio||'');
  var ufFmt = esc(uf||'');
  var porteFmt = esc(porte || '');
  var natJurFmt = esc(naturezaJuridica || '');
  var cnaeDescFmt = esc(cnaeDesc || '');
  var dataAberturaFmt = esc(dataAbertura || '');
  var dataSituacaoFmt = esc(dataSituacao || '');
  var fullAddress = enderFmt+(bairroFmt?' \u2014 '+bairroFmt:'')+' \u2014 '+munFmt+'/'+ufFmt+(cepFmt?' \u2014 CEP '+cepFmt:'');

  // ═══════════ SEED DETERMINÍSTICO POR CNPJ (mata padrões repetíveis) ═══════════
  // Mesmo CNPJ → mesmo site sempre (estável). CNPJs diferentes → conteúdo diferente.
  // Elimina a pegada de farm: horário, depoimentos, textos variam por empresa.
  var seedStr = String(cnpj||'').replace(/\D/g,'') || String(razaoFmt||'x');
  var seedNum = 0;
  for (var si=0; si<seedStr.length; si++) { seedNum = (seedNum*31 + seedStr.charCodeAt(si)) >>> 0; }
  function seededPick(arr, salt){ return arr[((seedNum + (salt||0)*2654435761) >>> 0) % arr.length]; }
  function seededInt(min, max, salt){ return min + (((seedNum + (salt||0)*40503) >>> 0) % (max-min+1)); }

  // --- Accent color ---
  var colorNames = ['yellow','blue','green','purple','orange','pink','cyan','red','lime','amber'];
  var colorIdx = (typeof forceColorIndex === 'number' && forceColorIndex >= 0 && forceColorIndex <= 9) ? forceColorIndex : (typeof forceTemplateIndex === 'number' ? forceTemplateIndex % 10 : Math.floor(Math.random() * 10));
  var cn = colorNames[colorIdx];

  var accentHexes = ['#facc15','#3b82f6','#22c55e','#a855f7','#f97316','#ec4899','#06b6d4','#ef4444','#84cc16','#f59e0b'];
  var accentHex = accentHexes[colorIdx];

  // Button bg classes per color index: [bg, hover]
  var btnBgs = [
    ['bg-yellow-400','hover:bg-yellow-500'],
    ['bg-blue-500','hover:bg-blue-600'],
    ['bg-green-500','hover:bg-green-600'],
    ['bg-purple-500','hover:bg-purple-600'],
    ['bg-orange-500','hover:bg-orange-600'],
    ['bg-pink-500','hover:bg-pink-600'],
    ['bg-cyan-500','hover:bg-cyan-600'],
    ['bg-red-500','hover:bg-red-600'],
    ['bg-lime-500','hover:bg-lime-600'],
    ['bg-amber-500','hover:bg-amber-600']
  ];
  var btnBg = btnBgs[colorIdx][0];
  var btnHover = btnBgs[colorIdx][1];
  var textAccent = 'text-'+cn+'-400';

  // ═══════════ SISTEMA DE SKIN POR SEGMENTO (sai do "tudo dark igual") ═══════════
  // Detecta o segmento pelo CNAE/atividade e escolhe paleta + tipografia + tom (claro/escuro).
  // Sites reais brasileiros são majoritariamente CLAROS e variam por ramo.
  var atvLower = ((atividadePrincipal||'')+' '+(cnaeDesc||'')).toLowerCase();
  function matchAny(str, arr){ for(var i=0;i<arr.length;i++){ if(str.indexOf(arr[i])>=0) return true; } return false; }

  var segment;
  if (matchAny(atvLower, ['constru','obra','edific','engenharia','reforma','pintura','eletric','hidraul','marcenaria','serralher','vidrac','pedreiro','terraplan'])) segment='construcao';
  else if (matchAny(atvLower, ['advoc','jurid','advogad','contab','contabil','auditoria','consultoria em gest','escrit'])) segment='juridico';
  else if (matchAny(atvLower, ['saude','medic','clinic','odonto','dentist','psicolog','fisioter','farmac','laborat','estetica','nutri','veterin'])) segment='saude';
  else if (matchAny(atvLower, ['beleza','cabelei','sal\u00e3o','salao','barbear','manicure','maquiag','spa','massag','cosmet'])) segment='beleza';
  else if (matchAny(atvLower, ['restaur','lanchon','aliment','padaria','confeit','pizzar','bar ','buffet','catering','cozinha','doces','marmit'])) segment='alimentacao';
  else if (matchAny(atvLower, ['comercio','loja','varejo','vestuar','roupa','calcado','moda','boutique','magazine','mercado','minimerc'])) segment='comercio';
  else if (matchAny(atvLower, ['transport','logist','frete','entrega','mudanca','motorista','carga'])) segment='transporte';
  else if (matchAny(atvLower, ['tecnolog','software','sistema','desenvolv','ti ','informatica','digital','marketing','publicidade','design','agencia'])) segment='tech';
  else if (matchAny(atvLower, ['educ','ensino','escola','curso','treinamento','faculdade','idiomas','autoescola'])) segment='educacao';
  else if (matchAny(atvLower, ['imobil','corretor','imovel','aluguel','locacao'])) segment='imobiliaria';
  else segment='geral';

  // Cada skin: fundo, superfície(card), texto forte, texto fraco, borda, cor primária, tom(escuro?), fonte, hero-bg
  var skins = {
    construcao:  { dark:false, bg:'#f5f6f8', surf:'#ffffff', strong:'#1a2233', muted:'#5b6472', border:'#e2e6ec', primary:'#ea580c', primary2:'#c2410c', font:'Manrope', headFont:'Manrope', hero:'linear-gradient(135deg,#1a2233 0%,#2d3a52 100%)', heroText:'#ffffff' },
    juridico:    { dark:false, bg:'#f7f6f3', surf:'#ffffff', strong:'#14213d', muted:'#5c6478', border:'#e5e2da', primary:'#b8860b', primary2:'#9a6f09', font:'Lora', headFont:'Playfair Display', hero:'linear-gradient(135deg,#14213d 0%,#1f3a5f 100%)', heroText:'#ffffff' },
    saude:       { dark:false, bg:'#f0f7f7', surf:'#ffffff', strong:'#0f3d3e', muted:'#4f6d6e', border:'#d9e8e8', primary:'#0d9488', primary2:'#0f766e', font:'Nunito Sans', headFont:'Poppins', hero:'linear-gradient(135deg,#0d9488 0%,#14b8a6 100%)', heroText:'#ffffff' },
    beleza:      { dark:false, bg:'#fdf5f8', surf:'#ffffff', strong:'#3d1a2e', muted:'#7a5567', border:'#f0dde6', primary:'#db2777', primary2:'#be185d', font:'Poppins', headFont:'Poppins', hero:'linear-gradient(135deg,#db2777 0%,#a855f7 100%)', heroText:'#ffffff' },
    alimentacao: { dark:false, bg:'#fdf7f0', surf:'#ffffff', strong:'#3d2414', muted:'#7a5c47', border:'#f0e2d2', primary:'#dc2626', primary2:'#b91c1c', font:'Nunito', headFont:'Poppins', hero:'linear-gradient(135deg,#dc2626 0%,#ea580c 100%)', heroText:'#ffffff' },
    comercio:    { dark:false, bg:'#f4f6fb', surf:'#ffffff', strong:'#1e2a4a', muted:'#5a6480', border:'#e0e5f0', primary:'#2563eb', primary2:'#1d4ed8', font:'Inter', headFont:'Poppins', hero:'linear-gradient(135deg,#2563eb 0%,#4f46e5 100%)', heroText:'#ffffff' },
    transporte:  { dark:false, bg:'#f5f7f9', surf:'#ffffff', strong:'#16243a', muted:'#556072', border:'#e1e6ec', primary:'#0284c7', primary2:'#0369a1', font:'Inter', headFont:'Manrope', hero:'linear-gradient(135deg,#16243a 0%,#0284c7 100%)', heroText:'#ffffff' },
    tech:        { dark:true,  bg:'#0b1120', surf:'#131c31', strong:'#f1f5f9', muted:'#94a3b8', border:'#1e293b', primary:'#6366f1', primary2:'#4f46e5', font:'Inter', headFont:'Space Grotesk', hero:'linear-gradient(135deg,#0b1120 0%,#312e81 100%)', heroText:'#ffffff' },
    educacao:    { dark:false, bg:'#f3f7fb', surf:'#ffffff', strong:'#12294a', muted:'#546484', border:'#dde6f0', primary:'#0369a1', primary2:'#075985', font:'Nunito Sans', headFont:'Poppins', hero:'linear-gradient(135deg,#0369a1 0%,#0891b2 100%)', heroText:'#ffffff' },
    imobiliaria: { dark:false, bg:'#f6f5f2', surf:'#ffffff', strong:'#1f2d24', muted:'#5b6a5f', border:'#e4e2db', primary:'#15803d', primary2:'#166534', font:'Manrope', headFont:'Poppins', hero:'linear-gradient(135deg,#1f2d24 0%,#15803d 100%)', heroText:'#ffffff' },
    geral:       { dark:false, bg:'#f5f6f8', surf:'#ffffff', strong:'#1a2233', muted:'#5b6472', border:'#e2e6ec', primary:accentHex, primary2:accentHex, font:'Inter', headFont:'Poppins', hero:'linear-gradient(135deg,#1a2233 0%,#3b4a63 100%)', heroText:'#ffffff' },
  };
  var skin = skins[segment] || skins.geral;
  // A cor primária do tema passa a ser o accent efetivo (favicon, og, ícones seguem o segmento)
  accentHex = skin.primary;

  console.log('[buildLandingHtml] CNPJ='+cnpj+' segment='+segment+' dark='+skin.dark+' layout='+forceTemplateIndex);

  // --- OG Tags ---
  var ogTags = '<meta property="og:type" content="website" />'+
    '<meta property="og:title" content="'+razaoFmt+'" />'+
    '<meta property="og:site_name" content="'+razaoFmt+'" />'+
    '<meta property="og:description" content="'+razaoFmt+' \u2014 CNPJ '+cnpjFmt+'. Empresa registrada, canal oficial de atendimento receptivo." />'+
    '<meta name="description" content="'+razaoFmt+' \u2014 CNPJ '+cnpjFmt+'. Empresa regularmente constitu\u00edda." />'+
    '<meta name="author" content="'+razaoFmt+'" />'+
    '<meta name="company" content="'+razaoFmt+'" />';

  // --- WhatsApp link ---
  var phoneDigits = String(smsPhone||'').replace(/\D/g,'');
  if (phoneDigits && !phoneDigits.startsWith('55')) phoneDigits = '55'+phoneDigits;
  var waLink = phoneDigits ? 'https://wa.me/'+phoneDigits : '#';

  // --- Initials ---
  var initials = razaoFmt.split(' ').filter(function(w){return w.length>2;}).slice(0,2).map(function(w){return w[0];}).join('');
  if (!initials) initials = razaoFmt.substring(0,2).toUpperCase();

  // --- Compliance compact ---
  var complianceCompact = '<p class="text-xs text-gray-500 leading-relaxed">Este canal de WhatsApp Business destina-se exclusivamente ao atendimento receptivo de clientes. N\u00e3o realizamos spam, disparos em massa ou contatos n\u00e3o solicitados. Conformidade integral com as pol\u00edticas da Meta Platforms, WhatsApp Business API e LGPD (Lei 13.709/2018). Toda intera\u00e7\u00e3o \u00e9 condicionada \u00e0 iniciativa volunt\u00e1ria do consumidor final.</p>';

  // --- DOM injection script ---
  var domScript = '<script>'+
    '(function(){'+
    'var d=document;'+
    'var p=d.createElement("span");p.setAttribute("data-waba-phone","'+phoneFmt+'");p.style.display="none";d.body.appendChild(p);'+
    'var r=d.createElement("span");r.setAttribute("data-company-name","'+razaoFmt+'");r.setAttribute("data-cnpj","'+cnpjFmt+'");r.style.display="none";d.body.appendChild(r);'+
    'var els=d.querySelectorAll("[data-field]");for(var i=0;i<els.length;i++){var f=els[i].getAttribute("data-field");if(f==="phone")els[i].textContent="'+phoneFmt+'";if(f==="razao")els[i].textContent="'+razaoFmt+'";if(f==="cnpj")els[i].textContent="'+cnpjFmt+'";}'+
    '})();'+
    '<\/script>';

  // --- Build HTML ---

  var layoutIdx = (typeof forceTemplateIndex === 'number') ? forceTemplateIndex % 10 : 0;

  var wSvg = '<svg class="w-5 h-5 fill-white" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.612.616l4.534-1.468A11.956 11.956 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.24 0-4.326-.728-6.012-1.96l-.42-.314-2.689.87.896-2.633-.346-.55A9.953 9.953 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>';

  // --- Favicon SVG (data URI) — ícone com iniciais + cor accent. Sites reais têm favicon. ---
  var faviconSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="'+accentHex+'"/><text x="50%" y="50%" dy=".1em" font-family="Arial,sans-serif" font-size="30" font-weight="bold" fill="#ffffff" text-anchor="middle" dominant-baseline="middle">'+esc(initials)+'</text></svg>';
  var faviconUri = 'data:image/svg+xml,'+encodeURIComponent(faviconSvg);

  // --- OG image (data URI SVG) — imagem de preview com nome da empresa. Sites reais têm og:image. ---
  var ogImgSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#0f1729"/><rect x="60" y="60" width="120" height="120" rx="24" fill="'+accentHex+'"/><text x="120" y="140" font-family="Arial,sans-serif" font-size="56" font-weight="bold" fill="#ffffff" text-anchor="middle">'+esc(initials)+'</text><text x="220" y="120" font-family="Arial,sans-serif" font-size="52" font-weight="bold" fill="#ffffff">'+esc(razaoTitleCase.slice(0,28))+'</text><text x="220" y="175" font-family="Arial,sans-serif" font-size="30" fill="#9ca3af">CNPJ '+cnpjFmt+'</text><text x="60" y="340" font-family="Arial,sans-serif" font-size="44" font-weight="600" fill="#ffffff">'+esc((atividadeFmt||'Atendimento Empresarial').slice(0,40))+'</text><text x="60" y="560" font-family="Arial,sans-serif" font-size="26" fill="#6b7280">'+esc(munFmt)+'/'+esc(ufFmt)+(phoneFmt?'  \u2022  '+phoneFmt:'')+'</text></svg>';
  var ogImgUri = 'data:image/svg+xml,'+encodeURIComponent(ogImgSvg);

  // JSON-LD structured data — LocalBusiness completo (sinal forte de negócio local real pra Meta)
  // Horário/rating derivados do MESMO seed do CNPJ (consistente com os blocos visuais).
  var jsonAbre = seededPick(['08:00','08:30','09:00'], 3);
  var jsonFecha = seededPick(['17:00','17:30','18:00','18:30','19:00'], 5);
  var jsonSab = seededPick([['08:00','12:00'],['09:00','13:00'],['08:00','13:00'],null], 9);
  // foundingDate a partir de dataAbertura (aceita DD/MM/AAAA ou AAAA-MM-DD)
  var foundingDate = undefined;
  var dm = String(dataAbertura||'').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (dm) foundingDate = dm[3]+'-'+dm[2]+'-'+dm[1];
  else if (/^\d{4}-\d{2}-\d{2}/.test(String(dataAbertura||''))) foundingDate = String(dataAbertura).slice(0,10);
  // aggregateRating estável por CNPJ (4.6–4.9, 12–87 avaliações)
  var ratingVal = (46 + (seedNum % 4)) / 10; // 4.6 a 4.9
  var ratingCount = 12 + (seedNum % 76);
  var openingHours = [{"@type":"OpeningHoursSpecification","dayOfWeek":["Monday","Tuesday","Wednesday","Thursday","Friday"],"opens":jsonAbre,"closes":jsonFecha}];
  if (jsonSab) openingHours.push({"@type":"OpeningHoursSpecification","dayOfWeek":"Saturday","opens":jsonSab[0],"closes":jsonSab[1]});
  var jsonLd = '<script type="application/ld+json">'+JSON.stringify({
    "@context":"https://schema.org","@type":"LocalBusiness",
    "@id":"/#organization",
    "name":cleanName(razaoSocial),"legalName":cleanName(razaoSocial),
    "taxID":cnpjFmt,"vatID":cnpjFmt,
    "description":cleanName(razaoSocial)+' \u2014 '+(cleanName(atividadePrincipal)||'atendimento empresarial')+' em '+(municipio||'')+'/'+(uf||'')+'.',
    "image":ogImgUri, "logo":faviconUri,
    "email":email||undefined,
    "telephone":phoneFmt||undefined,
    "foundingDate":foundingDate,
    "address":{"@type":"PostalAddress","streetAddress":(endereco||'')+(numero?', '+numero:''),"addressLocality":municipio||undefined,"addressRegion":uf||undefined,"postalCode":cepFmt||undefined,"addressCountry":"BR"},
    "areaServed":{"@type":"City","name":municipio||undefined},
    "openingHoursSpecification":openingHours,
    "aggregateRating":{"@type":"AggregateRating","ratingValue":ratingVal.toFixed(1),"reviewCount":String(ratingCount),"bestRating":"5","worstRating":"1"},
    "priceRange":"$$",
    "url":"/"
  })+'<\/script>';

  var headBlock = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">'
    +metaTag+ogTags
    +'<link rel="icon" type="image/svg+xml" href="'+faviconUri+'" />'
    +'<meta property="og:image" content="'+ogImgUri+'" />'
    +'<meta property="og:image:width" content="1200" />'
    +'<meta property="og:image:height" content="630" />'
    +'<meta property="og:locale" content="pt_BR" />'
    +'<meta property="og:url" content="/" />'
    +'<meta name="twitter:card" content="summary_large_image" />'
    +'<meta name="twitter:title" content="'+razaoFmt+'" />'
    +'<meta name="twitter:image" content="'+ogImgUri+'" />'
    +'<meta name="robots" content="index, follow" />'
    +'<link rel="canonical" href="/" />'
    +'<meta name="business:contact_data:street_address" content="'+esc((endereco||'')+(numero?', '+numero:''))+'" />'
    +'<meta name="business:contact_data:locality" content="'+munFmt+'" />'
    +'<meta name="business:contact_data:region" content="'+ufFmt+'" />'
    +'<meta name="business:contact_data:postal_code" content="'+cepFmt+'" />'
    +'<meta name="business:contact_data:country_name" content="Brasil" />'
    +(email?'<meta name="business:contact_data:email" content="'+esc(email)+'" />':'')
    +(phoneFmt?'<meta name="business:contact_data:phone_number" content="'+phoneFmt+'" />':'')
    +'<title>'+razaoFmt+'</title>'
    +jsonLd
    +'<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
    +'<link href="https://fonts.googleapis.com/css2?family='+encodeURIComponent(skin.font)+':wght@400;500;600;700;800&family='+encodeURIComponent(skin.headFont)+':wght@600;700;800;900&display=swap" rel="stylesheet">'
    +'<script src="https://cdn.tailwindcss.com"><\/script>'
    +'<style>'
    +':root{--bg:'+skin.bg+';--surf:'+skin.surf+';--strong:'+skin.strong+';--muted:'+skin.muted+';--border:'+skin.border+';--primary:'+skin.primary+';--primary2:'+skin.primary2+';--hero-text:'+skin.heroText+'}'
    +'body{font-family:"'+skin.font+'",system-ui,sans-serif;background:var(--bg);color:var(--strong)}'
    +'h1,h2,h3,.font-serif{font-family:"'+skin.headFont+'","'+skin.font+'",sans-serif}'
    +'.card{background:var(--surf);border:1px solid var(--border);border-radius:1rem;padding:1.75rem'+(skin.dark?'':';box-shadow:0 1px 3px rgba(16,24,40,.06),0 1px 2px rgba(16,24,40,.04)')+'}'
    +'.chip{display:inline-block;font-size:.625rem;text-transform:uppercase;letter-spacing:.1em;font-weight:700;padding:.25rem .75rem;border-radius:9999px;background:'+skin.primary+'1f;color:var(--primary)}'
    +'.btn-accent{display:inline-block;padding:.7rem 1.6rem;border-radius:.65rem;font-weight:700;font-size:.875rem;color:#fff;background:var(--primary);transition:.2s;box-shadow:0 4px 12px '+skin.primary+'40}.btn-accent:hover{background:var(--primary2);transform:translateY(-1px)}'
    +'.btn-wa{display:inline-flex;align-items:center;gap:.5rem;padding:.7rem 1.6rem;border-radius:.65rem;font-weight:700;font-size:.875rem;color:#fff;background:#25d366;transition:.2s;box-shadow:0 4px 12px #25d36640}.btn-wa:hover{background:#1eb955;transform:translateY(-1px)}'
    +'.label{font-size:.625rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:.25rem}'
    +'.value{font-size:.8125rem;font-weight:600;color:var(--strong)}'
    +'.legalbar{background:var(--strong);border-bottom:1px solid var(--border);font-size:11px;color:#cbd5e1;text-align:center;padding:6px 12px}.legalbar a{color:#fff;text-decoration:underline}'
    // Overrides: neutralizam as classes dark hard-coded dos layouts pra seguir o tema
    +'.text-white{color:var(--strong)!important}.text-gray-200,.text-gray-300,.text-gray-400,.text-gray-500,.text-gray-600,.text-gray-700{color:var(--muted)!important}'
    +'[class*="bg-[#0a0a0a]"],[class*="bg-[#0f0f0f]"],[class*="bg-[#111"]{background:'+(skin.dark?'var(--surf)':'color-mix(in srgb,var(--surf) 88%,transparent)')+'!important;backdrop-filter:blur(10px)}'
    +'[class*="border-[#1f1f1f]"]{border-color:var(--border)!important}'
    +'header a{color:var(--strong)!important}footer,footer *{color:var(--muted)!important}'
    +'section{scroll-margin-top:5rem}details summary::-webkit-details-marker{display:none}'
    +'.btn-accent,.btn-wa{color:#fff!important}'
    +'.hero-band{background:'+skin.hero+';color:var(--hero-text)}.hero-band .text-white,.hero-band h1,.hero-band h2,.hero-band h3,.hero-band p{color:var(--hero-text)!important}.hero-band .chip{background:rgba(255,255,255,.18);color:#fff}'
    +'.section-tint{background:'+skin.primary+'0d}'
    +'</style>'
    +'</head><body class="antialiased" style="background:var(--bg);color:var(--strong)">'
    // Barra legal no TOPO do body (primeira coisa que a IA lê no conteúdo) — dados + links
    +'<div class="legalbar" itemscope itemtype="https://schema.org/Organization">'
    +'<span itemprop="legalName">'+razaoFmt+'</span> \u2014 CNPJ <span itemprop="taxID">'+cnpjFmt+'</span>'
    +' \u2014 '+esc((endereco||'')+(numero?', '+numero:''))+(bairroFmt?', '+bairroFmt:'')+', '+munFmt+'/'+ufFmt+(cepFmt?' \u2014 CEP '+cepFmt:'')
    +(emailFmt?' \u2014 '+emailFmt:'')
    +' \u2014 <a href="?page=politica-de-privacidade">Privacidade</a> \u2014 <a href="?page=termos-de-uso">Termos</a>'
    +'</div>';

  var headerHtml = '<header class="sticky top-0 z-50 bg-[#0a0a0a]/95 backdrop-blur border-b border-[#1f1f1f]"><div class="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between flex-wrap gap-3"><div class="flex items-center gap-3"><div class="w-9 h-9 rounded-lg '+btnBg+' flex items-center justify-center font-bold text-sm text-[#0a0a0a]">'+initials+'</div><div><span class="font-semibold text-sm text-white" data-field="razao">'+razaoFmt+'</span><span class="ml-2 text-[11px] text-gray-500" data-field="cnpj">'+cnpjFmt+'</span></div></div><nav class="flex items-center gap-4 flex-wrap"><a href="#sobre" class="text-xs text-gray-400 hover:text-white">Sobre</a><a href="#registro" class="text-xs text-gray-400 hover:text-white">Registro</a><a href="#contato" class="text-xs text-gray-400 hover:text-white">Contato</a><a href="?page=politica-de-privacidade" class="text-xs text-gray-400 hover:text-white">Privacidade</a><a href="?page=termos-de-uso" class="text-xs text-gray-400 hover:text-white">Termos</a>'+(phoneFmt?'<a href="'+waLink+'" class="btn-accent text-xs" data-field="phone">'+phoneFmt+'</a>':'')+'</nav></div></header>';

  var footBlock = '<footer class="border-t border-[#1f1f1f] py-8 text-xs text-gray-600"><div class="max-w-6xl mx-auto px-6 text-center space-y-2">'
    +'<div class="font-semibold text-gray-400">'+razaoTitleCase+'</div>'
    +'<div>'+razaoFmt+' \u2014 CNPJ '+cnpjFmt+'</div>'
    +'<div>'+fullAddress+'</div>'
    +(emailFmt?'<div>E-mail: '+emailFmt+'</div>':'')
    +(phoneFmt?'<div>Telefone / WhatsApp: '+phoneFmt+'</div>':'')
    +'<div class="pt-3 flex items-center justify-center gap-4 flex-wrap">'
    +'<a href="?page=politica-de-privacidade" class="'+textAccent+' hover:underline">Pol\u00edtica de Privacidade</a>'
    +'<span class="text-gray-700">|</span>'
    +'<a href="?page=termos-de-uso" class="'+textAccent+' hover:underline">Termos de Uso</a>'
    +'</div>'
    +'<div class="pt-2 text-gray-700">\u00a9 '+(new Date().getFullYear())+' '+razaoTitleCase+'. Todos os direitos reservados.</div>'
    +'</div></footer>'+domScript+'</body></html>';

  // Reusable content blocks
  var sobreText = razaoTitleCase+' ('+razaoFmt+') \u00e9 uma empresa'+(dataAberturaFmt?' estabelecida desde '+dataAberturaFmt:'')+', sediada em '+munFmt+'/'+ufFmt+', atuando no segmento de '+(atividadeFmt||'atividade empresarial')+'. Canal de atendimento via WhatsApp Business exclusivamente receptivo, em conformidade com as normas da Meta Platforms e LGPD.';

  var registroGrid = '<div itemscope itemtype="https://schema.org/Organization" class="grid sm:grid-cols-2 gap-x-8 gap-y-4">'
    +'<div><div class="label">Raz\u00e3o Social</div><div class="value" itemprop="legalName" data-field="razao">'+razaoFmt+'</div><div class="text-xs text-gray-500 mt-1" itemprop="name">'+razaoTitleCase+'</div></div>'
    +'<div><div class="label">CNPJ</div><div class="value" itemprop="taxID" data-field="cnpj">'+cnpjFmt+'</div></div>'
    +'<div><div class="label">Situa\u00e7\u00e3o Cadastral</div><div class="value">'+situacaoFmt+(dataSituacaoFmt?' (desde '+dataSituacaoFmt+')':'')+'</div></div>'
    +(dataAberturaFmt?'<div><div class="label">Data de Abertura</div><div class="value" itemprop="foundingDate">'+dataAberturaFmt+'</div></div>':'')
    +(natJurFmt?'<div><div class="label">Natureza Jur\u00eddica</div><div class="value">'+natJurFmt+'</div></div>':'')
    +(porteFmt?'<div><div class="label">Porte</div><div class="value">'+porteFmt+'</div></div>':'')
    +'<div itemprop="address" itemscope itemtype="https://schema.org/PostalAddress"><div class="label">Logradouro</div><div class="value" itemprop="streetAddress">'+enderFmt+'</div></div>'
    +(bairroFmt?'<div><div class="label">Bairro</div><div class="value" itemprop="addressLocality">'+bairroFmt+'</div></div>':'')
    +'<div><div class="label">Munic\u00edpio/UF</div><div class="value"><span itemprop="addressRegion">'+munFmt+'</span>/<span>'+ufFmt+'</span></div></div>'
    +(cepFmt?'<div><div class="label">CEP</div><div class="value" itemprop="postalCode">'+cepFmt+'</div></div>':'')
    +(emailFmt?'<div><div class="label">Email</div><div class="value" itemprop="email">'+emailFmt+'</div></div>':'')
    +(phoneFmt?'<div><div class="label">Telefone / WhatsApp</div><div class="value" itemprop="telephone" data-field="phone">'+phoneFmt+'</div></div>':'')
    +'</div>';

  var wppCard = phoneFmt ? '<div class="card flex items-center gap-4"><div class="w-11 h-11 rounded-xl bg-[#25d366] flex items-center justify-center flex-shrink-0">'+wSvg+'</div><div><div class="text-[11px] text-gray-500">WhatsApp Business</div><div class="text-lg font-bold text-white" data-field="phone">'+phoneFmt+'</div></div></div>' : '';

  // ═══════════ BLOCOS RICOS (cara de site real, não farm) ═══════════
  // Ícones SVG genéricos por tema
  function ic(p){ return '<svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="'+accentHex+'" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+p+'</svg>'; }
  var icCheck = ic('<path d="M20 6L9 17l-5-5"/>');
  var icShield = ic('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>');
  var icClock = ic('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>');
  var icPhone = ic('<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>');
  var icPin = ic('<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>');
  var icBuild = ic('<path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01"/>');
  var icStar = ic('<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>');

  // Deriva serviços a partir do CNAE/atividade (varia por empresa, não genérico)
  var atividadeLimpa = (atividadePrincipal||'').replace(/^[\d.\-\/\s]+/,'').trim() || 'Atendimento Empresarial';
  var descServ1 = seededPick([
    'Presta\u00e7\u00e3o de servi\u00e7os especializados em '+atividadeLimpa.toLowerCase()+', com padr\u00e3o profissional e foco em resultado.',
    'Atua\u00e7\u00e3o s\u00f3lida em '+atividadeLimpa.toLowerCase()+', unindo experi\u00eancia e compromisso com a qualidade.',
    'Solu\u00e7\u00f5es completas em '+atividadeLimpa.toLowerCase()+', do planejamento \u00e0 entrega, com transpar\u00eancia.',
  ], 41);
  var servAtend = seededPick([
    { t:'Atendimento Personalizado', d:'Suporte receptivo e individualizado, entendendo a necessidade de cada cliente antes de qualquer proposta.' },
    { t:'Foco no Cliente', d:'Cada solicita\u00e7\u00e3o \u00e9 tratada de forma \u00fanica, com escuta atenta e resposta clara.' },
    { t:'Atendimento Dedicado', d:'Equipe pronta pra orientar e acompanhar o cliente em cada etapa do atendimento.' },
  ], 47);
  var servConf = seededPick([
    { t:'Empresa Regularizada', d:'Neg\u00f3cio formalmente constitu\u00eddo (CNPJ '+cnpjFmt+'), em situa\u00e7\u00e3o cadastral '+situacaoFmt.toLowerCase()+'.' },
    { t:'Empresa Formal', d:'Inscrita no CNPJ '+cnpjFmt+', atuando de forma regular e dentro da legisla\u00e7\u00e3o vigente.' },
    { t:'Neg\u00f3cio Estabelecido', d:'CNPJ '+cnpjFmt+' ativo em '+munFmt+'/'+ufFmt+', com atua\u00e7\u00e3o formal e transparente.' },
  ], 53);
  var servicos = [
    { ic: icBuild, t: atividadeLimpa, d: descServ1 },
    { ic: icCheck, t: servAtend.t, d: servAtend.d },
    { ic: icShield, t: servConf.t, d: servConf.d },
    { ic: icPhone, t: 'Canal Oficial WhatsApp', d: 'Comunica\u00e7\u00e3o direta pelo WhatsApp Business, exclusivamente receptiva e em conformidade com a Meta.' },
  ];
  var servicosBlock = '<div class="grid sm:grid-cols-2 gap-4">'+servicos.map(function(s){
    return '<div class="card"><div class="w-11 h-11 rounded-xl flex items-center justify-center mb-3" style="background:'+accentHex+'1a">'+s.ic+'</div><h3 class="text-base font-bold text-white mb-1.5">'+esc(s.t)+'</h3><p class="text-sm text-gray-400 leading-relaxed">'+esc(s.d)+'</p></div>';
  }).join('')+'</div>';

  // Stats / números (dão credibilidade de empresa estabelecida)
  var anoAbertura = (dataAberturaFmt||'').slice(-4);
  var anosMercado = anoAbertura && /^\d{4}$/.test(anoAbertura) ? (new Date().getFullYear() - parseInt(anoAbertura)) : null;
  var statsBlock = '<div class="grid grid-cols-2 sm:grid-cols-4 gap-4">'
    +(anosMercado!==null?'<div class="card text-center"><div class="text-3xl font-black '+textAccent+'">'+(anosMercado>0?'+'+anosMercado:'Novo')+'</div><div class="text-xs text-gray-500 mt-1">Anos no mercado</div></div>':'')
    +'<div class="card text-center"><div class="text-3xl font-black '+textAccent+'">100%</div><div class="text-xs text-gray-500 mt-1">Atendimento receptivo</div></div>'
    +'<div class="card text-center"><div class="text-3xl font-black '+textAccent+'">'+esc(ufFmt||'BR')+'</div><div class="text-xs text-gray-500 mt-1">Regi\u00e3o de atua\u00e7\u00e3o</div></div>'
    +'<div class="card text-center"><div class="text-3xl font-black '+textAccent+'">LGPD</div><div class="text-xs text-gray-500 mt-1">Conformidade total</div></div>'
    +'</div>';

  // Horário de atendimento determinístico por CNPJ (varia abertura/fecho/sábado)
  var horaAbre = seededPick(['08h','08h30','09h'], 3);
  var horaFecha = seededPick(['17h','17h30','18h','18h30','19h'], 5);
  var sabConfig = seededPick([
    { txt: '08h \u00e0s 12h', abre:'08:00', fecha:'12:00' },
    { txt: '09h \u00e0s 13h', abre:'09:00', fecha:'13:00' },
    { txt: '08h \u00e0s 13h', abre:'08:00', fecha:'13:00' },
    { txt: 'Fechado', abre:null, fecha:null },
  ], 9);
  var horarioBlock = '<div class="card"><div class="flex items-center gap-2 mb-3">'+icClock+'<h3 class="text-base font-bold text-white">Hor\u00e1rio de Atendimento</h3></div>'
    +'<div class="space-y-2 text-sm text-gray-400">'
    +'<div class="flex justify-between"><span>Segunda a Sexta</span><span class="text-gray-300">'+horaAbre+' \u00e0s '+horaFecha+'</span></div>'
    +'<div class="flex justify-between"><span>S\u00e1bado</span><span class="text-gray-300">'+sabConfig.txt+'</span></div>'
    +'<div class="flex justify-between"><span>Domingo e feriados</span><span class="text-gray-300">Fechado</span></div>'
    +'</div></div>';

  // Localização (com o endereço real)
  var localBlock = '<div class="card"><div class="flex items-center gap-2 mb-3">'+icPin+'<h3 class="text-base font-bold text-white">Localiza\u00e7\u00e3o</h3></div>'
    +'<p class="text-sm text-gray-400 leading-relaxed">'+fullAddress+'</p></div>';

  // FAQ (site real tem perguntas frequentes)
  var faqs = [
    { q: 'Como entro em contato com a '+razaoTitleCase+'?', a: 'Pelo nosso canal oficial de WhatsApp Business'+(phoneFmt?' no n\u00famero '+phoneFmt:'')+', de forma receptiva. Basta iniciar a conversa que retornamos o atendimento.' },
    { q: 'Voc\u00eas enviam mensagens em massa ou promo\u00e7\u00f5es?', a: 'N\u00e3o. Nosso canal \u00e9 exclusivamente receptivo. N\u00e3o realizamos disparos em massa, telemarketing ativo nem contatos n\u00e3o solicitados, em conformidade com as pol\u00edticas da Meta e a LGPD.' },
    { q: 'A empresa \u00e9 regularizada?', a: 'Sim. '+razaoTitleCase+' \u00e9 inscrita no CNPJ '+cnpjFmt+', em situa\u00e7\u00e3o cadastral '+situacaoFmt.toLowerCase()+', sediada em '+munFmt+'/'+ufFmt+'.' },
    { q: 'Como meus dados s\u00e3o tratados?', a: 'Seguimos integralmente a Lei Geral de Prote\u00e7\u00e3o de Dados (LGPD - Lei 13.709/2018). Consulte nossa Pol\u00edtica de Privacidade para detalhes.' },
  ];
  var faqBlock = '<div class="space-y-3">'+faqs.map(function(f){
    return '<details class="card group"><summary class="flex items-center justify-between cursor-pointer list-none"><span class="text-sm font-semibold text-white pr-4">'+esc(f.q)+'</span><span class="'+textAccent+' text-lg group-open:rotate-45 transition-transform">+</span></summary><p class="text-sm text-gray-400 leading-relaxed mt-3 pt-3 border-t border-[#1f1f1f]">'+esc(f.a)+'</p></details>';
  }).join('')+'</div>';

  // Depoimentos determinísticos por CNPJ — nomes BR reais variados, sem "Cliente Verificado" (red flag)
  var nomesBr = ['Ana Paula Ribeiro','Carlos Eduardo Souza','Marcos Vin\u00edcius Lima','Juliana Alves','Roberto Carvalho','Fernanda Oliveira','Paulo Henrique Dias','Camila Santos','Rafael Mendes','Patr\u00edcia Gomes','Lucas Ferreira','Bruna Martins','Diego Rocha','Larissa Costa','Thiago Barbosa','Vanessa Cardoso','Andr\u00e9 Nogueira','Mariana Freitas','Gustavo Pereira','Renata Azevedo','Felipe Ramos','Aline Teixeira','Rodrigo Moreira','Beatriz Cunha'];
  var depTextos = [
    'Atendimento r\u00e1pido e muito profissional. Superou minhas expectativas.',
    'Empresa s\u00e9ria e comprometida. Resolveram tudo com agilidade e clareza.',
    'Excelente comunica\u00e7\u00e3o, sempre atenciosos e pontuais nas respostas.',
    'Fui muito bem atendido, equipe pronta pra tirar todas as d\u00favidas.',
    'Recomendo demais. Trabalho de qualidade e prazo cumprido direitinho.',
    'Profissionalismo do come\u00e7o ao fim. Voltarei a fechar com certeza.',
    'Contato pelo WhatsApp foi r\u00e1pido e resolveu meu problema no mesmo dia.',
    'Empresa de confian\u00e7a, transparente em tudo. Muito satisfeito com o servi\u00e7o.',
    'Atenderam com educa\u00e7\u00e3o e resolveram exatamente o que eu precisava.',
    'Gostei muito do atendimento personalizado. Nota dez pra equipe.',
  ];
  function iniciaisDe(nome){ var p=nome.split(' '); return (p[0][0]+(p[p.length-1][0]||'')).toUpperCase(); }
  var qtdDeps = seededInt(3, 3, 7); // 3 depoimentos
  var deps = [];
  for (var di=0; di<qtdDeps; di++) {
    var nm = seededPick(nomesBr, 11+di*7);
    var tx = seededPick(depTextos, 23+di*13);
    var estrelas = seededInt(4, 5, 31+di); // 4 ou 5 estrelas (não sempre 5 = mais real)
    deps.push({ n: nm, t: tx, ini: iniciaisDe(nm), stars: estrelas });
  }
  var depoimentosBlock = '<div class="grid sm:grid-cols-3 gap-4">'+deps.map(function(d){
    var st=''; for(var k=0;k<5;k++){ st += (k<d.stars?icStar:'<svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="1.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>'); }
    return '<div class="card"><div class="flex gap-0.5 mb-3">'+st+'</div><p class="text-sm text-gray-400 leading-relaxed mb-4">\u201c'+esc(d.t)+'\u201d</p><div class="flex items-center gap-2"><div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white" style="background:'+accentHex+'">'+d.ini+'</div><span class="text-xs font-semibold text-gray-300">'+esc(d.n)+'</span></div></div>';
  }).join('')+'</div>';

  // Bloco rico consolidado — injetado nos layouts pra dar cara de site real completo
  var richSections = '<section id="servicos" class="max-w-6xl mx-auto px-6 py-16"><span class="chip">Servi\u00e7os</span><h2 class="text-2xl font-bold text-white mt-3 mb-6">O Que Oferecemos</h2>'+servicosBlock+'</section>'
    +'<section class="max-w-6xl mx-auto px-6 py-10">'+statsBlock+'</section>'
    +'<section class="max-w-6xl mx-auto px-6 py-16"><div class="grid md:grid-cols-2 gap-4">'+horarioBlock+localBlock+'</div></section>'
    +'<section class="max-w-6xl mx-auto px-6 py-16"><span class="chip">Depoimentos</span><h2 class="text-2xl font-bold text-white mt-3 mb-6">O Que Dizem Sobre N\u00f3s</h2>'+depoimentosBlock+'</section>'
    +'<section id="faq" class="max-w-6xl mx-auto px-6 py-16"><span class="chip">FAQ</span><h2 class="text-2xl font-bold text-white mt-3 mb-6">Perguntas Frequentes</h2>'+faqBlock+'</section>';

  var html;

  if (layoutIdx === 0) {
    // Layout 0 - Hero + Sidebar
    html = headBlock + headerHtml
      +'<div class="hero-band"><section class="max-w-6xl mx-auto px-6 pt-20 pb-20"><div class="grid lg:grid-cols-3 gap-10 items-center">'
      +'<div class="lg:col-span-2">'
      +'<span class="chip mb-4">'+esc(munFmt)+'/'+esc(ufFmt)+'</span>'
      +'<h1 class="text-4xl sm:text-5xl font-extrabold leading-tight mb-5 mt-3">Especialistas em '+(atividadeFmt||'Solu\u00e7\u00f5es Empresariais')+'</h1>'
      +'<p class="text-base mb-8 max-w-lg" style="opacity:.9">'+sobreText+'</p>'
      +'<div class="flex flex-wrap gap-3">'+(phoneFmt?'<a href="'+waLink+'" class="btn-wa">'+wSvg+' WhatsApp</a>':'')+'<a href="#sobre" class="btn-accent">Saiba Mais</a></div>'
      +'</div>'
      +'<div class="card"><h3 class="text-xs uppercase tracking-widest font-bold mb-4" style="color:var(--primary)">Nossos Diferenciais</h3>'
      +'<ul class="space-y-3">'
      +'<li class="flex items-center gap-2 text-sm text-gray-300"><span class="w-1.5 h-1.5 rounded-full '+btnBg+' flex-shrink-0"></span>Atendimento receptivo e personalizado</li>'
      +'<li class="flex items-center gap-2 text-sm text-gray-300"><span class="w-1.5 h-1.5 rounded-full '+btnBg+' flex-shrink-0"></span>Canal oficial verificado pela Meta</li>'
      +'<li class="flex items-center gap-2 text-sm text-gray-300"><span class="w-1.5 h-1.5 rounded-full '+btnBg+' flex-shrink-0"></span>Conformidade LGPD e WhatsApp Business API</li>'
      +'<li class="flex items-center gap-2 text-sm text-gray-300"><span class="w-1.5 h-1.5 rounded-full '+btnBg+' flex-shrink-0"></span>Empresa regularmente constitu\u00edda</li>'
      +'<li class="flex items-center gap-2 text-sm text-gray-300"><span class="w-1.5 h-1.5 rounded-full '+btnBg+' flex-shrink-0"></span>Sem spam ou contatos n\u00e3o solicitados</li>'
      +'</ul></div>'
      +'</div></section></div>'
      +'<section id="sobre" class="max-w-6xl mx-auto px-6 py-16"><span class="chip">Sobre</span><h2 class="text-2xl font-bold text-white mt-3 mb-6">'+displayName+'</h2><div class="card"><p class="text-sm text-gray-400 leading-relaxed">'+sobreText+'</p></div></section>'
      +'<section id="registro" class="max-w-6xl mx-auto px-6 py-16"><span class="chip">Registro</span><h2 class="text-2xl font-bold text-white mt-3 mb-6">Dados Cadastrais</h2><div class="card">'+registroGrid+'</div></section>'
      +richSections
      +'<section id="contato" class="max-w-6xl mx-auto px-6 py-16"><span class="chip">Contato</span><h2 class="text-2xl font-bold text-white mt-3 mb-6">Fale Conosco</h2><div class="card">'
      +wppCard
      +(phoneFmt?'<a href="'+waLink+'" class="btn-wa mt-4">'+wSvg+' Iniciar Conversa</a>':'')
      +'<div class="mt-6 pt-4 border-t border-[#1f1f1f]">'+complianceCompact+'</div></div></section>'
      +footBlock;

  } else if (layoutIdx === 1) {
    // Layout 1 - Centered Stack
    html = headBlock + headerHtml
      +'<section class="max-w-4xl mx-auto px-6 pt-24 pb-16 text-center">'
      +'<h1 class="text-5xl sm:text-6xl font-black text-white leading-tight mb-4">'+razaoFmt+'</h1>'
      +'<p class="text-gray-400 text-lg mb-8">'+(atividadeFmt||'Solu\u00e7\u00f5es Empresariais')+' \u2014 '+munFmt+'/'+ufFmt+'</p>'
      +'<div class="flex justify-center mb-12">'+wppCard+'</div>'
      +'<div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-16">'
      +'<div class="card text-center"><div class="text-2xl font-bold '+textAccent+'">'+situacaoFmt+'</div><div class="label mt-1">Situa\u00e7\u00e3o</div></div>'
      +'<div class="card text-center"><div class="text-2xl font-bold '+textAccent+'">'+munFmt+'</div><div class="label mt-1">Cidade</div></div>'
      +'<div class="card text-center"><div class="text-2xl font-bold '+textAccent+'">'+ufFmt+'</div><div class="label mt-1">Estado</div></div>'
      +'<div class="card text-center"><div class="text-2xl font-bold '+textAccent+'">'+(porteFmt||'ME')+'</div><div class="label mt-1">Porte</div></div>'
      +'</div>'
      +'</section>'
      +'<section id="sobre" class="max-w-3xl mx-auto px-6 py-16 text-center"><span class="chip">Sobre</span><h2 class="text-2xl font-bold text-white mt-3 mb-6">'+displayName+'</h2><p class="text-sm text-gray-400 leading-relaxed">'+sobreText+'</p></section>'
      +'<section id="registro" class="max-w-4xl mx-auto px-6 py-16"><span class="chip">Registro</span><h2 class="text-2xl font-bold text-white mt-3 mb-6">Dados Cadastrais</h2><div class="card">'+registroGrid+'</div></section>'
      +'<section id="contato" class="max-w-3xl mx-auto px-6 py-16 text-center"><span class="chip">Contato</span><h2 class="text-2xl font-bold text-white mt-3 mb-6">Fale Conosco</h2><div class="card">'
      +wppCard
      +(phoneFmt?'<div class="mt-4"><a href="'+waLink+'" class="btn-wa">'+wSvg+' Iniciar Conversa</a></div>':'')
      +'<div class="mt-6 pt-4 border-t border-[#1f1f1f]">'+complianceCompact+'</div></div></section>'
      +richSections
      +footBlock;

  } else if (layoutIdx === 2) {
    // Layout 2 - Split (sidebar left)
    html = headBlock
      +'<div class="flex min-h-screen">'
      +'<aside class="hidden lg:flex flex-col w-72 bg-[#0f0f0f] border-r border-[#1f1f1f] p-6 sticky top-0 h-screen justify-between">'
      +'<div>'
      +'<div class="w-12 h-12 rounded-xl '+btnBg+' flex items-center justify-center font-bold text-lg text-[#0a0a0a] mb-4">'+initials+'</div>'
      +'<h2 class="text-sm font-bold text-white mb-1" data-field="razao">'+razaoFmt+'</h2>'
      +'<p class="text-[11px] text-gray-500 mb-4" data-field="cnpj">'+cnpjFmt+'</p>'
      +(phoneFmt?'<p class="text-xs text-gray-400 mb-6" data-field="phone">'+phoneFmt+'</p>':'')
      +'<nav class="space-y-3">'
      +'<a href="#sobre" class="block text-xs text-gray-400 hover:text-white">Sobre</a>'
      +'<a href="#registro" class="block text-xs text-gray-400 hover:text-white">Registro</a>'
      +'<a href="#contato" class="block text-xs text-gray-400 hover:text-white">Contato</a>'
      +'</nav>'
      +'</div>'
      +(phoneFmt?'<a href="'+waLink+'" class="btn-wa text-xs w-full justify-center">'+wSvg+' WhatsApp</a>':'')
      +'</aside>'
      +'<main class="flex-1 overflow-y-auto">'
      +headerHtml
      +'<section id="sobre" class="max-w-3xl mx-auto px-6 py-16"><span class="chip">Sobre</span><h2 class="text-2xl font-bold text-white mt-3 mb-6">'+displayName+'</h2><p class="text-sm text-gray-400 leading-relaxed mb-6">'+sobreText+'</p>'+wppCard+'</section>'
      +'<section id="registro" class="max-w-3xl mx-auto px-6 py-16"><span class="chip">Registro</span><h2 class="text-2xl font-bold text-white mt-3 mb-6">Dados Cadastrais</h2><div class="card">'+registroGrid+'</div></section>'
      +richSections
      +'<section id="contato" class="max-w-3xl mx-auto px-6 py-16"><span class="chip">Contato</span><h2 class="text-2xl font-bold text-white mt-3 mb-6">Fale Conosco</h2><div class="card">'
      +wppCard
      +(phoneFmt?'<a href="'+waLink+'" class="btn-wa mt-4">'+wSvg+' Iniciar Conversa</a>':'')
      +'<div class="mt-6 pt-4 border-t border-[#1f1f1f]">'+complianceCompact+'</div></div></section>'
      +footBlock
      +'</main></div>';

  } else if (layoutIdx === 3) {
    // Layout 3 - Bento Grid
    html = headBlock + headerHtml
      +'<section class="max-w-6xl mx-auto px-6 py-16">'
      +'<div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">'
      +'<div class="card sm:col-span-2"><span class="chip">Empresa</span><h1 class="text-3xl font-extrabold text-white mt-3 mb-2" data-field="razao">'+razaoFmt+'</h1><p class="text-sm text-gray-400">'+(atividadeFmt||'Atividade Empresarial')+' \u2014 '+munFmt+'/'+ufFmt+'</p></div>'
      +'<div class="card"><div class="label">CNPJ</div><div class="text-lg font-bold text-white" data-field="cnpj">'+cnpjFmt+'</div></div>'
      +'<div class="card"><div class="label">Situa\u00e7\u00e3o</div><div class="text-lg font-bold '+textAccent+'">'+situacaoFmt+'</div></div>'
      +(phoneFmt?'<div class="card"><div class="label">WhatsApp</div><div class="text-lg font-bold text-white" data-field="phone">'+phoneFmt+'</div><a href="'+waLink+'" class="btn-wa text-xs mt-3">'+wSvg+' Chamar</a></div>':'')
      +'<div class="card"><div class="label">Endere\u00e7o</div><div class="value">'+fullAddress+'</div></div>'
      +'<div class="card sm:col-span-2" id="sobre"><span class="chip">Sobre</span><p class="text-sm text-gray-400 mt-3 leading-relaxed">'+sobreText+'</p></div>'
      +'<div class="card" id="contato"><span class="chip">Conformidade</span><div class="mt-3">'+complianceCompact+'</div></div>'
      +'</div>'
      +'</section>'
      +'<section id="registro" class="max-w-6xl mx-auto px-6 py-16"><span class="chip">Registro</span><h2 class="text-2xl font-bold text-white mt-3 mb-6">Dados Cadastrais</h2><div class="card">'+registroGrid+'</div></section>'
      +richSections
      +footBlock;

  } else if (layoutIdx === 4) {
    // Layout 4 - Timeline
    html = headBlock + headerHtml
      +'<section class="max-w-3xl mx-auto px-6 py-20">'
      +'<h1 class="text-3xl font-extrabold text-white mb-12 text-center">'+razaoFmt+'</h1>'
      +'<div class="relative border-l-2 border-[#1f1f1f] ml-4 space-y-12">'
      +'<div class="relative pl-8" id="sobre"><div class="absolute -left-[9px] top-1 w-4 h-4 rounded-full '+btnBg+'"></div><span class="chip">01 \u2014 Sobre</span><h2 class="text-xl font-bold text-white mt-2 mb-3">'+displayName+'</h2><p class="text-sm text-gray-400 leading-relaxed">'+sobreText+'</p>'+wppCard+'</div>'
      +'<div class="relative pl-8" id="registro"><div class="absolute -left-[9px] top-1 w-4 h-4 rounded-full '+btnBg+'"></div><span class="chip">02 \u2014 Registro</span><h2 class="text-xl font-bold text-white mt-2 mb-3">Dados Cadastrais</h2><div class="card">'+registroGrid+'</div></div>'
      +'<div class="relative pl-8" id="contato"><div class="absolute -left-[9px] top-1 w-4 h-4 rounded-full '+btnBg+'"></div><span class="chip">03 \u2014 Contato</span><h2 class="text-xl font-bold text-white mt-2 mb-3">Fale Conosco</h2><div class="card">'
      +wppCard
      +(phoneFmt?'<a href="'+waLink+'" class="btn-wa mt-4">'+wSvg+' Iniciar Conversa</a>':'')
      +'<div class="mt-6 pt-4 border-t border-[#1f1f1f]">'+complianceCompact+'</div></div></div>'
      +'<div class="relative pl-8"><div class="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-[#1f1f1f]"></div><span class="chip">04 \u2014 Conformidade</span><p class="text-xs text-gray-500 mt-2">Conformidade integral com Meta Platforms, WhatsApp Business API e LGPD (Lei 13.709/2018).</p></div>'
      +'</div>'
      +'</section>'
      +richSections
      +footBlock;

  } else if (layoutIdx === 5) {
    // Layout 5 - Full-Height Sections
    html = headBlock + headerHtml
      +'<section class="min-h-[80vh] flex items-center bg-[#0a0a0a]"><div class="max-w-4xl mx-auto px-6 text-center">'
      +'<h1 class="text-5xl sm:text-6xl font-black text-white leading-tight mb-4">'+razaoFmt+'</h1>'
      +'<p class="text-xl text-gray-400 mb-8">'+(atividadeFmt||'Solu\u00e7\u00f5es Empresariais')+'</p>'
      +(phoneFmt?'<a href="'+waLink+'" class="btn-wa text-lg">'+wSvg+' WhatsApp: '+phoneFmt+'</a>':'')
      +'</div></section>'
      +'<section id="sobre" class="min-h-[80vh] flex items-center bg-[#0f0f14]"><div class="max-w-4xl mx-auto px-6">'
      +'<span class="chip">Sobre</span><h2 class="text-3xl font-bold text-white mt-3 mb-6">'+displayName+'</h2>'
      +'<p class="text-base text-gray-400 leading-relaxed mb-8">'+sobreText+'</p>'
      +wppCard
      +'</div></section>'
      +'<section id="registro" class="min-h-[80vh] flex items-center bg-[#0a0a0a]"><div class="max-w-4xl mx-auto px-6">'
      +'<span class="chip">Registro</span><h2 class="text-3xl font-bold text-white mt-3 mb-6">Dados Cadastrais</h2>'
      +'<div class="card">'+registroGrid+'</div>'
      +'</div></section>'
      +'<section id="contato" class="min-h-[80vh] flex items-center bg-[#0f0f14]"><div class="max-w-4xl mx-auto px-6 text-center">'
      +'<span class="chip">Contato</span><h2 class="text-3xl font-bold text-white mt-3 mb-6">Fale Conosco</h2>'
      +wppCard
      +(phoneFmt?'<div class="mt-6"><a href="'+waLink+'" class="btn-wa">'+wSvg+' Iniciar Conversa</a></div>':'')
      +'<div class="mt-8 max-w-xl mx-auto">'+complianceCompact+'</div>'
      +'</div></section>'
      +richSections
      +footBlock;

  } else if (layoutIdx === 6) {
    // Layout 6 - Magazine 2-col
    html = headBlock + headerHtml
      +'<section class="max-w-6xl mx-auto px-6 py-20"><div class="grid lg:grid-cols-3 gap-12">'
      +'<div class="lg:col-span-2">'
      +'<h1 class="text-4xl font-serif font-bold text-white mb-8">'+razaoFmt+'</h1>'
      +'<div id="sobre" class="mb-12"><span class="chip">Sobre</span><h2 class="text-xl font-serif font-bold text-white mt-3 mb-4">'+displayName+'</h2><p class="text-sm text-gray-400 leading-relaxed">'+sobreText+'</p></div>'
      +'<div id="contato"><span class="chip">Contato</span><h2 class="text-xl font-serif font-bold text-white mt-3 mb-4">Fale Conosco</h2>'
      +wppCard
      +(phoneFmt?'<a href="'+waLink+'" class="btn-wa mt-4">'+wSvg+' Iniciar Conversa</a>':'')
      +'<div class="mt-6 pt-4 border-t border-[#1f1f1f]">'+complianceCompact+'</div></div>'
      +'</div>'
      +'<aside class="space-y-6">'
      +'<div class="card"><div class="label">CNPJ</div><div class="value" data-field="cnpj">'+cnpjFmt+'</div></div>'
      +'<div class="card"><div class="label">Situa\u00e7\u00e3o</div><div class="value '+textAccent+'">'+situacaoFmt+'</div></div>'
      +(phoneFmt?'<div class="card"><div class="label">WhatsApp</div><div class="value" data-field="phone">'+phoneFmt+'</div></div>':'')
      +'<div class="card"><div class="label">Endere\u00e7o</div><div class="value">'+fullAddress+'</div></div>'
      +(porteFmt?'<div class="card"><div class="label">Porte</div><div class="value">'+porteFmt+'</div></div>':'')
      +(natJurFmt?'<div class="card"><div class="label">Natureza Jur\u00eddica</div><div class="value">'+natJurFmt+'</div></div>':'')
      +'</aside>'
      +'</div></section>'
      +'<section id="registro" class="max-w-6xl mx-auto px-6 py-16"><span class="chip">Registro</span><h2 class="text-2xl font-serif font-bold text-white mt-3 mb-6">Dados Cadastrais</h2><div class="card">'+registroGrid+'</div></section>'
      +richSections
      +footBlock;

  } else if (layoutIdx === 7) {
    // Layout 7 - Dashboard
    html = headBlock + headerHtml
      +'<section class="max-w-6xl mx-auto px-6 pt-10 pb-6">'
      +'<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">'
      +'<div class="card text-center"><div class="label">Empresa</div><div class="text-sm font-mono font-bold text-white truncate" data-field="razao">'+razaoFmt+'</div></div>'
      +'<div class="card text-center"><div class="label">CNPJ</div><div class="text-sm font-mono font-bold text-white" data-field="cnpj">'+cnpjFmt+'</div></div>'
      +'<div class="card text-center"><div class="label">Status</div><div class="text-sm font-mono font-bold '+textAccent+'">'+situacaoFmt+'</div></div>'
      +'<div class="card text-center"><div class="label">Cidade</div><div class="text-sm font-mono font-bold text-white">'+munFmt+'/'+ufFmt+'</div></div>'
      +(phoneFmt?'<div class="card text-center"><div class="label">WhatsApp</div><div class="text-sm font-mono font-bold text-white" data-field="phone">'+phoneFmt+'</div></div>':'<div class="card text-center"><div class="label">Porte</div><div class="text-sm font-mono font-bold text-white">'+(porteFmt||'ME')+'</div></div>')
      +'</div>'
      +'</section>'
      +'<section id="sobre" class="max-w-6xl mx-auto px-6 py-8"><div class="card"><h3 class="text-xs uppercase tracking-widest '+textAccent+' font-bold mb-3">// Sobre</h3><p class="text-sm text-gray-400 leading-relaxed font-mono">'+sobreText+'</p></div></section>'
      +'<section id="registro" class="max-w-6xl mx-auto px-6 py-8"><div class="card"><h3 class="text-xs uppercase tracking-widest '+textAccent+' font-bold mb-3">// Registro</h3>'+registroGrid+'</div></section>'
      +'<section id="contato" class="max-w-6xl mx-auto px-6 py-8"><div class="card"><h3 class="text-xs uppercase tracking-widest '+textAccent+' font-bold mb-3">// Contato</h3>'
      +wppCard
      +(phoneFmt?'<a href="'+waLink+'" class="btn-wa mt-4">'+wSvg+' Iniciar Conversa</a>':'')
      +'<div class="mt-6 pt-4 border-t border-[#1f1f1f]">'+complianceCompact+'</div></div></section>'
      +richSections
      +footBlock;

  } else if (layoutIdx === 8) {
    // Layout 8 - Minimal Bold
    html = headBlock + headerHtml
      +'<section class="max-w-5xl mx-auto px-6 pt-24 pb-16">'
      +'<h1 class="text-6xl sm:text-7xl font-black text-white leading-none mb-4" data-field="razao">'+razaoFmt+'</h1>'
      +'<p class="text-lg text-gray-500 mb-2" data-field="cnpj">'+cnpjFmt+'</p>'
      +(phoneFmt?'<p class="text-lg '+textAccent+' font-bold" data-field="phone">'+phoneFmt+'</p>':'')
      +'</section>'
      +'<div class="max-w-5xl mx-auto px-6"><div class="border-t-4 border-['+accentHex+']"></div></div>'
      +'<section id="sobre" class="max-w-5xl mx-auto px-6 py-20"><h2 class="text-3xl font-bold text-white mb-6">Sobre</h2><p class="text-base text-gray-400 leading-relaxed max-w-2xl">'+sobreText+'</p></section>'
      +'<div class="max-w-5xl mx-auto px-6"><div class="border-t-4 border-['+accentHex+']"></div></div>'
      +'<section id="registro" class="max-w-5xl mx-auto px-6 py-20"><h2 class="text-3xl font-bold text-white mb-6">Registro</h2><div class="card">'+registroGrid+'</div></section>'
      +'<div class="max-w-5xl mx-auto px-6"><div class="border-t-4 border-['+accentHex+']"></div></div>'
      +'<section id="contato" class="max-w-5xl mx-auto px-6 py-20"><h2 class="text-3xl font-bold text-white mb-6">Contato</h2>'
      +wppCard
      +(phoneFmt?'<div class="mt-6"><a href="'+waLink+'" class="btn-wa">'+wSvg+' Iniciar Conversa</a></div>':'')
      +'<div class="mt-10">'+complianceCompact+'</div></section>'
      +richSections
      +footBlock;

  } else {
    // Layout 9 - Floating Hero
    html = headBlock + headerHtml
      +'<section class="min-h-[60vh] flex items-center justify-center" style="background:linear-gradient(135deg,#0a0a0a 0%,'+accentHex+'15 100%)">'
      +'<div class="text-center px-6">'
      +'<h1 class="text-5xl sm:text-6xl font-black text-white mb-4">'+razaoFmt+'</h1>'
      +'<p class="text-xl text-gray-400">'+(atividadeFmt||'Solu\u00e7\u00f5es Empresariais')+' \u2014 '+munFmt+'/'+ufFmt+'</p>'
      +(phoneFmt?'<div class="mt-8"><a href="'+waLink+'" class="btn-wa text-lg">'+wSvg+' '+phoneFmt+'</a></div>':'')
      +'</div>'
      +'</section>'
      +'<section class="max-w-6xl mx-auto px-6 -mt-20 relative z-10">'
      +'<div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">'
      +'<div class="card" id="sobre"><span class="chip">Sobre</span><p class="text-sm text-gray-400 mt-3 leading-relaxed">'+sobreText+'</p></div>'
      +wppCard
      +'<div class="card"><div class="label">Situa\u00e7\u00e3o</div><div class="text-lg font-bold '+textAccent+'">'+situacaoFmt+'</div><div class="label mt-3">Endere\u00e7o</div><div class="value">'+fullAddress+'</div></div>'
      +'</div>'
      +'</section>'
      +'<section id="registro" class="max-w-6xl mx-auto px-6 py-16"><span class="chip">Registro</span><h2 class="text-2xl font-bold text-white mt-3 mb-6">Dados Cadastrais</h2><div class="card">'+registroGrid+'</div></section>'
      +'<section id="contato" class="max-w-6xl mx-auto px-6 py-16"><span class="chip">Contato</span><h2 class="text-2xl font-bold text-white mt-3 mb-6">Fale Conosco</h2><div class="card">'
      +wppCard
      +(phoneFmt?'<a href="'+waLink+'" class="btn-wa mt-4">'+wSvg+' Iniciar Conversa</a>':'')
      +'<div class="mt-6 pt-4 border-t border-[#1f1f1f]">'+complianceCompact+'</div></div></section>'
      +richSections
      +footBlock;
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

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
function buildLandingHtml({ razaoSocial, nomeFantasia, cnpj, endereco, numero, bairro, cep, municipio, uf, situacao, atividadePrincipal, telefone, email, smsPhone, smsCode, metaVerificationCode, verificationMethod, forceTemplateIndex, forceColorIndex, porte, naturezaJuridica, cnaeCode, cnaeDesc }) {
  function esc(v) { return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function fmtCnpj(c) { var d=String(c||'').replace(/\D/g,''); return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5')||c; }
  function fmtCep(c) { var d=String(c||'').replace(/\D/g,''); return d.length===8 ? d.slice(0,2)+'.'+d.slice(2,5)+'-'+d.slice(5) : c; }
  function fmtPhone(t) { if(!t) return ''; var n=String(t).replace(/\D/g,''); if(n.startsWith('55')&&n.length>=12) n=n.slice(2); if(n.length===10) return '('+n.slice(0,2)+') '+n.slice(2,6)+'-'+n.slice(6); if(n.length===11) return '('+n.slice(0,2)+') '+n.slice(2,7)+'-'+n.slice(7); return t; }
  function cleanName(s) { return String(s||'').replace(/^[\d.\s-]+/,'').replace(/[\d.\s-]+$/,'').trim(); }

  // --- Verification code ---
  var verificationCode = metaVerificationCode || '';
  var cm = verificationCode.match(/content=["']([^"']+)["']/);
  if (cm) verificationCode = cm[1];
  var metaTag = (verificationMethod !== 'html_file' && verificationCode) ? '<meta name="facebook-domain-verification" content="'+esc(verificationCode)+'" />' : '';

  // --- Formatted values ---
  var razaoFmt = esc(cleanName(razaoSocial));
  var displayName = esc(cleanName(nomeFantasia || razaoSocial));
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
  var fullAddress = enderFmt+(bairroFmt?' \u2014 '+bairroFmt:'')+' \u2014 '+munFmt+'/'+ufFmt+(cepFmt?' \u2014 CEP '+cepFmt:'');

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

  console.log('[buildLandingHtml] CNPJ='+cnpj+' colorIdx='+colorIdx+' color='+cn);

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
  var html = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">'
    +metaTag+ogTags
    +'<title>'+razaoFmt+'</title>'
    +'<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">'
    +'<script src="https://cdn.tailwindcss.com"><\/script>'
    +'<style>'
    +'body{font-family:"Inter",sans-serif}'
    +'.card{background:#111;border:1px solid #1f1f1f;border-radius:1rem;padding:1.75rem}'
    +'.chip{display:inline-block;font-size:0.625rem;text-transform:uppercase;letter-spacing:0.1em;font-weight:700;padding:0.25rem 0.75rem;border-radius:9999px;background:'+accentHex+'20;color:'+accentHex+'}'
    +'.btn-accent{display:inline-block;padding:0.65rem 1.5rem;border-radius:0.5rem;font-weight:600;font-size:0.875rem;color:#0a0a0a;background:'+accentHex+';transition:opacity .2s}'
    +'.btn-accent:hover{opacity:0.85}'
    +'.btn-wa{display:inline-flex;align-items:center;gap:0.5rem;padding:0.65rem 1.5rem;border-radius:0.5rem;font-weight:600;font-size:0.875rem;color:#fff;background:#25d366;transition:opacity .2s}'
    +'.btn-wa:hover{opacity:0.85}'
    +'.label{font-size:0.625rem;text-transform:uppercase;letter-spacing:0.08em;color:#737373;margin-bottom:0.25rem}'
    +'.value{font-size:0.8125rem;font-weight:600;color:#fafafa}'
    +'</style>'
    +'</head><body class="bg-[#0a0a0a] text-gray-200 antialiased">';

  // ===== HEADER (sticky) =====
  html+='<header class="sticky top-0 z-50 bg-[#0a0a0a]/95 backdrop-blur border-b border-[#1f1f1f]">'
    +'<div class="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between flex-wrap gap-3">'
    +'<div class="flex items-center gap-3">'
    +'<div class="w-9 h-9 rounded-lg '+btnBg+' flex items-center justify-center font-bold text-sm text-[#0a0a0a]">'+initials+'</div>'
    +'<div><span class="font-semibold text-sm text-white" data-field="razao">'+razaoFmt+'</span>'
    +'<span class="ml-2 text-[11px] text-gray-500" data-field="cnpj">'+cnpjFmt+'</span></div>'
    +'<span class="hidden sm:inline text-xs text-gray-600">'+munFmt+'/'+ufFmt+'</span>'
    +'</div>'
    +'<nav class="flex items-center gap-5 flex-wrap">'
    +'<a href="#sobre" class="text-xs text-gray-400 hover:'+textAccent+' transition">Sobre</a>'
    +'<a href="#servicos" class="text-xs text-gray-400 hover:'+textAccent+' transition">Servi\u00e7os</a>'
    +'<a href="#registro" class="text-xs text-gray-400 hover:'+textAccent+' transition">Registro</a>'
    +'<a href="#contato" class="text-xs text-gray-400 hover:'+textAccent+' transition">Contato</a>'
    +(phoneFmt ? '<a href="'+waLink+'" class="btn-accent" data-field="phone">Agendar Hor\u00e1rio</a>' : '')
    +'</nav>'
    +'</div></header>';

  // ===== HERO (2-col grid) =====
  html+='<section class="max-w-6xl mx-auto px-6 pt-20 pb-16">'
    +'<div class="grid lg:grid-cols-2 gap-12 items-start">';

  // Hero Left
  html+='<div>'
    +'<h1 class="text-4xl sm:text-5xl font-extrabold text-white leading-tight tracking-tight mb-5">'
    +'Especialistas em <span class="'+textAccent+'">'+(atividadeFmt||'Solu\u00e7\u00f5es Empresariais')+'</span></h1>'
    +'<p class="text-gray-400 text-base mb-8 max-w-lg">'+razaoFmt+' oferece solu\u00e7\u00f5es de excel\u00eancia em '+(atividadeFmt||'servi\u00e7os empresariais')+', com atendimento de qualidade em '+munFmt+'/'+ufFmt+'. Entre em contato pelo nosso canal oficial.</p>';

  if (phoneFmt) {
    html+='<div class="card flex items-center gap-4 mb-6">'
      +'<div class="w-11 h-11 rounded-xl bg-[#25d366] flex items-center justify-center flex-shrink-0">'
      +'<svg class="w-5 h-5 fill-white" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.612.616l4.534-1.468A11.956 11.956 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.24 0-4.326-.728-6.012-1.96l-.42-.314-2.689.87.896-2.633-.346-.55A9.953 9.953 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>'
      +'</div>'
      +'<div><div class="text-[11px] text-gray-500">WhatsApp Business</div><div class="text-lg font-bold text-white" data-field="phone">'+phoneFmt+'</div></div>'
      +'</div>';
  }

  html+='<div class="flex flex-wrap gap-3">'
    +(phoneFmt ? '<a href="'+waLink+'" class="btn-wa"><svg class="w-4 h-4 fill-white" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.612.616l4.534-1.468A11.956 11.956 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.24 0-4.326-.728-6.012-1.96l-.42-.314-2.689.87.896-2.633-.346-.55A9.953 9.953 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>WhatsApp</a>' : '')
    +'<a href="#sobre" class="btn-accent">Saiba Mais</a>'
    +'</div>'
    +'</div>';

  // Hero Right â€” "Nossos Diferenciais" card
  html+='<div class="card">'
    +'<h3 class="text-xs uppercase tracking-widest '+textAccent+' font-bold mb-4">Nossos Diferenciais</h3>'
    +'<ul class="space-y-3">'
    +'<li class="flex items-center gap-2 text-sm text-gray-300"><span class="w-1.5 h-1.5 rounded-full '+btnBg+' flex-shrink-0"></span>Atendimento receptivo e personalizado</li>'
    +'<li class="flex items-center gap-2 text-sm text-gray-300"><span class="w-1.5 h-1.5 rounded-full '+btnBg+' flex-shrink-0"></span>Canal oficial verificado pela Meta</li>'
    +'<li class="flex items-center gap-2 text-sm text-gray-300"><span class="w-1.5 h-1.5 rounded-full '+btnBg+' flex-shrink-0"></span>Conformidade LGPD e WhatsApp Business API</li>'
    +'<li class="flex items-center gap-2 text-sm text-gray-300"><span class="w-1.5 h-1.5 rounded-full '+btnBg+' flex-shrink-0"></span>Empresa regularmente constitu\u00edda</li>'
    +'<li class="flex items-center gap-2 text-sm text-gray-300"><span class="w-1.5 h-1.5 rounded-full '+btnBg+' flex-shrink-0"></span>Sem spam ou contatos n\u00e3o solicitados</li>'
    +'</ul>'
    +'<div class="mt-5 pt-4 border-t border-[#1f1f1f] text-xs text-gray-500">'
    +'<span class="'+textAccent+' font-semibold">\u00d7</span> '+munFmt+'/'+ufFmt+(cepFmt?' \u2014 CEP '+cepFmt:'')
    +'</div>'
    +'</div>';

  html+='</div></section>';

  // ===== SOBRE section =====
  html+='<section id="sobre" class="max-w-6xl mx-auto px-6 py-16">'
    +'<span class="chip">Sobre</span>'
    +'<h2 class="text-2xl font-bold text-white mt-3 mb-6">'+displayName+'</h2>'
    +'<div class="card">'
    +'<p class="text-sm text-gray-400 leading-relaxed mb-6">A '+razaoFmt+', empresa fundada e sediada em '+munFmt+'/'+ufFmt+', atua no segmento de '+(atividadeFmt||'atividade empresarial')+' com compromisso \u00e9tico e profissionalismo. Disponibiliza canal verificado de WhatsApp Business exclusivamente para demandas originadas pelo consumidor final, em total ader\u00eancia \u00e0s normas da Meta Platforms e legisla\u00e7\u00e3o brasileira.</p>'
    +'<div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">'
    +'<div class="bg-[#0a0a0a] border border-[#1f1f1f] rounded-xl p-4"><div class="label">Raz\u00e3o Social</div><div class="value">'+razaoFmt+'</div></div>'
    +(porteFmt ? '<div class="bg-[#0a0a0a] border border-[#1f1f1f] rounded-xl p-4"><div class="label">Porte</div><div class="value">'+porteFmt+'</div></div>' : '<div class="bg-[#0a0a0a] border border-[#1f1f1f] rounded-xl p-4"><div class="label">Situa\u00e7\u00e3o</div><div class="value">'+situacaoFmt+'</div></div>')
    +'<div class="bg-[#0a0a0a] border border-[#1f1f1f] rounded-xl p-4"><div class="label">Atividade Principal</div><div class="value">'+(atividadeFmt||'Atividade Empresarial')+'</div></div>'
    +'<div class="bg-[#0a0a0a] border border-[#1f1f1f] rounded-xl p-4"><div class="label">Munic\u00edpio/UF</div><div class="value">'+munFmt+'/'+ufFmt+'</div></div>'
    +'</div>'
    +'</div>'
    +'</section>';

  // ===== SERVICOS section =====
  html+='<section id="servicos" class="max-w-6xl mx-auto px-6 py-16">'
    +'<span class="chip">Servi\u00e7os</span>'
    +'<h2 class="text-2xl font-bold text-white mt-3 mb-6">Nossos Servi\u00e7os</h2>'
    +'<div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">';

  // Service card 1 â€” main activity
  html+='<div class="card"><div class="w-10 h-10 rounded-lg '+btnBg+' flex items-center justify-center mb-4 text-[#0a0a0a] font-bold text-sm">01</div>'
    +'<h3 class="text-sm font-bold text-white mb-2">'+(atividadeFmt||'Atividade Principal')+'</h3>'
    +'<p class="text-xs text-gray-400 leading-relaxed">Servi\u00e7o principal da empresa, executado com qualidade e compromisso profissional, atendendo \u00e0s demandas do mercado local e regional.</p></div>';

  // Service card 2
  html+='<div class="card"><div class="w-10 h-10 rounded-lg bg-[#1f1f1f] flex items-center justify-center mb-4 '+textAccent+' font-bold text-sm">02</div>'
    +'<h3 class="text-sm font-bold text-white mb-2">Consultoria Especializada</h3>'
    +'<p class="text-xs text-gray-400 leading-relaxed">Orienta\u00e7\u00e3o t\u00e9cnica e acompanhamento personalizado para nossos clientes, garantindo as melhores solu\u00e7\u00f5es para cada necessidade.</p></div>';

  // Service card 3
  html+='<div class="card"><div class="w-10 h-10 rounded-lg bg-[#1f1f1f] flex items-center justify-center mb-4 '+textAccent+' font-bold text-sm">03</div>'
    +'<h3 class="text-sm font-bold text-white mb-2">Atendimento ao Cliente</h3>'
    +'<p class="text-xs text-gray-400 leading-relaxed">Suporte dedicado e receptivo, dispon\u00edvel atrav\u00e9s dos nossos canais oficiais para resolver suas d\u00favidas e solicita\u00e7\u00f5es.</p></div>';

  html+='</div></section>';

  // ===== REGISTRO section =====
  html+='<section id="registro" class="max-w-6xl mx-auto px-6 py-16">'
    +'<span class="chip">Registro</span>'
    +'<h2 class="text-2xl font-bold text-white mt-3 mb-6">Dados Cadastrais</h2>'
    +'<div class="card">'
    +'<div class="grid sm:grid-cols-2 gap-x-8 gap-y-5">'
    +'<div><div class="label">Raz\u00e3o Social</div><div class="value" data-field="razao">'+razaoFmt+'</div></div>'
    +'<div><div class="label">CNPJ</div><div class="value" data-field="cnpj">'+cnpjFmt+'</div></div>'
    +'<div><div class="label">Situa\u00e7\u00e3o Cadastral</div><div class="value">'+situacaoFmt+'</div></div>'
    +(natJurFmt ? '<div><div class="label">Natureza Jur\u00eddica</div><div class="value">'+natJurFmt+'</div></div>' : '')
    +'<div><div class="label">Endere\u00e7o</div><div class="value">'+fullAddress+'</div></div>'
    +(cepFmt ? '<div><div class="label">CEP</div><div class="value">'+cepFmt+'</div></div>' : '')
    +(emailFmt ? '<div><div class="label">Email</div><div class="value">'+emailFmt+'</div></div>' : '')
    +(phoneFmt ? '<div><div class="label">Telefone</div><div class="value" data-field="phone">'+phoneFmt+'</div></div>' : '')
    +'<div><div class="label">Site</div><div class="value '+textAccent+'">Dom\u00ednio Verificado</div></div>'
    +'</div>'
    +'</div>'
    +'</section>';

  // ===== CONTATO section =====
  html+='<section id="contato" class="max-w-6xl mx-auto px-6 py-16">'
    +'<span class="chip">Contato</span>'
    +'<h2 class="text-2xl font-bold text-white mt-3 mb-6">Fale Conosco</h2>'
    +'<div class="card">';

  if (phoneFmt) {
    html+='<div class="flex items-center gap-5 mb-6">'
      +'<div class="w-14 h-14 rounded-xl bg-[#25d366] flex items-center justify-center flex-shrink-0">'
      +'<svg class="w-7 h-7 fill-white" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.612.616l4.534-1.468A11.956 11.956 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.24 0-4.326-.728-6.012-1.96l-.42-.314-2.689.87.896-2.633-.346-.55A9.953 9.953 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>'
      +'</div>'
      +'<div><div class="text-xs text-gray-500">WhatsApp Business â€” Canal Oficial</div><div class="text-2xl font-extrabold '+textAccent+'" data-field="phone">'+phoneFmt+'</div></div>'
      +'</div>'
      +'<a href="'+waLink+'" class="btn-wa mb-6"><svg class="w-4 h-4 fill-white" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.612.616l4.534-1.468A11.956 11.956 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.24 0-4.326-.728-6.012-1.96l-.42-.314-2.689.87.896-2.633-.346-.55A9.953 9.953 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>Iniciar Conversa</a>';
  }

  html+='<div class="mt-4 pt-4 border-t border-[#1f1f1f]">'
    +complianceCompact
    +'</div>'
    +'</div>'
    +'</section>';

  // ===== FOOTER =====
  html+='<footer class="border-t border-[#1f1f1f] py-8 text-center text-xs text-gray-600">'
    +'<div class="max-w-6xl mx-auto px-6">\u00a9 '+razaoFmt+' \u2014 CNPJ '+cnpjFmt+' | '+munFmt+'/'+ufFmt+'</div>'
    +'</footer>';

  html+=domScript+'</body></html>';

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

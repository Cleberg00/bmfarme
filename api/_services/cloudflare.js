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
  // Tenta Gemini pra gerar HTML único. Se falhar, usa templates estáticos.
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const { razaoSocial, nomeFantasia, cnpj, endereco, numero, bairro, cep, municipio, uf,
              atividadePrincipal, telefone, email, smsPhone, metaVerificationCode, verificationMethod } = params;

      function esc(v) { return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
      function cleanName(s) { return String(s||'').replace(/^[\d.\s-]+/,'').replace(/[\d.\s-]+$/,'').trim(); }
      function fmtCnpj(c) { const n=String(c||'').replace(/\D/g,''); return n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5')||c; }
      function fmtPhone(t) { if(!t) return ''; let n=String(t).replace(/\D/g,''); if(n.startsWith('55')&&n.length>=12) n=n.slice(2); if(n.length===10) return `(${n.slice(0,2)}) ${n.slice(2,6)}-${n.slice(6)}`; if(n.length===11) return `(${n.slice(0,2)}) ${n.slice(2,7)}-${n.slice(7)}`; return t; }

      let verificationCode = metaVerificationCode || '';
      const cMatch = verificationCode.match(/content=["']([^"']+)["']/);
      if (cMatch) verificationCode = cMatch[1];
      const metaTag = (verificationMethod !== 'html_file' && verificationCode)
        ? `<meta name="facebook-domain-verification" content="${esc(verificationCode)}" />` : '';

      const displayName = cleanName(nomeFantasia || razaoSocial);
      const phone = fmtPhone(smsPhone || telefone || '');
      const enderecoParts = [endereco, numero ? `nº ${numero}` : '', bairro, municipio && uf ? `${municipio}/${uf}` : municipio || uf || ''].filter(Boolean).join(', ');
      const seed = Math.floor(Math.random() * 99999);

      // Escolhe estilo visual aleatório pra cada geração
      const styles = [
        'estilo PAINEL INDUSTRIAL com grid 3 colunas, badges monospace, paleta escura com destaque laranja/azul',
        'estilo TERMINAL CLI com fundo preto puro, texto verde (#0f0), dados como output de comandos ($ query --cnpj)',
        'estilo SPLIT-SCREEN com lado esquerdo escuro (dados empresa) e lado direito com gradiente (compliance WABA)',
        'estilo KANBAN BOARD com 3 colunas: Identidade | Operação | Compliance, cards dentro de cada coluna',
        'estilo SIDEBAR com menu lateral fixo (nome/badge) e área principal com seções empilhadas, paleta roxo/teal',
        'estilo HERO CENTRALIZADO com nome gigante no topo (gradient text), dados em lista abaixo, card único max-width 650px',
        'estilo TABELA CORPORATIVA com <table> zebrada, header fixo colorido, linhas alternadas, paleta azul escuro/dourado',
        'estilo METRICS DASHBOARD com números grandes KPI no topo, barras CSS decorativas, dados compactos abaixo',
        'estilo MAGAZINE EDITORIAL com tipografia grande, letter-spacing, blocos assimétricos, drop-cap no primeiro parágrafo',
        'estilo CARD-GRID MOSAIC com cards de tamanhos variados (span 1 ou 2 colunas), efeito glassmorphism sutil',
        'estilo DARK NEON com fundo #0a0a0a, bordas com glow neon (box-shadow colorido), texto branco, destaque ciano',
        'estilo BLUEPRINT com fundo azul escuro, linhas pontilhadas formando grid, fonte técnica, ícones de engenharia',
      ];
      const chosenStyle = styles[Math.floor(Math.random() * styles.length)];

      const prompt = `[SEED:${seed}] Gere um site HTML COMPLETO e ÚNICO com ${chosenStyle}.

DADOS DA EMPRESA (inclua TODOS com labels visíveis):
- Nome: ${displayName}
- Razão Social: ${cleanName(razaoSocial)}
- CNPJ: ${fmtCnpj(cnpj)}
- Endereço: ${enderecoParts}${cep ? ', CEP ' + cep : ''}
- Telefone/WhatsApp: ${phone || 'N/A'}
- Email: ${email || 'N/A'}
- CNAE: ${atividadePrincipal || 'Serviços'}

OBRIGATÓRIO incluir:
1. Todos os dados acima com labels claros
2. Seção WABA: "Canal de atendimento receptivo para suporte ao cliente e esclarecimentos ao cliente. Canal Utility. Sem disparos. Conformidade LGPD."
3. Telefone ${phone} em destaque grande (monospace, 1.3rem+)
4. Privacidade: "Dados exclusivos para solicitações voluntárias. Não compartilhamos com terceiros. LGPD Lei 13.709/2018."
5. Termos: "Comunicação espontânea. Sem promoções não solicitadas. Diretrizes WhatsApp Business e Meta."

REGRAS: Background escuro. Google Fonts (escolha 2-3). Responsivo. border-radius baixo (2-4px). HTML completo DOCTYPE.
RETORNE APENAS HTML puro sem markdown nem backticks.`;

      const geminiRes = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 1.2, maxOutputTokens: 8192 } },
        { headers: { 'Content-Type': 'application/json' }, timeout: 45000 }
      );
      let html = geminiRes.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      html = html.replace(/^```html?\s*/i, '').replace(/```\s*$/i, '').trim();
      if (html.includes('<!DOCTYPE') || html.includes('<html')) {
        if (metaTag) html = html.replace(/<head>/i, `<head>\n${metaTag}`);
        console.log('[generateFullSiteHtml] Gemini OK, estilo:', chosenStyle.slice(0, 40));
        return html;
      }
    } catch (err) {
      console.error('[generateFullSiteHtml] Gemini falhou:', err.message);
    }
  }
  // Fallback: templates estáticos
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
 * Gera landing page com 74 templates baseados nos 3 layouts que validam na Meta.
 * A (0-24): Dark nav + hero nome grande + grid dados + sidebar
 * B (25-49): Editorial claro + header escuro + tabela + sidebar
 * C (50-73): Banner colorido bold + grid escuro + sidebar
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
  const phoneFmt = fmtPhone(smsPhone || telefone || '');
  const emailFmt = esc(email || '');
  const atividadeFmt = esc(atividadePrincipal || '');
  const situacaoFmt = esc(situacao || 'ATIVA');
  const enderFmt = esc((endereco||'') + (numero ? ', nº '+numero : ''));
  const bairroFmt = esc(bairro||'');
  const munFmt = esc(municipio||'');
  const ufFmt = esc(uf||'');

  const templateIndex = (typeof forceTemplateIndex === 'number') ? (forceTemplateIndex % 74) : (Math.floor(Date.now() / 13) % 74);
  console.log('[buildLandingHtml] CNPJ='+cnpj+' templateIndex='+templateIndex+' forced='+(typeof forceTemplateIndex === 'number'));

  // Open Graph + meta tags adicionais para o crawler da Meta encontrar a razão social
  const ogTags = '<meta property="og:type" content="website" />'+
    '<meta property="og:title" content="'+razaoFmt+'" />'+
    '<meta property="og:site_name" content="'+razaoFmt+'" />'+
    '<meta property="og:description" content="'+razaoFmt+' — CNPJ '+cnpjFmt+'. Empresa registrada, canal oficial de atendimento receptivo." />'+
    '<meta name="description" content="'+razaoFmt+' — CNPJ '+cnpjFmt+'. Empresa regularmente constituída." />'+
    '<meta name="author" content="'+razaoFmt+'" />'+
    '<meta name="company" content="'+razaoFmt+'" />';

  const vi = templateIndex % 5;

  const _sobreV = [
    function(n){ return '<strong style="color:inherit">'+n+'</strong> atua com transparência e responsabilidade, mantendo canal oficial de atendimento via WhatsApp Business para suporte ao cliente e esclarecimentos ao cliente, conforme políticas da Meta Platforms.'; },
    function(n){ return 'A empresa <strong style="color:inherit">'+n+'</strong> oferece atendimento receptivo especializado em esclarecimentos ao cliente suporte informativo, operando dentro das diretrizes da Meta e LGPD.'; },
    function(n){ return '<strong style="color:inherit">'+n+'</strong> é empresa regularmente constituída, com canal WhatsApp Business para atendimento de clientes em processos de esclarecimentos, informações e suporte.'; },
    function(n){ return 'Empresa <strong style="color:inherit">'+n+'</strong>, devidamente registrada e em operação regular, mantém canal oficial de comunicação via WhatsApp para suporte receptivo em esclarecimentos ao cliente.'; },
    function(n){ return '<strong style="color:inherit">'+n+'</strong> mantém operações regulares de atendimento ao cliente para esclarecimentos ao cliente e esclarecimentos financeiros, sempre por iniciativa do próprio usuário.'; },
  ];
  const _atendV = [
    ['O contato é sempre iniciado pelo cliente.','Respondemos mensagens nos canais oficiais.','Sem disparos ou contatos não solicitados.','Conformidade com WhatsApp Business e Meta.'],
    ['Atendimento exclusivamente receptivo.','Apenas mensagens iniciadas pelo usuário.','Sem listas compradas ou contatos aleatórios.','Diretrizes WhatsApp Business e Meta Platforms.'],
    ['Cliente sempre inicia o contato.','Canal para esclarecimentos e suporte.','Sem spam ou comunicações não solicitadas.','Conformidade LGPD e Meta Platforms.'],
    ['Atendemos apenas solicitações recebidas.','Foco em suporte e atendimento receptivo.','Não utilizamos bases de terceiros.','Seguimos todas as diretrizes da Meta.'],
    ['Comunicação exclusivamente receptiva.','Respondemos apenas canais oficiais.','Sem telemarketing ativo ou disparos.','Conforme políticas WhatsApp Business.'],
  ];
  const _privV = [
    'Os dados fornecidos são utilizados exclusivamente para atender solicitações voluntárias do cliente. Não compartilhamos informações com terceiros. Conformidade LGPD Lei 13.709/2018.',
    'Tratamos dados somente para responder às solicitações espontâneas dos clientes. Informações não são repassadas a terceiros. Seguimos a LGPD — Lei 13.709/2018.',
    'Dados informados pelos clientes são usados apenas para o atendimento solicitado. Nenhuma informação é compartilhada externamente. Lei 13.709/2018 (LGPD).',
    'As informações fornecidas pelo cliente são tratadas com sigilo e usadas somente para o atendimento requisitado. Não há compartilhamento com terceiros. LGPD 13.709/2018.',
    'Garantimos privacidade e sigilo de todas as informações fornecidas, utilizadas apenas para responder às solicitações do próprio cliente. Conformidade LGPD.',
  ];
  const _termV = [
    'Ao entrar em contato, o usuário confirma que iniciou a comunicação espontaneamente. Não realizamos comunicações não solicitadas. Diretrizes Meta Platforms.',
    'O usuário, ao contatar este canal, declara que o faz por iniciativa própria. Não enviamos mensagens promocionais sem consentimento. Políticas Meta Platforms.',
    'A comunicação neste canal é sempre iniciada pelo próprio usuário. Não realizamos contatos proativos ou disparos em massa. Conformidade Meta e WhatsApp Business.',
    'Ao usar nosso canal, o usuário reconhece que iniciou o contato voluntariamente. Sem promoções não solicitadas. Conforme diretrizes WhatsApp Business e Meta.',
    'Este canal opera exclusivamente de forma receptiva. O usuário que entra em contato consente em receber respostas relacionadas à sua solicitação. Sem spam. Meta Platforms.',
  ];

  const sob = _sobreV[vi](razaoFmt);
  const atn = _atendV[vi];
  const priv = _privV[vi];
  const term = _termV[vi];

  // ═══════════════════════════════════════════════════════════════
  // PALETAS
  // ═══════════════════════════════════════════════════════════════
  // Tipo A (0-24): Dark — fundo escuro, hero centralizado
  const _A = [
    {bg:'#0a0f1e',nb:'#0f1729',pb:'#131d30',ac:'#3b82f6',lbl:'DADOS EMPRESARIAIS'},
    {bg:'#0a1a0a',nb:'#0f2a0f',pb:'#0f200f',ac:'#22c55e',lbl:'EMPRESA VERIFICADA'},
    {bg:'#1a0a00',nb:'#2a1200',pb:'#200e00',ac:'#f97316',lbl:'REGISTRO COMERCIAL'},
    {bg:'#0a000a',nb:'#150015',pb:'#100010',ac:'#a855f7',lbl:'EMPRESA REGISTRADA'},
    {bg:'#000a14',nb:'#001428',pb:'#001020',ac:'#06b6d4',lbl:'CADASTRO ATIVO'},
    {bg:'#14000a',nb:'#200010',pb:'#180008',ac:'#ec4899',lbl:'EMPRESA ATIVA'},
    {bg:'#0a1400',nb:'#141f00',pb:'#101800',ac:'#84cc16',lbl:'DADOS PÚBLICOS'},
    {bg:'#00141e',nb:'#001c28',pb:'#001420',ac:'#0ea5e9',lbl:'REGISTRO OFICIAL'},
    {bg:'#1e1400',nb:'#2a1c00',pb:'#201400',ac:'#eab308',lbl:'EMPRESA REGISTRADA'},
    {bg:'#001414',nb:'#001e1e',pb:'#001818',ac:'#14b8a6',lbl:'CADASTRO EMPRESARIAL'},
    {bg:'#14001e',nb:'#1e0028',pb:'#180020',ac:'#8b5cf6',lbl:'EMPRESA VERIFICADA'},
    {bg:'#1e0000',nb:'#280000',pb:'#200000',ac:'#ef4444',lbl:'REGISTRO ATIVO'},
    {bg:'#0a0a14',nb:'#10101e',pb:'#0c0c18',ac:'#6366f1',lbl:'DADOS EMPRESARIAIS'},
    {bg:'#001e14',nb:'#002818',pb:'#002014',ac:'#10b981',lbl:'EMPRESA REGISTRADA'},
    {bg:'#1e1000',nb:'#281800',pb:'#201200',ac:'#f59e0b',lbl:'CADASTRO COMERCIAL'},
    {bg:'#001418',nb:'#001e22',pb:'#001620',ac:'#0891b2',lbl:'DADOS OFICIAIS'},
    {bg:'#180014',nb:'#220018',pb:'#1c0012',ac:'#d946ef',lbl:'EMPRESA ATIVA'},
    {bg:'#141800',nb:'#1e2200',pb:'#181c00',ac:'#a3e635',lbl:'REGISTRO COMERCIAL'},
    {bg:'#001818',nb:'#002020',pb:'#001a1a',ac:'#2dd4bf',lbl:'CADASTRO ATIVO'},
    {bg:'#180018',nb:'#220022',pb:'#1c001c',ac:'#c084fc',lbl:'EMPRESA VERIFICADA'},
    {bg:'#180800',nb:'#241000',pb:'#1c0800',ac:'#fb923c',lbl:'REGISTRO OFICIAL'},
    {bg:'#000818',nb:'#001022',pb:'#00081c',ac:'#38bdf8',lbl:'DADOS EMPRESARIAIS'},
    {bg:'#081800',nb:'#102200',pb:'#0c1c00',ac:'#4ade80',lbl:'EMPRESA REGISTRADA'},
    {bg:'#180008',nb:'#22000e',pb:'#1c000a',ac:'#f472b6',lbl:'CADASTRO COMERCIAL'},
    {bg:'#080018',nb:'#0e0022',pb:'#0a001c',ac:'#818cf8',lbl:'EMPRESA ATIVA'},
  ];
  // Tipo B (25-49): Editorial — fundo claro, header escuro, tabela
  const _B = [
    {hb:'#0f2a1a',ac:'#22c55e',th:'#1a3d28',lbl:'DIÁRIO EMPRESARIAL',sub:'REGISTRO EMPRESARIAL — DADOS PÚBLICOS — COMPLIANCE'},
    {hb:'#1a2a0f',ac:'#84cc16',th:'#243d18',lbl:'CADASTRO COMERCIAL',sub:'REGISTRO OFICIAL — INFORMAÇÕES PÚBLICAS'},
    {hb:'#0f1a2a',ac:'#3b82f6',th:'#18283d',lbl:'PORTAL EMPRESARIAL',sub:'DADOS CADASTRAIS — COMPLIANCE — WABA'},
    {hb:'#2a0f1a',ac:'#ec4899',th:'#3d1828',lbl:'FICHA CADASTRAL',sub:'INFORMAÇÕES EMPRESARIAIS — REGISTRO PÚBLICO'},
    {hb:'#1a0f2a',ac:'#a855f7',th:'#28183d',lbl:'REGISTRO EMPRESARIAL',sub:'DADOS PÚBLICOS — COMPLIANCE META'},
    {hb:'#2a1a0f',ac:'#f97316',th:'#3d2818',lbl:'DADOS EMPRESARIAIS',sub:'CADASTRO OFICIAL — CONFORMIDADE LGPD'},
    {hb:'#0f2a2a',ac:'#06b6d4',th:'#183d3d',lbl:'DIÁRIO COMERCIAL',sub:'REGISTRO EMPRESARIAL — DADOS PÚBLICOS'},
    {hb:'#2a2a0f',ac:'#eab308',th:'#3d3d18',lbl:'PORTAL CADASTRAL',sub:'INFORMAÇÕES OFICIAIS — COMPLIANCE WABA'},
    {hb:'#0f0f2a',ac:'#6366f1',th:'#18183d',lbl:'FICHA EMPRESARIAL',sub:'DADOS CADASTRAIS — REGISTRO PÚBLICO'},
    {hb:'#2a0f0f',ac:'#ef4444',th:'#3d1818',lbl:'CADASTRO EMPRESARIAL',sub:'INFORMAÇÕES COMERCIAIS — LGPD'},
    {hb:'#0a2a1e',ac:'#10b981',th:'#143d2e',lbl:'DADOS OFICIAIS',sub:'REGISTRO COMERCIAL — COMPLIANCE META'},
    {hb:'#1e2a0a',ac:'#4ade80',th:'#2e3d14',lbl:'PORTAL COMERCIAL',sub:'CADASTRO PÚBLICO — INFORMAÇÕES EMPRESARIAIS'},
    {hb:'#0a1e2a',ac:'#0ea5e9',th:'#142e3d',lbl:'INFORMAÇÕES CADASTRAIS',sub:'DADOS EMPRESARIAIS — CONFORMIDADE'},
    {hb:'#2a1e0a',ac:'#f59e0b',th:'#3d2e14',lbl:'REGISTRO COMERCIAL',sub:'FICHA EMPRESARIAL — DADOS PÚBLICOS'},
    {hb:'#0a0a2a',ac:'#8b5cf6',th:'#14143d',lbl:'DADOS COMERCIAIS',sub:'CADASTRO OFICIAL — COMPLIANCE WABA'},
    {hb:'#1e0a2a',ac:'#d946ef',th:'#2e143d',lbl:'FICHA COMERCIAL',sub:'REGISTRO EMPRESARIAL — LGPD'},
    {hb:'#2a1e14',ac:'#fb923c',th:'#3d2e20',lbl:'PORTAL EMPRESARIAL',sub:'DADOS CADASTRAIS — REGISTRO OFICIAL'},
    {hb:'#142a1e',ac:'#34d399',th:'#203d2e',lbl:'CADASTRO COMERCIAL',sub:'INFORMAÇÕES PÚBLICAS — COMPLIANCE'},
    {hb:'#1e142a',ac:'#c084fc',th:'#2e203d',lbl:'REGISTRO OFICIAL',sub:'DADOS EMPRESARIAIS — WABA META'},
    {hb:'#2a140a',ac:'#fbbf24',th:'#3d2014',lbl:'DADOS CADASTRAIS',sub:'FICHA COMERCIAL — CONFORMIDADE'},
    {hb:'#0a2a14',ac:'#6ee7b7',th:'#143d20',lbl:'INFORMAÇÕES OFICIAIS',sub:'CADASTRO EMPRESARIAL — LGPD'},
    {hb:'#14142a',ac:'#7c3aed',th:'#20203d',lbl:'PORTAL CADASTRAL',sub:'DADOS PÚBLICOS — REGISTRO COMERCIAL'},
    {hb:'#2a0a14',ac:'#fb7185',th:'#3d1420',lbl:'FICHA EMPRESARIAL',sub:'INFORMAÇÕES CADASTRAIS — COMPLIANCE'},
    {hb:'#0a1e14',ac:'#059669',th:'#142e20',lbl:'DADOS EMPRESARIAIS',sub:'REGISTRO OFICIAL — CONFORMIDADE META'},
    {hb:'#0a0a1e',ac:'#4f46e5',th:'#14142e',lbl:'CADASTRO OFICIAL',sub:'PORTAL EMPRESARIAL — LGPD WABA'},
  ];
  // Tipo C (50-73): Banner colorido + conteúdo escuro
  const _C = [
    {hb:'#5b21b6',sb:'#0f0a1a',ac:'#a78bfa',cc:'#ddd6fe',lbl:'CADASTRO EMPRESARIAL'},
    {hb:'#065f46',sb:'#0a1a12',ac:'#6ee7b7',cc:'#a7f3d0',lbl:'EMPRESA REGISTRADA'},
    {hb:'#7c2d12',sb:'#1a0f0a',ac:'#fdba74',cc:'#fed7aa',lbl:'DADOS EMPRESARIAIS'},
    {hb:'#1e3a5f',sb:'#0a1020',ac:'#93c5fd',cc:'#bfdbfe',lbl:'CADASTRO ATIVO'},
    {hb:'#701a75',sb:'#150a1a',ac:'#f0abfc',cc:'#f5d0fe',lbl:'EMPRESA VERIFICADA'},
    {hb:'#3f3f46',sb:'#0f0f0f',ac:'#a1a1aa',cc:'#d4d4d8',lbl:'REGISTRO COMERCIAL'},
    {hb:'#1c4532',sb:'#0a1410',ac:'#6ee7b7',cc:'#a7f3d0',lbl:'CADASTRO OFICIAL'},
    {hb:'#78350f',sb:'#180e0a',ac:'#fcd34d',cc:'#fde68a',lbl:'DADOS CADASTRAIS'},
    {hb:'#1e3a8a',sb:'#0a0e20',ac:'#93c5fd',cc:'#bfdbfe',lbl:'PORTAL EMPRESARIAL'},
    {hb:'#4c1d95',sb:'#120a1a',ac:'#c4b5fd',cc:'#ddd6fe',lbl:'FICHA CADASTRAL'},
    {hb:'#831843',sb:'#1a0a10',ac:'#fda4af',cc:'#fecdd3',lbl:'REGISTRO OFICIAL'},
    {hb:'#14532d',sb:'#0a1510',ac:'#86efac',cc:'#bbf7d0',lbl:'EMPRESA ATIVA'},
    {hb:'#422006',sb:'#150e0a',ac:'#fdba74',cc:'#fed7aa',lbl:'DADOS OFICIAIS'},
    {hb:'#1e40af',sb:'#0a0e1a',ac:'#93c5fd',cc:'#bfdbfe',lbl:'CADASTRO EMPRESARIAL'},
    {hb:'#6b21a8',sb:'#140a1a',ac:'#d8b4fe',cc:'#e9d5ff',lbl:'INFORMAÇÕES CADASTRAIS'},
    {hb:'#9f1239',sb:'#1a0a0e',ac:'#fda4af',cc:'#fecdd3',lbl:'REGISTRO ATIVO'},
    {hb:'#064e3b',sb:'#0a1410',ac:'#6ee7b7',cc:'#a7f3d0',lbl:'EMPRESA REGISTRADA'},
    {hb:'#713f12',sb:'#180e0a',ac:'#fcd34d',cc:'#fde68a',lbl:'DADOS EMPRESARIAIS'},
    {hb:'#1d4ed8',sb:'#0a0e1a',ac:'#93c5fd',cc:'#bfdbfe',lbl:'PORTAL COMERCIAL'},
    {hb:'#581c87',sb:'#120a1a',ac:'#c4b5fd',cc:'#ddd6fe',lbl:'FICHA EMPRESARIAL'},
    {hb:'#881337',sb:'#1a0a0e',ac:'#fda4af',cc:'#fecdd3',lbl:'CADASTRO COMERCIAL'},
    {hb:'#166534',sb:'#0a1510',ac:'#86efac',cc:'#bbf7d0',lbl:'REGISTRO COMERCIAL'},
    {hb:'#92400e',sb:'#1a0e0a',ac:'#fcd34d',cc:'#fde68a',lbl:'DADOS CADASTRAIS'},
    {hb:'#1a56db',sb:'#0a0e1a',ac:'#93c5fd',cc:'#bfdbfe',lbl:'INFORMAÇÕES OFICIAIS'},
  ];

  // ═══════════════════════════════════════════════════════════════
  // BLOCOS HTML REUTILIZÁVEIS
  // ═══════════════════════════════════════════════════════════════

  // Grid de dados comum (usado por A e C)
  function dataGrid(ac) {
    return '<div class="frow"><div class="dk">Razão Social</div><div class="dv big">'+razaoFmt+'</div></div>'+
      '<div class="frow"><div class="dk">CNPJ</div><div class="dv mono">'+cnpjFmt+'</div></div>'+
      '<div class="frow"><div class="dk">Situação</div><div class="dv ok">'+situacaoFmt+'</div></div>'+
      (atividadeFmt?'<div class="frow"><div class="dk">Atividade Principal</div><div class="dv">'+atividadeFmt+'</div></div>':'')+
      '<div class="frow"><div class="dk">Endereço</div><div class="dv">'+enderFmt+'</div></div>'+
      '<div class="g3"><div class="gc"><div class="gk">Bairro/Distrito</div><div class="gv">'+bairroFmt+'</div></div>'+
      '<div class="gc"><div class="gk">Cidade</div><div class="gv">'+munFmt+'</div></div>'+
      '<div class="gc"><div class="gk">Estado</div><div class="gv">'+ufFmt+'</div></div></div>'+
      '<div class="g3"><div class="gc"><div class="gk">CEP</div><div class="gv m">'+cepFmt+'</div></div>'+
      '<div class="gc"><div class="gk">Telefone</div><div class="gv m">'+phoneFmt+'</div></div>'+
      '<div class="gc"><div class="gk">E-mail</div><div class="gv">'+emailFmt+'</div></div></div>';
  }

  // Sidebar comum (A e C)
  function sidebar(ac, hb) {
    const bgCard = hb || 'rgba(255,255,255,.05)';
    return (phoneFmt?'<div class="scard"><div class="st">Canal de Atendimento</div><div class="ph">'+phoneFmt+'</div><p class="sp">Atendimento receptivo para suporte ao cliente e esclarecimentos ao cliente.</p></div>':'')+
      '<div class="scard"><div class="st">Identificação Fiscal</div>'+
      '<div class="si"><div class="sil">Razão Social</div><div class="siv">'+razaoFmt+'</div></div>'+
      '<div class="si"><div class="sil">CNPJ</div><div class="siv" style="font-family:monospace;color:'+ac+'">'+cnpjFmt+'</div></div>'+
      '<div class="si"><div class="sil">Cidade/Estado</div><div class="siv">'+munFmt+'/'+ufFmt+'</div></div>'+
      '<div class="si"><div class="sil">CEP</div><div class="siv" style="font-family:monospace;color:'+ac+'">'+cepFmt+'</div></div>'+
      '</div>'+
      '<div class="scard"><div class="st">Compliance WABA</div>'+
      '<span class="stag">RECEPTIVO</span><span class="stag">UTILITY</span><span class="stag">LGPD</span><span class="stag">META</span>'+
      '<p class="sp" style="margin-top:8px">Sem disparos. Atendimento exclusivamente receptivo. Conformidade Meta Platforms.</p></div>';
  }

  // Seções de texto comuns (sobre, atendimento, privacidade, termos)
  function textSections(acColor) {
    return '<div class="sec" id="sobre"><h2>Sobre a Empresa</h2><p>'+sob+'</p></div>'+
      '<div class="sec" id="atendimento"><h2>Canal de Atendimento</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div>'+
      '<div class="sec" id="privacidade"><h2>Política de Privacidade</h2><p>'+priv+'</p></div>'+
      '<div class="sec" id="termos"><h2>Termos de Uso</h2><p>'+term+'</p></div>';
  }

  // ═══════════════════════════════════════════════════════════════
  // TIPO A: Dark nav + hero + grid + sidebar
  // ═══════════════════════════════════════════════════════════════
  if (templateIndex < 25) {
    const p = _A[templateIndex];
    const css = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;background:'+p.bg+';color:#e2e8f0;min-height:100vh}'+
      'nav{background:'+p.nb+';border-bottom:2px solid '+p.ac+';padding:0 24px;display:flex;align-items:center;justify-content:space-between;min-height:50px;flex-wrap:wrap;gap:6px}'+
      '.nlogo{font-size:13px;font-weight:900;color:#fff;max-width:440px;line-height:1.25;padding:6px 0}'+
      '.ninfo{display:flex;flex-direction:column;align-items:flex-end;gap:2px}.ncnpj{font-family:monospace;font-size:11px;color:'+p.ac+';font-weight:700}.nphone{font-family:monospace;font-size:12px;color:#fff;font-weight:900}'+
      '@media(max-width:640px){.ninfo{display:none}}'+
      '.nav2{background:rgba(0,0,0,.2);border-bottom:1px solid rgba(255,255,255,.06);padding:0 24px;display:flex;align-items:center;justify-content:space-between;min-height:36px}'+
      '.n2l{color:rgba(255,255,255,.8);font-size:10px;font-weight:700;letter-spacing:1px}'+
      '.n2r{display:flex;gap:16px}.n2r a{color:rgba(255,255,255,.45);text-decoration:none;font-size:10px}@media(max-width:640px){.n2r{display:none}}'+
      '.hero{background:'+p.nb+';padding:38px 24px;text-align:center;border-bottom:3px solid '+p.ac+'}'+
      '.badge{display:inline-block;background:'+p.ac+'22;border:1px solid '+p.ac+'55;border-radius:20px;padding:3px 14px;font-size:9px;font-weight:700;letter-spacing:1.8px;color:'+p.ac+';margin-bottom:10px}'+
      '.hero h1{font-size:2rem;font-weight:900;color:#fff;line-height:1.2;margin-bottom:6px}'+
      '.hmeta{font-family:monospace;font-size:13px;color:rgba(255,255,255,.65);margin-top:4px}'+
      '.hstatus{display:inline-block;background:rgba(74,222,128,.12);border:1px solid rgba(74,222,128,.3);color:#4ade80;border-radius:3px;padding:2px 10px;font-size:10px;font-weight:700;margin-top:7px}'+
      '.wrap{max-width:920px;margin:0 auto;padding:20px;display:grid;grid-template-columns:1fr 290px;gap:20px}@media(max-width:760px){.wrap{grid-template-columns:1fr}}'+
      '.panel{background:'+p.pb+';border:1px solid rgba(255,255,255,.07);border-radius:4px;overflow:hidden;margin-bottom:16px}'+
      '.ptitle{background:rgba(255,255,255,.04);padding:10px 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:'+p.ac+';border-bottom:1px solid rgba(255,255,255,.05)}'+
      '.frow{display:flex;border-bottom:1px solid rgba(255,255,255,.04);flex-wrap:wrap}.frow:last-child{border-bottom:none}'+
      '.dk{background:rgba(255,255,255,.03);padding:10px 14px;font-size:12px;font-weight:700;text-transform:uppercase;color:rgba(255,255,255,.5);letter-spacing:.5px;min-width:150px;flex-shrink:0;border-right:1px solid rgba(255,255,255,.04);display:flex;align-items:center}'+
      '.dv{padding:9px 13px;font-size:14px;color:#f1f5f9;font-weight:600;flex:1;word-break:break-word}.dv.big{font-size:1.35rem;font-weight:900;color:#fff}.dv.mono{font-family:monospace;color:'+p.ac+';font-weight:700}.dv.ok{color:#4ade80;font-weight:700}'+
      '.g3{display:grid;grid-template-columns:1fr 1fr 1fr;border-bottom:1px solid rgba(255,255,255,.04)}@media(max-width:480px){.g3{grid-template-columns:1fr}}'+
      '.gc{padding:9px 13px;border-right:1px solid rgba(255,255,255,.04)}.gc:last-child{border-right:none}'+
      '.gk{font-size:11px;font-weight:700;text-transform:uppercase;color:rgba(255,255,255,.45);letter-spacing:.5px;margin-bottom:4px}.gv{font-size:14px;color:#e2e8f0;font-weight:600}.gv.m{font-family:monospace;color:'+p.ac+'}'+
      '.sec{padding:20px 0;border-bottom:1px solid rgba(255,255,255,.05)}.sec:last-child{border-bottom:none}'+
      '.sec h2{font-size:14px;font-weight:700;color:'+p.ac+';margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid '+p.ac+'25}'+
      '.sec p{font-size:11px;color:rgba(255,255,255,.58);line-height:1.9;margin-bottom:6px}.sec ul{list-style:none}.sec li{font-size:13px;color:rgba(255,255,255,.65);line-height:1.9;padding-left:14px;position:relative}.sec li::before{content:"▸";position:absolute;left:0;color:'+p.ac+'}'+
      '.scard{background:'+p.pb+';border:1px solid rgba(255,255,255,.07);border-radius:4px;padding:14px;margin-bottom:14px}'+
      '.st{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:'+p.ac+';margin-bottom:9px}'+
      '.ph{font-family:monospace;font-size:1.15rem;color:#fff;font-weight:900;text-align:center;padding:10px;background:'+p.ac+'18;border-radius:3px;margin-bottom:9px;letter-spacing:2px}'+
      '.sp{font-size:13px;color:rgba(255,255,255,.6);line-height:1.8}.stag{font-size:11px;display:inline-block;background:rgba(255,255,255,.06);color:'+p.ac+';font-size:8px;font-weight:700;padding:2px 7px;border-radius:2px;margin:2px}'+
      '.si{padding:7px 0;border-bottom:1px solid rgba(255,255,255,.05)}.si:last-child{border-bottom:none}.sil{font-size:11px;text-transform:uppercase;color:rgba(255,255,255,.45);margin-bottom:3px;letter-spacing:.5px}.siv{font-size:15px;color:#e2e8f0;font-weight:700}'+
      '.fbar{background:'+p.nb+';border-top:1px solid rgba(255,255,255,.06);color:rgba(255,255,255,.45);text-align:center;padding:16px 22px;font-size:10px;line-height:1.9}.fbar a{color:rgba(255,255,255,.3);text-decoration:none}.fbar strong{color:rgba(255,255,255,.75)}';

    return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">'+metaTag+ogTags+'<title>'+razaoFmt+'</title><style>'+css+'</style></head><body>'+
      '<nav><div class="nlogo">'+razaoFmt+'</div><div class="ninfo"><span class="ncnpj">'+cnpjFmt+'</span>'+(phoneFmt?'<span class="nphone">'+phoneFmt+'</span>':'')+'</div></nav>'+
      '<div class="nav2"><span class="n2l">'+p.lbl+'</span><div class="n2r"><a href="#dados">Dados</a><a href="#sobre">Sobre</a><a href="#atendimento">Atendimento</a><a href="#privacidade">Privacidade</a><a href="#termos">Termos</a></div></div>'+
      '<div class="hero"><div class="badge">EMPRESA REGISTRADA</div><h1>'+razaoFmt+'</h1><div class="hmeta">CNPJ: '+cnpjFmt+'</div><div class="hstatus">SITUAÇÃO: '+situacaoFmt+'</div></div>'+
      '<div class="wrap"><div id="dados"><div class="panel"><div class="ptitle">Dados Cadastrais Oficiais</div>'+dataGrid(p.ac)+'</div>'+textSections(p.ac)+'</div>'+
      '<div>'+sidebar(p.ac, p.pb)+'</div></div>'+
      '<div class="fbar" id="contato"><strong>'+razaoFmt+'</strong> ??? CNPJ '+cnpjFmt+(phoneFmt?' | '+phoneFmt:'')+(emailFmt?' | '+emailFmt:'')+'<br>'+enderFmt+(bairroFmt?' ??? '+bairroFmt:'')+' ??? '+munFmt+'/'+ufFmt+(cepFmt?' ??? CEP '+cepFmt:'')+'<br><a href="#privacidade">Privacidade</a> ?? <a href="#termos">Termos</a> ?? <a href="#dados">Dados Cadastrais</a></div>'+
      '</body></html>';
  }

  // ═══════════════════════════════════════════════════════════════
  // TIPO B: Editorial — header escuro, fundo claro, tabela + sidebar
  // ═══════════════════════════════════════════════════════════════
  else if (templateIndex < 50) {
    const p = _B[templateIndex - 25];
    const css = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:Georgia,"Times New Roman",serif;background:#f0f0f0;color:#1a1a1a;min-height:100vh}'+
      'header{background:'+p.hb+';padding:10px 24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px}'+
      '.hlbl{font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:'+p.ac+';font-family:Arial,sans-serif;margin-bottom:2px}'+
      '.hname{font-family:Arial,sans-serif;font-size:14px;font-weight:900;color:#fff;line-height:1.2}'+
      '.hright{display:flex;flex-direction:column;align-items:flex-end;gap:3px}'+
      '.hcnpj{font-family:monospace;font-size:10px;font-weight:700;color:'+p.ac+'}'+
      '.hphone{font-family:monospace;font-size:13px;font-weight:900;color:#fff}'+
      '@media(max-width:640px){.hright{display:none}}'+
      'nav{background:#fff;border-bottom:2px solid #e5e7eb;padding:0 24px;display:flex;align-items:center;justify-content:space-between;min-height:38px}'+
      '.nname{font-family:Arial,sans-serif;font-size:11px;font-weight:700;color:#374151}'+
      '.nlinks{display:flex;gap:16px}.nlinks a{color:#6b7280;text-decoration:none;font-size:11px;font-family:Arial,sans-serif}@media(max-width:640px){.nlinks{display:none}}'+
      '.hero{background:#fff;padding:30px 24px;text-align:center;border-bottom:4px double #d1d5db}'+
      '.hed{font-size:9px;font-weight:400;letter-spacing:3px;text-transform:uppercase;color:#9ca3af;margin-bottom:10px;font-family:Arial,sans-serif}'+
      '.hname2{font-family:Arial,sans-serif;font-size:2rem;font-weight:900;color:#111827;letter-spacing:-0.5px;line-height:1.1;margin-bottom:8px}'+
      '.hsub{font-size:9px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#9ca3af;font-family:Arial,sans-serif}'+
      '.wrap{max-width:920px;margin:0 auto;padding:20px;display:grid;grid-template-columns:1fr 280px;gap:20px}@media(max-width:760px){.wrap{grid-template-columns:1fr}}'+
      '.intro{background:#fff;border-left:4px solid '+p.ac+';padding:16px 20px;margin-bottom:16px}'+
      '.intro h3{font-family:Arial,sans-serif;font-size:17px;font-weight:700;color:#111827;margin-bottom:8px}.intro p{font-size:14px;color:#4b5563;line-height:1.9;font-family:Arial,sans-serif}'+
      'table{width:100%;border-collapse:collapse;background:#fff;margin-bottom:16px;font-size:14px;font-family:Arial,sans-serif}'+
      'thead tr{background:'+p.th+';color:#fff}th{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;padding:10px 14px;text-align:left}'+
      'tbody tr{border-bottom:1px solid #e5e7eb}tbody tr:last-child{border-bottom:none}'+
      'td.lbl{background:#f9fafb;padding:11px 14px;font-size:13px;font-weight:700;text-transform:uppercase;color:#6b7280;letter-spacing:.5px;width:150px}'+
      'td.val{padding:11px 14px;color:#111827;font-weight:600;font-size:14px}td.val.ac{font-size:15px;color:'+p.ac+';font-family:monospace;font-weight:700}td.val.ok{color:#059669;font-weight:700}td.val.rs{font-size:18px;font-weight:900;color:#111827}'+
      '.sec2{background:#fff;padding:16px 20px;margin-bottom:14px;border-top:2px solid '+p.ac+';font-family:Arial,sans-serif}'+
      '.sec2 h2{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:'+p.ac+';margin-bottom:10px}'+
      '.sec2 p{font-size:14px;color:#4b5563;line-height:1.9;margin-bottom:8px}.sec2 ul{list-style:none}.sec2 li{font-size:14px;color:#4b5563;line-height:1.9;padding-left:14px;position:relative}.sec2 li::before{content:"→";position:absolute;left:0;color:'+p.ac+'}'+
      '.scard2{background:#fff;border:1px solid #e5e7eb;border-top:3px solid '+p.ac+';padding:14px;margin-bottom:14px;font-family:Arial,sans-serif}'+
      '.st2{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:'+p.ac+';margin-bottom:9px}'+
      '.ph2{font-family:monospace;font-size:1.1rem;font-weight:900;color:#111827;text-align:center;padding:10px;background:'+p.ac+'18;border-radius:2px;margin-bottom:9px;letter-spacing:2px}'+
      '.sp2{font-size:13px;color:#6b7280;line-height:1.8}.stag2{font-size:11px;display:inline-block;background:'+p.ac+'18;color:'+p.ac+';font-size:8px;font-weight:700;padding:2px 7px;border-radius:2px;margin:2px}'+
      '.si2{padding:7px 0;border-bottom:1px solid #f3f4f6}.si2:last-child{border-bottom:none}.sil2{font-size:11px;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;letter-spacing:.5px}.siv2{font-size:15px;color:#374151;font-weight:700}'+
      'footer{background:'+p.hb+';color:rgba(255,255,255,.55);text-align:center;padding:14px 22px;font-size:10px;line-height:1.9;font-family:Arial,sans-serif}footer a{color:rgba(255,255,255,.35);text-decoration:none}footer strong{color:rgba(255,255,255,.8)}';

    return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">'+metaTag+ogTags+'<title>'+razaoFmt+'</title><style>'+css+'</style></head><body>'+
      '<header><div><div class="hlbl">'+p.lbl+'</div><div class="hname">'+razaoFmt+'</div></div>'+
      '<div class="hright"><span class="hcnpj">'+cnpjFmt+'</span>'+(phoneFmt?'<span class="hphone">'+phoneFmt+'</span>':'')+'</div></header>'+
      '<nav><span class="nname">'+razaoFmt+'</span><div class="nlinks"><a href="#dados">Dados</a><a href="#sobre">Sobre</a><a href="#atendimento">Atendimento</a><a href="#privacidade">Privacidade</a></div></nav>'+
      '<div class="hero"><div class="hed">'+p.lbl+' — EDIÇÃO ESPECIAL</div><div class="hname2">'+razaoFmt+'</div><div class="hsub">'+p.sub+'</div></div>'+
      '<div class="wrap"><div id="dados">'+
      '<div class="intro"><h3>Empresa '+razaoFmt+'<br>Registrada e em Operação Regular</h3>'+
      '<p>'+razaoFmt+', inscrita no CNPJ sob o número '+cnpjFmt+', encontra-se em situação ativa junto aos órgãos competentes. Mantém canal oficial de comunicação via WhatsApp Business para atendimento de clientes em esclarecimentos, e suporte ao cliente, em conformidade com as políticas da Meta Platforms.</p></div>'+
      '<table><thead><tr><th>Campo</th><th>Informação</th></tr></thead><tbody>'+
      '<tr><td class="lbl">Razão Social</td><td class="val rs">'+razaoFmt+'</td></tr>'+
      '<tr><td class="lbl">CNPJ</td><td class="val ac">'+cnpjFmt+'</td></tr>'+
      '<tr><td class="lbl">Situação</td><td class="val ok">'+situacaoFmt+'</td></tr>'+
      (atividadeFmt?'<tr><td class="lbl">CNAE</td><td class="val">'+atividadeFmt+'</td></tr>':'')+
      '<tr><td class="lbl">Endereço</td><td class="val">'+enderFmt+(bairroFmt?' — '+bairroFmt:'')+' — '+munFmt+'/'+ufFmt+' — CEP '+cepFmt+'</td></tr>'+
      (emailFmt?'<tr><td class="lbl">E-mail</td><td class="val">'+emailFmt+'</td></tr>':'')+
      '</tbody></table>'+
      '<div class="sec2" id="sobre"><h2>Sobre a Empresa</h2><p>'+sob+'</p></div>'+
      '<div class="sec2" id="atendimento"><h2>Canal de Atendimento</h2><ul>'+atn.map(function(l){return '<li>'+l+'</li>';}).join('')+'</ul></div>'+
      '<div class="sec2" id="privacidade"><h2>Política de Privacidade</h2><p>'+priv+'</p></div>'+
      '<div class="sec2" id="termos"><h2>Termos de Uso</h2><p>'+term+'</p></div>'+
      '</div><div>'+
      (phoneFmt?'<div class="scard2"><div class="st2">Canal Oficial</div><div class="ph2">'+phoneFmt+'</div><p class="sp2">Atendimento receptivo via WhatsApp Business. Canal Utility verificado.</p></div>':'')+
      '<div class="scard2"><div class="st2">Compliance WABA</div><p class="sp2">Canal destinado ao atendimento de clientes para acordos, esclarecimentos e suporte ao cliente. Sem disparos. LGPD.</p></div>'+
      '<div class="scard2"><div class="st2">Identificação</div>'+
      '<div class="si2"><div class="sil2">Razão Social</div><div class="siv2">'+razaoFmt+'</div></div>'+
      '<div class="si2"><div class="sil2">CNPJ</div><div class="siv2" style="font-family:monospace;color:'+p.ac+'">'+cnpjFmt+'</div></div>'+
      '<div class="si2"><div class="sil2">Cidade/Estado</div><div class="siv2">'+munFmt+'/'+ufFmt+'</div></div>'+
      '<div class="si2"><div class="sil2">CEP</div><div class="siv2" style="font-family:monospace;color:'+p.ac+'">'+cepFmt+'</div></div>'+
      '</div></div></div>'+
      '<footer id="contato"><strong>'+razaoFmt+'</strong> ??? CNPJ '+cnpjFmt+(phoneFmt?' | '+phoneFmt:'')+(emailFmt?' | '+emailFmt:'')+'<br>'+enderFmt+(bairroFmt?' ??? '+bairroFmt:'')+' ??? '+munFmt+'/'+ufFmt+(cepFmt?' ??? CEP '+cepFmt:'')+'<br><a href="#privacidade">Privacidade</a> ?? <a href="#termos">Termos</a></footer>'+
      '</body></html>';
  }

  // ═══════════════════════════════════════════════════════════════
  // TIPO C: Banner colorido bold + grid escuro + sidebar
  // ═══════════════════════════════════════════════════════════════
  else {
    const p = _C[templateIndex - 50];
    const css = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;background:'+p.sb+';color:#e2e8f0;min-height:100vh}'+
      'header{background:'+p.hb+';padding:10px 24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px}'+
      '.hlbl{font-size:8px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:'+p.cc+';margin-bottom:2px}'+
      '.hname{font-size:13px;font-weight:900;color:#fff;line-height:1.2}'+
      '.hright{text-align:right}'+
      '.hcnpj{font-family:monospace;font-size:10px;font-weight:700;background:rgba(255,255,255,.12);color:#fff;padding:2px 8px;border-radius:2px;display:inline-block;margin-bottom:3px}'+
      '.hphone{font-family:monospace;font-size:12px;font-weight:900;color:#fff;display:block}'+
      '@media(max-width:640px){.hright{display:none}}'+
      'nav{background:'+p.sb+';border-bottom:1px solid rgba(255,255,255,.07);padding:0 24px;min-height:40px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px}'+
      '.nname2{font-size:11px;font-weight:700;color:#fff}'+
      '.nlinks2{display:flex;gap:16px}.nlinks2 a{color:rgba(255,255,255,.45);text-decoration:none;font-size:10px}@media(max-width:640px){.nlinks2{display:none}}'+
      '.ncnpj2{font-family:monospace;font-size:10px;color:'+p.ac+';font-weight:700}'+
      '.banner{background:'+p.hb+';padding:36px 24px 28px}'+
      '.blbl{font-size:8px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:'+p.cc+';margin-bottom:4px}'+
      '.btitle{font-size:8px;color:rgba(255,255,255,.5);margin-bottom:8px;letter-spacing:1px}'+
      '.bname{font-size:2rem;font-weight:900;color:#fff;line-height:1.1;margin-bottom:8px}'+
      '.bcnpj{font-family:monospace;font-size:13px;color:'+p.cc+';font-weight:700;margin-bottom:6px}'+
      '.bstatus{display:inline-block;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.3);color:#fff;border-radius:3px;padding:2px 10px;font-size:9px;font-weight:700}'+
      '.wrap{max-width:920px;margin:0 auto;padding:20px;display:grid;grid-template-columns:1fr 290px;gap:20px}@media(max-width:760px){.wrap{grid-template-columns:1fr}}'+
      '.panel{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:4px;overflow:hidden;margin-bottom:16px}'+
      '.ptitle{background:'+p.hb+';padding:8px 14px;font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:'+p.cc+'}'+
      '.frow{display:flex;border-bottom:1px solid rgba(255,255,255,.06);flex-wrap:wrap}.frow:last-child{border-bottom:none}'+
      '.dk{background:rgba(255,255,255,.04);padding:10px 14px;font-size:12px;font-weight:700;text-transform:uppercase;color:rgba(255,255,255,.5);letter-spacing:.5px;min-width:150px;flex-shrink:0;border-right:1px solid rgba(255,255,255,.06);display:flex;align-items:center}'+
      '.dv{padding:9px 13px;font-size:14px;color:#f1f5f9;font-weight:600;flex:1;word-break:break-word}.dv.big{font-size:1.35rem;font-weight:900;color:#fff}.dv.mono{font-family:monospace;color:'+p.ac+';font-weight:700}.dv.ok{color:#4ade80;font-weight:700}'+
      '.g3{display:grid;grid-template-columns:1fr 1fr 1fr;border-bottom:1px solid rgba(255,255,255,.06)}@media(max-width:480px){.g3{grid-template-columns:1fr}}'+
      '.gc{padding:9px 13px;border-right:1px solid rgba(255,255,255,.06)}.gc:last-child{border-right:none}'+
      '.gk{font-size:11px;font-weight:700;text-transform:uppercase;color:rgba(255,255,255,.45);letter-spacing:.5px;margin-bottom:4px}.gv{font-size:14px;color:#e2e8f0;font-weight:600}.gv.m{font-family:monospace;color:'+p.ac+'}'+
      '.sec{padding:20px 0;border-bottom:1px solid rgba(255,255,255,.06)}.sec:last-child{border-bottom:none}'+
      '.sec h2{font-size:14px;font-weight:700;color:'+p.ac+';margin-bottom:8px;padding-bottom:5px;border-bottom:1px solid '+p.ac+'30}'+
      '.sec p{font-size:13px;color:rgba(255,255,255,.65);line-height:1.9;margin-bottom:8px}.sec ul{list-style:none}.sec li{font-size:13px;color:rgba(255,255,255,.65);line-height:1.9;padding-left:14px;position:relative}.sec li::before{content:"▸";position:absolute;left:0;color:'+p.ac+'}'+
      '.scard{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:4px;padding:14px;margin-bottom:14px}'+
      '.st{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:'+p.ac+';margin-bottom:9px}'+
      '.ph{font-family:monospace;font-size:1.1rem;font-weight:900;color:#fff;text-align:center;padding:10px;background:'+p.hb+';border-radius:3px;margin-bottom:9px;letter-spacing:2px;border:1px solid '+p.ac+'40}'+
      '.sp{font-size:13px;color:rgba(255,255,255,.6);line-height:1.8}.stag{font-size:11px;display:inline-block;background:'+p.hb+';color:'+p.cc+';font-size:8px;font-weight:700;padding:2px 7px;border-radius:2px;margin:2px}'+
      '.si{padding:7px 0;border-bottom:1px solid rgba(255,255,255,.06)}.si:last-child{border-bottom:none}.sil{font-size:11px;text-transform:uppercase;color:rgba(255,255,255,.45);margin-bottom:3px;letter-spacing:.5px}.siv{font-size:15px;color:#e2e8f0;font-weight:700}'+
      'footer{background:'+p.hb+';border-top:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.5);text-align:center;padding:14px 22px;font-size:10px;line-height:1.9}footer a{color:rgba(255,255,255,.3);text-decoration:none}footer strong{color:rgba(255,255,255,.8)}';

    return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">'+metaTag+ogTags+'<title>'+razaoFmt+'</title><style>'+css+'</style></head><body>'+
      '<header><div><div class="hlbl">'+p.lbl+'</div><div class="hname">'+razaoFmt+'</div></div>'+
      '<div class="hright"><span class="hcnpj">'+cnpjFmt+'</span>'+(phoneFmt?'<span class="hphone">'+phoneFmt+'</span>':'')+'</div></header>'+
      '<nav><span class="nname2">'+razaoFmt+'</span><div class="nlinks2"><a href="#dados">Dados</a><a href="#sobre">Sobre</a><a href="#atendimento">Atendimento</a><a href="#privacidade">Privacidade</a></div><span class="ncnpj2">'+cnpjFmt+'</span></nav>'+
      '<div class="banner"><div class="blbl">RAZÃO SOCIAL DA EMPRESA</div><div class="btitle">CNPJ: '+cnpjFmt+'</div><div class="bname">'+razaoFmt+'</div><div class="bcnpj">CNPJ: '+cnpjFmt+'</div><div class="bstatus">SITUAÇÃO: '+situacaoFmt+'</div></div>'+
      '<div class="wrap"><div id="dados"><div class="panel"><div class="ptitle">Dados Cadastrais</div>'+dataGrid(p.ac)+'</div>'+textSections(p.ac)+'</div>'+
      '<div>'+
      (phoneFmt?'<div class="scard"><div class="st">Canal de Atendimento</div><div class="ph">'+phoneFmt+'</div><p class="sp">Atendimento receptivo para suporte ao cliente e esclarecimentos ao cliente.</p></div>':'')+
      '<div class="scard"><div class="st">Identificação</div>'+
      '<div class="si"><div class="sil">Razão Social</div><div class="siv">'+razaoFmt+'</div></div>'+
      '<div class="si"><div class="sil">CNPJ</div><div class="siv" style="font-family:monospace;color:'+p.ac+'">'+cnpjFmt+'</div></div>'+
      '<div class="si"><div class="sil">Cidade/Estado</div><div class="siv">'+munFmt+'/'+ufFmt+'</div></div>'+
      '<div class="si"><div class="sil">CEP</div><div class="siv" style="font-family:monospace;color:'+p.ac+'">'+cepFmt+'</div></div>'+
      '</div>'+
      '<div class="scard"><div class="st">Compliance WABA</div><span class="stag">RECEPTIVO</span><span class="stag">UTILITY</span><span class="stag">LGPD</span><span class="stag">META</span><p class="sp" style="margin-top:8px">Sem disparos. Conformidade Meta Platforms.</p></div>'+
      '</div></div>'+
      '<footer id="contato"><strong>'+razaoFmt+'</strong> ??? CNPJ '+cnpjFmt+(phoneFmt?' | '+phoneFmt:'')+(emailFmt?' | '+emailFmt:'')+'<br>'+enderFmt+(bairroFmt?' ??? '+bairroFmt:'')+' ??? '+munFmt+'/'+ufFmt+(cepFmt?' ??? CEP '+cepFmt:'')+'<br><a href="#privacidade">Privacidade</a> ?? <a href="#termos">Termos</a> ?? <a href="#dados">Dados Cadastrais</a></footer>'+
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

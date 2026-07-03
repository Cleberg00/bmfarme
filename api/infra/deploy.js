const prisma = require('../_lib/prisma');
const { verifyAuth, setCors } = require('../_lib/auth');
const { buildLandingHtml, createZone, addDnsTxtRecord, getZoneNameservers, deployWorker } = require('../_services/cloudflare');
const { deployNetlifySite, provisionSsl } = require('../_services/netlify');
const porkbun = require('../_services/porkbun');
const dynadot = require('../_services/dynadot');

// Formata telefone pra exibição (41) 96347-5267
function formatPhoneForReplace(phone) {
  let n = String(phone || '').replace(/\D/g, '');
  if (n.startsWith('55') && n.length >= 12) n = n.slice(2);
  if (n.length === 10) return `(${n.slice(0,2)}) ${n.slice(2,6)}-${n.slice(6)}`;
  if (n.length === 11) return `(${n.slice(0,2)}) ${n.slice(2,7)}-${n.slice(7)}`;
  return phone;
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── GET ?action=get_site — Worker wildcard busca HTML (sem auth JWT) ────
  if (req.method === 'GET' && req.query?.action === 'get_site') {
    try {
      const workerKey = req.headers['x-worker-key'];
      if (workerKey !== 'bmfarme-worker-2026')
        return res.status(401).json({ error: 'Unauthorized' });

      const { subdomain } = req.query;
      if (!subdomain) return res.status(400).json({ error: 'subdomain é obrigatório.' });

      const domain = await prisma.domain.findFirst({ where: { domainName: subdomain, status: 'ACTIVE' } });
      if (!domain) return res.status(404).send('<html><body><h1>Site não encontrado</h1></body></html>');

      const client = await prisma.client.findUnique({ where: { id: domain.clientId } });
      if (!client) return res.status(404).send('<html><body><h1>Cliente não encontrado</h1></body></html>');

      const smsLog = await prisma.smsLog.findFirst({
        where: { clientId: client.id, status: { in: ['WAITING', 'RECEIVED'] } },
        orderBy: { createdAt: 'desc' },
      });

      const cnpjDigits = String(client.cnpj || '').replace(/\D/g, '');
      const updatedSeed = domain.updatedAt ? new Date(domain.updatedAt).getTime() : Date.now();
      const nameSeed = domain.domainName.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      const fixedIndex = (cnpjDigits.split('').reduce((a, c) => a + parseInt(c, 10), 0) + nameSeed + (updatedSeed % 10000)) % 74;

      const html = buildLandingHtml({
        razaoSocial: domain.customRazao || client.razaoSocial,
        nomeFantasia: domain.customRazao || client.nomeFantasia,
        cnpj: client.cnpj, endereco: client.endereco, numero: client.numero,
        bairro: client.bairro, cep: client.cep,
        municipio: client.municipio, uf: client.uf, situacao: client.situacao,
        atividadePrincipal: client.atividadePrincipal, telefone: client.telefone,
        email: client.email, smsPhone: smsLog?.phoneNumber || null, smsCode: smsLog?.smsCode || null,
        metaVerificationCode: domain.metaVerificationCode, verificationMethod: 'meta_tag',
        forceTemplateIndex: fixedIndex,
      });

      res.setHeader('Content-Type', 'text/html; charset=UTF-8');
      return res.status(200).send(html);
    } catch (error) {
      return res.status(500).send('<html><body><h1>Erro interno</h1></body></html>');
    }
  }

  const user = verifyAuth(req, res);
  if (!user) return;

  // ── PATCH — republicar site existente com novo número ──────────────────
  if (req.method === 'PATCH') {
    try {
      const { domainId, newPhone, customRazao } = req.body;
      if (!domainId || (!newPhone && !customRazao))
        return res.status(400).json({ error: 'domainId e ao menos newPhone ou customRazao são obrigatórios.' });

      const domain = await prisma.domain.findUnique({ where: { id: domainId } });
      if (!domain) return res.status(404).json({ error: 'Domínio não encontrado.' });

      const client = await prisma.client.findUnique({ where: { id: domain.clientId } });
      if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' });

      // Regenera HTML com novo número E novo template (atualiza updatedAt pra mudar seed)
      const existingWorker = domain.cloudflareZoneId || '';
      const isWildcard = existingWorker === 'verificaconta-wildcard';

      // Força updatedAt novo pra gerar template diferente
      const newUpdatedAt = new Date();
      const newIndex = Math.floor(Math.random() * 74);
      await prisma.domain.update({
        where: { id: domain.id },
        data: {
          updatedAt: newUpdatedAt,
          ...(customRazao ? { customRazao: customRazao.trim() } : {}),
        }
      });

      const cnpjDigits = String(client.cnpj || '').replace(/\D/g, '');
      const nameSeed = domain.domainName.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      const updatedSeed = newUpdatedAt.getTime();
      const newIndex = (cnpjDigits.split('').reduce((a, c) => a + parseInt(c, 10), 0) + nameSeed + (updatedSeed % 10000)) % 74;

      const html = buildLandingHtml({
        razaoSocial: customRazao || client.razaoSocial, nomeFantasia: customRazao ? undefined : client.nomeFantasia,
        cnpj: client.cnpj, endereco: client.endereco, numero: client.numero,
        bairro: client.bairro, cep: client.cep,
        municipio: client.municipio, uf: client.uf, situacao: client.situacao,
        atividadePrincipal: client.atividadePrincipal, telefone: client.telefone,
        email: client.email, smsPhone: newPhone || client.telefone, smsCode: null,
        metaVerificationCode: domain.metaVerificationCode, verificationMethod: 'meta_tag',
        forceTemplateIndex: newIndex,
        customRazao: customRazao || undefined,
      });

      // Republica no provider correto (Workers se nome termina com -empresasverrificada)
      const isWorker = existingWorker.endsWith('-empresasverrificada') || existingWorker.endsWith('-zaplifydisparo');
      let resultUrl;
      if (isWildcard) {
        resultUrl = `https://${domain.domainName}`;
      } else if (isWorker) {
        const result = await deployWorker(existingWorker.replace('-empresasverrificada','').replace('-zaplifydisparo',''), html, domain.metaVerificationCode, 'meta_tag');
        resultUrl = result.url;
      } else {
        const result = await deployNetlifySite(existingWorker, html, domain.domainName);
        resultUrl = result.url;
      }

      return res.status(200).json({ success: true, workerUrl: resultUrl, newPhone });
    } catch (error) {
      return res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  // ── PUT — trocar layout do site (regenerar com template diferente) ────────
  if (req.method === 'PUT') {
    try {
      const { domainId } = req.body;
      if (!domainId)
        return res.status(400).json({ error: 'domainId é obrigatório.' });

      const domain = await prisma.domain.findUnique({ where: { id: domainId } });
      if (!domain) return res.status(404).json({ error: 'Domínio não encontrado.' });

      const client = await prisma.client.findUnique({ where: { id: domain.clientId } });
      if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' });

      // Busca o SMS mais recente desse cliente
      const smsLog = await prisma.smsLog.findFirst({
        where: { clientId: client.id, status: { in: ['WAITING', 'RECEIVED'] } },
        orderBy: { createdAt: 'desc' },
      });

      const siteParams = {
        razaoSocial: domain.customRazao || client.razaoSocial,
        nomeFantasia: domain.customRazao || client.nomeFantasia,
        cnpj: client.cnpj, endereco: client.endereco, numero: client.numero,
        bairro: client.bairro, cep: client.cep,
        municipio: client.municipio, uf: client.uf, situacao: client.situacao,
        atividadePrincipal: client.atividadePrincipal, telefone: client.telefone,
        email: client.email, smsPhone: smsLog?.phoneNumber || null, smsCode: smsLog?.smsCode || null,
        metaVerificationCode: domain.metaVerificationCode, verificationMethod: 'meta_tag',
      };

      // Gera novo template (random dos 16 layouts)
      const html = buildLandingHtml({ ...siteParams, subdomain: domain.domainName });

      // Republica no provider correto
      const wName = domain.cloudflareZoneId || '';
      const isWorker = wName.endsWith('-empresasverrificada') || wName.endsWith('-zaplifydisparo');
      const isWildcard = wName === 'verificaconta-wildcard';
      let resultUrl;
      if (isWildcard) {
        // Wildcard: força updatedAt novo ANTES de gerar o HTML (pra seed ser diferente)
        const newUpdatedAt = new Date();
        await prisma.domain.update({ where: { id: domain.id }, data: { updatedAt: newUpdatedAt } });

        const newIndexPut = Math.floor(Math.random() * 74);
        await prisma.domain.update({ where: { id: domain.id }, data: { updatedAt: newUpdatedAt } });

        // Gera HTML com novo índice
        const htmlWildcard = buildLandingHtml({ ...siteParams, forceTemplateIndex: newIndexPut });

        const baseDom = domain.baseDomain || 'verificaconta.com';
        resultUrl = `https://${domain.domainName}.${baseDom}`;
        // HTML gerado mas não usado diretamente — worker serve do banco em tempo real
        void htmlWildcard;
      } else if (isWorker) {
      } else if (isWorker) {
        const result = await deployWorker(wName.replace('-empresasverrificada','').replace('-zaplifydisparo',''), html, domain.metaVerificationCode, 'meta_tag');
        resultUrl = result.url;
      } else {
        const result = await deployNetlifySite(wName, html, domain.domainName);
        resultUrl = result.url;
      }

      return res.status(200).json({ success: true, workerUrl: resultUrl, message: 'Layout alterado com sucesso!' });
    } catch (error) {
      return res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  // ── GET ?action=check_domain — verifica disponibilidade de domínio ────
  if (req.method === 'GET' && req.query?.action === 'check_domain') {
    try {
      const { domain } = req.query;
      if (!domain) return res.status(400).json({ error: 'domain é obrigatório.' });
      const result = await checkDomain(domain);
      return res.status(200).json(result);
    } catch (error) {
      return res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  // ── GET ?action=provision_ssl — força SSL em site existente ────
  if (req.method === 'GET' && req.query?.action === 'provision_ssl') {
    try {
      const { siteName } = req.query;
      if (!siteName) return res.status(400).json({ error: 'siteName é obrigatório.' });
      const result = await provisionSsl(siteName);
      return res.status(200).json({ success: true, ssl: result });
    } catch (error) {
      return res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  // ── GET — lista todos os domínios publicados ──────────────────────────
  if (req.method === 'GET') {
    try {
      const domains = await prisma.domain.findMany({
        where: { status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
        include: {
          client: { select: { razaoSocial: true, cnpj: true } },
          user: { select: { name: true } },
        },
      });
      const items = domains.map(d => {
        let workerUrl;
        if (d.domainName.includes('.')) {
          // Domínio raiz (Dynadot)
          workerUrl = `https://${d.domainName}`;
        } else if (d.cloudflareZoneId === 'verificaconta-wildcard') {
          // Wildcard — usa baseDomain salvo no registro
          const base = d.baseDomain || 'verificaconta.com';
          workerUrl = `https://${d.domainName}.${base}`;
        } else {
          workerUrl = `https://${d.cloudflareZoneId || d.domainName}.netlify.app`;
        }
        return { ...d, workerUrl };
      });
      return res.status(200).json(items);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // ── POST — publicar novo site (existente) ──────────────────────────────
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  // Registro de domínio automático (Porkbun ou Dynadot + Netlify)
  if (req.body?.action === 'register_domain') {
    try {
      const { domainName, clientId, metaVerificationCode, customRazao, customFantasia } = req.body;
      if (!domainName || !clientId || !metaVerificationCode)
        return res.status(400).json({ error: 'domainName, clientId e metaVerificationCode são obrigatórios.' });

      const client = await prisma.client.findUnique({ where: { id: clientId } });
      if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' });

      // Verifica se o domínio já existe no banco (já registrado antes)
      const existing = await prisma.domain.findFirst({ where: { domainName } });
      const needsRegistration = !existing;

      if (needsRegistration) {
        // 1. Verifica disponibilidade e registra no Dynadot
        const check = await dynadot.checkDomain(domainName);
        if (!check.available) return res.status(422).json({ error: `Domínio ${domainName} não está disponível.` });
        await dynadot.registerDomain(domainName);

        // 2. Cria zona no Cloudflare (DNS instantâneo) + configura A record
        try {
          const zone = await createZone(domainName);
          const zoneId = zone.id;
          const nameservers = zone.name_servers || [];

          // Adiciona A record pro Netlify na zona Cloudflare
          const axios = require('axios');
          await axios.post(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, 
            { type: 'A', name: domainName, content: '75.2.60.5', ttl: 300, proxied: false },
            { headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' }, timeout: 15000 }
          );
          console.log(`[CF] A record criado: ${domainName} -> 75.2.60.5`);

          // Muda nameservers no Dynadot pro Cloudflare
          if (nameservers.length > 0) {
            await dynadot.setNameservers(domainName, nameservers);
            console.log(`[CF] NS alterados pro Cloudflare: ${nameservers.join(', ')}`);
          }
        } catch (cfErr) {
          console.log(`[CF] Zona/NS falhou (fallback pra DNS Dynadot): ${cfErr.message}`);
          // Fallback: configura DNS direto no Dynadot
          await dynadot.setDnsForNetlify(domainName);
        }
      }

      // 5. Busca SMS mais recente
      const smsLog = await prisma.smsLog.findFirst({
        where: { clientId, status: { in: ['WAITING', 'RECEIVED'] } },
        orderBy: { createdAt: 'desc' },
      });

      // 3. Gera HTML
      const html = buildLandingHtml({
        razaoSocial: customRazao || client.razaoSocial,
        nomeFantasia: customFantasia || client.nomeFantasia,
        cnpj: client.cnpj, endereco: client.endereco, numero: client.numero,
        bairro: client.bairro, cep: client.cep,
        municipio: client.municipio, uf: client.uf, situacao: client.situacao,
        atividadePrincipal: client.atividadePrincipal, telefone: client.telefone,
        email: client.email, smsPhone: smsLog?.phoneNumber || null, smsCode: smsLog?.smsCode || null,
        metaVerificationCode, verificationMethod: 'meta_tag',
      });

      // 4. Deploy no Netlify com domínio customizado
      const siteName = domainName.replace(/\./g, '-');
      const result = await deployNetlifySite(siteName, html, domainName);

      // 5. Salva no banco
      let domain;
      if (existing) {
        domain = await prisma.domain.update({
          where: { id: existing.id },
          data: { cloudflareZoneId: siteName, metaVerificationCode, status: 'ACTIVE', userId: user.id }
        });
      } else {
        domain = await prisma.domain.create({
          data: { domainName, cloudflareZoneId: siteName, metaVerificationCode, status: 'ACTIVE', clientId, userId: user.id }
        });
      }

      return res.status(existing ? 200 : 201).json({
        ...domain,
        workerUrl: `https://${domainName}`,
        subdomain: siteName,
        message: needsRegistration ? `Domínio ${domainName} registrado e site publicado!` : `Site republicado em ${domainName}!`,
      });
    } catch (error) {
      return res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  try {
    const { subdomain, metaVerificationCode, verificationMethod, clientId, cfAccount, customRazao, customFantasia, netlifyDomain } = req.body;

    if (!subdomain || !metaVerificationCode || !clientId)
      return res.status(400).json({ error: 'subdomain, metaVerificationCode e clientId são obrigatórios.' });

    const method = verificationMethod || 'meta_tag';

    // Valida o subdomínio
    const cleanSubdomain = subdomain.trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30);
    if (!cleanSubdomain)
      return res.status(400).json({ error: 'Subdomínio inválido.' });

    // Busca dados do cliente e o SMS mais recente em paralelo
    const [client, smsLog] = await Promise.all([
      prisma.client.findUnique({ where: { id: clientId } }),
      prisma.smsLog.findFirst({
        where: {
          clientId,
          status: { in: ['WAITING', 'RECEIVED'] }, // número gerado, com ou sem código
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' });

    // Se já existe um domain com esse subdomínio para este cliente, atualiza o worker (republica)
    const existing = await prisma.domain.findFirst({ where: { clientId, domainName: cleanSubdomain } });

    // Monta o número SMS para o site (número de telefone + código se já chegou)
    const smsPhone = smsLog?.phoneNumber || null;
    const smsCode  = smsLog?.smsCode || null;

    // Gera HTML via IA (100% único) com fallback pro template estático
    const siteParams = {
      razaoSocial: customRazao || client.razaoSocial,
      nomeFantasia: customFantasia || client.nomeFantasia,
      cnpj: client.cnpj, endereco: client.endereco, numero: client.numero,
      bairro: client.bairro, cep: client.cep,
      municipio: client.municipio, uf: client.uf, situacao: client.situacao,
      atividadePrincipal: client.atividadePrincipal, telefone: client.telefone,
      email: client.email, smsPhone, smsCode, metaVerificationCode, verificationMethod: method,
    };

    // Gera HTML com templates variados (16 layouts diferentes)
    const html = buildLandingHtml({ ...siteParams, subdomain: cleanSubdomain });

    // Publica o site (Cloudflare Workers ou Netlify)
    let workerName, url;
    if (cfAccount === 'empresasverrificada' || cfAccount === 'zaplifydisparo') {
      const chosenDomain = netlifyDomain || 'helixprobet.com';

      // ── Wildcard: sem Worker individual, sem Custom Domain ──
      if (cfAccount === 'empresasverrificada' && (chosenDomain === 'verificaconta.com' || chosenDomain === 'ativosmeta.com' || chosenDomain === 'verificativos.com' || chosenDomain === 'ativoscontas.com' || chosenDomain === 'verificacontas.com' || chosenDomain === 'zaplifyativos.com' || chosenDomain === 'verificametaativos.com' || chosenDomain === 'verificaativos.online' || chosenDomain === 'zaplifynegocios.com' || chosenDomain === 'zaplifytrabalho.com' || chosenDomain === 'centralativoss.com' || chosenDomain === 'verificadapro1.com' || chosenDomain === 'zaplifycontas.com' || chosenDomain === 'contaszaplify.com' || chosenDomain === 'masterverificada.com' || chosenDomain === 'farmezaplify.com' || chosenDomain === 'contasativas.com')) {
        workerName = 'verificaconta-wildcard';
        url = `https://${cleanSubdomain}.${chosenDomain}`;
        console.log(`[CF] Wildcard ${chosenDomain} — skip deploy, subdomain=${cleanSubdomain}`);

        // Cria TXT record pra verificação Meta via DNS
        try {
          let cleanCode = metaVerificationCode || '';
          const codeMatch = cleanCode.match(/content=["']([^"']+)["']/);
          if (codeMatch) cleanCode = codeMatch[1];
          // Remove prefixo se vier completo
          cleanCode = cleanCode.replace('facebook-domain-verification=', '');

          if (cleanCode) {
            const axios = require('axios');
            const cfHeaders = { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' };
            const zoneIds = {
              'verificaconta.com': process.env.CLOUDFLARE_ZONE_VERIFICACONTA,
              'ativosmeta.com': process.env.CLOUDFLARE_ZONE_ATIVOSMETA,
              'verificativos.com': process.env.CLOUDFLARE_ZONE_VERIFICATIVOS,
              'ativoscontas.com': process.env.CLOUDFLARE_ZONE_ATIVOSCONTAS,
              'verificacontas.com': process.env.CLOUDFLARE_ZONE_VERIFICACONTAS,
              'zaplifyativos.com': process.env.CLOUDFLARE_ZONE_ZAPLIFYATIVOS,
              'verificametaativos.com': process.env.CLOUDFLARE_ZONE_VERIFICAMETAATIVOS,
              'verificaativos.online': process.env.CLOUDFLARE_ZONE_VERIFICAATIVOS_ONLINE,
              'zaplifynegocios.com': process.env.CLOUDFLARE_ZONE_ZAPLIFYNEGOCIOS,
              'zaplifytrabalho.com': process.env.CLOUDFLARE_ZONE_ZAPLIFYTRABALHO,
              'centralativoss.com': process.env.CLOUDFLARE_ZONE_CENTRALATIVOSS,
              'verificadapro1.com': process.env.CLOUDFLARE_ZONE_VERIFICADAPRO1,
              'zaplifycontas.com': process.env.CLOUDFLARE_ZONE_ZAPLIFYCONTAS,
              'contaszaplify.com': process.env.CLOUDFLARE_ZONE_CONTASZAPLIFY,
              'masterverificada.com': process.env.CLOUDFLARE_ZONE_MASTERVERIFICADA,
              'farmezaplify.com': process.env.CLOUDFLARE_ZONE_FARMEZAPLIFY,
              'contasativas.com': process.env.CLOUDFLARE_ZONE_CONTASATIVAS,
            };
            const zoneId = zoneIds[chosenDomain] || process.env.CLOUDFLARE_ZONE_VERIFICACONTA || '';
            if (zoneId) {
              // Cria A record proxied pro subdomínio (garante que DNS resolve mesmo com TXT)
              await axios.post(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
                { type: 'A', name: cleanSubdomain, content: '192.0.2.1', ttl: 1, proxied: true },
                { headers: cfHeaders, timeout: 15000 }
              ).catch(e => console.log(`[A] Pode ja existir: ${e.response?.data?.errors?.[0]?.message || e.message}`));

              // Cria TXT record pra verificação Meta
              await axios.post(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
                { type: 'TXT', name: cleanSubdomain, content: `facebook-domain-verification=${cleanCode}`, ttl: 1 },
                { headers: cfHeaders, timeout: 15000 }
              ).catch(e => console.log(`[TXT] Pode ja existir: ${e.response?.data?.errors?.[0]?.message || e.message}`));
              console.log(`[DNS] A + TXT criados: ${cleanSubdomain}.verificaconta.com`);
            }
          }
        } catch (txtErr) {
          console.log(`[TXT] Erro geral: ${txtErr.message}`);
        }
      } else {
        // Fluxo original: deploy Worker + Custom Domain
        const targetSub = cfAccount === 'zaplifydisparo' ? (process.env.CLOUDFLARE_WORKERS_SUBDOMAIN_2 || 'zaplifydisparo') : undefined;
        const result = await deployWorker(cleanSubdomain, html, metaVerificationCode, method, targetSub);
        workerName = result.workerName;
        url = result.url;

        // Define URL customizada SEMPRE (o domínio que o usuário escolheu)
        const customHostname = `${cleanSubdomain}.${chosenDomain}`;
        url = `https://${customHostname}`;

        // Cria Custom Domain no Cloudflare (em background, não bloqueia)
        const domainZones = {
          'verificaconta.com': process.env.CLOUDFLARE_ZONE_VERIFICACONTA,
          'helixprobet.com': process.env.CLOUDFLARE_ZONE_HELIXPROBET,
          'verificaativos.online': process.env.CLOUDFLARE_ZONE_VERIFICAATIVOS_ONLINE,
          'verifica.cfd': process.env.CLOUDFLARE_ZONE_VERIFICA_CFD,
          'verificaativos.shop': process.env.CLOUDFLARE_ZONE_VERIFICAATIVOS,
        };
        const zoneId = domainZones[chosenDomain] || process.env.CLOUDFLARE_ZONE_HELIXPROBET || '';

        if (zoneId) {
          try {
            const axios = require('axios');
            const cfHeaders = { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' };
            await axios.put(
              `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/workers/domains`,
              { hostname: customHostname, zone_id: zoneId, service: workerName, environment: 'production' },
              { headers: cfHeaders, timeout: 15000 }
            );
            console.log(`[CF] Custom domain OK: ${customHostname}`);
          } catch (cfErr) {
            console.log(`[CF Domain] ERRO: ${cfErr.response?.status} ${JSON.stringify(cfErr.response?.data?.errors || cfErr.message)}`);
          }
        } else {
          console.log(`[CF] SKIP zoneId vazio pra ${chosenDomain}`);
        }
      }
    } else {
      const result = await deployNetlifySite(cleanSubdomain, html, netlifyDomain);
      workerName = result.siteName;
      url = result.url;

      // Adiciona TXT record pra subdomínios Netlify também
      try {
        let cleanCode = metaVerificationCode || '';
        const codeMatch = cleanCode.match(/content=["']([^"']+)["']/);
        if (codeMatch) cleanCode = codeMatch[1];

        const zoneId = process.env.CLOUDFLARE_ZONE_VERIFICAATIVOS || '';
        const domain = netlifyDomain || 'verificaativos.shop';
        if (zoneId && cleanCode) {
          await addDnsTxtRecord(zoneId, `${cleanSubdomain}.${domain}`, `facebook-domain-verification=${cleanCode}`);
          console.log(`[TXT] Adicionado verificação Meta pra ${cleanSubdomain}.${domain}`);
        }
      } catch (txtErr) {
        console.log(`[TXT] Erro (não fatal): ${txtErr.message}`);
      }
    }

    // Salva ou atualiza no banco
    let domain;
    if (existing) {
      domain = await prisma.domain.update({
        where: { id: existing.id },
        data: {
          cloudflareZoneId:     workerName,
          metaVerificationCode,
          status:               'ACTIVE',
          userId:               user.id,
          ...(workerName === 'verificaconta-wildcard' ? { baseDomain: netlifyDomain || null } : {}),
        }
      });
    } else {
      domain = await prisma.domain.create({
        data: {
          domainName:           cleanSubdomain,
          cloudflareZoneId:     workerName,
          metaVerificationCode,
          status:               'ACTIVE',
          clientId,
          userId:               user.id,
          ...(workerName === 'verificaconta-wildcard' ? { baseDomain: netlifyDomain || null } : {}),
        }
      });
    }

    return res.status(existing ? 200 : 201).json({
      ...domain,
      workerUrl: url,
      subdomain: cleanSubdomain,
      smsPhone,
      smsCode,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
};

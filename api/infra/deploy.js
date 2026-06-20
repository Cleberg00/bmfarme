const prisma = require('../_lib/prisma');
const { verifyAuth, setCors } = require('../_lib/auth');
const { deployWorker, deleteWorker, buildLandingHtml, generateAiContent, generateFullSiteHtml } = require('../_services/cloudflare');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = verifyAuth(req, res);
  if (!user) return;

  // ── PATCH — republicar site existente com novo número ──────────────────
  if (req.method === 'PATCH') {
    try {
      const { domainId, newPhone } = req.body;
      if (!domainId || !newPhone)
        return res.status(400).json({ error: 'domainId e newPhone são obrigatórios.' });

      const domain = await prisma.domain.findUnique({ where: { id: domainId } });
      if (!domain) return res.status(404).json({ error: 'Domínio não encontrado.' });

      const client = await prisma.client.findUnique({ where: { id: domain.clientId } });
      if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' });

      // Gera novo HTML com o número atualizado (IA primeiro, fallback estático)
      const siteParams = {
        razaoSocial: client.razaoSocial, nomeFantasia: client.nomeFantasia,
        cnpj: client.cnpj, endereco: client.endereco, numero: client.numero,
        bairro: client.bairro, cep: client.cep,
        municipio: client.municipio, uf: client.uf, situacao: client.situacao,
        atividadePrincipal: client.atividadePrincipal, telefone: client.telefone,
        email: client.email, smsPhone: newPhone, smsCode: null,
        metaVerificationCode: domain.metaVerificationCode, verificationMethod: 'meta_tag',
      };
      const html = buildLandingHtml({ ...siteParams, subdomain: domain.domainName });

      // Detecta em qual conta o worker está pelo nome salvo
      const existingWorker = domain.cloudflareZoneId || '';
      const sub2 = process.env.CLOUDFLARE_WORKERS_SUBDOMAIN_2 || '';
      const targetSub = (sub2 && existingWorker.endsWith(`-${sub2}`)) ? sub2 : (process.env.CLOUDFLARE_WORKERS_SUBDOMAIN || 'verificadametta');

      // Republica o worker na mesma conta
      const { workerName, url } = await deployWorker(domain.domainName, html, domain.metaVerificationCode, 'meta_tag', targetSub);

      return res.status(200).json({ success: true, workerUrl: url, newPhone, workerName });
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
        razaoSocial: client.razaoSocial, nomeFantasia: client.nomeFantasia,
        cnpj: client.cnpj, endereco: client.endereco, numero: client.numero,
        bairro: client.bairro, cep: client.cep,
        municipio: client.municipio, uf: client.uf, situacao: client.situacao,
        atividadePrincipal: client.atividadePrincipal, telefone: client.telefone,
        email: client.email, smsPhone: smsLog?.phoneNumber || null, smsCode: smsLog?.smsCode || null,
        metaVerificationCode: domain.metaVerificationCode, verificationMethod: 'meta_tag',
      };

      // Tenta IA primeiro, fallback pra template estático com índice forçado diferente
      let html;
      try {
        html = await generateFullSiteHtml(siteParams);
      } catch { /* fallback */ }
      if (!html) {
        // Força um template diferente usando random
        html = buildLandingHtml({ ...siteParams, subdomain: domain.domainName });
      }

      const { workerName, url } = await deployWorker(domain.domainName, html, domain.metaVerificationCode, 'meta_tag',
        (process.env.CLOUDFLARE_WORKERS_SUBDOMAIN_2 && (domain.cloudflareZoneId || '').endsWith(`-${process.env.CLOUDFLARE_WORKERS_SUBDOMAIN_2}`))
          ? process.env.CLOUDFLARE_WORKERS_SUBDOMAIN_2
          : (process.env.CLOUDFLARE_WORKERS_SUBDOMAIN || 'verificadametta')
      );

      return res.status(200).json({ success: true, workerUrl: url, workerName, message: 'Layout alterado com sucesso!' });
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
      const env = require('../_lib/env');
      const sub1 = env.cloudflareWorkersSubdomain;
      const sub2 = process.env.CLOUDFLARE_WORKERS_SUBDOMAIN_2 || '';
      const items = domains.map(d => {
        // Detecta em qual conta o worker está pelo sufixo no nome
        const wName = d.cloudflareZoneId || '';
        let workerUrl;
        if (sub2 && wName.endsWith(`-${sub2}`)) {
          workerUrl = `https://${wName}.${sub2}.workers.dev`;
        } else {
          workerUrl = `https://${wName}.${sub1}.workers.dev`;
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

  let deployedWorkerName = null;

  try {
    const { subdomain, metaVerificationCode, verificationMethod, clientId } = req.body;

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
      razaoSocial: client.razaoSocial, nomeFantasia: client.nomeFantasia,
      cnpj: client.cnpj, endereco: client.endereco, numero: client.numero,
      bairro: client.bairro, cep: client.cep,
      municipio: client.municipio, uf: client.uf, situacao: client.situacao,
      atividadePrincipal: client.atividadePrincipal, telefone: client.telefone,
      email: client.email, smsPhone, smsCode, metaVerificationCode, verificationMethod: method,
    };

    // Gera HTML via IA (Gemini) com fallback pro template estático (16 layouts)
    let html;
    try {
      html = await generateFullSiteHtml(siteParams);
    } catch { /* fallback */ }
    if (!html) {
      html = buildLandingHtml({ ...siteParams, subdomain: cleanSubdomain });
    }
    const aiSource = html.includes('Gemini') ? 'gemini' : 'templates_industriais';

    // Publica o worker (cria ou atualiza — a API do Cloudflare faz upsert)
    const { workerName, url } = await deployWorker(cleanSubdomain, html, metaVerificationCode, method);
    deployedWorkerName = workerName;

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
        }
      });
    }

    return res.status(existing ? 200 : 201).json({
      ...domain,
      workerUrl: url,
      subdomain: cleanSubdomain,
      smsPhone,
      smsCode,
      aiSource,
    });
  } catch (error) {
    if (deployedWorkerName) await deleteWorker(deployedWorkerName).catch(() => null);
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
};

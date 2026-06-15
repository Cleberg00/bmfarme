const prisma = require('../_lib/prisma');
const { verifyAuth, setCors } = require('../_lib/auth');
const { deployWorker, deleteWorker, buildLandingHtml, generateAiContent } = require('../_services/cloudflare');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  const user = verifyAuth(req, res);
  if (!user) return;

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

    // Gera conteúdo com IA e HTML da landing page
    const [aiContent] = await Promise.all([
      generateAiContent({
        razaoSocial:        client.razaoSocial,
        atividadePrincipal: client.atividadePrincipal,
        municipio:          client.municipio,
        uf:                 client.uf,
        smsPhone,
      }),
    ]);

    const html = buildLandingHtml({
      subdomain:          cleanSubdomain,
      razaoSocial:        client.razaoSocial,
      nomeFantasia:       client.nomeFantasia,
      cnpj:               client.cnpj,
      endereco:           client.endereco,
      cep:                client.cep,
      municipio:          client.municipio,
      uf:                 client.uf,
      situacao:           client.situacao,
      atividadePrincipal: client.atividadePrincipal,
      telefone:           client.telefone,
      email:              client.email,
      smsPhone,
      smsCode,
      metaVerificationCode,
      verificationMethod: method,
      aiContent,
    });

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
    });
  } catch (error) {
    if (deployedWorkerName) await deleteWorker(deployedWorkerName).catch(() => null);
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
};

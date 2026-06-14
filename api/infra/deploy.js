const prisma = require('../_lib/prisma');
const { verifyAuth, setCors } = require('../_lib/auth');
const { deployWorker, deleteWorker, buildLandingHtml, slugify } = require('../_services/cloudflare');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  const user = verifyAuth(req, res);
  if (!user) return;

  let deployedWorkerName = null;

  try {
    const { subdomain, metaVerificationCode, clientId } = req.body;

    if (!subdomain || !metaVerificationCode || !clientId)
      return res.status(400).json({ error: 'subdomain, metaVerificationCode e clientId são obrigatórios.' });

    // Valida o subdomínio
    const cleanSubdomain = subdomain.trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30);
    if (!cleanSubdomain)
      return res.status(400).json({ error: 'Subdomínio inválido.' });

    // Busca dados do cliente
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' });

    // Verifica duplicata
    const existing = await prisma.domain.findFirst({ where: { clientId, domainName: cleanSubdomain } });
    if (existing) return res.status(409).json({ error: 'Subdomínio já existe para este cliente.' });

    // Gera o HTML da landing page
    const html = buildLandingHtml({
      subdomain: cleanSubdomain,
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
      metaVerificationCode,
    });

    // Publica o worker
    const { workerName, url } = await deployWorker(cleanSubdomain, html);
    deployedWorkerName = workerName;

    // Salva no banco
    const domain = await prisma.domain.create({
      data: {
        domainName:           cleanSubdomain,
        cloudflareZoneId:     workerName,   // reusa o campo para armazenar o worker name
        metaVerificationCode,
        status:               'ACTIVE',
        clientId,
        userId:               user.id,
      }
    });

    return res.status(201).json({
      ...domain,
      workerUrl: url,
      subdomain: cleanSubdomain,
    });
  } catch (error) {
    // Rollback: remove o worker se foi criado mas o banco falhou
    if (deployedWorkerName) await deleteWorker(deployedWorkerName).catch(() => null);
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
};

const prisma = require('../_lib/prisma');
const { verifyAuth, setCors } = require('../_lib/auth');
const { lookupCnpj } = require('../_services/cnpj');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });

  const user = verifyAuth(req, res);
  if (!user) return;

  try {
    const { cnpj } = req.query;

    // Busca dados frescos da Receita Federal
    const cnpjData = await lookupCnpj(cnpj);

    // Salva/atualiza no banco
    const client = await prisma.client.upsert({
      where: { cnpj: cnpjData.cnpj },
      update: {
        razaoSocial: cnpjData.razaoSocial,
        endereco: cnpjData.endereco,
        cep: cnpjData.cep,
        userId: user.id
      },
      create: {
        cnpj: cnpjData.cnpj,
        razaoSocial: cnpjData.razaoSocial,
        endereco: cnpjData.endereco,
        cep: cnpjData.cep,
        userId: user.id
      }
    });

    // Retorna dados da API (sempre frescos) + id do banco
    return res.status(200).json({
      id: client.id,
      cnpj: cnpjData.cnpj,
      razaoSocial: cnpjData.razaoSocial,
      nomeFantasia: cnpjData.nomeFantasia,
      endereco: cnpjData.endereco,
      cep: cnpjData.cep,
      municipio: cnpjData.municipio,
      uf: cnpjData.uf,
      situacao: cnpjData.situacao,
      atividadePrincipal: cnpjData.atividadePrincipal,
      telefone: cnpjData.telefone,
      email: cnpjData.email,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
};

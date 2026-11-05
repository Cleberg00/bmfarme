const prisma = require('../lib/prisma');

/**
 * Busca empresas com WhatsApp na base de dados
 * @param {object} req - Request
 * @param {object} res - Response
 */
async function searchWhatsApp(req, res) {
  try {
    const { query, limit = 10, page = 1 } = req.query;
    const userId = req.user.id;

    const searchQuery = String(query || '').toUpperCase().trim();

    // Constrói a query de busca
    const where = {
      userId,
      telefone: { not: null },
      telefone: { not: '' },
      OR: [],
    };

    if (searchQuery.length >= 3) {
      where.OR.push({ razaoSocial: { contains: searchQuery } });
      where.OR.push({ nomeFantasia: { contains: searchQuery } });
      where.OR.push({ atividadePrincipal: { contains: searchQuery } });
    }

    // Remove OR vazio se não houver query
    if (where.OR.length === 0) {
      delete where.OR;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [companies, total] = await Promise.all([
      prisma.client.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { id: 'desc' },
        select: {
          id: true,
          cnpj: true,
          razaoSocial: true,
          nomeFantasia: true,
          telefone: true,
          email: true,
          municipio: true,
          uf: true,
          createdAt: true,
        },
      }),
      prisma.client.count({ where }),
    ]);

    // Formata WhatsApp para o padrão internacional
    const formatted = companies.map(c => ({
      id: c.id,
      cnpj: c.cnpj,
      razaoSocial: c.razaoSocial,
      nomeFantasia: c.nomeFantasia,
      telefone: c.telefone,
      whatsapp: formatWhatsApp(c.telefone),
      email: c.email,
      municipio: c.municipio,
      uf: c.uf,
      createdAt: c.createdAt,
    }));

    return res.status(200).json({
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      empresas: formatted,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      error: error.message || 'Falha ao buscar empresas com WhatsApp.',
    });
  }
}

/**
 * Formata número para WhatsApp (55DDDNUMERO)
 */
function formatWhatsApp(telefone) {
  if (!telefone || !String(telefone).trim()) return '';

  const digits = String(telefone).replace(/\D/g, '');

  // Se tiver 10 ou 11 dígitos, assume Brazil (55)
  if (digits.length === 10 || digits.length === 11) {
    return '55' + digits;
  }

  // Se já tiver 55 prefixo, mantém
  if (digits.startsWith('55') && digits.length === 12) {
    return digits;
  }

  // Formata genérico
  return digits;
}

/**
 * Gera atendimento automático para empresa
 */
async function setupAutoAnswer(req, res) {
  try {
    const { clientId, messageTemplate } = req.body;

    if (!clientId) {
      return res.status(400).json({ error: 'ID da empresa é obrigatório.' });
    }

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, cnpj: true, razaoSocial: true, whatsapp: true, telefone: true },
    });

    if (!client) {
      return res.status(404).json({ error: 'Empresa não encontrada.' });
    }

    // Cria configuração de atendimento automático
    const autoAnswer = await prisma.autoAnswer.create({
      data: {
        clientId,
        messageTemplate,
        isActive: true,
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Atendimento automático configurado.',
      autoAnswer,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      error: error.message || 'Falha ao configurar atendimento automático.',
    });
  }
}

/**
 * Lista atendimentos automáticos
 */
async function listAutoAnswers(req, res) {
  try {
    const { page = 1, limit = 20 } = req.query;
    const userId = req.user.id;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [answers, total] = await Promise.all([
      prisma.autoAnswer.findMany({
        where: { client: { userId } },
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          client: { select: { razaoSocial: true, cnpj: true } },
        },
      }),
      prisma.autoAnswer.count({ where: { client: { userId } } }),
    ]);

    return res.status(200).json({
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      answers,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      error: error.message || 'Falha ao listar atendimentos automáticos.',
    });
  }
}

module.exports = {
  searchWhatsApp,
  setupAutoAnswer,
  listAutoAnswers,
  formatWhatsApp,
};

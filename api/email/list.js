const prisma = require('../_lib/prisma');
const { verifyAuth, setCors } = require('../_lib/auth');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = verifyAuth(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    try {
      const { domain, to, limit } = req.query;
      const where = {};
      if (domain) where.domain = domain;
      if (to) where.to = to.toLowerCase();

      const emails = await prisma.email.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit) || 50,
      });

      return res.status(200).json(emails);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // DELETE - deletar email
  if (req.method === 'DELETE') {
    try {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id é obrigatório' });
      await prisma.email.delete({ where: { id } });
      return res.status(200).json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

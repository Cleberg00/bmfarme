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
      const take = parseInt(limit) || 50;

      let emails;
      if (domain && to) {
        emails = await prisma.$queryRawUnsafe(
          `SELECT * FROM "Email" WHERE domain = $1 AND "to" = $2 ORDER BY "createdAt" DESC LIMIT $3`,
          domain, to.toLowerCase(), take
        );
      } else if (domain) {
        emails = await prisma.$queryRawUnsafe(
          `SELECT * FROM "Email" WHERE domain = $1 ORDER BY "createdAt" DESC LIMIT $2`,
          domain, take
        );
      } else if (to) {
        emails = await prisma.$queryRawUnsafe(
          `SELECT * FROM "Email" WHERE "to" = $1 ORDER BY "createdAt" DESC LIMIT $2`,
          to.toLowerCase(), take
        );
      } else {
        emails = await prisma.$queryRawUnsafe(
          `SELECT * FROM "Email" ORDER BY "createdAt" DESC LIMIT $1`,
          take
        );
      }

      return res.status(200).json(emails);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id é obrigatório' });
      await prisma.$executeRawUnsafe(`DELETE FROM "Email" WHERE id = $1`, id);
      return res.status(200).json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

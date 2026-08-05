const prisma = require('../_lib/prisma');

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-email-key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Verificação simples pra evitar spam
  const key = req.headers['x-email-key'];
  if (key !== 'bmfarme-email-2026') return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { to, from, subject, body, domain } = req.body;
    if (!to || !from || !subject) return res.status(400).json({ error: 'to, from, subject são obrigatórios' });

    const email = await prisma.email.create({
      data: {
        to: to.toLowerCase(),
        from: from.toLowerCase(),
        subject,
        body: body || '',
        domain: domain || to.split('@')[1] || '',
      }
    });

    return res.status(200).json({ success: true, id: email.id });
  } catch (error) {
    console.error('[email/receive] Erro:', error.message);
    return res.status(500).json({ error: error.message });
  }
};

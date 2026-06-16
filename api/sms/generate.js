const prisma = require('../_lib/prisma');
const { verifyAuth, setCors } = require('../_lib/auth');
const { buyNumber, activateNumber } = require('../_services/sms');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  const user = verifyAuth(req, res);
  if (!user) return;

  try {
    const { clientId, service } = req.body;
    if (!clientId) return res.status(400).json({ error: 'clientId é obrigatório.' });

    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' });

    const smsData = await buyNumber(service);
    if (smsData.externalId) await activateNumber(smsData.externalId);

    const smsLog = await prisma.smsLog.create({
      data: {
        phoneNumber: smsData.phoneNumber,
        externalId: smsData.externalId || null,
        provider: smsData.provider,
        status: 'WAITING',
        clientId,
        userId: user.id
      }
    });

    return res.status(201).json(smsLog);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
};

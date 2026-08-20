const prisma = require('../_lib/prisma');
const { verifyAuth, setCors, rateLimit } = require('../_lib/auth');
const { buyNumber, activateNumber } = require('../_services/sms');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  // Rate limit: 10 solicitações de SMS por minuto por IP
  if (!rateLimit(req, res, { maxAttempts: 10, windowMs: 60000, message: 'Limite de solicitações SMS atingido. Aguarde 1 minuto.' })) return;

  const user = verifyAuth(req, res);
  if (!user) return;

  try {
    const { clientId, service, provider: preferredProvider, apiKey: customApiKey } = req.body;
    if (!clientId) return res.status(400).json({ error: 'clientId é obrigatório.' });

    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' });

    // API key por equipe: Wesley/Denis/Vitória usam SMS24H com key própria
    const teamKeys = {
      'wesley@gmail.com': 'b31d9d27890c8bff97f3a27f7317a530',
      'denis@gmail.com': 'b31d9d27890c8bff97f3a27f7317a530',
      'vitoria@gmail.com': 'b31d9d27890c8bff97f3a27f7317a530',
      'ronaldo@gmail.com': '545b407cf7e4555d525d6d77eccd08f2',
      'velhoronaldo@gmail.com': '545b407cf7e4555d525d6d77eccd08f2',
    };
    const effectiveApiKey = customApiKey || teamKeys[user.email] || undefined;
    const effectiveProvider = preferredProvider || (teamKeys[user.email] ? 'SMS24H' : undefined);

    const smsData = await buyNumber(service, undefined, effectiveProvider, effectiveApiKey);
    if (smsData.externalId) await activateNumber(smsData.externalId, smsData.provider);

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

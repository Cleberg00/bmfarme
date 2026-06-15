const prisma = require('../../_lib/prisma');
const { verifyAuth, setCors } = require('../../_lib/auth');
const { checkCode, confirmSms, requestResend } = require('../../_services/sms');
const { deployWorker, buildLandingHtml } = require('../../_services/cloudflare');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = verifyAuth(req, res);
  if (!user) return;

  try {
    const { logId } = req.query;
    const smsLog = await prisma.smsLog.findUnique({ where: { id: logId } });

    if (!smsLog || smsLog.userId !== user.id)
      return res.status(404).json({ error: 'SMS log não encontrado.' });

    // POST — confirmar ou reenviar
    if (req.method === 'POST') {
      const { action } = req.body || {};
      if (!smsLog.externalId)
        return res.status(422).json({ error: 'Sem externalId.' });

      if (action === 'confirm') {
        await confirmSms(smsLog.externalId);
        return res.status(200).json({ success: true, message: 'SMS confirmado.' });
      }
      if (action === 'resend') {
        const ok = await requestResend(smsLog.externalId);
        return res.status(200).json({ success: ok, message: ok ? 'Reenvio solicitado.' : 'Falha.' });
      }
      return res.status(400).json({ error: 'action: confirm ou resend' });
    }

    // GET — polling
    if (['RECEIVED', 'EXPIRED', 'FAILED'].includes(smsLog.status))
      return res.status(200).json(smsLog);

    if (!smsLog.externalId)
      return res.status(422).json({ error: 'Sem externalId para polling.' });

    const result = await checkCode(smsLog.externalId);
    const updated = await prisma.smsLog.update({
      where: { id: logId },
      data: { smsCode: result.code ?? smsLog.smsCode, status: result.status }
    });

    // Auto-republica site quando SMS chega
    if (result.status === 'RECEIVED' && result.code) {
      const domain = await prisma.domain.findFirst({
        where: { clientId: smsLog.clientId, status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
      });
      if (domain) {
        try {
          const client = await prisma.client.findUnique({ where: { id: smsLog.clientId } });
          if (client) {
            const html = buildLandingHtml({
              razaoSocial: client.razaoSocial, nomeFantasia: client.nomeFantasia,
              cnpj: client.cnpj, endereco: client.endereco, cep: client.cep,
              municipio: client.municipio, uf: client.uf, situacao: client.situacao,
              atividadePrincipal: client.atividadePrincipal, telefone: client.telefone,
              email: client.email, smsPhone: smsLog.phoneNumber, smsCode: result.code,
              metaVerificationCode: domain.metaVerificationCode, verificationMethod: 'meta_tag',
            });
            deployWorker(domain.domainName, html, domain.metaVerificationCode, 'meta_tag').catch(() => {});
          }
        } catch { /* silencioso */ }
      }
    }

    return res.status(200).json(updated);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
};

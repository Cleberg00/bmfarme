const prisma = require('../_lib/prisma');
const { verifyAuth, setCors } = require('../_lib/auth');

const TIER_LABELS = {
  TIER_1K:    '1.000/dia',
  TIER_10K:   '10.000/dia',
  TIER_100K:  '100.000/dia',
  UNLIMITED:  'Ilimitado',
};

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = verifyAuth(req, res);
  if (!user) return;

  // ── GET: lista todas as WABAs ──────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const { tier, status } = req.query;
      const where = {};
      if (tier)   where.tier   = tier;
      if (status) where.status = status;

      const wabas = await prisma.wabaAsset.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          user:     { select: { id: true, name: true } },
          bmAsset:  {
            include: {
              client: { select: { razaoSocial: true, cnpj: true } }
            }
          }
        }
      });

      return res.status(200).json(
        wabas.map(w => ({
          ...w,
          tierLabel: TIER_LABELS[w.tier] || w.tier,
        }))
      );
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // ── POST: registra nova WABA ───────────────────────────────────────────────
  if (req.method === 'POST') {
    try {
      const { wabaId, displayName, phoneNumber, tier, status, notes, bmAssetId } = req.body;
      if (!wabaId || !displayName)
        return res.status(400).json({ error: 'wabaId e displayName são obrigatórios.' });

      const existing = await prisma.wabaAsset.findUnique({ where: { wabaId } });
      if (existing)
        return res.status(409).json({ error: 'WABA ID já cadastrado.' });

      const waba = await prisma.wabaAsset.create({
        data: {
          wabaId,
          displayName,
          phoneNumber: phoneNumber || null,
          tier:        tier   || 'TIER_1K',
          status:      status || 'ACTIVE',
          notes:       notes  || null,
          bmAssetId:   bmAssetId || null,
          userId:      user.id,
        }
      });

      return res.status(201).json({ ...waba, tierLabel: TIER_LABELS[waba.tier] });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // ── PATCH: atualiza tier/status/notas de uma WABA ─────────────────────────
  if (req.method === 'PATCH') {
    try {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id é obrigatório.' });

      const { tier, status, notes, phoneNumber, displayName } = req.body;
      const data = {};
      if (tier)        data.tier        = tier;
      if (status)      data.status      = status;
      if (notes !== undefined) data.notes = notes;
      if (phoneNumber) data.phoneNumber  = phoneNumber;
      if (displayName) data.displayName  = displayName;

      const waba = await prisma.wabaAsset.update({ where: { id }, data });
      return res.status(200).json({ ...waba, tierLabel: TIER_LABELS[waba.tier] });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // ── DELETE: remove WABA ───────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    try {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id é obrigatório.' });
      await prisma.wabaAsset.delete({ where: { id } });
      return res.status(200).json({ message: 'WABA removida.' });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed.' });
};

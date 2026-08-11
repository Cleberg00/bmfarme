const bcrypt = require('bcryptjs');
const prisma = require('../_lib/prisma');
const { verifyAuth, setCors } = require('../_lib/auth');

// Garante que a coluna createdBy existe (cria se não existir)
let _colChecked = false;
async function ensureCreatedByColumn() {
  if (_colChecked) return;
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "createdBy" TEXT`);
  } catch { /* já existe ou outro erro benigno */ }
  _colChecked = true;
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = verifyAuth(req, res);
  if (!user) return;

  await ensureCreatedByColumn();

  const isAdmin = user.role === 'ADMIN';

  // Busca IDs dos membros da equipe (quem esse user criou)
  async function getTeamIds() {
    const team = await prisma.$queryRawUnsafe(`SELECT id, email FROM "User" WHERE "createdBy" = $1`, user.id);
    return team || [];
  }

  async function isInMyTeam(targetId) {
    if (isAdmin) return true;
    if (targetId === user.id) return true;
    const rows = await prisma.$queryRawUnsafe(`SELECT id FROM "User" WHERE id = $1 AND "createdBy" = $2`, targetId, user.id);
    return rows && rows.length > 0;
  }

  // PATCH (troca de senha/nome)
  if (req.method === 'PATCH') {
    try {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id é obrigatório.' });

      const isSelf = id === user.id;
      const canManage = await isInMyTeam(id);
      if (!isSelf && !canManage)
        return res.status(403).json({ error: 'Sem permissão para alterar este usuário.' });

      const { password, name } = req.body;
      const data = {};
      if (name) data.name = name;
      if (password) {
        if (password.length < 6)
          return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres.' });
        data.password = await bcrypt.hash(password, 10);
      }
      if (Object.keys(data).length === 0)
        return res.status(400).json({ error: 'Nenhum campo para atualizar.' });

      const updated = await prisma.user.update({
        where: { id },
        data,
        select: { id: true, email: true, name: true, role: true },
      });
      return res.status(200).json(updated);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // GET — lista usuários (admin vê todos, líder vê sua equipe + ele)
  if (req.method === 'GET') {
    try {
      if (isAdmin) {
        const users = await prisma.user.findMany({
          select: { id: true, email: true, name: true, role: true, createdAt: true, _count: { select: { bmAssets: true } } },
          orderBy: { createdAt: 'asc' },
        });
        return res.status(200).json(users);
      }
      // Não-admin: vê apenas quem ele criou + ele mesmo
      const teamMembers = await prisma.$queryRawUnsafe(
        `SELECT id, email, name, role, "createdAt" FROM "User" WHERE "createdBy" = $1 OR id = $1 ORDER BY "createdAt" ASC`,
        user.id
      );
      return res.status(200).json(teamMembers.map(u => ({ ...u, _count: { bmAssets: 0 } })));
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // POST — cria novo usuário (qualquer um pode criar, fica vinculado a quem criou)
  if (req.method === 'POST') {
    try {
      const { email, password, name, role } = req.body;
      if (!email || !password || !name)
        return res.status(400).json({ error: 'email, password e name são obrigatórios.' });

      if (password.length < 6)
        return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres.' });

      // Só admin pode criar ADMIN
      if (!isAdmin && role === 'ADMIN')
        return res.status(403).json({ error: 'Apenas admin pode criar outros admins.' });

      const existing = await prisma.user.findUnique({ where: { email: String(email).toLowerCase() } });
      if (existing) return res.status(409).json({ error: 'E-mail já cadastrado.' });

      const hashed = await bcrypt.hash(password, 10);
      
      // Cria o user e marca quem criou
      const newUser = await prisma.$queryRawUnsafe(
        `INSERT INTO "User" (id, email, password, name, role, "createdAt", "updatedAt", "createdBy") VALUES (gen_random_uuid()::text, $1, $2, $3, $4, NOW(), NOW(), $5) RETURNING id, email, name, role, "createdAt"`,
        String(email).toLowerCase(), hashed, name, role === 'ADMIN' ? 'ADMIN' : 'OPERATOR', user.id
      );
      
      return res.status(201).json(newUser[0] || newUser);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // DELETE — remove usuário
  if (req.method === 'DELETE') {
    try {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id é obrigatório.' });
      if (id === user.id) return res.status(400).json({ error: 'Não é possível remover a própria conta.' });

      const canManage = await isInMyTeam(id);
      if (!canManage)
        return res.status(403).json({ error: 'Sem permissão para remover este usuário.' });

      await prisma.bmAsset.deleteMany({ where: { userId: id } });
      await prisma.smsLog.deleteMany({ where: { userId: id } });
      await prisma.domain.deleteMany({ where: { userId: id } });
      await prisma.client.deleteMany({ where: { userId: id } });
      await prisma.user.delete({ where: { id } });
      return res.status(200).json({ message: 'Usuário removido.' });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed.' });
};

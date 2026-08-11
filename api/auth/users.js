const bcrypt = require('bcryptjs');
const prisma = require('../_lib/prisma');
const { verifyAuth, setCors } = require('../_lib/auth');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = verifyAuth(req, res);
  if (!user) return;

  // PATCH (troca de senha/nome) — qualquer usuário pode, sem exigir ADMIN
  if (req.method === 'PATCH') {
    try {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id é obrigatório.' });
      if (user.role !== 'ADMIN' && id !== user.id)
        return res.status(403).json({ error: 'Sem permissão para alterar outro usuário.' });

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

  // Apenas ADMIN pode gerenciar usuários abaixo
  if (user.role !== 'ADMIN')
    return res.status(403).json({ error: 'Apenas administradores podem gerenciar usuários.' });

  // GET — lista todos os usuários
  if (req.method === 'GET') {
    try {
      const users = await prisma.user.findMany({
        select: {
          id: true, email: true, name: true, role: true, createdAt: true,
          _count: { select: { bmAssets: true } }
        },
        orderBy: { createdAt: 'asc' },
      });
      return res.status(200).json(users);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // POST — cria novo usuário
  if (req.method === 'POST') {
    try {
      const { email, password, name, role } = req.body;
      if (!email || !password || !name)
        return res.status(400).json({ error: 'email, password e name são obrigatórios.' });

      if (password.length < 6)
        return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres.' });

      const existing = await prisma.user.findUnique({ where: { email: String(email).toLowerCase() } });
      if (existing) return res.status(409).json({ error: 'E-mail já cadastrado.' });

      const hashed = await bcrypt.hash(password, 10);
      const newUser = await prisma.user.create({
        data: {
          email: String(email).toLowerCase(),
          password: hashed,
          name,
          role: role === 'ADMIN' ? 'ADMIN' : 'OPERATOR',
        },
        select: { id: true, email: true, name: true, role: true, createdAt: true },
      });
      return res.status(201).json(newUser);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // DELETE — remove usuário por id (query param)
  if (req.method === 'DELETE') {
    try {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id é obrigatório.' });
      if (id === user.id) return res.status(400).json({ error: 'Não é possível remover a própria conta.' });

      // Remove registros vinculados antes de deletar o usuário
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

const bcrypt = require('bcryptjs');
const prisma = require('../_lib/prisma');
const { verifyAuth, setCors } = require('../_lib/auth');

// Equipes: líder → membros que ele pode gerenciar
const TEAMS = {
  'wesley@gmail.com': ['denis@gmail.com', 'vitoria@gmail.com'],
};

function getTeamMembers(leaderEmail) {
  return TEAMS[leaderEmail] || [];
}

function canManageUser(managerEmail, managerRole, targetEmail) {
  if (managerRole === 'ADMIN') return true;
  const team = getTeamMembers(managerEmail);
  return team.includes(targetEmail);
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = verifyAuth(req, res);
  if (!user) return;

  const isAdmin = user.role === 'ADMIN';
  const isTeamLeader = !!TEAMS[user.email];

  // PATCH (troca de senha/nome) — admin, líder de equipe, ou o próprio usuário
  if (req.method === 'PATCH') {
    try {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id é obrigatório.' });

      // Busca o user alvo pra verificar permissão
      const targetUser = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true } });
      if (!targetUser) return res.status(404).json({ error: 'Usuário não encontrado.' });

      // Permissão: admin, próprio, ou líder de equipe do alvo
      const isSelf = id === user.id;
      const canManage = canManageUser(user.email, user.role, targetUser.email);
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

  // GET — lista usuários (admin vê todos, líder vê sua equipe)
  if (req.method === 'GET') {
    if (!isAdmin && !isTeamLeader)
      return res.status(403).json({ error: 'Sem permissão para listar usuários.' });

    try {
      let where = {};
      if (!isAdmin && isTeamLeader) {
        // Líder vê apenas seus membros + ele mesmo
        const teamEmails = [...getTeamMembers(user.email), user.email];
        where = { email: { in: teamEmails } };
      }

      const users = await prisma.user.findMany({
        where,
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

  // POST — cria novo usuário (admin cria qualquer, líder cria na equipe dele)
  if (req.method === 'POST') {
    if (!isAdmin && !isTeamLeader)
      return res.status(403).json({ error: 'Sem permissão para criar usuários.' });

    try {
      const { email, password, name, role } = req.body;
      if (!email || !password || !name)
        return res.status(400).json({ error: 'email, password e name são obrigatórios.' });

      if (password.length < 6)
        return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres.' });

      // Líder não pode criar ADMIN
      if (!isAdmin && role === 'ADMIN')
        return res.status(403).json({ error: 'Apenas admin pode criar outros admins.' });

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

  // DELETE — remove usuário (admin remove qualquer, líder remove da equipe)
  if (req.method === 'DELETE') {
    try {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id é obrigatório.' });
      if (id === user.id) return res.status(400).json({ error: 'Não é possível remover a própria conta.' });

      const targetUser = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true } });
      if (!targetUser) return res.status(404).json({ error: 'Usuário não encontrado.' });

      if (!canManageUser(user.email, user.role, targetUser.email))
        return res.status(403).json({ error: 'Sem permissão para remover este usuário.' });

      // Remove registros vinculados antes de deletar
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

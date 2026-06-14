const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../_lib/prisma');
const env = require('../_lib/env');
const { setCors } = require('../_lib/auth');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'email e password são obrigatórios.' });

    const user = await prisma.user.findUnique({
      where: { email: String(email).toLowerCase() }
    });
    if (!user) return res.status(401).json({ error: 'Credenciais inválidas.' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Credenciais inválidas.' });

    const token = jwt.sign(
      { email: user.email, role: user.role },
      env.jwtSecret,
      { subject: user.id, expiresIn: '12h' }
    );

    return res.status(200).json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role }
    });
  } catch (error) {
    console.error('[login error]', error);
    return res.status(500).json({ error: error.message || 'Falha no login.' });
  }
};

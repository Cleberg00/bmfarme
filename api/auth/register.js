/**
 * Email temporário via Temp-Mail (privatix-temp-mail-v1.p.rapidapi.com)
 * GET /api/auth/register?action=generate&name=kalyel  → gera email temporário
 * GET /api/auth/register?action=inbox&email=x@domain  → lista mensagens
 */
const axios = require('axios');
const { verifyAuth, setCors } = require('../_lib/auth');
const env = require('../_lib/env');

// Domínios disponíveis no Temp-Mail
const DOMAINS = ['@mailnull.com', '@spamgourmet.com'];

const rapidApi = axios.create({
  baseURL: 'https://privatix-temp-mail-v1.p.rapidapi.com/request',
  timeout: 15000,
  headers: {
    'x-rapidapi-key':  env.tempMailKey,
    'x-rapidapi-host': 'privatix-temp-mail-v1.p.rapidapi.com',
    'Content-Type':    'application/json',
  },
});

// Gera hash MD5 simples para o formato da API
function md5(str) {
  // Node tem crypto nativo
  const crypto = require('crypto');
  return crypto.createHash('md5').update(str).digest('hex');
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });

  const user = verifyAuth(req, res);
  if (!user) return;

  const { action, email, name } = req.query;

  try {
    // ── Listar domínios disponíveis ──────────────────────────────────────────
    if (action === 'domains') {
      const { data } = await rapidApi.get('/domains/');
      return res.status(200).json({ domains: Array.isArray(data) ? data : DOMAINS });
    }

    // ── Gerar email temporário baseado no nome da empresa ────────────────────
    if (action === 'generate' || !action) {
      let domains = DOMAINS;
      try {
        const { data } = await rapidApi.get('/domains/');
        if (Array.isArray(data) && data.length > 0) domains = data;
      } catch { /* usa padrão */ }

      // Normaliza o nome para criar username
      const base = (name || 'empresa')
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 20);
      const suffix = Math.floor(Math.random() * 9000) + 1000;
      const username = `${base}${suffix}`;
      const domain = domains[Math.floor(Math.random() * domains.length)];
      const generatedEmail = `${username}${domain}`;

      return res.status(200).json({
        email: generatedEmail,
        username,
        domain,
        inboxHash: md5(generatedEmail),
      });
    }

    // ── Buscar mensagens da caixa de entrada ────────────────────────────────
    if (action === 'inbox') {
      if (!email) return res.status(400).json({ error: 'email é obrigatório.' });
      const hash = md5(email.toLowerCase());
      const { data } = await rapidApi.get(`/mail/id/${hash}/`);
      const messages = Array.isArray(data) ? data : [];
      return res.status(200).json({ messages, count: messages.length });
    }

    // ── Ler mensagem específica ─────────────────────────────────────────────
    if (action === 'message') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id é obrigatório.' });
      const { data } = await rapidApi.get(`/one_mail/id/${id}/`);
      return res.status(200).json(data);
    }

    return res.status(400).json({ error: 'action inválida. Use: generate, domains, inbox, message' });
  } catch (error) {
    const msg = error.response?.data?.message || error.message || 'Erro ao consultar Temp Mail.';
    return res.status(error.response?.status || 500).json({ error: msg });
  }
};

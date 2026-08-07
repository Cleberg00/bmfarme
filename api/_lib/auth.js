const jwt = require('jsonwebtoken');
const env = require('./env');

/**
 * Verifica o token JWT do request.
 * Se inválido, responde 401 e retorna null.
 * Se válido, retorna o payload { id, email, role }.
 */
function verifyAuth(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token de autorização é obrigatório.' });
    return null;
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    return { id: payload.sub, email: payload.email, role: payload.role };
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado.' });
    return null;
  }
}

/**
 * Verifica se o usuário é ADMIN. Retorna true/false e responde 403 se não for.
 */
function requireAdmin(user, res) {
  if (!user || user.role !== 'ADMIN') {
    res.status(403).json({ error: 'Acesso restrito a administradores.' });
    return false;
  }
  return true;
}

/**
 * Rate limiter simples em memória (por IP).
 * Limita a X tentativas em Y segundos.
 */
const _rateLimitStore = {};
function rateLimit(req, res, { maxAttempts = 5, windowMs = 60000, message = 'Muitas tentativas. Tente novamente em 1 minuto.' } = {}) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.headers['x-real-ip'] || 'unknown';
  const now = Date.now();
  const key = ip + ':' + (req.url || '');
  
  if (!_rateLimitStore[key]) _rateLimitStore[key] = { count: 0, firstAttempt: now };
  const entry = _rateLimitStore[key];
  
  // Reset se passou a janela de tempo
  if (now - entry.firstAttempt > windowMs) {
    entry.count = 0;
    entry.firstAttempt = now;
  }
  
  entry.count++;
  
  if (entry.count > maxAttempts) {
    res.status(429).json({ error: message });
    return false;
  }
  return true;
}

// Limpa entries velhas a cada 5 minutos
setInterval(() => {
  const now = Date.now();
  for (const key of Object.keys(_rateLimitStore)) {
    if (now - _rateLimitStore[key].firstAttempt > 300000) delete _rateLimitStore[key];
  }
}, 300000);

/**
 * Adiciona headers CORS padrão à resposta.
 */
function setCors(res) {
  const allowedOrigins = process.env.CORS_ORIGINS || '*';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigins);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = { verifyAuth, requireAdmin, rateLimit, setCors };

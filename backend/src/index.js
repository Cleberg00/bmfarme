const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const prisma = require('./lib/prisma');
const authRoutes = require('./routes/auth.routes');
const cnpjRoutes = require('./routes/cnpj.routes');
const infraRoutes = require('./routes/infra.routes');
const smsRoutes = require('./routes/sms.routes');
const bmRoutes = require('./routes/bm.routes');
const whatsappRoutes = require('./routes/whatsapp.routes');

const app = express();
let server = null;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return res.status(200).json({ status: 'ok' });
  } catch (error) {
    return res.status(500).json({ status: 'error' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/cnpj', cnpjRoutes);
app.use('/api/infra', infraRoutes);
app.use('/api/sms', smsRoutes);
app.use('/api/bm', bmRoutes);
app.use('/api/whatsapp', whatsappRoutes);

app.use((req, res) => {
  return res.status(404).json({ error: 'Route not found.' });
});

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  return res.status(error.statusCode || 500).json({
    error: error.message || 'Internal server error.'
  });
});

if (require.main === module) {
  server = app.listen(env.port, () => {
    process.stdout.write(`BM Farm God Mode backend running on port ${env.port}\n`);
  });
}

module.exports = { app, server };
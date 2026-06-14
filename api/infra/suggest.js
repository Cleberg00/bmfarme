const { verifyAuth, setCors } = require('../_lib/auth');
const { slugify } = require('../_services/cloudflare');
const env = require('../_lib/env');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });

  const user = verifyAuth(req, res);
  if (!user) return;

  const { razaoSocial } = req.query;
  if (!razaoSocial) return res.status(400).json({ error: 'razaoSocial é obrigatório.' });

  const slug = slugify(razaoSocial);
  const workersDomain = env.cloudflareWorkersSubdomain;

  return res.status(200).json({
    subdomain: slug,
    url: `https://${slug}-${workersDomain}.${workersDomain}.workers.dev`,
  });
};

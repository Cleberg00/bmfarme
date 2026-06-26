/**
 * Netlify Deploy — hospeda sites estáticos via API
 * Cria um site e faz deploy do HTML como index.html
 * URL final: https://<subdomain>.nexusmkt.shop (com domínio customizado)
 *         ou https://<site-name>.netlify.app (fallback)
 */
const axios = require('axios');

const NETLIFY_API = 'https://api.netlify.com/api/v1';
const CUSTOM_DOMAIN = process.env.NETLIFY_CUSTOM_DOMAIN || 'nexusmkt.shop'; // domínio raiz

function getToken() {
  return process.env.NETLIFY_TOKEN || '';
}

/**
 * Cria um site no Netlify, faz deploy do HTML e adiciona domínio customizado
 * @param {string} subdomain - nome do site (slug)
 * @param {string} htmlContent - HTML completo da página
 * @returns {{ siteName: string, url: string }}
 */
async function deployNetlifySite(subdomain, htmlContent) {
  const token = getToken();
  if (!token) throw Object.assign(new Error('NETLIFY_TOKEN não configurado'), { statusCode: 500 });

  const siteName = subdomain.slice(0, 60);
  const customDomain = `${siteName}.${CUSTOM_DOMAIN}`;

  try {
    // 1. Cria o site (ou usa existente) com domínio customizado
    let siteId;
    try {
      const createRes = await axios.post(`${NETLIFY_API}/sites`, {
        name: siteName,
        custom_domain: CUSTOM_DOMAIN ? customDomain : undefined,
      }, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 15000,
      });
      siteId = createRes.data.id;
      console.log(`[Netlify] Site criado: ${siteId}`);
    } catch (err) {
      // Se já existe, busca pelo nome
      if (err.response?.status === 422) {
        const listRes = await axios.get(`${NETLIFY_API}/sites?name=${siteName}`, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 15000,
        });
        const existing = listRes.data?.find(s => s.name === siteName);
        if (existing) {
          siteId = existing.id;
          console.log(`[Netlify] Site existente reutilizado: ${siteId}`);
        } else {
          throw err;
        }
      } else {
        throw err;
      }
    }

    // 2. Adiciona domínio customizado se configurado (async — não bloqueia deploy)
    if (CUSTOM_DOMAIN) {
      axios.put(`${NETLIFY_API}/sites/${siteId}`, {
        custom_domain: customDomain,
      }, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 15000,
      }).then(() => {
        // Provisiona SSL após vincular domínio
        return axios.post(`${NETLIFY_API}/sites/${siteId}/ssl`, {}, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          timeout: 15000,
        });
      }).catch(e => console.log(`[Netlify] Custom domain/SSL setup (non-fatal): ${e.message}`));
    }

    // 3. Deploy com arquivo único (index.html) via file digest
    const crypto = require('crypto');
    const fileContent = Buffer.from(htmlContent, 'utf8');
    const sha1 = crypto.createHash('sha1').update(fileContent).digest('hex');

    // 3a. Inicia deploy com digest dos arquivos
    const deployRes = await axios.post(`${NETLIFY_API}/sites/${siteId}/deploys`, {
      files: { '/index.html': sha1 },
    }, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 15000,
    });

    const deployId = deployRes.data.id;
    const required = deployRes.data.required || [sha1];

    // 3b. Upload do arquivo se necessário
    if (required.length > 0) {
      await axios.put(`${NETLIFY_API}/deploys/${deployId}/files/index.html`, fileContent, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/octet-stream',
        },
        timeout: 15000,
      });
    }

    // URL final: domínio customizado se configurado, senão netlify.app
    const url = CUSTOM_DOMAIN ? `https://${customDomain}` : `https://${siteName}.netlify.app`;
    console.log(`[Netlify] Deploy OK: ${url}`);
    return { siteName, url };
  } catch (error) {
    const msg = error.response?.data?.message || error.response?.data?.errors || error.message;
    console.error('[Netlify] Deploy error:', msg);
    throw Object.assign(new Error(`Netlify deploy error: ${JSON.stringify(msg)}`), { statusCode: error.response?.status || 502 });
  }
}

/**
 * Deleta um site do Netlify
 */
async function deleteNetlifySite(siteName) {
  const token = getToken();
  if (!token) return;
  try {
    const listRes = await axios.get(`${NETLIFY_API}/sites?name=${siteName}`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10000,
    });
    const site = listRes.data?.find(s => s.name === siteName);
    if (site) {
      await axios.delete(`${NETLIFY_API}/sites/${site.id}`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000,
      });
    }
  } catch { /* silencioso */ }
}

module.exports = { deployNetlifySite, deleteNetlifySite };

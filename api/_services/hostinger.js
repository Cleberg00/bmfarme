/**
 * Hostinger Integration — Cria sites com domínio temporário e faz upload via FTP
 * 
 * Fluxo:
 * 1. POST /api/hosting/v1/websites → cria site com domínio .hostingersite.com
 * 2. FTP upload index.html → public_html/
 * 
 * Dados FTP:
 * Host: 186.244.145.13
 * User: u249435360
 * Port: 21
 */
const axios = require('axios');
const ftp = require('basic-ftp');

const HOSTINGER_API = 'https://developers.hostinger.com/api/hosting/v1';
const HOSTINGER_TOKEN = process.env.HOSTINGER_API_TOKEN || '';
const HOSTINGER_ORDER_ID = 1007983286;

const FTP_HOST = '186.244.145.13';
const FTP_USER_PREFIX = 'u249435360';
const FTP_PASS = process.env.HOSTINGER_FTP_PASS || '';
const FTP_PORT = 21;

/**
 * Cria um site na Hostinger com domínio temporário
 * @param {string} subdomain - nome desejado (ex: "empresatal")
 * @returns {{ domain: string, url: string }}
 */
async function createHostingerSite(subdomain) {
  const domain = `${subdomain}.hostingersite.com`;
  
  try {
    await axios.post(`${HOSTINGER_API}/websites`, {
      domain,
      order_id: HOSTINGER_ORDER_ID,
    }, {
      headers: { Authorization: `Bearer ${HOSTINGER_TOKEN}`, 'Content-Type': 'application/json' },
      timeout: 30000,
    });
    console.log(`[Hostinger] Site criado: ${domain}`);
  } catch (e) {
    // 422 = site já existe, tudo OK — vai direto pro upload
    if (e.response?.status === 422) {
      console.log(`[Hostinger] Site já existe: ${domain} — prosseguindo pro upload`);
    } else {
      throw new Error(`Hostinger: erro ao criar site - ${e.response?.data?.message || e.message}`);
    }
  }

  return { domain, url: `https://${domain}` };
}

/**
 * Faz upload de HTML via FTP pro public_html do site
 * @param {string} domain - domínio do site (ex: "empresatal.hostingersite.com")
 * @param {string} htmlContent - conteúdo HTML completo
 */
async function uploadHtmlFtp(domain, htmlContent) {
  const client = new ftp.Client();
  client.ftp.verbose = false;
  
  // Username FTP é u249435360.dominio
  const ftpUser = `${FTP_USER_PREFIX}.${domain}`;
  
  try {
    await client.access({
      host: FTP_HOST,
      port: FTP_PORT,
      user: ftpUser,
      password: FTP_PASS,
      secure: false,
    });

    // Vai pro public_html (raiz padrão do FTP já é o public_html na Hostinger)
    try {
      await client.cd('/public_html');
    } catch {
      // Já pode estar no public_html
    }

    // Upload do index.html como stream
    const { Readable } = require('stream');
    const stream = Readable.from([htmlContent]);
    await client.uploadFrom(stream, 'index.html');

    console.log(`[Hostinger FTP] Upload OK: ${domain}/public_html/index.html (user: ${ftpUser})`);
  } finally {
    client.close();
  }
}

/**
 * Deploy completo: cria site + upload HTML
 * @param {string} subdomain - nome desejado
 * @param {string} htmlContent - HTML da landing page
 * @returns {{ domain: string, url: string }}
 */
async function deployHostingerSite(subdomain, htmlContent) {
  // 1. Cria o site via API
  const { domain, url } = await createHostingerSite(subdomain);

  // 2. Aguarda pro site ser provisionado (FTP demora pra ativar)
  await new Promise(r => setTimeout(r, 8000));

  // 3. Upload do HTML via FTP
  await uploadHtmlFtp(domain, htmlContent);

  return { domain, url, provider: 'hostinger' };
}

/**
 * Deleta um site da Hostinger
 */
async function deleteHostingerSite(domain) {
  try {
    await axios.delete(`${HOSTINGER_API}/websites/${domain}`, {
      headers: { Authorization: `Bearer ${HOSTINGER_TOKEN}` },
      timeout: 15000,
    });
    console.log(`[Hostinger] Site deletado: ${domain}`);
    return true;
  } catch (e) {
    console.log(`[Hostinger] Erro ao deletar ${domain}: ${e.message}`);
    return false;
  }
}

module.exports = { createHostingerSite, uploadHtmlFtp, deployHostingerSite, deleteHostingerSite };

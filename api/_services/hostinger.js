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
const FTP_USER = 'u249435360';
const FTP_PASS = process.env.HOSTINGER_FTP_PASS || '';
const FTP_PORT = 21;

/**
 * Cria um site na Hostinger com domínio temporário
 * @param {string} subdomain - nome desejado (ex: "empresatal")
 * @returns {{ domain: string, url: string }}
 */
async function createHostingerSite(subdomain) {
  const domain = `${subdomain}.hostingersite.com`;
  
  const res = await axios.post(`${HOSTINGER_API}/websites`, {
    domain,
    order_id: HOSTINGER_ORDER_ID,
  }, {
    headers: { Authorization: `Bearer ${HOSTINGER_TOKEN}`, 'Content-Type': 'application/json' },
    timeout: 30000,
  });

  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`Hostinger: erro ao criar site - ${JSON.stringify(res.data)}`);
  }

  console.log(`[Hostinger] Site criado: ${domain}`);
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
  
  try {
    await client.access({
      host: FTP_HOST,
      port: FTP_PORT,
      user: FTP_USER,
      password: FTP_PASS,
      secure: false,
    });

    // Navega pro diretório do site
    const sitePath = `/home/${FTP_USER}/domains/${domain}/public_html`;
    
    try {
      await client.ensureDir(sitePath);
    } catch {
      // Tenta caminho alternativo
      await client.ensureDir(`/domains/${domain}/public_html`);
    }

    // Upload do index.html como stream
    const { Readable } = require('stream');
    const stream = Readable.from([htmlContent]);
    await client.uploadFrom(stream, 'index.html');

    console.log(`[Hostinger FTP] Upload OK: ${domain}/public_html/index.html`);
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

  // 2. Aguarda um pouco pro site ser provisionado
  await new Promise(r => setTimeout(r, 3000));

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

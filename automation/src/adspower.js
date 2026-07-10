// AdsPower Local API Client
const axios = require('axios');

const API = process.env.ADSPOWER_API || 'http://127.0.0.1:50325';
const KEY = process.env.ADSPOWER_API_KEY || '';

function headers() {
  return KEY ? { 'Api-Key': KEY } : {};
}

// Lista todos os perfis do AdsPower
async function listProfiles(page = 1, pageSize = 100) {
  const { data } = await axios.get(`${API}/api/v1/user/list`, {
    params: { page, page_size: pageSize },
    headers: headers(),
  });
  if (data.code !== 0) throw new Error(`AdsPower list error: ${data.msg}`);
  return data.data.list || [];
}

// Abre um browser profile e retorna a URL de conexao do Puppeteer
async function openBrowser(profileId) {
  const { data } = await axios.get(`${API}/api/v1/browser/start`, {
    params: { user_id: profileId },
    headers: headers(),
  });
  if (data.code !== 0) throw new Error(`AdsPower open error: ${data.msg}`);
  return {
    wsEndpoint: data.data.ws.puppeteer,
    debugPort: data.data.debug_port,
  };
}

// Fecha um browser profile
async function closeBrowser(profileId) {
  const { data } = await axios.get(`${API}/api/v1/browser/stop`, {
    params: { user_id: profileId },
    headers: headers(),
  });
  return data.code === 0;
}

// Verifica status de um profile
async function checkBrowser(profileId) {
  const { data } = await axios.get(`${API}/api/v1/browser/active`, {
    params: { user_id: profileId },
    headers: headers(),
  });
  return data.data?.status === 'Active';
}

// Cria um novo perfil no AdsPower
async function createProfile({ name, proxy, cookie, platform }) {
  const body = {
    name: name || 'Auto Profile',
    group_id: '0',
    user_proxy_config: proxy ? {
      proxy_soft: 'other',
      proxy_type: proxy.type || 'http',
      proxy_host: proxy.host,
      proxy_port: String(proxy.port),
      proxy_user: proxy.user || '',
      proxy_password: proxy.pass || '',
    } : undefined,
  };

  const { data } = await axios.post(`${API}/api/v1/user/create`, body, {
    headers: { ...headers(), 'Content-Type': 'application/json' },
  });
  if (data.code !== 0) throw new Error(`AdsPower create error: ${data.msg}`);
  
  const profileId = data.data.id;

  // Se tem cookie, importa
  if (cookie && profileId) {
    await importCookies(profileId, cookie);
  }

  return profileId;
}

// Importa cookies para um perfil
async function importCookies(profileId, cookieString) {
  let cookies;
  try {
    cookies = JSON.parse(cookieString);
  } catch {
    // Se nao for JSON, tenta como cookie string simples
    cookies = cookieString;
  }

  const { data } = await axios.post(`${API}/api/v1/user/update`, {
    user_id: profileId,
    cookie: typeof cookies === 'string' ? cookies : JSON.stringify(cookies),
  }, {
    headers: { ...headers(), 'Content-Type': 'application/json' },
  });
  return data.code === 0;
}

module.exports = {
  listProfiles,
  openBrowser,
  closeBrowser,
  checkBrowser,
  createProfile,
  importCookies,
};

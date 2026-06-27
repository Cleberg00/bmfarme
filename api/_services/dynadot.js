/**
 * Dynadot API — registra domínios e configura DNS
 * API: https://api.dynadot.com/api3.json?key=...&command=...
 */
const axios = require('axios');

const DYNADOT_API = 'https://api.dynadot.com/api3.json';

function getKey() {
  return process.env.DYNADOT_API_KEY || '';
}

/**
 * Verifica disponibilidade de um domínio
 */
async function checkDomain(domain) {
  const key = getKey();
  if (!key) throw new Error('DYNADOT_API_KEY não configurado');

  const res = await axios.get(DYNADOT_API, {
    params: { key, command: 'search', domain0: domain },
    timeout: 15000,
  });

  const data = res.data;
  if (data?.SearchResponse?.SearchResults?.[0]) {
    const result = data.SearchResponse.SearchResults[0];
    return {
      domain: result.DomainName,
      available: result.Available === 'yes',
      price: result.Price,
      currency: result.Currency,
    };
  }
  throw new Error('Resposta inesperada do Dynadot');
}

/**
 * Registra um domínio
 */
async function registerDomain(domain, duration = 1) {
  const key = getKey();
  if (!key) throw new Error('DYNADOT_API_KEY não configurado');

  const res = await axios.get(DYNADOT_API, {
    params: { key, command: 'register', domain: domain, duration },
    timeout: 30000,
  });

  const data = res.data;
  if (data?.RegisterResponse?.Status === 'success' || data?.Response?.ResponseCode === '0') {
    console.log(`[Dynadot] Domínio registrado: ${domain}`);
    return { success: true, domain };
  }

  const error = data?.RegisterResponse?.Error || data?.Response?.Error || JSON.stringify(data);
  throw new Error(`Dynadot register error: ${error}`);
}

/**
 * Configura DNS do domínio com CNAME pra Netlify
 */
async function setDnsForNetlify(domain) {
  const key = getKey();
  if (!key) throw new Error('DYNADOT_API_KEY não configurado');

  // Configura registro A apontando pro Netlify load balancer
  const res = await axios.get(DYNADOT_API, {
    params: {
      key,
      command: 'set_dns2',
      domain,
      main_record_type0: 'a',
      main_record0: '75.2.60.5',
    },
    timeout: 15000,
  });

  const data = res.data;
  if (data?.SetDnsResponse?.Status === 'success' || data?.SetDnsResponse?.ResponseCode === 0) {
    console.log(`[Dynadot] DNS configurado pra Netlify: ${domain}`);
    return true;
  }

  console.log('[Dynadot] DNS response:', JSON.stringify(data));
  return true;
}

module.exports = { checkDomain, registerDomain, setDnsForNetlify };

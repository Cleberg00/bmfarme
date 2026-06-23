/**
 * SMS24h.org + HeroSMS.com (fallback) — protocolo compatível com sms-activate
 * GET http://api.sms24h.org/stubs/handler_api?action=...&api_key=...
 * GET https://hero-sms.com/api/v1?action=...&api_key=...
 * Respostas em texto puro, não JSON.
 */
const axios = require('axios');
const env = require('../_lib/env');

const DEFAULT_SERVICE = 'fb'; // Facebook
const DEFAULT_COUNTRY = 73;   // Brasil

// Provider configs
function getProviders() {
  const providers = [
    {
      name: 'SMS24H',
      baseURL: env.sms24ApiUrl,
      apiKey: env.sms24ApiKey,
      timeout: 15000,
    },
  ];
  // HeroSMS como fallback (se configurado)
  if (process.env.HEROSMS_API_KEY) {
    providers.push({
      name: 'HEROSMS',
      baseURL: process.env.HEROSMS_API_URL || 'https://hero-sms.com/stubs/handler_api.php',
      apiKey: process.env.HEROSMS_API_KEY,
      timeout: 15000,
    });
  }
  return providers;
}

function makeRequest(provider, params) {
  return axios.get(provider.baseURL, {
    params: { api_key: provider.apiKey, ...params },
    timeout: provider.timeout,
  }).then(res => typeof res.data === 'string' ? res.data.trim() : String(res.data).trim());
}

async function buyNumber(service = DEFAULT_SERVICE, country, preferredProvider) {
  const effectiveCountry = country || DEFAULT_COUNTRY;
  let providers = getProviders();
  
  // Se o usuario escolheu um provider específico, usa SÓ ele (sem fallback)
  if (preferredProvider) {
    const preferred = providers.find(p => p.name === preferredProvider);
    if (preferred) {
      providers = [preferred];
    }
  }
  
  let lastError;

  for (const provider of providers) {
    try {
      // HeroSMS usa padrão SMS-Activate: Brasil = 12, fb = fb
      // SMS24h usa: Brasil = 73, fb = fb
      // HeroSMS: maxPrice pra pegar o mais barato disponível
      const countryCode = (provider.name === 'HEROSMS') ? 12 : effectiveCountry;
      const extraParams = (provider.name === 'HEROSMS') ? { maxPrice: '0.15' } : {};
      const raw = await makeRequest(provider, { action: 'getNumber', service, country: countryCode, ...extraParams });

      if (raw.startsWith('ACCESS_NUMBER:')) {
        const parts = raw.split(':');
        if (parts.length < 3) continue;
        console.log(`[SMS] Número obtido via ${provider.name}: ${parts[2]}`);
        return { externalId: parts[1], phoneNumber: parts[2], provider: provider.name };
      }

      // Erros que indicam sem números — tenta próximo provider
      if (raw === 'NO_NUMBERS' || raw === 'NO_BALANCE') {
        console.log(`[SMS] ${provider.name}: ${raw}, tentando próximo...`);
        lastError = new Error(raw);
        continue;
      }

      // Erro fatal — para aqui
      const errors = {
        WRONG_SERVICE: 'Serviço inválido.',
        BAD_KEY: 'API key inválida.',
        ERROR_SQL: 'Erro interno no servidor SMS.',
        BAD_ACTION: 'Ação inválida.'
      };
      throw Object.assign(new Error(errors[raw] || `Erro: ${raw}`), { statusCode: 422 });
    } catch (err) {
      if (err.statusCode) throw err;
      lastError = err;
      console.log(`[SMS] ${provider.name} falhou: ${err.message}`);
    }
  }

  throw Object.assign(
    new Error(lastError?.message || 'Sem números disponíveis em nenhum provider.'),
    { statusCode: 422 }
  );
}

async function activateNumber(externalId, providerName) {
  const provider = getProviders().find(p => p.name === providerName) || getProviders()[0];
  try {
    const raw = await makeRequest(provider, { action: 'setStatus', status: 1, id: externalId });
    return raw === 'ACCESS_READY' || raw.includes('ACCESS');
  } catch { return false; }
}

async function checkCode(externalId, providerName) {
  const provider = getProviders().find(p => p.name === providerName) || getProviders()[0];
  let raw;
  try {
    raw = await makeRequest(provider, { action: 'getStatus', id: externalId });
  } catch (error) {
    throw Object.assign(new Error(String(error.response?.data || error.message)), { statusCode: 502 });
  }

  if (raw.startsWith('STATUS_OK:'))
    return { code: raw.split(':')[1], status: 'RECEIVED' };

  const map = {
    STATUS_WAIT_CODE:   { code: null, status: 'WAITING' },
    STATUS_WAIT_RETRY:  { code: null, status: 'WAITING' },
    STATUS_WAIT_RESEND: { code: null, status: 'WAITING' },
    STATUS_CANCEL:      { code: null, status: 'EXPIRED' },
    STATUS_CANCEL_TIMEOUT: { code: null, status: 'EXPIRED' }
  };
  return map[raw] ?? { code: null, status: 'WAITING' };
}

async function releaseNumber(externalId, confirmed = false, providerName) {
  const provider = getProviders().find(p => p.name === providerName) || getProviders()[0];
  try {
    await makeRequest(provider, { action: 'setStatus', status: confirmed ? 6 : 8, id: externalId });
    return true;
  } catch { return false; }
}

async function confirmSms(externalId, providerName) {
  const provider = getProviders().find(p => p.name === providerName) || getProviders()[0];
  try {
    await makeRequest(provider, { action: 'setStatus', status: 6, id: externalId });
    return true;
  } catch { return false; }
}

async function requestResend(externalId, providerName) {
  const provider = getProviders().find(p => p.name === providerName) || getProviders()[0];
  try {
    const raw = await makeRequest(provider, { action: 'setStatus', status: 3, id: externalId });
    return raw.includes('ACCESS') || raw.includes('READY');
  } catch { return false; }
}

async function getBalance() {
  const results = [];
  for (const provider of getProviders()) {
    try {
      const raw = await makeRequest(provider, { action: 'getBalance' });
      if (raw.startsWith('ACCESS_BALANCE:')) {
        results.push({ provider: provider.name, balance: parseFloat(raw.split(':')[1]) });
      }
    } catch { /* skip */ }
  }
  return results.length === 1 ? results[0].balance : results;
}

module.exports = { buyNumber, activateNumber, checkCode, releaseNumber, confirmSms, requestResend, getBalance };

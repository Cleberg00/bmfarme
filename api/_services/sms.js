/**
 * SMS24h.org — protocolo compatível com sms-activate.ru
 * GET http://api.sms24h.org/stubs/handler_api?action=...&api_key=...
 * Respostas em texto puro, não JSON.
 */
const axios = require('axios');
const env = require('../_lib/env');

const DEFAULT_SERVICE = 'fb'; // Facebook
const DEFAULT_COUNTRY = 73;   // Brasil

function getApi() {
  return axios.create({ baseURL: env.sms24ApiUrl, timeout: 20000 });
}

async function apiRequest(params) {
  const res = await getApi().get('', {
    params: { api_key: env.sms24ApiKey, ...params }
  });
  return typeof res.data === 'string' ? res.data.trim() : String(res.data).trim();
}

async function buyNumber(service = DEFAULT_SERVICE, country = DEFAULT_COUNTRY) {
  let raw;
  try {
    raw = await apiRequest({ action: 'getNumber', service, country });
  } catch (error) {
    throw Object.assign(new Error(String(error.response?.data || error.message)), { statusCode: 502 });
  }

  if (raw.startsWith('ACCESS_NUMBER:')) {
    const parts = raw.split(':');
    if (parts.length < 3)
      throw Object.assign(new Error('Resposta inesperada: ' + raw), { statusCode: 502 });
    return { externalId: parts[1], phoneNumber: parts[2], provider: 'SMS24H' };
  }

  const errors = {
    NO_NUMBERS: 'Sem números disponíveis. Tente novamente em breve.',
    NO_BALANCE: 'Saldo insuficiente na conta SMS24h.',
    WRONG_SERVICE: 'Serviço inválido.',
    BAD_KEY: 'API key inválida.',
    ERROR_SQL: 'Erro interno no servidor SMS24h.',
    BAD_ACTION: 'Ação inválida.'
  };
  throw Object.assign(new Error(errors[raw] || `Erro: ${raw}`), { statusCode: 422 });
}

async function activateNumber(externalId) {
  try {
    const raw = await apiRequest({ action: 'setStatus', status: 1, id: externalId });
    return raw === 'ACCESS_READY' || raw.includes('ACCESS');
  } catch { return false; }
}

async function checkCode(externalId) {
  let raw;
  try {
    raw = await apiRequest({ action: 'getStatus', id: externalId });
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

async function releaseNumber(externalId, confirmed = false) {
  try {
    await apiRequest({ action: 'setStatus', status: confirmed ? 6 : 8, id: externalId });
    return true;
  } catch { return false; }
}

// Confirma que o SMS foi recebido (status 6)
async function confirmSms(externalId) {
  try {
    await apiRequest({ action: 'setStatus', status: 6, id: externalId });
    return true;
  } catch { return false; }
}

// Solicita reenvio do código (status 3)
async function requestResend(externalId) {
  try {
    const raw = await apiRequest({ action: 'setStatus', status: 3, id: externalId });
    return raw.includes('ACCESS') || raw.includes('READY');
  } catch { return false; }
}

async function getBalance() {
  try {
    const raw = await apiRequest({ action: 'getBalance' });
    if (raw.startsWith('ACCESS_BALANCE:')) return parseFloat(raw.split(':')[1]);
    return null;
  } catch { return null; }
}

module.exports = { buyNumber, activateNumber, checkCode, releaseNumber, confirmSms, requestResend, getBalance };

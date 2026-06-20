// Validação lazy de variáveis — segura para cold start serverless
function get(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

// Multi-conta Cloudflare: usa conta 2 (zaplifydisparo) como padrão, conta 1 como backup
function getCloudflareAccount() {
  const hasAccount2 = process.env.CLOUDFLARE_API_TOKEN_2 && process.env.CLOUDFLARE_ACCOUNT_ID_2 && process.env.CLOUDFLARE_WORKERS_SUBDOMAIN_2;
  if (hasAccount2) {
    return {
      token: process.env.CLOUDFLARE_API_TOKEN_2,
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID_2,
      subdomain: process.env.CLOUDFLARE_WORKERS_SUBDOMAIN_2,
    };
  }
  return {
    token: get('CLOUDFLARE_API_TOKEN'),
    accountId: get('CLOUDFLARE_ACCOUNT_ID'),
    subdomain: get('CLOUDFLARE_WORKERS_SUBDOMAIN'),
  };
}

module.exports = {
  get jwtSecret()                  { return get('JWT_SECRET'); },
  get cloudflareApiToken()         { return get('CLOUDFLARE_API_TOKEN'); },
  get cloudflareAccountId()        { return get('CLOUDFLARE_ACCOUNT_ID'); },
  get cloudflareWorkersSubdomain() { return get('CLOUDFLARE_WORKERS_SUBDOMAIN'); },
  get cloudflareAiToken()          { return process.env.CLOUDFLARE_AI_TOKEN || get('CLOUDFLARE_API_TOKEN'); },
  get sms24ApiKey()                { return get('SMS24_API_KEY'); },
  get sms24ApiUrl()                { return get('SMS24_API_URL'); },
  // legado opcional
  get vpsIp()        { return process.env.VPS_IP || ''; },
  get dataApiKey()   { return process.env.DATA_API_KEY || ''; },
  get tempMailKey()  { return process.env.TEMP_MAIL_API_KEY || ''; },
  // Multi-conta
  getCloudflareAccount,
};

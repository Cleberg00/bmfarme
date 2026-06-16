// Validação lazy de variáveis — segura para cold start serverless
function get(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
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
};

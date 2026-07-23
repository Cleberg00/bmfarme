const prisma = require('../_lib/prisma');
const { verifyAuth, setCors } = require('../_lib/auth');
const { buildLandingHtml, generateFullSiteHtml, createZone, addDnsTxtRecord, getZoneNameservers, deployWorker } = require('../_services/cloudflare');
const { deployNetlifySite, provisionSsl } = require('../_services/netlify');
const porkbun = require('../_services/porkbun');
const dynadot = require('../_services/dynadot');

// Formata telefone pra exibição (41) 96347-5267
function formatPhoneForReplace(phone) {
  let n = String(phone || '').replace(/\D/g, '');
  if (n.startsWith('55') && n.length >= 12) n = n.slice(2);
  if (n.length === 10) return `(${n.slice(0,2)}) ${n.slice(2,6)}-${n.slice(6)}`;
  if (n.length === 11) return `(${n.slice(0,2)}) ${n.slice(2,7)}-${n.slice(7)}`;
  return phone;
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── GET ?action=fix_txt — Recria TXT DNS pra todos os domínios wildcard sem TXT ────
  if (req.method === 'GET' && req.query?.action === 'fix_txt') {
    const user = verifyAuth(req, res);
    if (!user) return;
    try {
      const axios = require('axios');
      const cfHeaders = { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' };
      const zoneIds = {
        'verificaconta.com': process.env.CLOUDFLARE_ZONE_VERIFICACONTA,
        'validarfm.com': process.env.CLOUDFLARE_ZONE_VALIDARFM,
        'perfilvalidados.com.br': process.env.CLOUDFLARE_ZONE_PERFILVALIDADOS_BR,
        'perfilvalidados.com': process.env.CLOUDFLARE_ZONE_PERFILVALIDADOS,
        'mettaativos.com': process.env.CLOUDFLARE_ZONE_METTAATIVOS,
        'perfilbr.com': process.env.CLOUDFLARE_ZONE_PERFILBR,
        'ativosmeta.com': process.env.CLOUDFLARE_ZONE_ATIVOSMETA,
        'verificativos.com': process.env.CLOUDFLARE_ZONE_VERIFICATIVOS,
        'ativoscontas.com': process.env.CLOUDFLARE_ZONE_ATIVOSCONTAS,
        'verificacontas.com': process.env.CLOUDFLARE_ZONE_VERIFICACONTAS,
        'zaplifyativos.com': process.env.CLOUDFLARE_ZONE_ZAPLIFYATIVOS,
        'verificametaativos.com': process.env.CLOUDFLARE_ZONE_VERIFICAMETAATIVOS,
        'verificaativos.online': process.env.CLOUDFLARE_ZONE_VERIFICAATIVOS_ONLINE,
        'verificabussines.com': process.env.CLOUDFLARE_ZONE_VERIFICABUSSINES,
        'zaplifynegocios.com': process.env.CLOUDFLARE_ZONE_ZAPLIFYNEGOCIOS,
        'zaplifytrabalho.com': process.env.CLOUDFLARE_ZONE_ZAPLIFYTRABALHO,
        'centralativoss.com': process.env.CLOUDFLARE_ZONE_CENTRALATIVOSS,
        'verificadapro1.com': process.env.CLOUDFLARE_ZONE_VERIFICADAPRO1,
        'zaplifycontas.com': process.env.CLOUDFLARE_ZONE_ZAPLIFYCONTAS,
        'contaszaplify.com': process.env.CLOUDFLARE_ZONE_CONTASZAPLIFY,
        'masterverificada.com': process.env.CLOUDFLARE_ZONE_MASTERVERIFICADA,
        'farmezaplify.com': process.env.CLOUDFLARE_ZONE_FARMEZAPLIFY,
        'contasativas.com': process.env.CLOUDFLARE_ZONE_CONTASATIVAS,
        'verificaperfilbm.com': process.env.CLOUDFLARE_ZONE_VERIFICAPERFILBM,
        'zaplifybm.com': process.env.CLOUDFLARE_ZONE_ZAPLIFYBM,
        'zaplifybm.com.br': process.env.CLOUDFLARE_ZONE_ZAPLIFYBM_BR,
        'verificaativos.com': process.env.CLOUDFLARE_ZONE_VERIFICAATIVOS2,
        'contasativasfb.com': process.env.CLOUDFLARE_ZONE_CONTASATIVASFB,
        'contasativasbr.com': process.env.CLOUDFLARE_ZONE_CONTASATIVASBR,
        'verificaperfil01.com': process.env.CLOUDFLARE_ZONE_VERIFICAPERFIL01,
        'verificazapli.com': process.env.CLOUDFLARE_ZONE_VERIFICAZAPLI,
        'checkverifica.com.br': process.env.CLOUDFLARE_ZONE_CHECKVERIFICA,
        'verificacontas.com.br': process.env.CLOUDFLARE_ZONE_VERIFICACONTAS_BR,
        'verificaperfil.com.br': process.env.CLOUDFLARE_ZONE_VERIFICAPERFIL_BR,
        'verificabm.com.br': process.env.CLOUDFLARE_ZONE_VERIFICABM_BR,
        'zaplifyverifica.com.br': process.env.CLOUDFLARE_ZONE_ZAPLIFYVERIFICA_BR,
        'zaplifyativos.com.br': process.env.CLOUDFLARE_ZONE_ZAPLIFYATIVOS_BR,
        'validacaoperfil.com': process.env.CLOUDFLARE_ZONE_VALIDACAOPERFIL,
        'veirficacc.com': process.env.CLOUDFLARE_ZONE_VEIRFICACC,
        'verificaportifolio.com.br': process.env.CLOUDFLARE_ZONE_VERIFICAPORTIFOLIO_BR,
        'verificaportifolio.com': process.env.CLOUDFLARE_ZONE_VERIFICAPORTIFOLIO,
        'verificapf.com': process.env.CLOUDFLARE_ZONE_VERIFICAPF,
        'verifcadorbm.com': process.env.CLOUDFLARE_ZONE_VERIFCADORBM,
        'verificabussines.com': process.env.CLOUDFLARE_ZONE_VERIFICABUSSINES,
        'verificadorbm.com': process.env.CLOUDFLARE_ZONE_VERIFICADORBM,
        'ativoson.com': process.env.CLOUDFLARE_ZONE_ATIVOSON,
        'validacaopf.com': process.env.CLOUDFLARE_ZONE_VALIDACAOPF,
        'verifcationbm.com': process.env.CLOUDFLARE_ZONE_VERIFCATIONBM,
        'verifcationbm.com.br': process.env.CLOUDFLARE_ZONE_VERIFCATIONBM_BR,
        'ageion.com': process.env.CLOUDFLARE_ZONE_AGEION,
        'verificacaobm02.com': process.env.CLOUDFLARE_ZONE_VERIFICACAOBM02,
        'perfilbr01.com': process.env.CLOUDFLARE_ZONE_PERFILBR01,
        'vericationbm.com': process.env.CLOUDFLARE_ZONE_VERICATIONBM,
        'zaplifyativos01.com': process.env.CLOUDFLARE_ZONE_ZAPLIFYATIVOS01,
        'zaplifyvalidation.com': process.env.CLOUDFLARE_ZONE_ZAPLIFYVALIDATION,
        'bmseven.com': process.env.CLOUDFLARE_ZONE_BMSEVEN,
        'zaplify01.com': process.env.CLOUDFLARE_ZONE_ZAPLIFY01,
        'zaplifybm02.com': process.env.CLOUDFLARE_ZONE_ZAPLIFYBM02,
        'zapbm02.com': process.env.CLOUDFLARE_ZONE_ZAPBM02,
        'zaplifydigital.com': process.env.CLOUDFLARE_ZONE_ZAPLIFYDIGITAL,
        'veridesk1.com': process.env.CLOUDFLARE_ZONE_VERIDESK1,
      };

      // Busca todos os domínios wildcard do usuário
      const domains = await prisma.domain.findMany({
        where: { userId: user.id, cloudflareZoneId: 'verificaconta-wildcard', status: 'ACTIVE' },
      });

      let created = 0, skipped = 0, errors = 0;
      for (const domain of domains) {
        const baseDom = domain.baseDomain || 'verificaconta.com';
        const zoneId = zoneIds[baseDom];
        if (!zoneId) { skipped++; continue; }

        let cleanCode = domain.metaVerificationCode || '';
        const codeMatch = cleanCode.match(/content=["']([^"']+)["']/);
        if (codeMatch) cleanCode = codeMatch[1];
        cleanCode = cleanCode.replace('facebook-domain-verification=', '');
        if (!cleanCode) { skipped++; continue; }

        try {
          await axios.post(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
            { type: 'TXT', name: domain.domainName, content: `facebook-domain-verification=${cleanCode}`, ttl: 1 },
            { headers: cfHeaders, timeout: 15000 }
          );
          created++;
        } catch (e) {
          const msg = e.response?.data?.errors?.[0]?.message || e.message;
          if (msg.includes('already exists')) skipped++;
          else { errors++; console.log(`[fix_txt] ${domain.domainName}.${baseDom}: ${msg}`); }
        }
      }

      return res.status(200).json({ success: true, total: domains.length, created, skipped, errors });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // ── GET ?action=get_site — Worker wildcard busca HTML (sem auth JWT) ────
  if (req.method === 'GET' && req.query?.action === 'get_site') {
    try {
      const workerKey = req.headers['x-worker-key'];
      if (workerKey !== 'bmfarme-worker-2026')
        return res.status(401).json({ error: 'Unauthorized' });

      const { subdomain, page } = req.query;
      if (!subdomain) return res.status(400).json({ error: 'subdomain é obrigatório.' });

      const domain = await prisma.domain.findFirst({ where: { domainName: subdomain, status: 'ACTIVE' } });
      if (!domain) return res.status(404).send('<html><body><h1>Site não encontrado</h1></body></html>');

      const client = await prisma.client.findUnique({ where: { id: domain.clientId } });
      if (!client) return res.status(404).send('<html><body><h1>Cliente não encontrado</h1></body></html>');

      // Páginas separadas de privacidade e termos (o Meta crawler verifica esses URLs)
      if (page === 'privacy' || page === 'politica-de-privacidade') {
        const razao = domain.customRazao || client.razaoSocial || '';
        res.setHeader('Content-Type', 'text/html; charset=UTF-8');
        return res.status(200).send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Política de Privacidade — ${razao}</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;background:#f5f5f5;color:#333;padding:40px 24px}main{max-width:800px;margin:0 auto;background:#fff;padding:40px;border-radius:4px}h1{font-size:24px;margin-bottom:24px;color:#111}h2{font-size:16px;margin:24px 0 12px}p{font-size:14px;line-height:1.9;margin-bottom:12px;color:#555}a{color:#2563eb}</style></head><body><main><h1>Política de Privacidade</h1><p><strong>${razao}</strong> — CNPJ ${client.cnpj || ''}</p><h2>1. Coleta de Dados</h2><p>Os dados fornecidos pelos usuários são utilizados exclusivamente para atender às solicitações feitas de forma voluntária pelo próprio usuário. Não coletamos dados sem consentimento expresso.</p><h2>2. Uso dos Dados</h2><p>As informações fornecidas são usadas apenas para responder às solicitações do usuário. Não compartilhamos informações pessoais com terceiros.</p><h2>3. LGPD</h2><p>Em conformidade com a Lei Geral de Proteção de Dados (Lei 13.709/2018), o usuário pode solicitar exclusão ou correção de seus dados a qualquer momento.</p><h2>4. Canal de Atendimento</h2><p>Nosso canal WhatsApp é exclusivamente receptivo. Não realizamos disparos, telemarketing ou contatos não solicitados.</p><p><a href="/">← Voltar ao início</a></p></main></body></html>`);
      }

      if (page === 'terms' || page === 'termos-de-uso') {
        const razao = domain.customRazao || client.razaoSocial || '';
        res.setHeader('Content-Type', 'text/html; charset=UTF-8');
        return res.status(200).send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Termos de Uso — ${razao}</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;background:#f5f5f5;color:#333;padding:40px 24px}main{max-width:800px;margin:0 auto;background:#fff;padding:40px;border-radius:4px}h1{font-size:24px;margin-bottom:24px;color:#111}h2{font-size:16px;margin:24px 0 12px}p{font-size:14px;line-height:1.9;margin-bottom:12px;color:#555}a{color:#2563eb}</style></head><body><main><h1>Termos de Uso</h1><p><strong>${razao}</strong> — CNPJ ${client.cnpj || ''}</p><h2>1. Aceitação</h2><p>Ao entrar em contato com nosso canal, o usuário declara que iniciou a comunicação de forma espontânea e voluntária.</p><h2>2. Uso do Canal</h2><p>Este canal de atendimento destina-se exclusivamente ao atendimento receptivo de clientes que entraram em contato por iniciativa própria para obter informações, esclarecimentos ou suporte.</p><h2>3. Proibições</h2><p>Não realizamos disparos em massa, telemarketing ativo ou comunicações não solicitadas. Todo atendimento segue as diretrizes do WhatsApp Business e Meta Platforms.</p><h2>4. Conformidade</h2><p>Todas as operações seguem as políticas da Meta Platforms, WhatsApp Business Policy e a legislação brasileira vigente.</p><p><a href="/">← Voltar ao início</a></p></main></body></html>`);
      }

      const smsLog = await prisma.smsLog.findFirst({
        where: { clientId: client.id, userId: domain.userId },
        orderBy: { createdAt: 'desc' },
      });

      // Se tem HTML cacheado, serve direto (PATCH e deploy mantêm atualizado)
      if (domain.htmlCache) {
        res.setHeader('Content-Type', 'text/html; charset=UTF-8');
        return res.status(200).send(domain.htmlCache);
      }

      const cnpjDigits = String(client.cnpj || '').replace(/\D/g, '');
      const updatedSeed = domain.updatedAt ? new Date(domain.updatedAt).getTime() : Date.now();
      const nameSeed = domain.domainName.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      const fixedIndex = (cnpjDigits.split('').reduce((a, c) => a + parseInt(c, 10), 0) * 7 + nameSeed * 3 + Math.floor(updatedSeed / 1009)) % 18;

      const html = buildLandingHtml({
        razaoSocial: domain.customRazao || client.razaoSocial,
        nomeFantasia: domain.customRazao || client.nomeFantasia,
        cnpj: client.cnpj, endereco: client.endereco, numero: client.numero,
        bairro: client.bairro, cep: client.cep,
        municipio: client.municipio, uf: client.uf, situacao: client.situacao,
        atividadePrincipal: client.atividadePrincipal, telefone: client.telefone,
        email: client.email, smsPhone: smsLog?.phoneNumber || null, smsCode: smsLog?.smsCode || null,
        metaVerificationCode: domain.metaVerificationCode, verificationMethod: 'meta_tag',
        forceTemplateIndex: fixedIndex,
      });

      res.setHeader('Content-Type', 'text/html; charset=UTF-8');
      return res.status(200).send(html);
    } catch (error) {
      console.error('[get_site] ERRO:', error?.message || error);
      return res.status(500).send(`<html><body><h1>Erro interno</h1><p>${error?.message || ''}</p></body></html>`);
    }
  }

  const user = verifyAuth(req, res);
  if (!user) return;

  // ── PATCH — republicar site existente com novo número ──────────────────
  if (req.method === 'PATCH') {
    try {
      const { domainId, newPhone, customRazao } = req.body;
      if (!domainId || (!newPhone && !customRazao))
        return res.status(400).json({ error: 'domainId e ao menos newPhone ou customRazao são obrigatórios.' });

      const domain = await prisma.domain.findUnique({ where: { id: domainId } });
      if (!domain) return res.status(404).json({ error: 'Domínio não encontrado.' });

      const client = await prisma.client.findUnique({ where: { id: domain.clientId } });
      if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' });

      // Regenera HTML com novo número E novo template (atualiza updatedAt pra mudar seed)
      const existingWorker = domain.cloudflareZoneId || '';
      const isWildcard = existingWorker === 'verificaconta-wildcard';

      // Força updatedAt calculado para gerar template aleatório real
      const newIndex = Math.floor(Math.random() * 18);
      const cnpjDigits = String(client.cnpj || '').replace(/\D/g, '');
      const nameSeed = domain.domainName.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      const cnpjSum = cnpjDigits.split('').reduce((a, c) => a + parseInt(c, 10), 0);
      const neededTs = (newIndex - ((cnpjSum * 7 + nameSeed * 3) % 18) + 80) % 18;
      const fakeTs = new Date(neededTs * 1009 + 1);
      await prisma.domain.update({
        where: { id: domain.id },
        data: {
          updatedAt: fakeTs,
          ...(customRazao ? { customRazao: customRazao.trim() } : {}),
        }
      });

      const updatedSeed = fakeTs.getTime();

      const html = buildLandingHtml({
        razaoSocial: customRazao || client.razaoSocial, nomeFantasia: customRazao ? undefined : client.nomeFantasia,
        cnpj: client.cnpj, endereco: client.endereco, numero: client.numero,
        bairro: client.bairro, cep: client.cep,
        municipio: client.municipio, uf: client.uf, situacao: client.situacao,
        atividadePrincipal: client.atividadePrincipal, telefone: client.telefone,
        email: client.email, smsPhone: newPhone || client.telefone, smsCode: null,
        metaVerificationCode: domain.metaVerificationCode, verificationMethod: 'meta_tag',
        forceTemplateIndex: newIndex,
        customRazao: customRazao || undefined,
      });

      // Republica no provider correto (Workers se nome termina com -empresasverrificada)
      const isWorker = existingWorker.endsWith('-empresasverrificada') || existingWorker.endsWith('-zaplifydisparo');
      let resultUrl;
      if (isWildcard) {
        // Para wildcard: salva o novo número atualizando o smsLog mais recente
        // (o worker serve o HTML em tempo real buscando do smsLog)
        if (newPhone) {
          const existingSmsLog = await prisma.smsLog.findFirst({
            where: { clientId: client.id, userId: domain.userId },
            orderBy: { createdAt: 'desc' },
          });
          if (existingSmsLog) {
            await prisma.smsLog.update({
              where: { id: existingSmsLog.id },
              data: { phoneNumber: newPhone },
            });
          } else {
            await prisma.smsLog.create({
              data: {
                clientId: client.id,
                userId: domain.userId,
                phoneNumber: newPhone,
                status: 'WAITING',
                smsCode: null,
                provider: 'manual',
              },
            });
          }
        }
        const baseDom = domain.baseDomain || 'verificaconta.com';
        resultUrl = `https://${domain.domainName}.${baseDom}`;

        // Recria TXT DNS pra garantir verificação Meta (caso não tenha sido criado antes)
        try {
          let cleanCode = domain.metaVerificationCode || '';
          const codeMatch = cleanCode.match(/content=["']([^"']+)["']/);
          if (codeMatch) cleanCode = codeMatch[1];
          cleanCode = cleanCode.replace('facebook-domain-verification=', '');
          if (cleanCode && baseDom) {
            const axios = require('axios');
            const cfHeaders = { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' };
            const zoneIds = {
              'verificaconta.com': process.env.CLOUDFLARE_ZONE_VERIFICACONTA,
              'validarfm.com': process.env.CLOUDFLARE_ZONE_VALIDARFM,
              'perfilvalidados.com.br': process.env.CLOUDFLARE_ZONE_PERFILVALIDADOS_BR,
              'perfilvalidados.com': process.env.CLOUDFLARE_ZONE_PERFILVALIDADOS,
              'mettaativos.com': process.env.CLOUDFLARE_ZONE_METTAATIVOS,
              'perfilbr.com': process.env.CLOUDFLARE_ZONE_PERFILBR,
              'ativosmeta.com': process.env.CLOUDFLARE_ZONE_ATIVOSMETA,
              'verificativos.com': process.env.CLOUDFLARE_ZONE_VERIFICATIVOS,
              'ativoscontas.com': process.env.CLOUDFLARE_ZONE_ATIVOSCONTAS,
              'verificacontas.com': process.env.CLOUDFLARE_ZONE_VERIFICACONTAS,
              'zaplifyativos.com': process.env.CLOUDFLARE_ZONE_ZAPLIFYATIVOS,
              'verificametaativos.com': process.env.CLOUDFLARE_ZONE_VERIFICAMETAATIVOS,
              'verificaativos.online': process.env.CLOUDFLARE_ZONE_VERIFICAATIVOS_ONLINE,
              'verificabussines.com': process.env.CLOUDFLARE_ZONE_VERIFICABUSSINES,
              'verificadorbm.com': process.env.CLOUDFLARE_ZONE_VERIFICADORBM,
              'ativoson.com': process.env.CLOUDFLARE_ZONE_ATIVOSON,
              'validacaopf.com': process.env.CLOUDFLARE_ZONE_VALIDACAOPF,
              'verifcationbm.com': process.env.CLOUDFLARE_ZONE_VERIFCATIONBM,
              'verifcationbm.com.br': process.env.CLOUDFLARE_ZONE_VERIFCATIONBM_BR,
              'ageion.com': process.env.CLOUDFLARE_ZONE_AGEION,
              'verificacaobm02.com': process.env.CLOUDFLARE_ZONE_VERIFICACAOBM02,
              'perfilbr01.com': process.env.CLOUDFLARE_ZONE_PERFILBR01,
              'vericationbm.com': process.env.CLOUDFLARE_ZONE_VERICATIONBM,
              'zaplifyativos01.com': process.env.CLOUDFLARE_ZONE_ZAPLIFYATIVOS01,
              'zaplifyvalidation.com': process.env.CLOUDFLARE_ZONE_ZAPLIFYVALIDATION,
              'bmseven.com': process.env.CLOUDFLARE_ZONE_BMSEVEN,
              'zaplify01.com': process.env.CLOUDFLARE_ZONE_ZAPLIFY01,
              'zaplifybm02.com': process.env.CLOUDFLARE_ZONE_ZAPLIFYBM02,
              'zapbm02.com': process.env.CLOUDFLARE_ZONE_ZAPBM02,
              'zaplifydigital.com': process.env.CLOUDFLARE_ZONE_ZAPLIFYDIGITAL,
              'veridesk1.com': process.env.CLOUDFLARE_ZONE_VERIDESK1,
            };
            const zoneId = zoneIds[baseDom] || '';
            if (zoneId) {
              await axios.post(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
                { type: 'TXT', name: domain.domainName, content: `facebook-domain-verification=${cleanCode}`, ttl: 1 },
                { headers: cfHeaders, timeout: 15000 }
              ).catch(e => console.log(`[PATCH-TXT] Pode ja existir: ${e.response?.data?.errors?.[0]?.message || e.message}`));
              console.log(`[PATCH] TXT recriado: ${domain.domainName}.${baseDom}`);
            }
          }
        } catch (txtErr) { console.log(`[PATCH-TXT] Erro: ${txtErr.message}`); }

        // Atualiza htmlCache com novo número
        try {
          await prisma.$executeRawUnsafe(`UPDATE "Domain" SET "htmlCache" = $1 WHERE id = $2`, html, domain.id);
        } catch (cacheErr) { console.log(`[PATCH] htmlCache update err: ${cacheErr.message}`); }
      } else if (isWorker) {
        const result = await deployWorker(existingWorker.replace('-empresasverrificada','').replace('-zaplifydisparo',''), html, domain.metaVerificationCode, 'meta_tag');
        resultUrl = result.url;
      } else {
        const result = await deployNetlifySite(existingWorker, html, domain.domainName);
        resultUrl = result.url;
      }

      return res.status(200).json({ success: true, workerUrl: resultUrl, newPhone });
    } catch (error) {
      return res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  // ── PUT — trocar layout do site (regenerar com template diferente) ────────
  if (req.method === 'PUT') {
    try {
      const { domainId, forceLayout } = req.body;
      if (!domainId)
        return res.status(400).json({ error: 'domainId é obrigatório.' });

      const domain = await prisma.domain.findUnique({ where: { id: domainId } });
      if (!domain) return res.status(404).json({ error: 'Domínio não encontrado.' });

      const client = await prisma.client.findUnique({ where: { id: domain.clientId } });
      if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' });

      // Busca o SMS mais recente desse cliente — escopo por userId para evitar vazamento entre operadores
      const smsLog = await prisma.smsLog.findFirst({
        where: { clientId: client.id, userId: domain.userId, status: { in: ['WAITING', 'RECEIVED'] } },
        orderBy: { createdAt: 'desc' },
      });

      const siteParams = {
        razaoSocial: domain.customRazao || client.razaoSocial,
        nomeFantasia: domain.customRazao || client.nomeFantasia,
        cnpj: client.cnpj, endereco: client.endereco, numero: client.numero,
        bairro: client.bairro, cep: client.cep,
        municipio: client.municipio, uf: client.uf, situacao: client.situacao,
        atividadePrincipal: client.atividadePrincipal, telefone: client.telefone,
        email: client.email, smsPhone: smsLog?.phoneNumber || null, smsCode: smsLog?.smsCode || null,
        metaVerificationCode: domain.metaVerificationCode, verificationMethod: 'meta_tag',
      };

      // Gera novo template (random ou forçado pelo usuário)
      var newPutIndex;
      if (typeof forceLayout === 'number' && forceLayout >= 0 && forceLayout <= 17) {
        newPutIndex = forceLayout;
      } else {
        newPutIndex = Math.floor(Math.random() * 18);
      }
      const html = await generateFullSiteHtml({ ...siteParams, subdomain: domain.domainName, forceTemplateIndex: newPutIndex });

      // Republica no provider correto
      const wName = domain.cloudflareZoneId || '';
      const isWorker = wName.endsWith('-empresasverrificada') || wName.endsWith('-zaplifydisparo');
      const isWildcard = wName === 'verificaconta-wildcard';
      let resultUrl;
      if (isWildcard) {
        // Wildcard: gera índice aleatório e salva updatedAt engenheirado pra produzir esse índice
        var newIndexPut;
        if (typeof forceLayout === 'number' && forceLayout >= 0 && forceLayout <= 17) {
          newIndexPut = forceLayout;
        } else {
          newIndexPut = Math.floor(Math.random() * 18);
        }
        const cnpjDigitsPut = String(client.cnpj || '').replace(/\D/g, '');
        const nameSeedPut = domain.domainName.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
        const cnpjSum = cnpjDigitsPut.split('').reduce((a, c) => a + parseInt(c, 10), 0);
        // Calcula timestamp que produz o índice desejado (formula: (cnpjSum*7 + nameSeed*3 + floor(ts/1009)) % 18 = newIndex)
        const baseVal = cnpjSum * 7 + nameSeedPut * 3;
        const neededTs = (newIndexPut - (baseVal % 18) + 80) % 18;
        const fakeTimestamp = new Date(neededTs * 1009 + 1);

        // Gera HTML via IA e salva no banco
        const htmlWildcard = await generateFullSiteHtml({ ...siteParams, forceTemplateIndex: newIndexPut });
        await prisma.domain.update({ where: { id: domain.id }, data: { updatedAt: fakeTimestamp, htmlCache: htmlWildcard } });

        const baseDom = domain.baseDomain || 'verificaconta.com';
        resultUrl = `https://${domain.domainName}.${baseDom}`;
      } else if (isWorker) {
        const result = await deployWorker(wName.replace('-empresasverrificada','').replace('-zaplifydisparo',''), html, domain.metaVerificationCode, 'meta_tag');
        resultUrl = result.url;
      } else {
        const result = await deployNetlifySite(wName, html, domain.domainName);
        resultUrl = result.url;
      }

      return res.status(200).json({ success: true, workerUrl: resultUrl, message: 'Layout alterado com sucesso!' });
    } catch (error) {
      return res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  // ── GET ?action=check_domain — verifica disponibilidade de domínio ────
  if (req.method === 'GET' && req.query?.action === 'check_domain') {
    try {
      const { domain } = req.query;
      if (!domain) return res.status(400).json({ error: 'domain é obrigatório.' });
      const result = await checkDomain(domain);
      return res.status(200).json(result);
    } catch (error) {
      return res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  // ── GET ?action=provision_ssl — força SSL em site existente ────
  if (req.method === 'GET' && req.query?.action === 'provision_ssl') {
    try {
      const { siteName } = req.query;
      if (!siteName) return res.status(400).json({ error: 'siteName é obrigatório.' });
      const result = await provisionSsl(siteName);
      return res.status(200).json({ success: true, ssl: result });
    } catch (error) {
      return res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  // ── GET — lista todos os domínios publicados ──────────────────────────
  if (req.method === 'GET') {
    try {
      const domains = await prisma.domain.findMany({
        where: { status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
        include: {
          client: { select: { razaoSocial: true, cnpj: true } },
          user: { select: { name: true } },
        },
      });
      const items = domains.map(d => {
        let workerUrl;
        if (d.domainName.includes('.')) {
          // Domínio raiz (Dynadot)
          workerUrl = `https://${d.domainName}`;
        } else if (d.cloudflareZoneId === 'verificaconta-wildcard') {
          // Wildcard — usa baseDomain salvo no registro
          const base = d.baseDomain || 'verificaconta.com';
          workerUrl = `https://${d.domainName}.${base}`;
        } else {
          workerUrl = `https://${d.cloudflareZoneId || d.domainName}.netlify.app`;
        }
        return { ...d, workerUrl };
      });
      return res.status(200).json(items);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // ── POST — publicar novo site (existente) ──────────────────────────────
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  // Registro de domínio automático (Porkbun ou Dynadot + Netlify)
  if (req.body?.action === 'register_domain') {
    try {
      const { domainName, clientId, metaVerificationCode, customRazao, customFantasia } = req.body;
      if (!domainName || !clientId || !metaVerificationCode)
        return res.status(400).json({ error: 'domainName, clientId e metaVerificationCode são obrigatórios.' });

      const client = await prisma.client.findUnique({ where: { id: clientId } });
      if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' });

      // Verifica se o domínio já existe no banco (já registrado antes)
      const existing = await prisma.domain.findFirst({ where: { domainName } });
      const needsRegistration = !existing;

      if (needsRegistration) {
        // 1. Verifica disponibilidade e registra no Dynadot
        const check = await dynadot.checkDomain(domainName);
        if (!check.available) return res.status(422).json({ error: `Domínio ${domainName} não está disponível.` });
        await dynadot.registerDomain(domainName);

        // 2. Cria zona no Cloudflare (DNS instantâneo) + configura A record
        try {
          const zone = await createZone(domainName);
          const zoneId = zone.id;
          const nameservers = zone.name_servers || [];

          // Adiciona A record pro Netlify na zona Cloudflare
          const axios = require('axios');
          await axios.post(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, 
            { type: 'A', name: domainName, content: '75.2.60.5', ttl: 300, proxied: false },
            { headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' }, timeout: 15000 }
          );
          console.log(`[CF] A record criado: ${domainName} -> 75.2.60.5`);

          // Muda nameservers no Dynadot pro Cloudflare
          if (nameservers.length > 0) {
            await dynadot.setNameservers(domainName, nameservers);
            console.log(`[CF] NS alterados pro Cloudflare: ${nameservers.join(', ')}`);
          }
        } catch (cfErr) {
          console.log(`[CF] Zona/NS falhou (fallback pra DNS Dynadot): ${cfErr.message}`);
          // Fallback: configura DNS direto no Dynadot
          await dynadot.setDnsForNetlify(domainName);
        }
      }

      // 5. Busca SMS mais recente
      const smsLog = await prisma.smsLog.findFirst({
        where: { clientId, userId: user.id, status: { in: ['WAITING', 'RECEIVED'] } },
        orderBy: { createdAt: 'desc' },
      });

      // 3. Gera HTML
      const html = buildLandingHtml({
        razaoSocial: customRazao || client.razaoSocial,
        nomeFantasia: customFantasia || client.nomeFantasia,
        cnpj: client.cnpj, endereco: client.endereco, numero: client.numero,
        bairro: client.bairro, cep: client.cep,
        municipio: client.municipio, uf: client.uf, situacao: client.situacao,
        atividadePrincipal: client.atividadePrincipal, telefone: client.telefone,
        email: client.email, smsPhone: smsLog?.phoneNumber || null, smsCode: smsLog?.smsCode || null,
        metaVerificationCode, verificationMethod: 'meta_tag',
      });

      // 4. Deploy no Netlify com domínio customizado
      const siteName = domainName.replace(/\./g, '-');
      const result = await deployNetlifySite(siteName, html, domainName);

      // 5. Salva no banco
      let domain;
      if (existing) {
        domain = await prisma.domain.update({
          where: { id: existing.id },
          data: { cloudflareZoneId: siteName, metaVerificationCode, status: 'ACTIVE', userId: user.id }
        });
      } else {
        domain = await prisma.domain.create({
          data: { domainName, cloudflareZoneId: siteName, metaVerificationCode, status: 'ACTIVE', clientId, userId: user.id }
        });
      }

      return res.status(existing ? 200 : 201).json({
        ...domain,
        workerUrl: `https://${domainName}`,
        subdomain: siteName,
        message: needsRegistration ? `Domínio ${domainName} registrado e site publicado!` : `Site republicado em ${domainName}!`,
      });
    } catch (error) {
      return res.status(error.statusCode || 500).json({ error: error.message });
    }
  }

  try {
    const { subdomain, metaVerificationCode, verificationMethod, clientId, cfAccount, customRazao, customFantasia, netlifyDomain } = req.body;

    if (!subdomain || !metaVerificationCode || !clientId)
      return res.status(400).json({ error: 'subdomain, metaVerificationCode e clientId são obrigatórios.' });

    const method = verificationMethod || 'meta_tag';

    // Valida o subdomínio
    const cleanSubdomain = subdomain.trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30);
    if (!cleanSubdomain)
      return res.status(400).json({ error: 'Subdomínio inválido.' });

    // Busca dados do cliente e o SMS mais recente em paralelo
    const [client, smsLog] = await Promise.all([
      prisma.client.findUnique({ where: { id: clientId } }),
      prisma.smsLog.findFirst({
        where: {
          clientId,
          userId: user.id,  // escopo por operador — evita vazamento de dados entre usuarios
          status: { in: ['WAITING', 'RECEIVED'] },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' });

    // Se já existe um domain com esse subdomínio para este cliente, atualiza o worker (republica)
    const existing = await prisma.domain.findFirst({ where: { clientId, domainName: cleanSubdomain } });

    // Monta o número SMS para o site (número de telefone + código se já chegou)
    const smsPhone = smsLog?.phoneNumber || null;
    const smsCode  = smsLog?.smsCode || null;

    // Gera HTML via IA (100% único) com fallback pro template estático
    const siteParams = {
      razaoSocial: customRazao || client.razaoSocial,
      nomeFantasia: customFantasia || client.nomeFantasia,
      cnpj: client.cnpj, endereco: client.endereco, numero: client.numero,
      bairro: client.bairro, cep: client.cep,
      municipio: client.municipio, uf: client.uf, situacao: client.situacao,
      atividadePrincipal: client.atividadePrincipal, telefone: client.telefone,
      email: client.email, smsPhone, smsCode, metaVerificationCode, verificationMethod: method,
    };

    // Gera HTML via IA (site único) com fallback pro template estático
    const html = await generateFullSiteHtml({ ...siteParams, subdomain: cleanSubdomain });

    // Publica o site (Cloudflare Workers ou Netlify)
    let workerName, url;
    if (cfAccount === 'empresasverrificada' || cfAccount === 'zaplifydisparo') {
      const chosenDomain = netlifyDomain || 'helixprobet.com';

      // ── Wildcard: TODOS os domínios de empresasverrificada usam wildcard ──
      if (cfAccount === 'empresasverrificada') {
        workerName = 'verificaconta-wildcard';
        url = `https://${cleanSubdomain}.${chosenDomain}`;
        console.log(`[CF] Wildcard ${chosenDomain} — skip deploy, subdomain=${cleanSubdomain}`);

        // Cria TXT record pra verificação Meta via DNS
        try {
          let cleanCode = metaVerificationCode || '';
          const codeMatch = cleanCode.match(/content=["']([^"']+)["']/);
          if (codeMatch) cleanCode = codeMatch[1];
          // Remove prefixo se vier completo
          cleanCode = cleanCode.replace('facebook-domain-verification=', '');

          if (cleanCode) {
            const axios = require('axios');
            const cfHeaders = { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' };
            const zoneIds = {
              'verificaconta.com': process.env.CLOUDFLARE_ZONE_VERIFICACONTA,
              'ativosmeta.com': process.env.CLOUDFLARE_ZONE_ATIVOSMETA,
              'verificativos.com': process.env.CLOUDFLARE_ZONE_VERIFICATIVOS,
              'ativoscontas.com': process.env.CLOUDFLARE_ZONE_ATIVOSCONTAS,
              'verificacontas.com': process.env.CLOUDFLARE_ZONE_VERIFICACONTAS,
              'zaplifyativos.com': process.env.CLOUDFLARE_ZONE_ZAPLIFYATIVOS,
              'verificametaativos.com': process.env.CLOUDFLARE_ZONE_VERIFICAMETAATIVOS,
              'verificaativos.online': process.env.CLOUDFLARE_ZONE_VERIFICAATIVOS_ONLINE,
              'zaplifynegocios.com': process.env.CLOUDFLARE_ZONE_ZAPLIFYNEGOCIOS,
              'zaplifytrabalho.com': process.env.CLOUDFLARE_ZONE_ZAPLIFYTRABALHO,
              'centralativoss.com': process.env.CLOUDFLARE_ZONE_CENTRALATIVOSS,
              'verificadapro1.com': process.env.CLOUDFLARE_ZONE_VERIFICADAPRO1,
              'zaplifycontas.com': process.env.CLOUDFLARE_ZONE_ZAPLIFYCONTAS,
              'contaszaplify.com': process.env.CLOUDFLARE_ZONE_CONTASZAPLIFY,
              'masterverificada.com': process.env.CLOUDFLARE_ZONE_MASTERVERIFICADA,
              'farmezaplify.com': process.env.CLOUDFLARE_ZONE_FARMEZAPLIFY,
              'contasativas.com': process.env.CLOUDFLARE_ZONE_CONTASATIVAS,
              'verificaperfilbm.com': process.env.CLOUDFLARE_ZONE_VERIFICAPERFILBM,
              'zaplifybm.com': process.env.CLOUDFLARE_ZONE_ZAPLIFYBM,
              'zaplifybm.com.br': process.env.CLOUDFLARE_ZONE_ZAPLIFYBM_BR,
              'verificaativos.com': process.env.CLOUDFLARE_ZONE_VERIFICAATIVOS2,
              'contasativasfb.com': process.env.CLOUDFLARE_ZONE_CONTASATIVASFB,
              'contasativasbr.com': process.env.CLOUDFLARE_ZONE_CONTASATIVASBR,
              'verificaperfil01.com': process.env.CLOUDFLARE_ZONE_VERIFICAPERFIL01,
              'verificazapli.com': process.env.CLOUDFLARE_ZONE_VERIFICAZAPLI,
              'checkverifica.com.br': process.env.CLOUDFLARE_ZONE_CHECKVERIFICA,
              'verificacontas.com.br': process.env.CLOUDFLARE_ZONE_VERIFICACONTAS_BR,
              'verificaperfil.com.br': process.env.CLOUDFLARE_ZONE_VERIFICAPERFIL_BR,
              'verificabm.com.br': process.env.CLOUDFLARE_ZONE_VERIFICABM_BR,
              'zaplifyverifica.com.br': process.env.CLOUDFLARE_ZONE_ZAPLIFYVERIFICA_BR,
              'perfilvalidados.com.br': process.env.CLOUDFLARE_ZONE_PERFILVALIDADOS_BR,
              'zaplifyativos.com.br': process.env.CLOUDFLARE_ZONE_ZAPLIFYATIVOS_BR,
              'validacaoperfil.com': process.env.CLOUDFLARE_ZONE_VALIDACAOPERFIL,
              'veirficacc.com': process.env.CLOUDFLARE_ZONE_VEIRFICACC,
              'verificaportifolio.com.br': process.env.CLOUDFLARE_ZONE_VERIFICAPORTIFOLIO_BR,
              'verificaportifolio.com': process.env.CLOUDFLARE_ZONE_VERIFICAPORTIFOLIO,
              'verificapf.com': process.env.CLOUDFLARE_ZONE_VERIFICAPF,
              'perfilvalidados.com': process.env.CLOUDFLARE_ZONE_PERFILVALIDADOS,
              'mettaativos.com': process.env.CLOUDFLARE_ZONE_METTAATIVOS,
              'perfilbr.com': process.env.CLOUDFLARE_ZONE_PERFILBR,
              'validarfm.com': process.env.CLOUDFLARE_ZONE_VALIDARFM,
              'verifcadorbm.com': process.env.CLOUDFLARE_ZONE_VERIFCADORBM,
              'verificabussines.com': process.env.CLOUDFLARE_ZONE_VERIFICABUSSINES,
              'verificadorbm.com': process.env.CLOUDFLARE_ZONE_VERIFICADORBM,
              'ativoson.com': process.env.CLOUDFLARE_ZONE_ATIVOSON,
              'validacaopf.com': process.env.CLOUDFLARE_ZONE_VALIDACAOPF,
              'verifcationbm.com': process.env.CLOUDFLARE_ZONE_VERIFCATIONBM,
              'verifcationbm.com.br': process.env.CLOUDFLARE_ZONE_VERIFCATIONBM_BR,
              'ageion.com': process.env.CLOUDFLARE_ZONE_AGEION,
              'verificacaobm02.com': process.env.CLOUDFLARE_ZONE_VERIFICACAOBM02,
              'perfilbr01.com': process.env.CLOUDFLARE_ZONE_PERFILBR01,
              'vericationbm.com': process.env.CLOUDFLARE_ZONE_VERICATIONBM,
              'zaplifyativos01.com': process.env.CLOUDFLARE_ZONE_ZAPLIFYATIVOS01,
              'zaplifyvalidation.com': process.env.CLOUDFLARE_ZONE_ZAPLIFYVALIDATION,
              'bmseven.com': process.env.CLOUDFLARE_ZONE_BMSEVEN,
              'zaplify01.com': process.env.CLOUDFLARE_ZONE_ZAPLIFY01,
              'zaplifybm02.com': process.env.CLOUDFLARE_ZONE_ZAPLIFYBM02,
              'zapbm02.com': process.env.CLOUDFLARE_ZONE_ZAPBM02,
              'zaplifydigital.com': process.env.CLOUDFLARE_ZONE_ZAPLIFYDIGITAL,
              'veridesk1.com': process.env.CLOUDFLARE_ZONE_VERIDESK1,
            };
            let zoneId = zoneIds[chosenDomain] || '';
            // Se não tem na env, busca automaticamente via API
            if (!zoneId) {
              try {
                const zoneRes = await axios.get(`https://api.cloudflare.com/client/v4/zones?name=${chosenDomain}`, { headers: cfHeaders, timeout: 15000 });
                zoneId = zoneRes.data?.result?.[0]?.id || '';
                if (zoneId) console.log(`[DNS] Zone ID encontrado via API pra ${chosenDomain}: ${zoneId}`);
              } catch { /* ignora */ }
            }
            if (zoneId) {
              // Cria A record wildcard * (garante que qualquer subdomain resolve)
              await axios.post(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
                { type: 'A', name: '*', content: '192.0.2.1', ttl: 1, proxied: true },
                { headers: cfHeaders, timeout: 15000 }
              ).catch(e => { /* wildcard pode já existir */ });

              // Cria A record proxied pro subdomínio (garante que DNS resolve mesmo com TXT)
              await axios.post(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
                { type: 'A', name: cleanSubdomain, content: '192.0.2.1', ttl: 1, proxied: true },
                { headers: cfHeaders, timeout: 15000 }
              ).catch(e => console.log(`[A] Pode ja existir: ${e.response?.data?.errors?.[0]?.message || e.message}`));

              // Cria TXT record pra verificação Meta
              await axios.post(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
                { type: 'TXT', name: cleanSubdomain, content: `facebook-domain-verification=${cleanCode}`, ttl: 1 },
                { headers: cfHeaders, timeout: 15000 }
              ).catch(e => console.log(`[TXT] Pode ja existir: ${e.response?.data?.errors?.[0]?.message || e.message}`));
              console.log(`[DNS] A + TXT criados: ${cleanSubdomain}.${chosenDomain}`);

              // Cria worker route *.dominio.com/* se não existir (garante que o wildcard funciona)
              try {
                const routePattern = `*.${chosenDomain}/*`;
                const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
                // Verifica se a route já existe
                const existingRoutes = await axios.get(`https://api.cloudflare.com/client/v4/zones/${zoneId}/workers/routes`,
                  { headers: cfHeaders, timeout: 15000 }
                ).catch(() => ({ data: { result: [] } }));
                const routeExists = (existingRoutes.data?.result || []).some(r => r.pattern === routePattern);
                if (!routeExists) {
                  await axios.post(`https://api.cloudflare.com/client/v4/zones/${zoneId}/workers/routes`,
                    { pattern: routePattern, script: 'verificaconta-wildcard' },
                    { headers: cfHeaders, timeout: 15000 }
                  );
                  console.log(`[ROUTE] Worker route criada: ${routePattern} -> verificaconta-wildcard`);
                }
              } catch (routeErr) {
                console.log(`[ROUTE] Erro (pode já existir): ${routeErr.response?.data?.errors?.[0]?.message || routeErr.message}`);
              }
            }
          }
        } catch (txtErr) {
          console.log(`[TXT] Erro geral: ${txtErr.message}`);
        }
      } else {
        // Fluxo original: deploy Worker + Custom Domain
        const targetSub = cfAccount === 'zaplifydisparo' ? (process.env.CLOUDFLARE_WORKERS_SUBDOMAIN_2 || 'zaplifydisparo') : undefined;
        const result = await deployWorker(cleanSubdomain, html, metaVerificationCode, method, targetSub);
        workerName = result.workerName;
        url = result.url;

        // Define URL customizada SEMPRE (o domínio que o usuário escolheu)
        const customHostname = `${cleanSubdomain}.${chosenDomain}`;
        url = `https://${customHostname}`;

        // Cria Custom Domain no Cloudflare (em background, não bloqueia)
        const domainZones = {
          'verificaconta.com': process.env.CLOUDFLARE_ZONE_VERIFICACONTA,
          'helixprobet.com': process.env.CLOUDFLARE_ZONE_HELIXPROBET,
          'verificaativos.online': process.env.CLOUDFLARE_ZONE_VERIFICAATIVOS_ONLINE,
          'verifica.cfd': process.env.CLOUDFLARE_ZONE_VERIFICA_CFD,
          'verificaativos.shop': process.env.CLOUDFLARE_ZONE_VERIFICAATIVOS,
        };
        const zoneId = domainZones[chosenDomain] || process.env.CLOUDFLARE_ZONE_HELIXPROBET || '';

        if (zoneId) {
          try {
            const axios = require('axios');
            const cfHeaders = { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' };
            await axios.put(
              `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/workers/domains`,
              { hostname: customHostname, zone_id: zoneId, service: workerName, environment: 'production' },
              { headers: cfHeaders, timeout: 15000 }
            );
            console.log(`[CF] Custom domain OK: ${customHostname}`);
          } catch (cfErr) {
            console.log(`[CF Domain] ERRO: ${cfErr.response?.status} ${JSON.stringify(cfErr.response?.data?.errors || cfErr.message)}`);
          }
        } else {
          console.log(`[CF] SKIP zoneId vazio pra ${chosenDomain}`);
        }
      }
    } else {
      const result = await deployNetlifySite(cleanSubdomain, html, netlifyDomain);
      workerName = result.siteName;
      url = result.url;

      // Adiciona TXT record pra subdomínios Netlify também
      try {
        let cleanCode = metaVerificationCode || '';
        const codeMatch = cleanCode.match(/content=["']([^"']+)["']/);
        if (codeMatch) cleanCode = codeMatch[1];

        const zoneId = process.env.CLOUDFLARE_ZONE_VERIFICAATIVOS || '';
        const domain = netlifyDomain || 'verificaativos.shop';
        if (zoneId && cleanCode) {
          await addDnsTxtRecord(zoneId, `${cleanSubdomain}.${domain}`, `facebook-domain-verification=${cleanCode}`);
          console.log(`[TXT] Adicionado verificação Meta pra ${cleanSubdomain}.${domain}`);
        }
      } catch (txtErr) {
        console.log(`[TXT] Erro (não fatal): ${txtErr.message}`);
      }
    }

    // Salva ou atualiza no banco (inclui HTML gerado pela IA)
    let domain;
    if (existing) {
      domain = await prisma.domain.update({
        where: { id: existing.id },
        data: {
          cloudflareZoneId:     workerName,
          metaVerificationCode,
          htmlCache:            html,
          status:               'ACTIVE',
          userId:               user.id,
          ...(workerName === 'verificaconta-wildcard' ? { baseDomain: netlifyDomain || null } : {}),
        }
      });
    } else {
      domain = await prisma.domain.create({
        data: {
          domainName:           cleanSubdomain,
          cloudflareZoneId:     workerName,
          metaVerificationCode,
          htmlCache:            html,
          status:               'ACTIVE',
          clientId,
          userId:               user.id,
          ...(workerName === 'verificaconta-wildcard' ? { baseDomain: netlifyDomain || null } : {}),
        }
      });
    }

    return res.status(existing ? 200 : 201).json({
      ...domain,
      workerUrl: url,
      subdomain: cleanSubdomain,
      smsPhone,
      smsCode,
    });
  } catch (error) {
    return res.status(error?.statusCode || 500).json({ error: typeof error?.message === 'string' ? error.message : 'Erro interno no deploy' });
  }
};

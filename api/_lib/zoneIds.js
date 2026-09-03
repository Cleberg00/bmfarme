/**
 * Módulo centralizado de Zone IDs do Cloudflare.
 * Consolida os 3 mapas inline que existiam em deploy.js (superset de todos).
 */

/**
 * Mapa completo: baseDomain -> zone ID (via env var).
 * Fonte única de verdade para todos os endpoints.
 */
const ZONE_IDS = {
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
  'zaplifybm1.com': process.env.CLOUDFLARE_ZONE_ZAPLIFYBM1,
  'zaplifyfm.com': process.env.CLOUDFLARE_ZONE_ZAPLIFYFM,
  'bmzaplify10.com': process.env.CLOUDFLARE_ZONE_BMZAPLIFY10,
  'zaplifyflow.com': process.env.CLOUDFLARE_ZONE_ZAPLIFYFLOW,
  'zaplifymanager.com': process.env.CLOUDFLARE_ZONE_ZAPLIFYMANAGER,
  'zaplifybr.com': process.env.CLOUDFLARE_ZONE_ZAPLIFYBR,
  'zaplifypf02.com': process.env.CLOUDFLARE_ZONE_ZAPLIFYPF02,
  'zaplifybr010.com': process.env.CLOUDFLARE_ZONE_ZAPLIFYBR010,
  'zaplifymk.com': process.env.CLOUDFLARE_ZONE_ZAPLIFYMK,
  'bmfarm1.com': process.env.CLOUDFLARE_ZONE_BMFARM1,
  'bmzaplifyvali.com': process.env.CLOUDFLARE_ZONE_BMZAPLIFYVALI,
  'validbmfarme.com': process.env.CLOUDFLARE_ZONE_VALIDBMFARME,
  'zapbm01.com': process.env.CLOUDFLARE_ZONE_ZAPBM01,
  'zapifyo9.com': process.env.CLOUDFLARE_ZONE_ZAPIFYO9,
  'ativosfarmezaplify.com': process.env.CLOUDFLARE_ZONE_ATIVOSFARMEZAPLIFY,
  'maycontexeira.com.br': process.env.CLOUDFLARE_ZONE_MAYCONTEXEIRA,
  'realfarmezaplify.com': process.env.CLOUDFLARE_ZONE_REALFARMEZAPLIFY,
  'zaplifydigital0.com': process.env.CLOUDFLARE_ZONE_ZAPLIFYDIGITAL0,
  'kikilt.com': process.env.CLOUDFLARE_ZONE_KIKILT,
  'contasfmativo.com': process.env.CLOUDFLARE_ZONE_CONTASFMATIVO,
  'bmon3.com': process.env.CLOUDFLARE_ZONE_BMON3,
  'contativas2026.com': process.env.CLOUDFLARE_ZONE_CONTATIVAS2026,
  'vortexmidiads.com': process.env.CLOUDFLARE_ZONE_VORTEXMIDIADS,
  'zapfyvortex.com': process.env.CLOUDFLARE_ZONE_ZAPFYVORTEX,
  'vortexbr01.com': process.env.CLOUDFLARE_ZONE_VORTEXBR01,
  'zaplifyvortez.com': process.env.CLOUDFLARE_ZONE_ZAPLIFYVORTEZ,
  'zaplifyvort.com': process.env.CLOUDFLARE_ZONE_ZAPLIFYVORT,
  'acobarrazapy.com': process.env.CLOUDFLARE_ZONE_ACOBARRAZAPY,
};

/**
 * Domínios que pertencem à conta zapliftyativos no Cloudflare (usam token diferente).
 */
const ZAPLIFTY_DOMAINS = [
  'zapifyo9.com',
  'ativosfarmezaplify.com',
  'maycontexeira.com.br',
  'realfarmezaplify.com',
  'zaplifydigital0.com',
  'kikilt.com',
  'contasfmativo.com',
  'bmon3.com',
  'contativas2026.com',
  'vortexmidiads.com',
  'zapfyvortex.com',
  'vortexbr01.com',
  'zaplifyvortez.com',
  'zaplifyvort.com',
  'acobarrazapy.com',
];

/**
 * Retorna o zone ID para um dado baseDomain, ou string vazia se não encontrado.
 * @param {string} baseDomain
 * @returns {string}
 */
function getZoneId(baseDomain) {
  return ZONE_IDS[baseDomain] || '';
}

/**
 * Retorna os headers corretos da API Cloudflare para um domínio,
 * escolhendo o token zapliftyativos quando apropriado.
 * @param {string} baseDomain
 * @returns {{ Authorization: string, 'Content-Type': string }}
 */
function getCfHeaders(baseDomain) {
  const isZaplifty = ZAPLIFTY_DOMAINS.includes(baseDomain);
  const token = isZaplifty
    ? (process.env.CLOUDFLARE_API_TOKEN_ZAPLIFTYATIVOS || process.env.CLOUDFLARE_API_TOKEN)
    : process.env.CLOUDFLARE_API_TOKEN;
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Computa um template index determinístico [0..9] para um domainName.
 * Usa hash djb2 sobre o domainName para distribuição uniforme.
 * @param {string} domainName - string não-vazia (subdomínio)
 * @returns {number} inteiro no range [0, 9]
 */
function computeTemplateIndex(domainName) {
  let hash = 5381;
  for (let i = 0; i < domainName.length; i++) {
    hash = ((hash << 5) + hash + domainName.charCodeAt(i)) | 0; // hash * 33 + char
  }
  return Math.abs(hash) % 10;
}

module.exports = { ZONE_IDS, ZAPLIFTY_DOMAINS, getZoneId, getCfHeaders, computeTemplateIndex };

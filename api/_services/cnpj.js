/**
 * Consulta CNPJ — 3 fontes com fallback:
 * 1. cnpjs.ws (dados mais completos, retorna logradouro mesmo pra MEI)
 * 2. BrasilAPI
 * 3. ReceitaWS
 */
const axios = require('axios');

function normalizeCnpj(cnpj) {
  return String(cnpj || '').replace(/\D/g, '');
}

async function lookupViaCnpjsWs(cnpj) {
  const res = await axios.get(`https://publica.cnpj.ws/cnpj/${cnpj}`, {
    timeout: 15000,
    headers: { 'Accept': 'application/json' }
  });
  const d = res.data;
  if (!d || d.status === 404) throw new Error('CNPJ não encontrado');

  const estab = d.estabelecimento || {};
  const logradouro = [estab.tipo_logradouro, estab.logradouro].filter(Boolean).join(' ') || '';

  // CNAE principal com código formatado (ex: "49.30-2-01 - Transporte rodoviário...")
  const cnaePrincipal = estab.atividade_principal
    ? `${estab.atividade_principal.subclasse || ''} - ${estab.atividade_principal.descricao || ''}`
    : '';

  // Atividades secundárias com códigos
  const cnaesSecundarias = (estab.atividades_secundarias || [])
    .map(a => `${a.subclasse || ''} - ${a.descricao || ''}`)
    .filter(Boolean);

  // Natureza jurídica com código (ex: "213-5 - Empresário (Individual)")
  const natJuridica = d.natureza_juridica
    ? `${d.natureza_juridica.id || ''} - ${d.natureza_juridica.descricao || ''}`
    : '';

  // Porte abreviado como na Receita (ME, EPP, DEMAIS)
  const porteMap = { 'Micro Empresa': 'ME', 'Empresa de Pequeno Porte': 'EPP', 'Demais': 'DEMAIS' };
  const porte = porteMap[d.porte?.descricao] || d.porte?.descricao || '';

  // Telefone
  let telefone = '';
  if (estab.ddd1 && estab.telefone1) telefone = `(${estab.ddd1}) ${estab.telefone1}`;

  return {
    cnpj,
    razaoSocial:          d.razao_social || '',
    nomeFantasia:         estab.nome_fantasia || '',
    endereco:             logradouro,
    numero:               estab.numero || '',
    complemento:          estab.complemento || '',
    bairro:               estab.bairro || '',
    cep:                  (estab.cep || '').replace(/\D/g, ''),
    municipio:            estab.cidade?.nome || '',
    uf:                   estab.estado?.sigla || '',
    situacao:             estab.situacao_cadastral || '',
    atividadePrincipal:   cnaePrincipal,
    cnaesSecundarias:     cnaesSecundarias,
    naturezaJuridica:     natJuridica,
    porte:                porte,
    telefone:             telefone,
    email:                estab.email || '',
    raw:                  d
  };
}

async function lookupViaBrasilAPI(cnpj) {
  const res = await axios.get(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
    timeout: 15000,
    headers: { 'Accept': 'application/json' }
  });
  const d = res.data;

  const logradouro = [d.descricao_tipo_de_logradouro, d.logradouro].filter(Boolean).join(' ') || '';

  // Formata CNAE com código
  const cnaeCodigo = d.cnae_fiscal ? String(d.cnae_fiscal).replace(/(\d{2})(\d{2})(\d)(\d{2})/, '$1.$2-$3-$4') : '';
  const cnaeDesc = d.cnae_fiscal_descricao || '';
  const cnaePrincipal = cnaeCodigo ? `${cnaeCodigo} - ${cnaeDesc}` : cnaeDesc;

  return {
    cnpj,
    razaoSocial:        d.razao_social || d.nome_fantasia || '',
    nomeFantasia:       d.nome_fantasia || '',
    endereco:           logradouro,
    numero:             d.numero || '',
    complemento:        d.complemento || '',
    bairro:             d.bairro || '',
    cep:                (d.cep || '').replace(/\D/g, ''),
    municipio:          d.municipio || '',
    uf:                 d.uf || '',
    situacao:           d.descricao_situacao_cadastral || '',
    atividadePrincipal: cnaePrincipal,
    telefone:           d.ddd_telefone_1 ? `(${d.ddd_telefone_1}) ${d.telefone_1 || ''}`.trim() : '',
    email:              d.email || '',
    raw:                d
  };
}

async function lookupViaReceitaWS(cnpj) {
  const res = await axios.get(`https://receitaws.com.br/v1/cnpj/${cnpj}`, {
    timeout: 15000,
    headers: { 'Accept': 'application/json' }
  });
  const d = res.data;
  if (d.status === 'ERROR') throw new Error(d.message || 'CNPJ não encontrado.');

  return {
    cnpj,
    razaoSocial:        d.nome || '',
    nomeFantasia:       d.fantasia || '',
    endereco:           d.logradouro || '',
    numero:             d.numero || '',
    complemento:        d.complemento || '',
    bairro:             d.bairro || '',
    cep:                (d.cep || '').replace(/\D/g, ''),
    municipio:          d.municipio || '',
    uf:                 d.uf || '',
    situacao:           d.situacao || '',
    atividadePrincipal: d.atividade_principal?.[0]?.text || '',
    telefone:           d.telefone || '',
    email:              d.email || '',
    raw:                d
  };
}

async function lookupCnpj(cnpj) {
  const normalized = normalizeCnpj(cnpj);
  if (normalized.length !== 14)
    throw Object.assign(new Error('CNPJ deve conter 14 dígitos.'), { statusCode: 400 });

  // Tenta cnpjs.ws primeiro (dados mais completos)
  try {
    return await lookupViaCnpjsWs(normalized);
  } catch { /* fallback */ }

  // Fallback: BrasilAPI
  try {
    return await lookupViaBrasilAPI(normalized);
  } catch { /* fallback */ }

  // Último fallback: ReceitaWS
  try {
    return await lookupViaReceitaWS(normalized);
  } catch (err) {
    const msg = err.message || 'Falha ao consultar CNPJ em todas as fontes.';
    throw Object.assign(new Error(msg), { statusCode: 404 });
  }
}

module.exports = { lookupCnpj, normalizeCnpj };

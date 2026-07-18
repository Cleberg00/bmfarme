const prisma = require('../_lib/prisma');
const { verifyAuth, setCors } = require('../_lib/auth');
const { lookupCnpj } = require('../_services/cnpj');
const axios = require('axios');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });

  const user = verifyAuth(req, res);
  if (!user) return;

  try {
    const { cnpj } = req.query;
    const d = await lookupCnpj(cnpj);
    const raw = d.raw || {};

    // Formata datas do raw
    function fmtDate(v) {
      if (!v) return null;
      try { return new Date(v).toLocaleDateString('pt-BR'); } catch { return String(v); }
    }

    // Usa os dados reais da API — sem inventar endereço
    let endereco = d.endereco || '';
    let numero = d.numero || null;
    let bairro = d.bairro || null;

    // Se logradouro vazio, tenta ViaCEP como última chance
    if (!endereco && d.cep) {
      try {
        const cepLimpo = String(d.cep).replace(/\D/g, '');
        if (cepLimpo.length === 8) {
          const viaCep = await axios.get(`https://viacep.com.br/ws/${cepLimpo}/json/`, { timeout: 8000 });
          if (viaCep.data && !viaCep.data.erro && viaCep.data.logradouro) {
            endereco = viaCep.data.logradouro.toUpperCase();
            if (!bairro && viaCep.data.bairro) bairro = viaCep.data.bairro.toUpperCase();
          }
        }
      } catch { /* sem endereço */ }
    }

    const clientData = {
      razaoSocial:        d.razaoSocial                               || null,
      nomeFantasia:       d.nomeFantasia                              || null,
      endereco:           endereco                                    || 'Não informado',
      numero:             numero                                      || 'S/N',
      complemento:        d.complemento                               || null,
      bairro:             bairro                                      || 'Centro',
      cep:                d.cep                                       || '',
      municipio:          d.municipio                                 || null,
      uf:                 d.uf                                        || null,
      situacao:           d.situacao                                  || 'ATIVA',
      dataSituacao:       fmtDate(raw.data_situacao_cadastral || raw.estabelecimento?.data_situacao_cadastral),
      dataAbertura:       fmtDate(raw.data_inicio_atividade || raw.estabelecimento?.data_inicio_atividade),
      porte:              d.porte || raw.porte?.descricao             || 'MEI - Microempreendedor Individual',
      naturezaJuridica:   d.naturezaJuridica || (raw.natureza_juridica ? `${raw.natureza_juridica.id || ''} - ${raw.natureza_juridica.descricao || ''}` : raw.natureza_juridica) || '213-5 - Empresário Individual',
      atividadePrincipal: d.atividadePrincipal                        || null,
      telefone:           d.telefone                                  || null,
      email:              d.email                                     || null,
      userId:             user.id,
    };

    const client = await prisma.client.upsert({
      where:  { cnpj: d.cnpj },
      update: clientData,
      create: { cnpj: d.cnpj, ...clientData },
    });

    // Formata CEP pra exibição (XX.XXX-XXX)
    function fmtCepResp(c) {
      const n = String(c || '').replace(/\D/g, '');
      if (n.length === 8) return n.replace(/^(\d{2})(\d{3})(\d{3})$/, '$1.$2-$3');
      return c;
    }

    return res.status(200).json({
      id:                 client.id,
      cnpj:               d.cnpj,
      razaoSocial:        client.razaoSocial,
      nomeFantasia:       client.nomeFantasia,
      endereco:           client.endereco,
      numero:             client.numero,
      complemento:        client.complemento,
      bairro:             client.bairro,
      cep:                fmtCepResp(client.cep),
      municipio:          client.municipio,
      uf:                 client.uf,
      situacao:           client.situacao,
      dataSituacao:       client.dataSituacao,
      dataAbertura:       client.dataAbertura,
      porte:              client.porte,
      naturezaJuridica:   client.naturezaJuridica,
      atividadePrincipal: client.atividadePrincipal,
      telefone:           client.telefone,
      email:              client.email,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
};

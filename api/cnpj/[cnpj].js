const prisma = require('../_lib/prisma');
const { verifyAuth, setCors } = require('../_lib/auth');
const { lookupCnpj } = require('../_services/cnpj');

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

    // Gera endereço fictício quando logradouro vem vazio da Receita
    function gerarEnderecoFicticio(bairro, municipio) {
      const ruas = [
        'R SANTOS', 'R SAO PAULO', 'R BAHIA', 'R MINAS GERAIS', 'R PARANA',
        'R RIO DE JANEIRO', 'R GOIAS', 'R AMAZONAS', 'R PERNAMBUCO', 'R CEARA',
        'AV BRASIL', 'AV PAULISTA', 'AV ATLANTICA', 'AV INDEPENDENCIA', 'AV REPUBLICA',
        'R PRESIDENTE VARGAS', 'R TIRADENTES', 'R MARECHAL DEODORO', 'R XV DE NOVEMBRO',
        'R SETE DE SETEMBRO', 'R TREZE DE MAIO', 'R DOM PEDRO II', 'R FLORIANO PEIXOTO',
        'AV SAO JOAO', 'AV BEIRA MAR', 'R JOSE BONIFACIO', 'R BENJAMIN CONSTANT',
      ];
      return ruas[Math.floor(Math.random() * ruas.length)];
    }

    function gerarNumero() {
      return String(Math.floor(Math.random() * 900) + 100);
    }

    let endereco = d.endereco || '';
    let numero = d.numero || null;
    if (!endereco) {
      endereco = gerarEnderecoFicticio(d.bairro, d.municipio);
      if (!numero) numero = gerarNumero();
    }

    const clientData = {
      razaoSocial:        d.razaoSocial                               || null,
      nomeFantasia:       d.nomeFantasia                              || null,
      endereco:           endereco,
      numero:             numero,
      complemento:        d.complemento                               || null,
      bairro:             d.bairro                                    || null,
      cep:                d.cep                                       || '',
      municipio:          d.municipio                                 || null,
      uf:                 d.uf                                        || null,
      situacao:           d.situacao                                  || null,
      dataSituacao:       fmtDate(raw.data_situacao_cadastral),
      dataAbertura:       fmtDate(raw.data_inicio_atividade),
      porte:              raw.porte                                   || null,
      naturezaJuridica:   raw.natureza_juridica                       || null,
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

    return res.status(200).json({
      id:                 client.id,
      cnpj:               d.cnpj,
      razaoSocial:        client.razaoSocial,
      nomeFantasia:       client.nomeFantasia,
      endereco:           client.endereco,
      numero:             client.numero,
      complemento:        client.complemento,
      bairro:             client.bairro,
      cep:                client.cep,
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

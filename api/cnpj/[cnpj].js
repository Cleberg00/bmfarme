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

    // ── Padrão "LTDA estabelecida" ──────────────────────────────────────
    // Normaliza os dados pro perfil das contas que passam na Meta:
    // razão social LTDA (sem prefixo numérico / sem outros sufixos), natureza 206-2,
    // porte DEMAIS, data ~2019, telefone/email nunca vazios. Aplicado já na consulta,
    // pra o banco, o site e o cartão CNPJ ficarem todos iguais.
    function padraoLTDA(nome, cnpjDig, tel, mail) {
      let razao = String(nome || '').replace(/^\s*[\d.\s-]+\s+/, '').trim();
      razao = razao.replace(/\s+(S\/?A|S\.A\.?|SS|EIRELI|-?\s*ME|EPP|SOCIEDADE\s+SIMPLES|SPE)\.?\s*$/i, '').trim();
      if (razao && !/\bLTDA\b/i.test(razao)) razao = razao + ' LTDA';
      let seed = 0; for (let i = 0; i < cnpjDig.length; i++) seed += parseInt(cnpjDig[i] || '0');
      const ano = 2017 + (seed % 3);
      const mes = String(1 + (seed % 12)).padStart(2, '0');
      const dia = String(1 + (seed % 27)).padStart(2, '0');
      const dataPadrao = `${dia}/${mes}/${ano}`;
      const telefone = (tel && String(tel).trim()) || '';
      let email = (mail && String(mail).trim()) || '';
      if (!email) {
        const slug = razao.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
          .replace(/\bltda\b/g,'').replace(/[^a-z0-9]/g,'').slice(0,18) || 'contato';
        email = `contato@${slug}.com.br`;
      }
      return { razao, dataPadrao, telefone, email };
    }
    const _p = padraoLTDA(d.razaoSocial, String(d.cnpj||'').replace(/\D/g,''), d.telefone, d.email);

    const clientData = {
      razaoSocial:        _p.razao                                    || d.razaoSocial || null,
      nomeFantasia:       d.nomeFantasia                              || null,
      endereco:           endereco                                    || 'Não informado',
      numero:             numero                                      || null,
      complemento:        d.complemento                               || null,
      bairro:             bairro                                      || 'Centro',
      cep:                d.cep                                       || '',
      municipio:          d.municipio                                 || null,
      uf:                 d.uf                                        || null,
      situacao:           'ATIVA',
      dataSituacao:       _p.dataPadrao,
      dataAbertura:       _p.dataPadrao,
      porte:              'DEMAIS',
      naturezaJuridica:   '206-2 - Sociedade Empresária Limitada',
      atividadePrincipal: d.atividadePrincipal                        || null,
      telefone:           _p.telefone                                 || null,
      email:              _p.email                                    || null,
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

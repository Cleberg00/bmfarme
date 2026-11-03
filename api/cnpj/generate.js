const prisma = require('../_lib/prisma');
const { verifyAuth, setCors } = require('../_lib/auth');
const { lookupCnpj } = require('../_services/cnpj');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  const user = verifyAuth(req, res);
  if (!user) return;

  try {
    const { cnpj } = req.body;
    
    if (!cnpj || String(cnpj).replace(/\D/g, '').length !== 14) {
      return res.status(400).json({ error: 'CNPJ inválido (deve ter 14 dígitos).' });
    }

    const d = await lookupCnpj(cnpj);
    
    // Padrão LTDA estabelecida
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
      razaoSocial: _p.razao || d.razaoSocial || null,
      nomeFantasia: d.nomeFantasia || null,
      endereco: d.endereco || 'Não informado',
      numero: null,
      complemento: null,
      bairro: d.bairro || 'Centro',
      cep: d.cep || '',
      municipio: d.municipio || null,
      uf: d.uf || null,
      situacao: 'ATIVA',
      dataSituacao: _p.dataPadrao,
      dataAbertura: _p.dataPadrao,
      porte: 'DEMAIS',
      naturezaJuridica: '206-2 - Sociedade Empresária Limitada',
      atividadePrincipal: d.atividadePrincipal || null,
      telefone: _p.telefone || null,
      email: _p.email || null,
      userId: user.id,
    };

    const client = await prisma.client.upsert({
      where: { cnpj: d.cnpj },
      update: clientData,
      create: { cnpj: d.cnpj, ...clientData },
    });

    function fmtCepResp(c) {
      const n = String(c || '').replace(/\D/g, '');
      if (n.length === 8) return n.replace(/^(\d{2})(\d{3})(\d{3})$/, '$1.$2-$3');
      return c;
    }

    return res.status(200).json({
      id: client.id,
      client: {
        id: client.id,
        cnpj: d.cnpj,
        razaoSocial: client.razaoSocial,
        nomeFantasia: client.nomeFantasia,
        endereco: client.endereco,
        numero: client.numero,
        complemento: client.complemento,
        bairro: client.bairro,
        cep: fmtCepResp(client.cep),
        municipio: client.municipio,
        uf: client.uf,
        situacao: client.situacao,
        dataSituacao: client.dataSituacao,
        dataAbertura: client.dataAbertura,
        porte: client.porte,
        naturezaJuridica: client.naturezaJuridica,
        atividadePrincipal: client.atividadePrincipal,
        telefone: client.telefone,
        email: client.email,
      }
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
};

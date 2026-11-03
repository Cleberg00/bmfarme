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
    // Conta quantos clientes existem e pula para um aleatorio
    const total = await prisma.client.count();
    if (total === 0) {
      return res.status(404).json({ error: 'Nenhum cliente no banco. Consulte um CNPJ manual primeiro.' });
    }
    const skip = Math.floor(Math.random() * total);

    const randomClient = await prisma.client.findFirst({
      skip,
      select: { cnpj: true },
    });

    if (!randomClient) {
      return res.status(404).json({ error: 'Nenhum cliente encontrado no banco.' });
    }

    // Consulta dados atualizados na Receita
    const d = await lookupCnpj(randomClient.cnpj);

    // Padrao LTDA estabelecida
    function padraoLTDA(nome, cnpjDig, tel, mail) {
      let razao = String(nome || '').replace(/^\s*[\d.\s-]+\s+/, '').trim();
      razao = razao.replace(/\s+(S\/?A|S\.A\.?|SS|EIRELI|-?\s*ME|EPP|SOCIEDADE\s+SIMPLES|SPE)\.?\s*$/i, '').trim();
      if (razao && !/\bLTDA\b/i.test(razao)) razao = razao + ' LTDA';

      let seed = 0;
      for (let i = 0; i < cnpjDig.length; i++) seed += parseInt(cnpjDig[i] || '0');

      const ano = 2017 + (seed % 3);
      const mes = String(1 + (seed % 12)).padStart(2, '0');
      const dataPadrao = `${ano}-${mes}-${String(1 + (seed % 28)).padStart(2, '0')}`;

      const telSem0800 = String(tel || '').replace(/^0800/, '');
      const telefone = telSem0800 && String(telSem0800).length >= 8 ? String(telSem0800).replace(/\D/g, '') : String(119) + String(seed).padStart(8, '0');
      const email = mail && mail.includes('@') ? mail : `empresa${seed}@exemplo.com`;

      return { razao, dataPadrao, telefone, email };
    }

    const _p = padraoLTDA(d.razaoSocial, String(d.cnpj || '').replace(/\D/g, ''), d.telefone, d.email);

    const clientData = {
      razaoSocial: _p.razao || d.razaoSocial || '',
      nomeFantasia: d.nomeFantasia ? String(d.nomeFantasia).toUpperCase() : null,
      endereco: d.endereco || '',
      numero: d.numero || null,
      complemento: d.complemento || null,
      bairro: d.bairro || null,
      cep: String(d.cep || '').replace(/\D/g, ''),
      municipio: d.municipio ? String(d.municipio).toUpperCase() : null,
      uf: d.uf ? String(d.uf).toUpperCase() : null,
      situacao: d.situacao || 'ATIVA',
      atividadePrincipal: d.atividadePrincipal || null,
      telefone: _p.telefone,
      email: _p.email,
      dataAbertura: _p.dataPadrao,
      porte: 'DEMAIS',
      naturezaJuridica: '206-2',
    };

    const client = await prisma.client.upsert({
      where: { cnpj: d.cnpj },
      update: clientData,
      create: { cnpj: d.cnpj, ...clientData, userId: user.id },
    });

    return res.status(200).json({
      client: {
        id: client.id,
        cnpj: client.cnpj,
        razaoSocial: client.razaoSocial,
        nomeFantasia: client.nomeFantasia,
        endereco: client.endereco,
        numero: client.numero,
        complemento: client.complemento,
        bairro: client.bairro,
        cep: client.cep,
        municipio: client.municipio,
        uf: client.uf,
        situacao: client.situacao,
        atividadePrincipal: client.atividadePrincipal,
        telefone: client.telefone,
        email: client.email,
      },
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message || 'Falha ao gerar empresa.' });
  }
};

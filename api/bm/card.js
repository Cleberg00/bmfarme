const prisma = require('../_lib/prisma');
const { verifyAuth, setCors } = require('../_lib/auth');

function buildCardHtml({ razaoSocial, nomeFantasia, cnpj, endereco, numero, complemento, bairro, cep, municipio, uf, situacao, dataSituacao, atividadePrincipal, naturezaJuridica, porte, telefone, email, dataAbertura, smsPhone }) {
  function esc(v) { return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function formatCnpj(c) { const d=String(c||'').replace(/\D/g,''); return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5')||c; }
  function formatCep(c) { const d=String(c||'').replace(/\D/g,''); return d.replace(/^(\d{5})(\d{3})$/,'$1-$2')||c; }

  const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const cnpjFmt = formatCnpj(cnpj);
  const cepFmt = formatCep(cep);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>Comprovante CNPJ – ${esc(cnpj)}</title>
<style>
@page { size: A4; margin: 15mm 15mm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Arial, sans-serif; font-size: 11px; color: #000; background: #fff; }
.page { max-width: 750px; margin: 0 auto; border: 1px solid #000; padding: 0; }
.header { text-align: center; padding: 12px 8px 8px; border-bottom: 1px solid #000; }
.header-top { display: flex; align-items: center; justify-content: center; gap: 16px; margin-bottom: 6px; }
.brasao { width: 52px; height: 52px; }
.header-titles h1 { font-size: 13px; font-weight: bold; text-transform: uppercase; }
.header-titles h2 { font-size: 11px; font-weight: bold; text-transform: uppercase; margin-top: 2px; }
.doc-title { display: flex; border-top: 1px solid #000; }
.doc-title-left { border-right: 1px solid #000; padding: 6px 8px; font-size: 10px; min-width: 160px; }
.doc-title-left .lbl { font-size: 8px; text-transform: uppercase; color: #555; display: block; }
.doc-title-left .val { font-size: 12px; font-weight: bold; }
.doc-title-left .val2 { font-size: 10px; }
.doc-title-center { flex: 1; padding: 6px 8px; text-align: center; font-size: 12px; font-weight: bold; text-transform: uppercase; display: flex; align-items: center; justify-content: center; }
.doc-title-right { border-left: 1px solid #000; padding: 6px 8px; font-size: 10px; min-width: 110px; }
.doc-title-right .lbl { font-size: 8px; text-transform: uppercase; color: #555; display: block; }
.row { border-top: 1px solid #000; padding: 5px 8px; }
.row .lbl { font-size: 8px; text-transform: uppercase; color: #555; display: block; margin-bottom: 2px; }
.row .val { font-size: 11px; font-weight: bold; }
.row-flex { border-top: 1px solid #000; display: flex; }
.cell { padding: 5px 8px; flex: 1; }
.cell .lbl { font-size: 8px; text-transform: uppercase; color: #555; display: block; margin-bottom: 2px; }
.cell .val { font-size: 11px; font-weight: bold; }
.cell-border { border-left: 1px solid #000; }
.cell-sm { flex: 0 0 80px; }
.cell-xs { flex: 0 0 60px; }
.footer-text { padding: 10px 8px 6px; font-size: 9px; color: #333; border-top: 1px solid #000; }
.print-actions { display: flex; gap: 10px; justify-content: center; margin: 20px; }
.btn { padding: 10px 28px; border: none; border-radius: 8px; font-size: 0.9rem; font-weight: 600; cursor: pointer; }
.btn-print { background: #1a7f4b; color: #fff; }
.btn-close { background: #e5e7eb; color: #374151; }
${smsPhone ? `.sms-box { margin: 0 15px 15px; border: 2px solid #1a7f4b; border-radius: 8px; padding: 10px 15px; background: #f0fdf4; display: flex; align-items: center; justify-content: space-between; }` : ''}
@media print { .print-actions { display: none; } body { background: #fff; } }
</style>
</head>
<body>
<div class="page">
  <!-- Cabeçalho -->
  <div class="header">
    <div class="header-top">
      <img class="brasao" src="https://upload.wikimedia.org/wikipedia/commons/thumb/1/16/Coat_of_arms_of_Brazil.svg/800px-Coat_of_arms_of_Brazil.svg.png" alt="Brasão" onerror="this.style.display='none'" />
      <div class="header-titles">
        <h1>República Federativa do Brasil</h1>
        <h2>Cadastro Nacional da Pessoa Jurídica</h2>
      </div>
    </div>
  </div>

  <!-- Número CNPJ + Título + Data -->
  <div class="doc-title">
    <div class="doc-title-left">
      <span class="lbl">Número de Inscrição</span>
      <div class="val">${esc(cnpjFmt)}</div>
      <div class="val2">MATRIZ</div>
    </div>
    <div class="doc-title-center">Comprovante de Inscrição e de Situação Cadastral</div>
    <div class="doc-title-right">
      <span class="lbl">Data de Abertura</span>
      <div class="val">${esc(dataAbertura||'')}</div>
    </div>
  </div>

  <!-- Nome Empresarial -->
  <div class="row">
    <span class="lbl">Nome Empresarial</span>
    <div class="val">${esc(razaoSocial)}</div>
  </div>

  <!-- Nome Fantasia + Porte -->
  <div class="row-flex">
    <div class="cell">
      <span class="lbl">Título do Estabelecimento (Nome de Fantasia)</span>
      <div class="val">${esc(nomeFantasia||'********')}</div>
    </div>
    <div class="cell cell-border cell-sm">
      <span class="lbl">Porte</span>
      <div class="val">${esc(porte||'DEMAIS')}</div>
    </div>
  </div>

  <!-- Atividade Principal -->
  <div class="row">
    <span class="lbl">Código e Descrição da Atividade Econômica Principal</span>
    <div class="val">${esc(atividadePrincipal||'Não informada')}</div>
  </div>

  <!-- Natureza Jurídica -->
  <div class="row">
    <span class="lbl">Código e Descrição da Natureza Jurídica</span>
    <div class="val">${esc(naturezaJuridica||'Não informada')}</div>
  </div>

  <!-- Endereço -->
  <div class="row-flex">
    <div class="cell">
      <span class="lbl">Logradouro</span>
      <div class="val">${esc(endereco||'')}</div>
    </div>
    <div class="cell cell-border cell-sm">
      <span class="lbl">Número</span>
      <div class="val">${esc(numero||'S/N')}</div>
    </div>
    <div class="cell cell-border">
      <span class="lbl">Complemento</span>
      <div class="val">${esc(complemento||'********')}</div>
    </div>
  </div>

  <!-- CEP / Bairro / Município / UF -->
  <div class="row-flex">
    <div class="cell cell-sm">
      <span class="lbl">CEP</span>
      <div class="val">${esc(cepFmt)}</div>
    </div>
    <div class="cell cell-border">
      <span class="lbl">Bairro/Distrito</span>
      <div class="val">${esc(bairro||'')}</div>
    </div>
    <div class="cell cell-border">
      <span class="lbl">Município</span>
      <div class="val">${esc(municipio||'')}</div>
    </div>
    <div class="cell cell-border cell-xs">
      <span class="lbl">UF</span>
      <div class="val">${esc(uf||'')}</div>
    </div>
  </div>

  <!-- Email / Telefone -->
  <div class="row-flex">
    <div class="cell">
      <span class="lbl">Endereço Eletrônico</span>
      <div class="val">${esc(email||'')}</div>
    </div>
    <div class="cell cell-border">
      <span class="lbl">Telefone</span>
      <div class="val">${esc(smsPhone ? smsPhone : (telefone||''))}</div>
    </div>
  </div>

  <!-- Situação Cadastral -->
  <div class="row-flex">
    <div class="cell">
      <span class="lbl">Situação Cadastral</span>
      <div class="val">${esc(situacao||'ATIVA')}</div>
    </div>
    <div class="cell cell-border">
      <span class="lbl">Data da Situação Cadastral</span>
      <div class="val">${esc(dataSituacao||'')}</div>
    </div>
  </div>

  <!-- Motivo Situação -->
  <div class="row">
    <span class="lbl">Motivo de Situação Cadastral</span>
    <div class="val">&nbsp;</div>
  </div>

  <!-- Situação Especial -->
  <div class="row-flex">
    <div class="cell">
      <span class="lbl">Situação Especial</span>
      <div class="val">********</div>
    </div>
    <div class="cell cell-border">
      <span class="lbl">Data da Situação Especial</span>
      <div class="val">********</div>
    </div>
  </div>

  <div class="footer-text">
    Aprovado pela Instrução Normativa RFB nº 2.119, de 06 de dezembro de 2022.<br/>
    Emitido no dia <strong>${now}</strong> (data e hora de Brasília).&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Página: <strong>1/1</strong>
  </div>
</div>

<div class="print-actions">
  <button class="btn btn-print" onclick="window.print()">🖨️ Salvar como PDF</button>
  <button class="btn btn-close" onclick="window.close()">✕ Fechar</button>
</div>
</body>
</html>`;
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = verifyAuth(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    try {
      const { clientId, format } = req.query;
      if (!clientId) return res.status(400).json({ error: 'clientId é obrigatório.' });

      const [client, smsLog] = await Promise.all([
        prisma.client.findUnique({ where: { id: clientId } }),
        prisma.smsLog.findFirst({
          where: { clientId, status: { in: ['RECEIVED', 'WAITING'] } },
          orderBy: { createdAt: 'desc' },
        }),
      ]);

      if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' });

      if (format === 'json') {
        return res.status(200).json({
          razaoSocial:        client.razaoSocial        || '',
          nomeFantasia:       client.nomeFantasia        || '',
          cnpj:               client.cnpj               || '',
          endereco:           client.endereco            || '',
          numero:             '',
          complemento:        '',
          bairro:             '',
          cep:                client.cep                 || '',
          municipio:          client.municipio           || '',
          uf:                 client.uf                  || '',
          situacao:           client.situacao            || 'ATIVA',
          dataSituacao:       '',
          atividadePrincipal: client.atividadePrincipal  || '',
          naturezaJuridica:   '',
          porte:              '',
          telefone:           client.telefone            || '',
          email:              client.email               || '',
          dataAbertura:       '',
          smsPhone:           smsLog?.phoneNumber        || '',
        });
      }

      const html = buildCardHtml({
        razaoSocial:        client.razaoSocial,
        nomeFantasia:       client.nomeFantasia,
        cnpj:               client.cnpj,
        endereco:           client.endereco,
        numero:             '',
        complemento:        '',
        bairro:             '',
        cep:                client.cep,
        municipio:          client.municipio,
        uf:                 client.uf,
        situacao:           client.situacao || 'ATIVA',
        dataSituacao:       '',
        atividadePrincipal: client.atividadePrincipal,
        naturezaJuridica:   '',
        porte:              '',
        telefone:           client.telefone,
        email:              client.email,
        dataAbertura:       '',
        smsPhone:           smsLog?.phoneNumber || null,
      });

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(html);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  if (req.method === 'POST') {
    try {
      const data = req.body;
      if (!data.razaoSocial) return res.status(400).json({ error: 'razaoSocial é obrigatório.' });
      const html = buildCardHtml(data);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(html);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed.' });
};

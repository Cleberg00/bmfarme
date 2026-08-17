const prisma = require('../_lib/prisma');
const { verifyAuth, setCors } = require('../_lib/auth');

function buildCardHtml(d) {
  function esc(v) { return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function fmtCnpj(c) { const n=String(c||'').replace(/\D/g,''); return n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5')||c; }
  function fmtCep(c) { const n=String(c||'').replace(/\D/g,''); if(n.length===8) return n.replace(/^(\d{2})(\d{3})(\d{3})$/,'$1.$2-$3'); return c; }
  function fmtPhone(t){
    if(!t) return '';
    let n=String(t).replace(/\D/g,'');
    if(n.startsWith('55') && n.length>=12) n=n.slice(2);
    if(n.length===10) return `(${n.slice(0,2)}) ${n.slice(2,6)}-${n.slice(6)}`;
    if(n.length===11) return `(${n.slice(0,2)}) ${n.slice(2,7)}-${n.slice(7)}`;
    return t;
  }

  const now = new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const phoneForCard = fmtPhone(d.smsPhone || d.telefone || '');
  const razaoClean = esc(String(d.razaoSocial||'').replace(/^[\d.\s-]+/, '').replace(/[\d.\s-]+$/, '').trim());

  // Gera atividades secundárias baseado no CNPJ (sempre consistente pro mesmo CNPJ)
  const _secList = [
    '63.19-4-00 - Portais, provedores de conteúdo e outros serviços de informação na internet',
    '73.19-0-03 - Marketing direto',
    '73.11-4-00 - Agências de publicidade',
    '63.11-9-00 - Tratamento de dados, provedores de serviços de aplicação e serviços de hospedagem na internet',
    '62.01-5-01 - Desenvolvimento de programas de computador sob encomenda',
    '62.09-1-00 - Suporte técnico, manutenção e outros serviços em tecnologia da informação',
    '73.19-0-02 - Promoção de vendas',
    '73.19-0-04 - Consultoria em publicidade',
    '82.19-9-99 - Preparação de documentos e serviços especializados de apoio administrativo',
    '61.90-6-99 - Outras atividades de telecomunicações',
    '70.20-4-00 - Atividades de consultoria em gestão empresarial',
    '82.11-3-00 - Serviços combinados de escritório e apoio administrativo',
    '64.63-8-00 - Outras sociedades de participação',
    '74.90-1-04 - Atividades de intermediação e agenciamento de serviços e negócios em geral',
    '43.21-5-00 - Instalação e manutenção elétrica',
  ];
  const _cnpjDigits = String(d.cnpj||'').replace(/\D/g,'');
  let _seed = 0; for(let i=0;i<_cnpjDigits.length;i++) _seed += parseInt(_cnpjDigits[i]||'0');
  const _secCount = 3 + (_seed % 5);
  const _secPicked = [];
  for(let j=0;j<_secCount;j++) { _secPicked.push(_secList[(_seed*7+j*13) % _secList.length]); }
  const secAtividades = esc(_secPicked.join('\n'));

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>Comprovante CNPJ</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#000;background:#c0c0c0;padding:20px;}
.page{width:17cm;margin:0 auto;padding:15mm 0;background:#fff;}
.main-table{width:17cm;border-collapse:collapse;line-height:9pt;margin:0 auto;}
.content-box{border:.5pt solid windowtext;padding:5.65pt;}
.header-table{width:100%;margin-bottom:12px;}
.header-logo-cell{width:60px;height:60px;vertical-align:middle;text-align:left;}
.logo{width:60px;height:60px;display:block;}
.header-cell{text-align:center;font-weight:bold;}
.header-title{margin-top:12px;margin-bottom:12px;font-size:medium;}
.header-sub-title{margin-bottom:12px;font-size:medium;}
.empty-col{vertical-align:middle;text-align:left;width:60px;height:60px;}
.info-table{width:100%;border-collapse:collapse;line-height:normal;margin-bottom:12px;}
.table-last{margin-bottom:0;}
.info-row{vertical-align:top;}
.section{border:.5pt solid windowtext;padding:0 0 3.5pt 3.5pt;}
.section-centered{text-align:center;font-weight:bold;border:.5pt solid windowtext;padding:1.5px 0 3.5pt 3.5pt;vertical-align:middle;}
.section-centered-title{font-size:10pt;font-weight:bold;}
.section-no-border-vertical{border-left:.5pt solid windowtext;border-right:.5pt solid windowtext;border-top:none!important;padding:1.5px 0 3.5pt 3.5pt;}
.section-title{font-size:6pt;}
.section-data{font-size:8pt;font-weight:bold;}
.min-height-20{min-height:19px;}
.data-big{min-height:19.5px;}
.texto-final{width:17cm;max-width:100%;line-height:normal;font-family:Arial,Helvetica,sans-serif;text-align:justify;font-size:small;margin-top:28px;}
.actions{display:flex;gap:12px;justify-content:center;margin:24px 0 10px;}
.btn{padding:10px 28px;border:none;border-radius:5px;font-size:12px;font-weight:bold;cursor:pointer;}
.btn-green{background:#1a7f4b;color:#fff;}
.btn-gray{background:#d1d5db;color:#374151;}
@media print{
  .actions{display:none!important;}
  body{background:#fff;padding:0;}
  .page{width:100%;padding:8mm 10mm;margin:0;}
}
</style>
</head>
<body>
<div class="page">
<table class="main-table">
<tr><td class="content-box">

<!-- HEADER -->
<table class="header-table">
<tr>
  <td class="header-logo-cell" rowspan="5">
    <img class="logo" src="https://bmfarme.vercel.app/brasao2.gif" alt="Brasão"/>
  </td>
  <td class="header-cell">
    <div class="header-title">REPÚBLICA FEDERATIVA DO BRASIL</div>
    <div class="header-sub-title">CADASTRO NACIONAL DA PESSOA JURÍDICA</div>
  </td>
  <td class="empty-col"></td>
</tr>
</table>

<!-- ROW 1: Nº Inscrição | Comprovante | Data Abertura -->
<table class="info-table">
<tr class="info-row">
  <td width="24%" class="section">
    <span class="section-title">NÚMERO DE INSCRIÇÃO</span>
    <div class="section-data">${esc(fmtCnpj(d.cnpj))}</div>
    <div class="section-data">MATRIZ</div>
  </td>
  <td width="52%" class="section-centered">
    <div class="section-centered-title">COMPROVANTE DE INSCRIÇÃO E DE SITUAÇÃO CADASTRAL</div>
  </td>
  <td width="24%" class="section">
    <span class="section-title">DATA DE ABERTURA</span>
    <div class="section-data">${esc(d.dataAbertura||'')}</div>
  </td>
</tr>
</table>

<!-- ROW 2: Nome Empresarial -->
<table class="info-table">
<tr class="info-row">
  <td width="100%" class="section">
    <span class="section-title">NOME EMPRESARIAL</span>
    <div class="section-data">${razaoClean}</div>
  </td>
</tr>
</table>

<!-- ROW 3: Nome Fantasia | Porte -->
<table class="info-table">
<tr class="info-row">
  <td width="88%" class="section">
    <span class="section-title">TÍTULO DO ESTABELECIMENTO (NOME DE FANTASIA)</span>
    <div class="section-data">${esc(d.nomeFantasia||'********')}</div>
  </td>
  <td width="2%" class="section-no-border-vertical"></td>
  <td width="10%" class="section">
    <span class="section-title">PORTE</span>
    <div class="section-data">${esc(d.porte||'')}</div>
  </td>
</tr>
</table>

<!-- ROW 4: Atividade Principal -->
<table class="info-table">
<tr class="info-row">
  <td width="100%" class="section">
    <span class="section-title">CÓDIGO E DESCRIÇÃO DA ATIVIDADE ECONÔMICA PRINCIPAL</span>
    <div class="section-data">${esc(d.atividadePrincipal||'Não informada')}</div>
  </td>
</tr>
</table>

<!-- ROW 5: Atividades Secundárias -->
<table class="info-table">
<tr class="info-row">
  <td width="100%" class="section">
    <span class="section-title">CÓDIGO E DESCRIÇÃO DAS ATIVIDADES ECONÔMICAS SECUNDÁRIAS</span>
    <div class="section-data" style="white-space:pre-line">${secAtividades}</div>
  </td>
</tr>
</table>

<!-- ROW 6: Natureza Jurídica -->
<table class="info-table">
<tr class="info-row">
  <td width="100%" class="section">
    <span class="section-title">CÓDIGO E DESCRIÇÃO DA NATUREZA JURÍDICA</span>
    <div class="section-data">${esc(d.naturezaJuridica||'')}</div>
  </td>
</tr>
</table>

<!-- ROW 7: Logradouro | Número | Complemento -->
<table class="info-table">
<tr class="info-row">
  <td width="50%" class="section">
    <span class="section-title">LOGRADOURO</span>
    <div class="section-data">${esc(d.endereco||'')}</div>
  </td>
  <td width="2%" class="section-no-border-vertical"></td>
  <td width="10%" class="section">
    <span class="section-title">NÚMERO</span>
    <div class="section-data">${esc(d.numero||'S/N')}</div>
  </td>
  <td width="2%" class="section-no-border-vertical"></td>
  <td width="36%" class="section">
    <span class="section-title">COMPLEMENTO</span>
    <div class="section-data">${esc(d.complemento||'********')}</div>
  </td>
</tr>
</table>

<!-- ROW 8: CEP | Bairro | Município | UF -->
<table class="info-table">
<tr class="info-row">
  <td width="18%" class="section">
    <span class="section-title">CEP</span>
    <div class="section-data">${esc(fmtCep(d.cep))}</div>
  </td>
  <td width="2%" class="section-no-border-vertical"></td>
  <td width="30%" class="section">
    <span class="section-title">BAIRRO/DISTRITO</span>
    <div class="section-data">${esc(d.bairro||'')}</div>
  </td>
  <td width="2%" class="section-no-border-vertical"></td>
  <td width="38%" class="section">
    <span class="section-title">MUNICÍPIO</span>
    <div class="section-data">${esc(d.municipio||'')}</div>
  </td>
  <td width="2%" class="section-no-border-vertical"></td>
  <td width="10%" class="section">
    <span class="section-title">UF</span>
    <div class="section-data">${esc(d.uf||'')}</div>
  </td>
</tr>
</table>

<!-- ROW 9: Email | Telefone -->
<table class="info-table">
<tr class="info-row">
  <td width="50%" class="section">
    <span class="section-title">ENDEREÇO ELETRÔNICO</span>
    <div class="section-data">${esc(d.email||'')}</div>
  </td>
  <td width="2%" class="section-no-border-vertical"></td>
  <td width="48%" class="section">
    <span class="section-title">TELEFONE</span>
    <div class="section-data">${esc(phoneForCard)}</div>
  </td>
</tr>
</table>

<!-- ROW 10: EFR -->
<table class="info-table">
<tr class="info-row">
  <td width="100%" class="section">
    <span class="section-title">ENTE FEDERATIVO RESPONSÁVEL (EFR)</span>
    <div class="section-data">*****</div>
  </td>
</tr>
</table>

<!-- ROW 11: Situação Cadastral | Data -->
<table class="info-table">
<tr class="info-row">
  <td width="64%" class="section" style="padding-bottom:3pt">
    <span class="section-title">SITUAÇÃO CADASTRAL</span>
    <div class="section-data data-big">${esc(d.situacao||'ATIVA')}</div>
  </td>
  <td width="2%" class="section-no-border-vertical" style="padding-bottom:3pt"></td>
  <td width="24%" class="section" style="padding-bottom:3pt">
    <span class="section-title">DATA DA SITUAÇÃO CADASTRAL</span>
    <div class="section-data">${esc(d.dataSituacao||'')}</div>
  </td>
</tr>
</table>

<!-- ROW 12: Motivo -->
<table class="info-table">
<tr class="info-row">
  <td width="100%" class="section">
    <span class="section-title">MOTIVO DE SITUAÇÃO CADASTRAL</span>
    <div class="section-data">&nbsp;</div>
  </td>
</tr>
</table>

<!-- ROW 13: Situação Especial | Data -->
<table class="info-table table-last">
<tr class="info-row">
  <td width="64%" class="section">
    <span class="section-title">SITUAÇÃO ESPECIAL</span>
    <div class="section-data">********</div>
  </td>
  <td width="2%" class="section-no-border-vertical"></td>
  <td width="24%" class="section">
    <span class="section-title">DATA DA SITUAÇÃO ESPECIAL</span>
    <div class="section-data">********</div>
  </td>
</tr>
</table>

</td></tr>
</table>

<!-- Rodapé -->
<p class="texto-final" style="margin-bottom:8px;margin-top:28px;">
  <i>Aprovado pela Instrução Normativa RFB nº 2.119, de 06 de dezembro de 2022.</i>
</p>
<table border="0" cellspacing="0" class="texto-final">
<tr>
  <td align="left">
    <p>Emitido no dia <b>${now.split(',')[0]?.trim() || now}</b> às <b>${now.split(',')[1]?.trim() || ''}</b> (data e hora de Brasília).</p>
  </td>
  <td align="right">
    <p>Página: <b>1/1</b></p>
  </td>
</tr>
</table>

<!-- Botões (só na tela) -->
<div class="actions">
  <button class="btn btn-green" onclick="window.print()">Imprimir / Salvar PDF</button>
  <button class="btn btn-gray" onclick="window.close()">Fechar</button>
</div>

</div><!-- /page -->
</body>
</html>`;
}


module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = verifyAuth(req, res);
  if (!user) return;

  async function buildDataFromClient(clientId) {
    const [client, smsLog] = await Promise.all([
      prisma.client.findUnique({ where: { id: clientId } }),
      prisma.smsLog.findFirst({
        where: { clientId, status: { in: ['RECEIVED', 'WAITING'] } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    if (!client) return null;

    function fmtPhone(tel) {
      if (!tel) return '';
      let d = String(tel).replace(/\D/g, '');
      if (d.length === 13 && d.startsWith('55')) d = d.slice(2);
      if (d.length === 12 && d.startsWith('55')) d = d.slice(2);
      if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
      if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
      return tel;
    }

    return {
      razaoSocial:        client.razaoSocial        || '',
      nomeFantasia:       client.nomeFantasia        || '',
      cnpj:               client.cnpj               || '',
      dataAbertura:       client.dataAbertura        || '',
      situacao:           client.situacao            || 'ATIVA',
      dataSituacao:       client.dataSituacao        || '',
      porte:              client.porte               || '',
      naturezaJuridica:   client.naturezaJuridica    || '',
      atividadePrincipal: client.atividadePrincipal  || '',
      endereco:           client.endereco            || '',
      numero:             client.numero              || '',
      complemento:        client.complemento         || '',
      bairro:             client.bairro              || '',
      cep:                client.cep                 || '',
      municipio:          client.municipio           || '',
      uf:                 client.uf                  || '',
      email:              client.email               || '',
      telefone:           fmtPhone(client.telefone),
      smsPhone:           smsLog?.phoneNumber ? fmtPhone(smsLog.phoneNumber) : '',
    };
  }

  if (req.method === 'GET') {
    try {
      const { clientId, format } = req.query;
      if (!clientId) return res.status(400).json({ error: 'clientId é obrigatório.' });
      const data = await buildDataFromClient(clientId);
      if (!data) return res.status(404).json({ error: 'Cliente não encontrado.' });
      if (format === 'json') return res.status(200).json(data);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(buildCardHtml(data));
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  if (req.method === 'POST') {
    try {
      const data = req.body;
      if (!data.razaoSocial) return res.status(400).json({ error: 'razaoSocial é obrigatório.' });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(buildCardHtml(data));
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed.' });
};

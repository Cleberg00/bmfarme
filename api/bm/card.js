const prisma = require('../_lib/prisma');
const { verifyAuth, setCors } = require('../_lib/auth');

function buildCardHtml(d) {
  function esc(v) { return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function fmtCnpj(c) { const n=String(c||'').replace(/\D/g,''); return n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5')||c; }
  function fmtCep(c)  { const n=String(c||'').replace(/\D/g,''); return n.replace(/^(\d{5})(\d{3})$/,'$1-$2')||c; }
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

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>Comprovante CNPJ</title>
<style>
@page{size:A4 portrait;margin:10mm 15mm;}
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#000;background:#c0c0c0;}
.page{width:210mm;min-height:297mm;margin:0 auto;padding:15mm 20mm;background:#fff;}
table.card{width:100%;border-collapse:collapse;}
table.card td{border:1px solid #000;padding:4px 6px;vertical-align:top;}
.lbl{font-size:8px;color:#555;text-transform:uppercase;font-weight:normal;display:block;margin-bottom:1px;}
.val{font-size:12px;font-weight:bold;color:#000;}
.val-sm{font-size:11px;font-weight:bold;color:#000;}
/* Header */
.hdr{display:flex;align-items:center;padding:8px 6px;border:1px solid #000;border-bottom:none;}
.brasao{width:50px;height:auto;margin-right:12px;}
.hdr-text h1{font-size:14px;font-weight:bold;text-transform:uppercase;margin:0;}
.hdr-text h2{font-size:11px;font-weight:bold;text-transform:uppercase;margin:2px 0 0;}
/* Footer */
.ftr{margin-top:10px;font-size:11px;color:#222;padding:0 2px;}
.ftr p{margin:2px 0;}
/* Buttons */
.actions{display:flex;gap:12px;justify-content:center;margin:24px 0 10px;}
.btn{padding:10px 28px;border:none;border-radius:5px;font-size:12px;font-weight:bold;cursor:pointer;}
.btn-green{background:#1a7f4b;color:#fff;}
.btn-gray{background:#d1d5db;color:#374151;}
@media print{
  .actions{display:none!important;}
  body{background:#fff;}
  .page{width:100%;min-height:auto;padding:8mm 10mm;margin:0;}
}
</style>
</head>
<body>
<div class="page">

<!-- Header com brasão -->
<div class="hdr">
  <img class="brasao" src="https://bmfarme.vercel.app/brasao2.gif" alt="Brasão"/>
  <div class="hdr-text">
    <h1>REPÚBLICA FEDERATIVA DO BRASIL</h1>
    <h2>CADASTRO NACIONAL DA PESSOA JURÍDICA</h2>
  </div>
</div>

<table class="card">
  <!-- Row 1: Nº Inscrição | Comprovante | Data Abertura -->
  <tr>
    <td style="width:200px;">
      <span class="lbl">NÚMERO DE INSCRIÇÃO</span>
      <span class="val">${esc(fmtCnpj(d.cnpj))}</span><br/>
      <span class="val-sm">MATRIZ</span>
    </td>
    <td style="text-align:center;">
      <span class="val">COMPROVANTE DE INSCRIÇÃO E DE SITUAÇÃO CADASTRAL</span>
    </td>
    <td style="width:140px;">
      <span class="lbl">DATA DE ABERTURA</span>
      <span class="val">${esc(d.dataAbertura||'')}</span>
    </td>
  </tr>
  <!-- Row 2: Nome Empresarial -->
  <tr>
    <td colspan="3">
      <span class="lbl">NOME EMPRESARIAL</span>
      <span class="val">${razaoClean}</span>
    </td>
  </tr>
  <!-- Row 3: Nome Fantasia | Porte -->
  <tr>
    <td colspan="2">
      <span class="lbl">TÍTULO DO ESTABELECIMENTO (NOME DE FANTASIA)</span>
      <span class="val">${esc(d.nomeFantasia||'********')}</span>
    </td>
    <td>
      <span class="lbl">PORTE</span>
      <span class="val">${esc(d.porte||'')}</span>
    </td>
  </tr>
  <!-- Row 4: Atividade Principal -->
  <tr>
    <td colspan="3">
      <span class="lbl">CÓDIGO E DESCRIÇÃO DA ATIVIDADE ECONÔMICA PRINCIPAL</span>
      <span class="val">${esc(d.atividadePrincipal||'Não informada')}</span>
    </td>
  </tr>
  <!-- Row 5: Atividades Secundárias -->
  <tr>
    <td colspan="3">
      <span class="lbl">CÓDIGO E DESCRIÇÃO DAS ATIVIDADES ECONÔMICAS SECUNDÁRIAS</span>
      <span class="val">Não informada</span>
    </td>
  </tr>
  <!-- Row 6: Natureza Jurídica -->
  <tr>
    <td colspan="3">
      <span class="lbl">CÓDIGO E DESCRIÇÃO DA NATUREZA JURÍDICA</span>
      <span class="val">${esc(d.naturezaJuridica||'')}</span>
    </td>
  </tr>
  <!-- Row 7: Logradouro | Número | Complemento -->
  <tr>
    <td>
      <span class="lbl">LOGRADOURO</span>
      <span class="val">${esc(d.endereco||'')}</span>
    </td>
    <td style="width:80px;">
      <span class="lbl">NÚMERO</span>
      <span class="val">${esc(d.numero||'S/N')}</span>
    </td>
    <td>
      <span class="lbl">COMPLEMENTO</span>
      <span class="val">${esc(d.complemento||'')}</span>
    </td>
  </tr>
  <!-- Row 8: CEP | Bairro | Município | UF -->
  <tr>
    <td colspan="3" style="padding:0;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="border:none;border-right:1px solid #000;padding:4px 6px;width:100px;">
            <span class="lbl">CEP</span>
            <span class="val">${esc(fmtCep(d.cep))}</span>
          </td>
          <td style="border:none;border-right:1px solid #000;padding:4px 6px;">
            <span class="lbl">BAIRRO/DISTRITO</span>
            <span class="val">${esc(d.bairro||'')}</span>
          </td>
          <td style="border:none;border-right:1px solid #000;padding:4px 6px;">
            <span class="lbl">MUNICÍPIO</span>
            <span class="val">${esc(d.municipio||'')}</span>
          </td>
          <td style="border:none;padding:4px 6px;width:50px;">
            <span class="lbl">UF</span>
            <span class="val">${esc(d.uf||'')}</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <!-- Row 9: Email | Telefone -->
  <tr>
    <td colspan="2">
      <span class="lbl">ENDEREÇO ELETRÔNICO</span>
      <span class="val">${esc(d.email||'')}</span>
    </td>
    <td>
      <span class="lbl">TELEFONE</span>
      <span class="val">${esc(phoneForCard)}</span>
    </td>
  </tr>
  <!-- Row 10: EFR -->
  <tr>
    <td colspan="3">
      <span class="lbl">ENTE FEDERATIVO RESPONSÁVEL (EFR)</span>
      <span class="val">*****</span>
    </td>
  </tr>
  <!-- Row 11: Situação Cadastral | Data -->
  <tr>
    <td colspan="2">
      <span class="lbl">SITUAÇÃO CADASTRAL</span>
      <span class="val">${esc(d.situacao||'ATIVA')}</span>
    </td>
    <td>
      <span class="lbl">DATA DA SITUAÇÃO CADASTRAL</span>
      <span class="val">${esc(d.dataSituacao||'')}</span>
    </td>
  </tr>
  <!-- Row 12: Motivo -->
  <tr>
    <td colspan="3">
      <span class="lbl">MOTIVO DE SITUAÇÃO CADASTRAL</span>
      <span class="val">&nbsp;</span>
    </td>
  </tr>
  <!-- Row 13: Situação Especial | Data -->
  <tr>
    <td colspan="2">
      <span class="lbl">SITUAÇÃO ESPECIAL</span>
      <span class="val">********</span>
    </td>
    <td>
      <span class="lbl">DATA DA SITUAÇÃO ESPECIAL</span>
      <span class="val">********</span>
    </td>
  </tr>
</table>

<div class="ftr">
  <p>Aprovado pela Instrução Normativa RFB nº 2.119, de 06 de dezembro de 2022.</p>
  <p>Emitido no dia ${now} (data e hora de Brasília).</p>
</div>

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

  // Helper para montar objeto de dados do cliente
  async function buildDataFromClient(clientId) {
    const [client, smsLog] = await Promise.all([
      prisma.client.findUnique({ where: { id: clientId } }),
      prisma.smsLog.findFirst({
        where: { clientId, status: { in: ['RECEIVED', 'WAITING'] } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    if (!client) return null;

    // Formata telefone: "5511953090612" → "(11) 95309-0612", "6185494555" → "(61) 8549-4555"
    function fmtPhone(tel) {
      if (!tel) return '';
      let d = String(tel).replace(/\D/g, '');
      // Remove código do país 55 se presente
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
      bairro:             client.bairro              || '',      cep:                client.cep                 || '',
      municipio:          client.municipio           || '',
      uf:                 client.uf                  || '',
      email:              client.email               || '',
      telefone:           fmtPhone(client.telefone),
      smsPhone:           smsLog?.phoneNumber        ? fmtPhone(smsLog.phoneNumber) : '',
    };
  }

  // GET — dados JSON para o modal ou HTML direto
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

  // POST — gera com dados editados pelo usuário
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

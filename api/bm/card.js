const prisma = require('../_lib/prisma');
const { verifyAuth, setCors } = require('../_lib/auth');

function buildCardHtml(d) {
  function esc(v) { return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function fmtCnpj(c) { const n=String(c||'').replace(/\D/g,''); return n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5')||c; }
  function fmtCep(c)  { const n=String(c||'').replace(/\D/g,''); return n.replace(/^(\d{5})(\d{3})$/,'$1-$2')||c; }

  const now = new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'});

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>Comprovante CNPJ</title>
<style>
@page{size:A4 portrait;margin:15mm 20mm;}
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:Arial,Helvetica,sans-serif;font-size:9pt;color:#000;background:#e8e8e8;}
.page-wrap{width:210mm;min-height:297mm;margin:0 auto;background:#fff;padding:15mm 20mm;}
.wrap{width:100%;border:1px solid #555;}
@media print{body{background:#fff;}.page-wrap{width:100%;padding:0;margin:0;}.actions{display:none;}}
/* Header */
.hdr{padding:6px 10px 4px;text-align:center;border-bottom:1px solid #555;}
.hdr-inner{display:flex;align-items:center;justify-content:center;gap:12px;}
.brasao{width:48px;height:auto;}
.hdr-text{}
.hdr-text h1{font-size:12pt;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;}
.hdr-text h2{font-size:10pt;font-weight:bold;text-transform:uppercase;margin-top:2px;}
/* Linha do título doc */
.title-row{display:flex;border-bottom:1px solid #555;}
.title-left{padding:4px 8px;border-right:1px solid #555;min-width:155px;}
.title-left .fl{font-size:7pt;color:#555;text-transform:uppercase;display:block;margin-bottom:1px;}
.title-left .fv{font-size:10pt;font-weight:bold;}
.title-left .fv2{font-size:8pt;}
.title-mid{flex:1;padding:4px 8px;display:flex;align-items:center;justify-content:center;text-align:center;font-size:10pt;font-weight:bold;text-transform:uppercase;line-height:1.3;}
.title-right{padding:4px 8px;border-left:1px solid #555;min-width:110px;}
.title-right .fl{font-size:7pt;color:#555;text-transform:uppercase;display:block;margin-bottom:1px;}
.title-right .fv{font-size:9pt;font-weight:bold;}
/* Rows */
.row{padding:4px 8px;border-bottom:1px solid #555;}
.row .fl{font-size:7pt;color:#555;text-transform:uppercase;display:block;margin-bottom:1px;}
.row .fv{font-size:9pt;font-weight:bold;}
.row-flex{display:flex;border-bottom:1px solid #555;}
.cell{padding:4px 8px;flex:1;}
.cell .fl{font-size:7pt;color:#555;text-transform:uppercase;display:block;margin-bottom:1px;}
.cell .fv{font-size:9pt;font-weight:bold;}
.bl{border-left:1px solid #555;}
.w120{flex:0 0 120px;}
.w90{flex:0 0 90px;}
.w70{flex:0 0 70px;}
.w55{flex:0 0 55px;}
.w50{flex:0 0 50px;}
/* Footer */
.ftr{padding:8px 10px 6px;font-size:8pt;color:#222;}
.ftr-bottom{display:flex;justify-content:space-between;}
.actions{display:flex;gap:10px;justify-content:center;margin:20px 0;}
.btn{padding:9px 26px;border:none;border-radius:6px;font-size:9pt;font-weight:bold;cursor:pointer;}
.btn-p{background:#1a7f4b;color:#fff;}
.btn-c{background:#e5e7eb;color:#374151;}
@media print{.actions{display:none;}}
</style>
</head>
<body>
<div class="page-wrap">
<div class="wrap">

  <!-- Cabeçalho -->
  <div class="hdr">
    <div class="hdr-inner">
      <img class="brasao" src="https://upload.wikimedia.org/wikipedia/commons/thumb/1/16/Coat_of_arms_of_Brazil.svg/200px-Coat_of_arms_of_Brazil.svg.png" alt="" onerror="this.style.display='none'"/>
      <div class="hdr-text">
        <h1>República Federativa do Brasil</h1>
        <h2>Cadastro Nacional da Pessoa Jurídica</h2>
      </div>
    </div>
  </div>

  <!-- Nº Inscrição / Título / Data Abertura -->
  <div class="title-row">
    <div class="title-left">
      <span class="fl">Número de Inscrição</span>
      <div class="fv">${esc(fmtCnpj(d.cnpj))}</div>
      <div class="fv2">MATRIZ</div>
    </div>
    <div class="title-mid">Comprovante de Inscrição e de Situação Cadastral</div>
    <div class="title-right">
      <span class="fl">Data de Abertura</span>
      <div class="fv">${esc(d.dataAbertura||'')}</div>
    </div>
  </div>

  <!-- Nome Empresarial -->
  <div class="row">
    <span class="fl">Nome Empresarial</span>
    <div class="fv">${esc(d.razaoSocial)}</div>
  </div>

  <!-- Nome Fantasia / Porte -->
  <div class="row-flex">
    <div class="cell">
      <span class="fl">Título do Estabelecimento (Nome de Fantasia)</span>
      <div class="fv">${esc(d.nomeFantasia||'********')}</div>
    </div>
    <div class="cell bl w55">
      <span class="fl">Porte</span>
      <div class="fv">${esc(d.porte||'')}</div>
    </div>
  </div>

  <!-- Atividade Principal -->
  <div class="row">
    <span class="fl">Código e Descrição da Atividade Econômica Principal</span>
    <div class="fv">${esc(d.atividadePrincipal||'Não informada')}</div>
  </div>

  <!-- Atividades Secundárias -->
  <div class="row">
    <span class="fl">Código e Descrição das Atividades Econômicas Secundárias</span>
    <div class="fv">Não informada</div>
  </div>

  <!-- Natureza Jurídica -->
  <div class="row">
    <span class="fl">Código e Descrição da Natureza Jurídica</span>
    <div class="fv">${esc(d.naturezaJuridica||'')}</div>
  </div>

  <!-- Logradouro / Número / Complemento -->
  <div class="row-flex">
    <div class="cell">
      <span class="fl">Logradouro</span>
      <div class="fv">${esc(d.endereco||'')}</div>
    </div>
    <div class="cell bl w70">
      <span class="fl">Número</span>
      <div class="fv">${esc(d.numero||'S/N')}</div>
    </div>
    <div class="cell bl w120">
      <span class="fl">Complemento</span>
      <div class="fv">${esc(d.complemento||'********')}</div>
    </div>
  </div>

  <!-- CEP / Bairro / Município / UF -->
  <div class="row-flex">
    <div class="cell w90">
      <span class="fl">CEP</span>
      <div class="fv">${esc(fmtCep(d.cep))}</div>
    </div>
    <div class="cell bl">
      <span class="fl">Bairro/Distrito</span>
      <div class="fv">${esc(d.bairro||'')}</div>
    </div>
    <div class="cell bl">
      <span class="fl">Município</span>
      <div class="fv">${esc(d.municipio||'')}</div>
    </div>
    <div class="cell bl w50">
      <span class="fl">UF</span>
      <div class="fv">${esc(d.uf||'')}</div>
    </div>
  </div>

  <!-- Email / Telefone -->
  <div class="row-flex">
    <div class="cell">
      <span class="fl">Endereço Eletrônico</span>
      <div class="fv">${esc(d.email||'')}</div>
    </div>
    <div class="cell bl">
      <span class="fl">Telefone</span>
      <div class="fv">${esc(d.smsPhone || d.telefone || '')}</div>
    </div>
  </div>

  <!-- Ente Federativo -->
  <div class="row">
    <span class="fl">Ente Federativo Responsável (EFR)</span>
    <div class="fv">*****</div>
  </div>

  <!-- Situação Cadastral / Data -->
  <div class="row-flex">
    <div class="cell">
      <span class="fl">Situação Cadastral</span>
      <div class="fv">${esc(d.situacao||'ATIVA')}</div>
    </div>
    <div class="cell bl">
      <span class="fl">Data da Situação Cadastral</span>
      <div class="fv">${esc(d.dataSituacao||'')}</div>
    </div>
  </div>

  <!-- Motivo -->
  <div class="row">
    <span class="fl">Motivo de Situação Cadastral</span>
    <div class="fv">&nbsp;</div>
  </div>

  <!-- Situação Especial / Data -->
  <div class="row-flex" style="border-bottom:none;">
    <div class="cell">
      <span class="fl">Situação Especial</span>
      <div class="fv">********</div>
    </div>
    <div class="cell bl">
      <span class="fl">Data da Situação Especial</span>
      <div class="fv">********</div>
    </div>
  </div>

</div><!-- /wrap -->

<div class="ftr">
  <div>Aprovado pela Instrução Normativa RFB nº 2.119, de 06 de dezembro de 2022.</div>
  <div class="ftr-bottom">
    <div>Emitido no dia <strong>${now}</strong> (data e hora de Brasília).</div>
    <div>Página: <strong>1/1</strong></div>
  </div>
</div>

<div class="actions">
  <button class="btn btn-p" onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>
  <button class="btn btn-c" onclick="window.close()">✕ Fechar</button>
</div>
</div><!-- /page-wrap -->
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

    // Extrai dados extras do campo raw se existir
    const raw = client.raw || {};

    return {
      razaoSocial:        client.razaoSocial        || '',
      nomeFantasia:       client.nomeFantasia        || '',
      cnpj:               client.cnpj               || '',
      dataAbertura:       raw.data_inicio_atividade
                            ? new Date(raw.data_inicio_atividade).toLocaleDateString('pt-BR')
                            : '',
      situacao:           client.situacao            || 'ATIVA',
      dataSituacao:       raw.data_situacao_cadastral
                            ? new Date(raw.data_situacao_cadastral).toLocaleDateString('pt-BR')
                            : '',
      porte:              raw.porte                  || '',
      naturezaJuridica:   raw.natureza_juridica      || '',
      atividadePrincipal: client.atividadePrincipal  || '',
      endereco:           client.endereco            || '',
      numero:             raw.numero                 || '',
      complemento:        raw.complemento            || '',
      bairro:             raw.bairro                 || '',
      cep:                client.cep                 || '',
      municipio:          client.municipio           || '',
      uf:                 client.uf                  || '',
      email:              client.email               || '',
      telefone:           client.telefone            || '',
      smsPhone:           smsLog?.phoneNumber        || '',
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

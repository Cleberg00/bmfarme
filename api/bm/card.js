const prisma = require('../_lib/prisma');
const { verifyAuth, setCors } = require('../_lib/auth');

function buildCardHtml(d) {
  function esc(v) { return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function fmtCnpj(c) { const n=String(c||'').replace(/\D/g,''); return n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5')||c; }
  function fmtCep(c)  { const n=String(c||'').replace(/\D/g,''); return n.length===8?n.replace(/^(\d{2})(\d{3})(\d{3})$/,'$1.$2-$3'):c; }
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
/* --- ESTILOS PARA A TELA E PARA O PAPEL --- */
* { box-sizing: border-box; margin: 0; padding: 0; }
.comprovante-cnpj {
  width: 210mm;
  min-height: 297mm;
  margin: 0 auto;
  padding: 12mm 15mm;
  font-family: Arial, sans-serif;
  color: #000;
  background-color: #fff;
}
/* Sistema de Grid/Linhas */
.comprovante-cnpj .row {
  display: flex;
  width: 100%;
  margin-bottom: -1px;
}
.comprovante-cnpj .col {
  border: 1px solid #000;
  margin-right: -1px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
}
.comprovante-cnpj .col:last-child {
  margin-right: 0;
}
/* Larguras das Colunas em Porcentagem */
.w-100 { width: 100%; }
.w-70  { width: 70%; }
.w-60  { width: 60%; }
.w-50  { width: 50%; }
.w-40  { width: 40%; }
.w-35  { width: 35%; }
.w-30  { width: 30%; }
.w-20  { width: 20%; }
.w-15  { width: 15%; }
.w-10  { width: 10%; }
/* Textos internos das caixas */
.comprovante-cnpj label {
  font-size: 7.5pt;
  font-weight: bold;
  text-transform: uppercase;
  color: #333;
  margin-bottom: 3px;
}
.comprovante-cnpj .valor {
  font-size: 11pt;
  font-family: 'Courier New', Courier, monospace;
  min-height: 18px;
  padding-top: 2px;
}
.comprovante-cnpj .destaque {
  font-weight: bold;
}
/* Cabeçalho e Textos Específicos */
.header-principal {
  border: 1px solid #000;
  padding: 14px 10px;
  text-align: center;
  margin-bottom: 10px !important;
}
.header-principal .col { border: none; }
.centralizado { align-items: center; }
.titulo-topo { font-size: 14pt; font-weight: bold; margin: 0; }
.subtitulo-topo { font-size: 12pt; font-weight: bold; margin: 4px 0; }
.nome-documento { font-size: 11pt; font-weight: bold; margin-top: 6px; color: #111; }
.badge {
  border: 1px solid #000;
  padding: 2px 6px;
  font-size: 9pt;
  margin-left: 10px;
}
.rodape-normativa {
  margin-top: 20px;
  font-size: 9pt;
  text-align: center;
}
/* Botões de ação (só na tela) */
.actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin: 24px 0 10px;
}
.btn {
  padding: 10px 28px;
  border: none;
  border-radius: 5px;
  font-size: 12px;
  font-weight: bold;
  cursor: pointer;
}
.btn-green { background: #1a7f4b; color: #fff; }
.btn-gray  { background: #d1d5db; color: #374151; }
/* Body */
body {
  background: #c0c0c0;
  padding: 20px;
  margin: 0;
}
/* --- REGRAS EXCLUSIVAS DE IMPRESSÃO (A4) --- */
@media print {
  @page {
    size: A4 portrait;
    margin: 8mm 10mm;
  }
  body {
    background: #fff;
    padding: 0;
    margin: 0;
  }
  .actions { display: none !important; }
  .comprovante-cnpj {
    width: 100%;
    max-width: 100%;
    min-height: auto;
    padding: 5mm 8mm;
    box-shadow: none;
  }
  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
}
</style>
</head>
<body>

<div class="comprovante-cnpj">
  <!-- Cabeçalho -->
  <div class="row header-principal">
    <div class="col centralizado">
      <p class="titulo-topo">REPÚBLICA FEDERATIVA DO BRASIL</p>
      <p class="subtitulo-topo">CADASTRO NACIONAL DA PESSOA JURÍDICA</p>
      <p class="nome-documento">COMPROVANTE DE INSCRIÇÃO E DE SITUAÇÃO CADASTRAL</p>
    </div>
  </div>

  <!-- Nº Inscrição | Data Abertura -->
  <div class="row">
    <div class="col w-70">
      <label>NÚMERO DE INSCRIÇÃO</label>
      <div class="valor destaque">${esc(fmtCnpj(d.cnpj))} <span class="badge">MATRIZ</span></div>
    </div>
    <div class="col w-30">
      <label>DATA DE ABERTURA</label>
      <div class="valor destaque">${esc(d.dataAbertura||'')}</div>
    </div>
  </div>

  <!-- Nome Empresarial -->
  <div class="row">
    <div class="col w-100">
      <label>NOME EMPRESARIAL</label>
      <div class="valor destaque">${razaoClean}</div>
    </div>
  </div>

  <!-- Nome Fantasia | Porte -->
  <div class="row">
    <div class="col w-70">
      <label>TÍTULO DO ESTABELECIMENTO (NOME DE FANTASIA)</label>
      <div class="valor">${esc(d.nomeFantasia||'********')}</div>
    </div>
    <div class="col w-30">
      <label>PORTE</label>
      <div class="valor">${esc(d.porte||'')}</div>
    </div>
  </div>

  <!-- Atividade Principal -->
  <div class="row">
    <div class="col w-100">
      <label>CÓDIGO E DESCRIÇÃO DA ATIVIDADE ECONÔMICA PRINCIPAL</label>
      <div class="valor">${esc(d.atividadePrincipal||'Não informada')}</div>
    </div>
  </div>

  <!-- Atividades Secundárias -->
  <div class="row">
    <div class="col w-100">
      <label>CÓDIGO E DESCRIÇÃO DAS ATIVIDADES ECONÔMICAS SECUNDÁRIAS</label>
      <div class="valor">Não informada</div>
    </div>
  </div>

  <!-- Natureza Jurídica -->
  <div class="row">
    <div class="col w-100">
      <label>CÓDIGO E DESCRIÇÃO DA NATUREZA JURÍDICA</label>
      <div class="valor">${esc(d.naturezaJuridica||'')}</div>
    </div>
  </div>

  <!-- Logradouro | Número | Complemento -->
  <div class="row">
    <div class="col w-50">
      <label>LOGRADOURO</label>
      <div class="valor">${esc(d.endereco||'')}</div>
    </div>
    <div class="col w-15">
      <label>NÚMERO</label>
      <div class="valor">${esc(d.numero||'S/N')}</div>
    </div>
    <div class="col w-35">
      <label>COMPLEMENTO</label>
      <div class="valor">${esc(d.complemento||'********')}</div>
    </div>
  </div>

  <!-- CEP | Bairro | Município | UF -->
  <div class="row">
    <div class="col w-35">
      <label>CEP</label>
      <div class="valor">${esc(fmtCep(d.cep))}</div>
    </div>
    <div class="col w-35">
      <label>BAIRRO/DISTRITO</label>
      <div class="valor">${esc(d.bairro||'')}</div>
    </div>
    <div class="col w-20">
      <label>MUNICÍPIO</label>
      <div class="valor">${esc(d.municipio||'')}</div>
    </div>
    <div class="col w-10">
      <label>UF</label>
      <div class="valor">${esc(d.uf||'')}</div>
    </div>
  </div>

  <!-- Email | Telefone -->
  <div class="row">
    <div class="col w-60">
      <label>ENDEREÇO ELETRÔNICO</label>
      <div class="valor">${esc(d.email||'')}</div>
    </div>
    <div class="col w-40">
      <label>TELEFONE</label>
      <div class="valor">${esc(phoneForCard)}</div>
    </div>
  </div>

  <!-- Situação Cadastral | Data -->
  <div class="row">
    <div class="col w-60">
      <label>SITUAÇÃO CADASTRAL</label>
      <div class="valor destaque">${esc(d.situacao||'ATIVA')}</div>
    </div>
    <div class="col w-40">
      <label>DATA DA SITUAÇÃO CADASTRAL</label>
      <div class="valor">${esc(d.dataSituacao||'')}</div>
    </div>
  </div>

  <!-- Rodapé normativa -->
  <div class="rodape-normativa">
    <p>Aprovado pela Instrução Normativa RFB nº 2.119, de 06 de dezembro de 2022.</p>
    <p>Emitido no dia ${now} (data e hora de Brasília).</p>
  </div>
</div>

<!-- Botões (só aparecem na tela, ocultam na impressão) -->
<div class="actions">
  <button class="btn btn-green" onclick="window.print()">Imprimir / Salvar PDF</button>
  <button class="btn btn-gray" onclick="window.close()">Fechar</button>
</div>

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

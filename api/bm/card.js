const prisma = require('../_lib/prisma');
const { verifyAuth, setCors } = require('../_lib/auth');

/**
 * Gera um HTML que o navegador pode imprimir como PDF.
 * Retorna o HTML do cartão CNPJ com os dados do cliente + número SMS.
 */
function buildCardHtml({ razaoSocial, nomeFantasia, cnpj, endereco, cep, municipio, uf, situacao, atividadePrincipal, telefone, email, smsPhone, workerUrl }) {
  function esc(v) {
    return String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function formatCnpj(c) {
    const d = String(c || '').replace(/\D/g, '');
    return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') || c;
  }
  function formatCep(c) {
    const d = String(c || '').replace(/\D/g, '');
    return d.replace(/^(\d{5})(\d{3})$/, '$1-$2') || c;
  }

  const name = esc(nomeFantasia || razaoSocial);
  const rows = [
    ['Razão Social',        esc(razaoSocial)],
    nomeFantasia ? ['Nome Fantasia', esc(nomeFantasia)] : null,
    ['CNPJ',               formatCnpj(cnpj)],
    situacao ? ['Situação', esc(situacao)] : null,
    atividadePrincipal ? ['Atividade Principal', esc(atividadePrincipal)] : null,
    endereco ? ['Endereço', esc(endereco)] : null,
    cep ? ['CEP', formatCep(cep)] : null,
    municipio && uf ? ['Município / UF', `${esc(municipio)} - ${esc(uf)}`] : null,
    telefone ? ['Telefone', esc(telefone)] : null,
    email ? ['E-mail', esc(email)] : null,
    smsPhone ? ['Número SMS (verificação)', `<strong style="color:#1a7f4b;font-size:1.05em">${esc(smsPhone)}</strong>`] : null,
    workerUrl ? ['Site de verificação', `<a href="${esc(workerUrl)}" style="color:#2563eb">${esc(workerUrl)}</a>`] : null,
  ].filter(Boolean);

  const rowsHtml = rows.map(([label, value]) => `
    <tr>
      <td class="label">${label}</td>
      <td class="value">${value}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Cartão CNPJ – ${name}</title>
  <style>
    @page { size: A4; margin: 20mm 18mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #fff; color: #111; font-size: 13px; }
    .card { border: 2px solid #1a7f4b; border-radius: 12px; overflow: hidden; max-width: 600px; margin: 0 auto; }
    .header { background: linear-gradient(135deg, #1a365d, #1a7f4b); padding: 24px 28px; color: #fff; }
    .header h1 { font-size: 1.35rem; font-weight: 700; margin-bottom: 4px; }
    .header p { font-size: 0.8rem; opacity: 0.75; }
    .badge { display: inline-block; margin-top: 10px; background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.3); padding: 3px 12px; border-radius: 999px; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.06em; }
    table { width: 100%; border-collapse: collapse; }
    tr:nth-child(even) { background: #f8fdf9; }
    td { padding: 10px 20px; vertical-align: top; }
    td.label { width: 38%; font-weight: 600; color: #4a5568; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.05em; padding-right: 8px; }
    td.value { color: #1a202c; font-size: 0.88rem; }
    .footer { background: #f0fdf4; border-top: 1px solid #bbf7d0; padding: 12px 20px; text-align: center; font-size: 0.72rem; color: #6b7280; }
    .print-btn { display: block; margin: 20px auto; padding: 10px 28px; background: #1a7f4b; color: #fff; border: none; border-radius: 8px; font-size: 0.9rem; font-weight: 600; cursor: pointer; }
    @media print { .print-btn { display: none; } body { background: #fff; } }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>${name}</h1>
      <p>Cartão CNPJ</p>
      <span class="badge">🇧🇷 Receita Federal do Brasil</span>
    </div>
    <table>${rowsHtml}
    </table>
    <div class="footer">Documento gerado em ${new Date().toLocaleString('pt-BR')} • Dados da Receita Federal</div>
  </div>
  <button class="print-btn" onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>
</body>
</html>`;
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });

  const user = verifyAuth(req, res);
  if (!user) return;

  try {
    const { clientId } = req.query;
    if (!clientId) return res.status(400).json({ error: 'clientId é obrigatório.' });

    // Busca cliente
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' });

    // Busca último SMS com código recebido
    const smsLog = await prisma.smsLog.findFirst({
      where: { clientId, status: 'RECEIVED' },
      orderBy: { createdAt: 'desc' },
    });

    // Busca domínio ativo
    const domain = await prisma.domain.findFirst({
      where: { clientId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });

    const env = require('../_lib/env');
    const workerUrl = domain
      ? `https://${domain.cloudflareZoneId}.${env.cloudflareWorkersSubdomain}.workers.dev`
      : null;

    const html = buildCardHtml({
      razaoSocial:        client.razaoSocial,
      nomeFantasia:       client.nomeFantasia,
      cnpj:               client.cnpj,
      endereco:           client.endereco,
      cep:                client.cep,
      municipio:          client.municipio,
      uf:                 client.uf,
      situacao:           client.situacao,
      atividadePrincipal: client.atividadePrincipal,
      telefone:           client.telefone,
      email:              client.email,
      smsPhone:           smsLog?.phoneNumber || null,
      workerUrl,
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

/**
 * Cloudflare Email Worker — recebe emails e salva no banco via API
 * 
 * Deploy na conta zapliftyativos:
 * 1. Na Cloudflare → Workers & Pages → Create Worker
 * 2. Nome: email-receiver
 * 3. Cola este código
 * 4. Depois vai em cada domínio → Email → Email Routing → Enable
 * 5. Adiciona Catch-all rule → "Send to Worker" → email-receiver
 */
export default {
  async email(message, env, ctx) {
    // Extrai dados do email
    const to = message.to;
    const from = message.from;
    const subject = message.headers.get('subject') || '(sem assunto)';
    
    // Lê o corpo do email
    const reader = message.raw.getReader();
    const chunks = [];
    let done = false;
    while (!done) {
      const { value, done: d } = await reader.read();
      if (value) chunks.push(value);
      done = d;
    }
    const rawEmail = new TextDecoder().decode(new Uint8Array(chunks.flat()));
    
    // Extrai só o texto (simplificado - pega o body entre boundaries ou texto puro)
    let body = rawEmail;
    // Tenta pegar só o conteúdo relevante (últimos 2000 chars se muito grande)
    if (body.length > 3000) {
      body = body.slice(-2000);
    }

    // Extrai domínio do destinatário
    const domain = to.split('@')[1] || '';

    // Envia pro endpoint da API
    try {
      const resp = await fetch('https://bmfarme.vercel.app/api/email/receive', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-email-key': 'bmfarme-email-2026'
        },
        body: JSON.stringify({ to, from, subject, body, domain })
      });
      
      if (!resp.ok) {
        console.log('Erro ao salvar email:', await resp.text());
      }
    } catch (e) {
      console.log('Erro fetch:', e.message);
    }
  }
}

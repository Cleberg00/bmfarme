/**
 * Cloudflare Email Worker - email-receiver
 * Recebe emails via Email Routing e encaminha pro backend
 * 
 * Deploy: wrangler deploy --name email-receiver
 * Conta: zapliftyativos (zaplifyativos@gmail.com)
 */

export default {
  async email(message, env, ctx) {
    try {
      const to = message.to || '';
      const from = message.from || '';
      const subject = message.headers.get('subject') || '(sem assunto)';
      
      // Lê o body do email
      const rawBody = await new Response(message.raw).text();
      
      // Extrai texto simples do email (remove headers e HTML)
      let body = '';
      if (rawBody.includes('Content-Type: text/plain')) {
        const parts = rawBody.split('Content-Type: text/plain');
        if (parts[1]) {
          const afterHeaders = parts[1].split('\r\n\r\n').slice(1).join('\r\n\r\n');
          body = afterHeaders.split('--')[0].trim();
        }
      }
      if (!body) {
        // Fallback: tenta extrair qualquer texto útil
        body = rawBody
          .replace(/<[^>]+>/g, ' ')
          .replace(/\r\n/g, '\n')
          .split('\n')
          .filter(line => !line.startsWith('Content-') && !line.startsWith('MIME-') && !line.startsWith('Date:') && !line.startsWith('From:') && !line.startsWith('To:') && !line.startsWith('Subject:') && !line.startsWith('Message-ID:') && line.trim().length > 0)
          .join('\n')
          .slice(0, 5000);
      }

      const domain = to.split('@')[1] || '';

      // Envia pro backend
      const response = await fetch('https://bmfarme.vercel.app/api/infra/deploy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-email-key': 'bmfarme-email-2026',
        },
        body: JSON.stringify({
          action: 'email_receive',
          to,
          from,
          subject,
          body,
          domain,
        }),
      });

      const result = await response.json();
      console.log(`[email-receiver] ${to} from ${from}: ${response.status}`, result);
    } catch (err) {
      console.error('[email-receiver] Erro:', err.message || err);
    }
  },
};

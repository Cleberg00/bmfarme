import { useEffect, useState } from 'react';
import api from '../../api/client';

type Email = {
  id: string;
  to: string;
  from: string;
  subject: string;
  body: string;
  domain: string;
  read: boolean;
  createdAt: string;
};

type EmailInboxBlockProps = {
  workerUrl?: string;
};

export default function EmailInboxBlock({ workerUrl }: EmailInboxBlockProps) {
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const emailAddress = workerUrl ? (() => {
    try {
      const u = new URL(workerUrl);
      const parts = u.hostname.split('.');
      const sub = parts[0];
      const dom = parts.slice(1).join('.');
      return `${sub}@${dom}`;
    } catch { return ''; }
  })() : '';

  const emailDomain = emailAddress.split('@')[1] || '';

  const fetchEmails = async () => {
    if (!emailDomain) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/email/list?domain=${emailDomain}&limit=30`);
      setEmails(data);
    } catch (e) {
      console.error('Erro ao buscar emails:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!emailDomain) return;
    fetchEmails();
    if (autoRefresh) {
      const interval = setInterval(fetchEmails, 10000);
      return () => clearInterval(interval);
    }
  }, [emailDomain, autoRefresh]);

  const deleteEmail = async (id: string) => {
    try {
      await api.delete(`/email/list?id=${id}`);
      setEmails(prev => prev.filter(e => e.id !== id));
      if (selectedEmail?.id === id) setSelectedEmail(null);
    } catch { /* ignore */ }
  };

  const extractCode = (body: string): string | null => {
    const patterns = [
      /(\d{4,8})/,
      /code[:\s]*(\d{4,8})/i,
      /c[óo]digo[:\s]*(\d{4,8})/i,
      /verification[:\s]*(\d{4,8})/i,
    ];
    for (const p of patterns) {
      const m = body.match(p);
      if (m) return m[1];
    }
    return null;
  };

  if (!workerUrl) return null;

  return (
    <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-indigo-400">📧 Caixa de Email</p>
          <p className="text-sm text-indigo-300 font-mono mt-1">{emailAddress}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchEmails}
            disabled={loading}
            className="rounded-lg border border-indigo-500/50 bg-indigo-500/10 px-3 py-1.5 text-xs text-indigo-300 hover:bg-indigo-500/20 disabled:opacity-50"
          >
            {loading ? '⏳' : '🔄'} Atualizar
          </button>
          <label className="flex items-center gap-1 text-xs text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            Auto (10s)
          </label>
        </div>
      </div>

      {emails.length === 0 ? (
        <div className="text-center py-6 text-slate-500 text-sm">
          <p>📭 Nenhum email recebido ainda</p>
          <p className="text-xs mt-1">Emails para <span className="text-indigo-400 font-mono">{emailAddress}</span> aparecerão aqui</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {emails.map(email => {
            const code = extractCode(email.body);
            return (
              <div
                key={email.id}
                className={`rounded-lg border p-3 cursor-pointer transition ${
                  selectedEmail?.id === email.id
                    ? 'border-indigo-500 bg-indigo-500/10'
                    : 'border-slate-700 bg-slate-800/60 hover:border-indigo-500/50'
                }`}
                onClick={() => setSelectedEmail(email)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-200 truncate">{email.subject}</p>
                    <p className="text-xs text-slate-500 mt-0.5">De: {email.from}</p>
                    <p className="text-xs text-slate-600 mt-0.5">{new Date(email.createdAt).toLocaleString('pt-BR')}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {code && (
                      <span className="bg-green-500/20 border border-green-500/50 text-green-300 text-xs font-mono font-bold px-2 py-1 rounded">
                        {code}
                      </span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteEmail(email.id); }}
                      className="text-red-400 hover:text-red-300 text-xs"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedEmail && (
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-4 mt-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-bold text-slate-200">{selectedEmail.subject}</p>
            <button onClick={() => setSelectedEmail(null)} className="text-slate-500 hover:text-slate-300 text-xs">✕ Fechar</button>
          </div>
          <p className="text-xs text-slate-500 mb-2">De: {selectedEmail.from} → {selectedEmail.to}</p>
          <pre className="text-xs text-slate-300 whitespace-pre-wrap max-h-48 overflow-y-auto bg-slate-800 p-3 rounded">
            {selectedEmail.body}
          </pre>
        </div>
      )}
    </div>
  );
}

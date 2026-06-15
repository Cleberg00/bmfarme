import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../../api/client';
import CopyButton from '../ui/CopyButton';

type Message = {
  _id: { $oid: string };
  mail_from: string;
  mail_subject: string;
  mail_preview: string;
  mail_timestamp: number;
};

type TempMailBlockProps = {
  razaoSocial?: string;
  onEmailGenerated?: (email: string) => void;
};

export default function TempMailBlock({ razaoSocial, onEmailGenerated }: TempMailBlockProps) {
  const [email, setEmail]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [messages, setMessages]   = useState<Message[]>([]);
  const [polling, setPolling]     = useState(false);
  const [newMsg, setNewMsg]       = useState(false);
  const intervalRef               = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    setPolling(false);
  }, []);

  // Gera nome base a partir da razão social
  const baseName = razaoSocial
    ? razaoSocial.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '').slice(0, 15)
    : 'empresa';

  const generate = async () => {
    setLoading(true);
    stopPolling();
    setMessages([]);
    setNewMsg(false);
    try {
      const { data } = await api.get(`/auth/register?action=generate&name=${baseName}`);
      setEmail(data.email);
      onEmailGenerated?.(data.email);
      // Inicia polling de inbox
      setPolling(true);
      intervalRef.current = setInterval(async () => {
        try {
          const { data: inbox } = await api.get(`/auth/register?action=inbox&email=${encodeURIComponent(data.email)}`);
          if (inbox.count > 0) {
            setMessages(inbox.messages);
            setNewMsg(true);
          }
        } catch { /* silencioso */ }
      }, 8000);
    } catch { /* silencioso */ }
    finally { setLoading(false); }
  };

  // Auto-gera quando razão social chega
  useEffect(() => {
    if (razaoSocial && !email) { generate(); }
    return () => stopPolling();
  }, [razaoSocial]); // eslint-disable-line

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {/* Email gerado */}
        <div className="flex-1 rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2.5 flex items-center gap-2 min-w-0">
          {loading ? (
            <span className="text-xs text-slate-500 animate-pulse">Gerando email...</span>
          ) : email ? (
            <>
              <span className="text-sm font-mono text-slate-100 truncate flex-1">{email}</span>
              <CopyButton value={email} label="email" />
              {polling && <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse shrink-0" title="Aguardando emails" />}
              {newMsg && <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" title="Novo email!" />}
            </>
          ) : (
            <span className="text-xs text-slate-600">Nenhum email gerado</span>
          )}
        </div>
        <button type="button" onClick={generate} disabled={loading}
          className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-300 hover:text-white transition disabled:opacity-50 shrink-0">
          {email ? '🔄 Novo email' : '📧 Gerar email'}
        </button>
      </div>

      {/* Caixa de entrada */}
      {messages.length > 0 && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 overflow-hidden">
          <div className="px-4 py-2 border-b border-emerald-500/20">
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-400">📬 {messages.length} mensagem(ns) recebida(s)</p>
          </div>
          <div className="divide-y divide-slate-800">
            {messages.map(m => (
              <div key={m._id.$oid} className="px-4 py-3">
                <p className="text-xs font-semibold text-slate-300 truncate">{m.mail_subject || '(sem assunto)'}</p>
                <p className="text-xs text-slate-500 mt-0.5">De: {m.mail_from}</p>
                {m.mail_preview && <p className="text-xs text-slate-400 mt-1 line-clamp-2">{m.mail_preview}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {polling && messages.length === 0 && (
        <p className="text-xs text-slate-600 flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
          Monitorando inbox... (atualiza a cada 8s)
        </p>
      )}
    </div>
  );
}

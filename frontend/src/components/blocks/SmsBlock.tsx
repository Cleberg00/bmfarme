import { useEffect, useRef, useState } from 'react';
import api from '../../api/client';
import { useSmsPoll } from '../../hooks/useSmsPoll';
import CopyButton from '../ui/CopyButton';
import axios from 'axios';

type SmsBlockProps = {
  clientId: string | null;
  onSmsReady: (smsLogId: string, code: string, phone: string) => void;
  onPhoneGenerated?: (phone: string) => void;
};

export default function SmsBlock({ clientId, onSmsReady, onPhoneGenerated }: SmsBlockProps) {
  const [logId, setLogId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [provider, setProvider] = useState<'SMS24H' | 'HEROSMS'>('SMS24H');
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [generatedPhone, setGeneratedPhone] = useState<string | null>(null);
  const lastDeliveredCodeRef = useRef<string | null>(null);

  const SMS_TIMEOUT = 1200; // 20 minutos pra ambos providers

  const { status, smsCode, isPolling, phoneNumber } = useSmsPoll(logId, Boolean(logId));

  // Timer countdown
  useEffect(() => {
    if (!startTime || smsCode || status === 'EXPIRED' || status === 'FAILED') return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime, smsCode, status]);

  const remaining = Math.max(0, SMS_TIMEOUT - elapsed);
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  // Dispara onSmsReady quando código chegar
  useEffect(() => {
    if (!smsCode || !logId || lastDeliveredCodeRef.current === smsCode) return;
    lastDeliveredCodeRef.current = smsCode;
    onSmsReady(logId, smsCode, phoneNumber ?? '');
  }, [logId, onSmsReady, smsCode, phoneNumber]);

  // Dispara onPhoneGenerated assim que o número for gerado (antes do código chegar)
  useEffect(() => {
    if (!phoneNumber || !onPhoneGenerated) return;
    onPhoneGenerated(phoneNumber);
  }, [phoneNumber, onPhoneGenerated]);

  const handleGenerate = async () => {
    if (!clientId) return;
    setLoading(true);
    setError('');
    setLogId(null);
    setConfirmed(false);
    setStartTime(null);
    setElapsed(0);
    setGeneratedPhone(null);
    lastDeliveredCodeRef.current = null;
    try {
      const { data } = await api.post('/sms/generate', { clientId, provider });
      const nextLogId: string = data.id ?? data.smsLog?.id;
      setLogId(nextLogId);
      setGeneratedPhone(data.phoneNumber || null);
      setStartTime(Date.now());
    } catch (err) {
      setError(
        axios.isAxiosError(err)
          ? err.response?.data?.error || err.message
          : err instanceof Error ? err.message : 'Falha ao gerar número.'
      );
    } finally {
      setLoading(false);
    }
  };

  const displayPhone = phoneNumber ?? generatedPhone;

  return (
    <div className="space-y-5">
      {/* Seletor de provider SMS */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-slate-300">Provedor SMS</label>
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setProvider('SMS24H')}
            className={`rounded-xl border px-4 py-3 text-left transition ${
              provider === 'SMS24H'
                ? 'border-emerald-500 bg-emerald-500/10'
                : 'border-slate-700 bg-slate-800/60 hover:border-slate-600'
            }`}
          >
            <p className={`text-sm font-semibold ${provider === 'SMS24H' ? 'text-emerald-300' : 'text-slate-200'}`}>SMS24h</p>
            <p className="text-xs text-slate-500 mt-0.5">Principal — sms24h.org</p>
          </button>
          <button
            type="button"
            onClick={() => setProvider('HEROSMS')}
            className={`rounded-xl border px-4 py-3 text-left transition ${
              provider === 'HEROSMS'
                ? 'border-purple-500 bg-purple-500/10'
                : 'border-slate-700 bg-slate-800/60 hover:border-slate-600'
            }`}
          >
            <p className={`text-sm font-semibold ${provider === 'HEROSMS' ? 'text-purple-300' : 'text-slate-200'}`}>HeroSMS</p>
            <p className="text-xs text-slate-500 mt-0.5">Backup — hero-sms.com</p>
          </button>
        </div>
      </div>

      {/* Botão gerar */}
      <button
        type="button"
        onClick={handleGenerate}
        disabled={loading}
        className="flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 font-bold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? (
          <>
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" className="stroke-current opacity-20" strokeWidth="4" />
              <path d="M22 12a10 10 0 0 0-10-10" className="stroke-current" strokeWidth="4" strokeLinecap="round" />
            </svg>
            Gerando número...
          </>
        ) : logId ? '🔄 Gerar Novo Número' : '📱 Gerar Número SMS'}
      </button>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          ❌ {error}
        </div>
      )}

      {/* Número gerado */}
      {displayPhone && (
        <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-500">Número para receber SMS</p>
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-2xl font-bold text-slate-100">{displayPhone}</p>
            <CopyButton value={displayPhone} label="número" />
          </div>
        </div>
      )}

      {/* Status aguardando + timer */}
      {isPolling && !smsCode && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="h-3 w-3 animate-pulse rounded-full bg-blue-400" />
            <p className="text-sm font-medium text-blue-300">Aguardando SMS...</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`font-mono text-lg font-bold ${remaining < 60 ? 'text-red-400' : remaining < 120 ? 'text-amber-400' : 'text-blue-300'}`}>
              {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
            </span>
          </div>
        </div>
      )}

      {/* Código recebido */}
      {smsCode && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-5 space-y-4">
          <p className="mb-2 text-sm font-semibold text-emerald-300">✅ Código SMS recebido!</p>
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-5xl font-bold tracking-widest text-emerald-400">{smsCode}</p>
            <CopyButton value={smsCode} label="código SMS" />
          </div>
          {/* Botões confirmar / reenviar */}
          {!confirmed ? (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-emerald-500/20">
              <button
                type="button"
                onClick={async () => {
                  if (logId) try { await api.post(`/sms/check/${logId}`, { action: 'confirm' }); setConfirmed(true); } catch {}
                }}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 transition"
              >
                ✅ Confirmar Recebimento
              </button>
              <button
                type="button"
                onClick={async () => { if (logId) try { await api.post(`/sms/check/${logId}`, { action: 'resend' }); } catch {} }}
                className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs font-bold text-amber-300 hover:bg-amber-500/20 transition"
              >
                🔄 Solicitar Reenvio
              </button>
            </div>
          ) : (
            <p className="text-xs text-emerald-400 pt-2 border-t border-emerald-500/20">✅ SMS confirmado com sucesso!</p>
          )}
        </div>
      )}

      {/* Expirado/falha */}
      {(status === 'EXPIRED' || status === 'FAILED') && !smsCode && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          ⚠️ SMS {status === 'EXPIRED' ? 'expirou' : 'falhou'}. Clique em "Gerar Novo Número" para tentar novamente.
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import api from '../../api/client';
import { useSmsPoll } from '../../hooks/useSmsPoll';
import StatusBadge from '../ui/StatusBadge';
import axios from 'axios';

type SmsBlockProps = {
  clientId: string | null;
  onSmsReady: (smsLogId: string, code: string) => void;
};

export default function SmsBlock({ clientId, onSmsReady }: SmsBlockProps) {
  const [logId, setLogId] = useState<string | null>(null);
  const [generatedPhone, setGeneratedPhone] = useState<string | null>(null);
  const [requestStatus, setRequestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');
  const [flashBorder, setFlashBorder] = useState(false);
  const flashTimeoutRef = useRef<number | null>(null);
  const lastDeliveredCodeRef = useRef<string | null>(null);

  const { status, smsCode, isPolling, phoneNumber } = useSmsPoll(logId ? String(logId) : null, Boolean(logId));

  useEffect(() => {
    if (!smsCode || !logId || lastDeliveredCodeRef.current === smsCode) {
      return;
    }
    lastDeliveredCodeRef.current = smsCode;
    onSmsReady(logId, smsCode);
    setFlashBorder(true);
    if (flashTimeoutRef.current) {
      window.clearTimeout(flashTimeoutRef.current);
    }
    flashTimeoutRef.current = window.setTimeout(() => setFlashBorder(false), 1800);
    return () => {
      if (flashTimeoutRef.current) {
        window.clearTimeout(flashTimeoutRef.current);
      }
    };
  }, [logId, onSmsReady, smsCode]);

  const badgeStatus = useMemo<'idle' | 'loading' | 'success' | 'error'>(() => {
    if (requestStatus === 'error' || status === 'FAILED' || status === 'EXPIRED') {
      return 'error';
    }
    if (smsCode) {
      return 'success';
    }
    if (requestStatus === 'loading' || isPolling) {
      return 'loading';
    }
    return requestStatus;
  }, [isPolling, requestStatus, smsCode, status]);

  const handleGenerate = async () => {
    if (!clientId) {
      return;
    }
    setRequestStatus('loading');
    setError('');
    setGeneratedPhone(null);
    try {
      const { data } = await api.post('/sms/generate', { clientId });
      const nextLogId: string = data.smsLog?.id ?? data.id;
      const nextPhone: string | null = data.smsLog?.phoneNumber ?? data.phoneNumber ?? null;
      setLogId(nextLogId);
      setGeneratedPhone(nextPhone);
      lastDeliveredCodeRef.current = null;
      setRequestStatus('success');
    } catch (requestError) {
      setRequestStatus('error');
      setError(
        axios.isAxiosError(requestError)
          ? requestError.response?.data?.message || requestError.message
          : requestError instanceof Error
            ? requestError.message
            : 'Falha ao gerar número.'
      );
    }
  };

  return (
    <div className={`space-y-5 rounded-2xl border ${flashBorder ? 'animate-flash-border border-emerald-500/50' : 'border-transparent'}`}>
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={requestStatus === 'loading'}
          className="rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Gerar Numero
        </button>
        <StatusBadge
          status={badgeStatus}
          label={smsCode ? 'Código recebido' : isPolling ? 'Aguardando SMS' : requestStatus === 'error' ? 'Erro no SMS' : 'SMS pendente'}
        />
      </div>

      {(generatedPhone || phoneNumber) && (
        <div className="rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3">
          <p className="text-sm text-slate-400">Número gerado</p>
          <p className="mt-1 text-lg font-mono text-slate-100">{phoneNumber || generatedPhone}</p>
        </div>
      )}

      {isPolling && (
        <div className="flex items-center gap-3 text-sm text-emerald-300">
          <span className="animate-pulse-dot h-3 w-3 rounded-full bg-emerald-400" />
          <span>Aguardando codigo...</span>
        </div>
      )}

      {smsCode && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-5">
          <p className="text-sm text-emerald-300">Código recebido</p>
          <p className="mt-2 text-4xl font-bold text-emerald-400">{smsCode}</p>
        </div>
      )}

      {(status === 'EXPIRED' || status === 'FAILED' || error) && (
        <p className="text-sm text-red-400">{error || `Status do SMS: ${status}`}</p>
      )}
    </div>
  );
}

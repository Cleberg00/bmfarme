import { useState } from 'react';
import api from '../../api/client';
import StatusBadge from '../ui/StatusBadge';
import axios from 'axios';

type InfraBlockProps = {
  clientId: number | null;
  onDomainReady: (domainId: number) => void;
};

export default function InfraBlock({ clientId, onDomainReady }: InfraBlockProps) {
  const [domainName, setDomainName] = useState('');
  const [metaVerificationCode, setMetaVerificationCode] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');

  const handleDeploy = async () => {
    if (!clientId) {
      return;
    }
    setStatus('loading');
    setError('');
    try {
      const { data } = await api.post('/infra/deploy', { domainName, metaVerificationCode, clientId });
      setStatus('success');
      onDomainReady(data.id ?? data.domain?.id);
    } catch (requestError) {
      setStatus('error');
      setError(
        axios.isAxiosError(requestError)
          ? requestError.response?.data?.message || requestError.message
          : requestError instanceof Error
            ? requestError.message
            : 'Falha ao subir infraestrutura.'
      );
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-300">Domínio</label>
          <input
            value={domainName}
            onChange={(event) => setDomainName(event.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-3 text-slate-100 outline-none transition focus:border-emerald-500"
            placeholder="cliente.exemplo.com"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-300">Meta Verification Code</label>
          <input
            value={metaVerificationCode}
            onChange={(event) => setMetaVerificationCode(event.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-3 text-slate-100 outline-none transition focus:border-emerald-500"
            placeholder="meta-verification-code"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={handleDeploy}
          disabled={status === 'loading'}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === 'loading' && (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" className="stroke-current opacity-20" strokeWidth="4" />
              <path d="M22 12a10 10 0 0 0-10-10" className="stroke-current" strokeWidth="4" strokeLinecap="round" />
            </svg>
          )}
          <span>Subir Infra</span>
        </button>
        <StatusBadge
          status={status}
          label={status === 'idle' ? 'Infra pendente' : status === 'loading' ? 'Provisionando domínio' : status === 'success' ? 'Dominio ativo' : 'Erro na infraestrutura'}
        />
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {status === 'success' && (
        <div className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300">
          Dominio ativo
        </div>
      )}
    </div>
  );
}
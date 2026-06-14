import { useMemo, useState } from 'react';
import api from '../../api/client';
import StatusBadge from '../ui/StatusBadge';
import axios from 'axios';

type ClientPayload = {
  id: number;
  razaoSocial: string;
  endereco: string;
  cep: string;
};

type CnpjBlockProps = {
  onClientReady: (clientId: number, data: { razaoSocial: string; endereco: string; cep: string }) => void;
};

function formatCnpj(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

export default function CnpjBlock({ onClientReady }: CnpjBlockProps) {
  const [cnpj, setCnpj] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');
  const [client, setClient] = useState<ClientPayload | null>(null);

  const rawDigits = useMemo(() => cnpj.replace(/\D/g, ''), [cnpj]);

  const handleBlur = async () => {
    if (rawDigits.length < 14) {
      return;
    }
    setStatus('loading');
    setError('');
    try {
      const { data } = await api.get(`/cnpj/${rawDigits}`);
      // API retorna o objeto Client direto
      const nextClient = data as ClientPayload;
      setClient(nextClient);
      setStatus('success');
      onClientReady(nextClient.id, {
        razaoSocial: nextClient.razaoSocial,
        endereco: nextClient.endereco,
        cep: nextClient.cep,
      });
    } catch (requestError) {
      setClient(null);
      setStatus('error');
      setError(
        axios.isAxiosError(requestError)
          ? requestError.response?.data?.message || requestError.message
          : requestError instanceof Error
            ? requestError.message
            : 'Falha ao consultar CNPJ.'
      );
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex-1 space-y-2">
          <label className="text-sm font-medium text-slate-300">CNPJ</label>
          <input
            value={cnpj}
            onChange={(event) => setCnpj(formatCnpj(event.target.value))}
            onBlur={handleBlur}
            placeholder="00.000.000/0000-00"
            className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-3 text-slate-100 outline-none transition focus:border-emerald-500"
          />
        </div>
        <StatusBadge
          status={status}
          label={status === 'idle' ? 'Aguardando consulta' : status === 'loading' ? 'Consultando CNPJ' : status === 'success' ? 'Cliente carregado' : 'Erro na consulta'}
        />
      </div>

      {status === 'loading' && (
        <div className="flex items-center gap-3 text-sm text-slate-300">
          <svg className="h-5 w-5 animate-spin text-emerald-400" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" className="stroke-current opacity-20" strokeWidth="4" />
            <path d="M22 12a10 10 0 0 0-10-10" className="stroke-current" strokeWidth="4" strokeLinecap="round" />
          </svg>
          <span>Buscando dados do cliente...</span>
        </div>
      )}

      {status === 'error' && <p className="text-sm text-red-400">{error}</p>}

      {client && status === 'success' && (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="bg-slate-800/50 rounded-lg p-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">Razão Social</p>
            <p className="mt-2 text-sm text-slate-100">{client.razaoSocial}</p>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">Endereço</p>
            <p className="mt-2 text-sm text-slate-100">{client.endereco}</p>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">CEP</p>
            <p className="mt-2 text-sm text-slate-100">{client.cep}</p>
          </div>
        </div>
      )}
    </div>
  );
}
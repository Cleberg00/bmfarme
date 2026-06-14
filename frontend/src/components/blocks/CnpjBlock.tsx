import { useMemo, useState } from 'react';
import api from '../../api/client';
import StatusBadge from '../ui/StatusBadge';
import axios from 'axios';

type ClientPayload = {
  id: string;
  cnpj: string;
  razaoSocial: string;
  endereco: string;
  cep: string;
};

type CnpjBlockProps = {
  onClientReady: (clientId: string, data: { razaoSocial: string; endereco: string; cep: string }) => void;
};

function formatCnpj(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // fallback para browsers antigos
      const el = document.createElement('textarea');
      el.value = value;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Copiar"
      className="ml-2 shrink-0 rounded-lg border border-slate-600 bg-slate-700 px-2 py-1 text-xs font-medium text-slate-300 transition hover:border-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-300"
    >
      {copied ? '✓ Copiado' : 'Copiar'}
    </button>
  );
}

function DataField({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-800/50 rounded-lg p-3">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-sm text-slate-100 break-all">{value || '—'}</p>
        {value && <CopyButton value={value} />}
      </div>
    </div>
  );
}

export default function CnpjBlock({ onClientReady }: CnpjBlockProps) {
  const [cnpj, setCnpj] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');
  const [client, setClient] = useState<ClientPayload | null>(null);

  const rawDigits = useMemo(() => cnpj.replace(/\D/g, ''), [cnpj]);

  const handleSearch = async () => {
    if (rawDigits.length < 14) return;
    setStatus('loading');
    setError('');
    setClient(null);
    try {
      const { data } = await api.get<ClientPayload>(`/cnpj/${rawDigits}`);
      setClient(data);
      setStatus('success');
      onClientReady(data.id, {
        razaoSocial: data.razaoSocial,
        endereco: data.endereco,
        cep: data.cep,
      });
    } catch (requestError) {
      setClient(null);
      setStatus('error');
      setError(
        axios.isAxiosError(requestError)
          ? requestError.response?.data?.error || requestError.message
          : requestError instanceof Error
            ? requestError.message
            : 'Falha ao consultar CNPJ.'
      );
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="flex-1 space-y-2">
          <label className="text-sm font-medium text-slate-300">CNPJ</label>
          <input
            value={cnpj}
            onChange={(e) => setCnpj(formatCnpj(e.target.value))}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="00.000.000/0000-00"
            className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-3 text-slate-100 outline-none transition focus:border-emerald-500"
          />
        </div>
        <button
          type="button"
          onClick={handleSearch}
          disabled={rawDigits.length < 14 || status === 'loading'}
          className="rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === 'loading' ? 'Consultando...' : 'Consultar'}
        </button>
        <StatusBadge
          status={status}
          label={
            status === 'idle' ? 'Aguardando consulta'
            : status === 'loading' ? 'Consultando CNPJ'
            : status === 'success' ? 'Cliente carregado'
            : 'Erro na consulta'
          }
        />
      </div>

      {status === 'error' && <p className="text-sm text-red-400">{error}</p>}

      {client && status === 'success' && (
        <div className="grid gap-4 md:grid-cols-3">
          <DataField label="Razão Social" value={client.razaoSocial} />
          <DataField label="Endereço" value={client.endereco} />
          <DataField label="CEP" value={client.cep} />
        </div>
      )}
    </div>
  );
}

import { useMemo, useState } from 'react';
import api from '../../api/client';
import CopyButton from '../ui/CopyButton';
import axios from 'axios';
import TempMailBlock from './TempMailBlock';

type ClientPayload = {
  id: string;
  cnpj: string;
  razaoSocial: string;
  nomeFantasia?: string;
  endereco: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cep: string;
  municipio?: string;
  uf?: string;
  situacao?: string;
  atividadePrincipal?: string;
  telefone?: string;
  email?: string;
};

type CnpjBlockProps = {
  onClientReady: (clientId: string, data: { razaoSocial: string; endereco: string; cep: string }) => void;
  workerUrl?: string | null;
};

// Palavras que ficam minúsculas no título
const LOWER_WORDS = new Set(['de','da','do','dos','das','e','em','a','o','para','com','por','ou','ao','às','nos','nas']);

function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map((word, i) => {
      if (i > 0 && LOWER_WORDS.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

// Remove números/pontos do início da razão social (ex: "65.682.194 THAIS..." → "THAIS...")
function cleanRazao(str: string): string {
  return str.replace(/^[\d.\s-]+/, '').trim();
}

function FieldCopy({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-3">
      <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-500">{label}</p>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-slate-100 break-words flex-1">{value}</p>
        <CopyButton value={value} label={label} />
      </div>
    </div>
  );
}

function formatCnpj(value: string) {
  const d = value.replace(/\D/g, '').slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

export default function CnpjBlock({ onClientReady, workerUrl }: CnpjBlockProps) {
  const [cnpj, setCnpj] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [client, setClient] = useState<ClientPayload | null>(null);

  const rawDigits = useMemo(() => cnpj.replace(/\D/g, ''), [cnpj]);
  const isReady = rawDigits.length === 14;

  const handleSearch = async () => {
    if (!isReady) return;
    setLoading(true);
    setError('');
    setClient(null);
    try {
      const { data } = await api.get<ClientPayload>(`/cnpj/${rawDigits}`);
      setClient(data);
      onClientReady(data.id, {
        razaoSocial: data.razaoSocial,
        endereco: data.endereco,
        cep: data.cep,
      });
    } catch (err) {
      setError(
        axios.isAxiosError(err)
          ? err.response?.data?.error || err.message
          : err instanceof Error ? err.message : 'Falha ao consultar CNPJ.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1.5">
          <label className="text-sm font-semibold text-slate-300">CNPJ da empresa</label>
          <input
            value={cnpj}
            onChange={(e) => setCnpj(formatCnpj(e.target.value))}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="00.000.000/0000-00"
            maxLength={18}
            className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-3 text-lg text-slate-100 outline-none transition focus:border-emerald-500"
          />
        </div>
        <button
          type="button"
          onClick={handleSearch}
          disabled={!isReady || loading}
          className="flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-base font-bold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <>
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" className="stroke-current opacity-20" strokeWidth="4" />
                <path d="M22 12a10 10 0 0 0-10-10" className="stroke-current" strokeWidth="4" strokeLinecap="round" />
              </svg>
              Buscando...
            </>
          ) : 'Consultar CNPJ'}
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {client && (
        <div className="space-y-3">
          {/* Header da empresa — nome em título */}
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-slate-800/60 px-4 py-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 border border-blue-500/20">
              <svg className="h-6 w-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
                <polyline strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} points="9,22 9,12 15,12 15,22"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-bold text-slate-100">
                  {toTitleCase(cleanRazao(client.nomeFantasia || client.razaoSocial))}
                </h3>
                {client.situacao && (
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${client.situacao.toUpperCase().includes('ATIVA') ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
                    {client.situacao}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {toTitleCase(cleanRazao(client.razaoSocial))} · {client.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')}
              </p>
            </div>
          </div>

          {/* Campos copiáveis — dados originais em MAIÚSCULO como vem da Receita */}
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldCopy label="Razão Social" value={client.razaoSocial} />
            {client.nomeFantasia && <FieldCopy label="Nome Fantasia" value={client.nomeFantasia} />}
            <FieldCopy label="CNPJ (EIN)" value={client.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')} />
            {client.situacao && <FieldCopy label="Situação" value={client.situacao} />}
          </div>

          {/* Endereço separado por campo — para preencher no Meta */}
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-3 space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">📍 Endereço (campos separados para o Meta)</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <FieldCopy label="Endereço (logradouro)" value={client.endereco} />
              {!client.endereco && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                  ⚠️ Logradouro não disponível na Receita Federal — preencha manualmente no cartão CNPJ
                </div>
              )}
              <FieldCopy label="Endereço (continuação / bairro)" value={client.bairro || ''} />
              <FieldCopy label="Cidade" value={client.municipio} />
              <FieldCopy label="Estado / Província" value={client.uf} />
              <FieldCopy label="CEP / Código Postal" value={client.cep ? client.cep.replace(/(\d{5})(\d{3})/, '$1-$2') : ''} />
              <FieldCopy label="Telefone Comercial" value={client.telefone} />
            </div>
            {workerUrl && <FieldCopy label="Site da empresa" value={workerUrl} />}
            {client.email && <FieldCopy label="E-mail" value={client.email} />}
          </div>

          {client.atividadePrincipal && (
            <FieldCopy label="Atividade Principal" value={client.atividadePrincipal} />
          )}

          {/* Email temporário — seção separada */}
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2">📧 Email Temporário</p>
            <TempMailBlock razaoSocial={client.razaoSocial} />
          </div>
        </div>
      )}
    </div>
  );
}

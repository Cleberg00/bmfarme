import { useEffect, useState } from 'react';
import api from '../../api/client';
import CopyButton from '../ui/CopyButton';
import axios from 'axios';

type InfraBlockProps = {
  clientId: string | null;
  razaoSocial?: string;
  onDomainReady: (domainId: string, workerUrl: string) => void;
};

export default function InfraBlock({ clientId, razaoSocial, onDomainReady }: InfraBlockProps) {
  const [subdomain, setSubdomain] = useState('');
  const [metaCode, setMetaCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [deployed, setDeployed] = useState<{ subdomain: string; workerUrl: string; domainId: string } | null>(null);

  // Sugere subdomínio automaticamente quando a razão social chega
  useEffect(() => {
    if (!razaoSocial || deployed) return;
    const stopWords = new Set(['de','da','do','dos','das','e','em','a','o','para','com','ltda','eireli','me','sa','ss','epp']);
    const slug = razaoSocial
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w && !stopWords.has(w))
      .slice(0, 2)
      .join('')
      .slice(0, 20);
    setSubdomain(slug || 'empresa');
  }, [razaoSocial, deployed]);

  const handleDeploy = async () => {
    if (!clientId || !subdomain || !metaCode) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/infra/deploy', {
        subdomain: subdomain.trim().toLowerCase().replace(/[^a-z0-9-]/g, ''),
        metaVerificationCode: metaCode,
        clientId,
      });
      const id: string = data.id ?? '';
      const url: string = data.workerUrl ?? '';
      setDeployed({ subdomain: data.subdomain ?? subdomain, workerUrl: url, domainId: id });
      onDomainReady(id, url);
    } catch (err) {
      setError(
        axios.isAxiosError(err)
          ? err.response?.data?.error || err.message
          : err instanceof Error ? err.message : 'Falha ao subir infraestrutura.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Subdomínio */}
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-slate-300">Subdomínio</label>
          <div className="flex items-center rounded-xl border border-slate-700 bg-slate-800/80 overflow-hidden focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500/30">
            <input
              value={subdomain}
              onChange={(e) => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="nomedocliente"
              disabled={!!deployed}
              maxLength={30}
              className="flex-1 bg-transparent px-4 py-3 text-slate-100 outline-none disabled:opacity-50"
            />
            <span className="pr-3 text-xs text-slate-500 whitespace-nowrap">.workers.dev</span>
          </div>
          {subdomain && !deployed && (
            <p className="text-xs text-slate-500">
              URL: <span className="text-emerald-400 font-mono">{subdomain}-zaplifydisparo.zaplifydisparo.workers.dev</span>
            </p>
          )}
        </div>

        {/* Meta Verification Code */}
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-slate-300">
            Meta Verification Code
            <a
              href="https://business.facebook.com/settings/owned-domains"
              target="_blank"
              rel="noreferrer"
              className="ml-2 text-xs text-emerald-400 hover:text-emerald-300"
            >
              Obter no Meta →
            </a>
          </label>
          <input
            value={metaCode}
            onChange={(e) => setMetaCode(e.target.value.trim())}
            placeholder="Cole o código do Meta Business"
            disabled={!!deployed}
            className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-3 text-slate-100 outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 disabled:opacity-50"
          />
        </div>
      </div>

      {!deployed && (
        <button
          type="button"
          onClick={handleDeploy}
          disabled={loading || !subdomain || !metaCode}
          className="flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 font-bold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <>
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" className="stroke-current opacity-20" strokeWidth="4" />
                <path d="M22 12a10 10 0 0 0-10-10" className="stroke-current" strokeWidth="4" strokeLinecap="round" />
              </svg>
              Publicando site...
            </>
          ) : '🚀 Publicar Site'}
        </button>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          ❌ {error}
        </div>
      )}

      {deployed && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-3">
          <p className="text-sm font-bold text-emerald-300">✅ Site publicado com sucesso!</p>

          <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-700 bg-slate-800/60 px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-1">URL do site</p>
              <p className="font-mono text-sm text-emerald-300 break-all">{deployed.workerUrl}</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <CopyButton value={deployed.workerUrl} label="URL" />
              <a
                href={deployed.workerUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:text-white transition"
              >
                Abrir ↗
              </a>
            </div>
          </div>

          <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-300">
            <strong>Próximo passo:</strong> Vá ao Meta Business Manager → Configurações → Domínios → Adicione <strong>{deployed.workerUrl}</strong> e clique em verificar.
          </div>
        </div>
      )}
    </div>
  );
}

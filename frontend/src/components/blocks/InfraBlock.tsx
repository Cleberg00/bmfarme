import { useEffect, useState } from 'react';
import api from '../../api/client';
import CopyButton from '../ui/CopyButton';
import axios from 'axios';

type VerificationMethod = 'meta_tag' | 'html_file';

type InfraBlockProps = {
  clientId: string | null;
  razaoSocial?: string;
  smsPhone?: string | null;
  onDomainReady: (domainId: string, workerUrl: string) => void;
};

const METHOD_OPTIONS: { value: VerificationMethod; label: string; description: string; icon: string }[] = [
  {
    value: 'meta_tag',
    label: 'Meta Tag HTML',
    description: 'Adiciona <meta name="facebook-domain-verification"> no <head> da página',
    icon: '🏷️',
  },
  {
    value: 'html_file',
    label: 'Arquivo HTML',
    description: 'Serve um arquivo de verificação em /.well-known/facebook-domain-verification.html',
    icon: '📄',
  },
];

export default function InfraBlock({ clientId, razaoSocial, smsPhone, onDomainReady }: InfraBlockProps) {
  const [subdomain, setSubdomain] = useState('');
  const [metaCode, setMetaCode] = useState('');
  const [method, setMethod] = useState<VerificationMethod>('meta_tag');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [deployed, setDeployed] = useState<{ subdomain: string; workerUrl: string; domainId: string } | null>(null);

  // Sugere subdomínio automaticamente quando a razão social chega
  useEffect(() => {
    if (!razaoSocial) return;
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
  }, [razaoSocial]);

  const handleDeploy = async () => {
    if (!clientId || !subdomain || !metaCode) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/infra/deploy', {
        subdomain: subdomain.trim().toLowerCase().replace(/[^a-z0-9-]/g, ''),
        metaVerificationCode: metaCode.trim(),
        verificationMethod: method,
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

  const handleRedeploy = async () => {
    if (!clientId || !subdomain || !metaCode) return;
    setDeployed(null);
    setError('');
    await handleDeploy();
  };

  const workerPreviewUrl = subdomain
    ? `${subdomain}-verificadametta.verificadametta.workers.dev`
    : '';

  return (
    <div className="space-y-5">

      {/* Método de verificação */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-slate-300">Método de Verificação Meta</label>
        <div className="grid gap-2 sm:grid-cols-2">
          {METHOD_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setMethod(opt.value)}
              className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-left transition ${
                method === opt.value
                  ? 'border-emerald-500 bg-emerald-500/10'
                  : 'border-slate-700 bg-slate-800/60 hover:border-slate-600'
              }`}
            >
              <span className="text-xl mt-0.5">{opt.icon}</span>
              <div>
                <p className={`text-sm font-semibold ${method === opt.value ? 'text-emerald-300' : 'text-slate-200'}`}>
                  {opt.label}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">{opt.description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Subdomínio */}
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-slate-300">Subdomínio</label>
          <div className="flex items-center rounded-xl border border-slate-700 bg-slate-800/80 overflow-hidden focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500/30">
            <input
              value={subdomain}
              onChange={(e) => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="nomedocliente"
              maxLength={30}
              className="flex-1 bg-transparent px-4 py-3 text-slate-100 outline-none"
            />
            <span className="pr-3 text-xs text-slate-500 whitespace-nowrap">.workers.dev</span>
          </div>
          {workerPreviewUrl && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm font-mono text-emerald-400">{workerPreviewUrl}</span>
              <CopyButton value={`https://${workerPreviewUrl}`} label="URL" />
            </div>
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
            className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-3 text-slate-100 outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
          />
        </div>
      </div>

      {/* Info SMS vinculado */}
      {smsPhone ? (
        <div className="flex items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2.5 text-sm">
          <span className="text-blue-400">📱</span>
          <span className="text-blue-300">Número SMS <strong className="font-mono">{smsPhone}</strong> será incluído no site</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/40 px-4 py-2.5 text-xs text-slate-500">
          <span>💡</span>
          <span>Gere um número SMS no passo 3 antes de publicar para incluí-lo no site</span>
        </div>
      )}

      {/* Botões */}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleDeploy}
          disabled={loading || !subdomain || !metaCode || !clientId}
          className="flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 font-bold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <>
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" className="stroke-current opacity-20" strokeWidth="4" />
                <path d="M22 12a10 10 0 0 0-10-10" className="stroke-current" strokeWidth="4" strokeLinecap="round" />
              </svg>
              Publicando...
            </>
          ) : deployed ? '🔄 Republicar Site' : '🚀 Publicar Site'}
        </button>

        {deployed && (
          <button
            type="button"
            onClick={handleRedeploy}
            disabled={loading}
            className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:bg-slate-700 disabled:opacity-50"
          >
            ✏️ Alterar e republicar
          </button>
        )}
        {deployed && (
          <button
            type="button"
            disabled={loading}
            onClick={async () => {
              if (!deployed.domainId) return;
              setLoading(true);
              setError('');
              try {
                const { data } = await api.put('/infra/deploy', { domainId: deployed.domainId });
                setDeployed(prev => prev ? { ...prev, workerUrl: data.workerUrl || prev.workerUrl } : prev);
                alert('✅ Layout alterado! Abra o site pra conferir.');
              } catch (err) {
                setError(
                  axios.isAxiosError(err)
                    ? err.response?.data?.error || err.message
                    : 'Erro ao trocar layout.'
                );
              } finally {
                setLoading(false);
              }
            }}
            className="rounded-xl border border-purple-500/50 bg-purple-500/10 px-4 py-3 text-sm font-semibold text-purple-300 transition hover:bg-purple-500/20 disabled:opacity-50"
          >
            🎲 Trocar Layout
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          ❌ {error}
        </div>
      )}

      {/* Resultado */}
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

          {/* Instruções por método */}
          {method === 'meta_tag' && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-300 space-y-1">
              <p className="font-bold">📋 Próximo passo — Meta Tag:</p>
              <p>1. Vá em <strong>Meta Business Manager → Configurações → Domínios</strong></p>
              <p>2. Adicione o domínio: <span className="font-mono text-amber-200">{deployed.workerUrl}</span></p>
              <p>3. Escolha <strong>"Meta tag"</strong> e clique em <strong>Verificar domínio</strong></p>
            </div>
          )}

          {method === 'html_file' && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-300 space-y-1">
              <p className="font-bold">📋 Próximo passo — Arquivo HTML:</p>
              <p>1. Vá em <strong>Meta Business Manager → Configurações → Domínios</strong></p>
              <p>2. Adicione o domínio: <span className="font-mono text-amber-200">{deployed.workerUrl}</span></p>
              <p>3. Escolha <strong>"Arquivo HTML"</strong> e clique em <strong>Verificar domínio</strong></p>
              <p>4. O arquivo está disponível em: <span className="font-mono text-amber-200">{deployed.workerUrl}/.well-known/facebook-domain-verification.html</span></p>
            </div>
          )}
        </div>
      )}

      {/* Seção editar número de site já publicado */}
      {deployed && (
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">✏️ Alterar número no site publicado</p>
          <div className="flex items-center gap-2">
            <input
              id="edit-phone"
              placeholder="Novo número (ex: 5511999999999)"
              className="flex-1 rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-emerald-500"
            />
            <button
              type="button"
              onClick={async () => {
                const input = document.getElementById('edit-phone') as HTMLInputElement;
                const newPhone = input?.value?.trim();
                if (!newPhone || !deployed.domainId) return;
                try {
                  await api.patch('/infra/deploy', { domainId: deployed.domainId, newPhone });
                  alert('✅ Número atualizado no site com sucesso!');
                  input.value = '';
                } catch { alert('❌ Erro ao atualizar número.'); }
              }}
              className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-500 transition shrink-0"
            >
              Atualizar
            </button>
          </div>
          <p className="text-xs text-slate-600">O site será republicado automaticamente com o novo número.</p>
        </div>
      )}
    </div>
  );
}

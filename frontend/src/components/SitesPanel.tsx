import { useCallback, useEffect, useState } from 'react';
import api from '../api/client';
import CopyButton from './ui/CopyButton';
import { showToast } from './ui/Toast';

type SiteRecord = {
  id: string;
  domainName: string;
  cloudflareZoneId: string;
  metaVerificationCode: string;
  status: string;
  createdAt: string;
  workerUrl: string;
  client: { razaoSocial: string; cnpj: string } | null;
  user: { name: string } | null;
};

export default function SitesPanel({ onBack }: { onBack: () => void }) {
  const [sites, setSites] = useState<SiteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newPhone, setNewPhone] = useState('');
  const [updating, setUpdating] = useState(false);

  const loadSites = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/infra/deploy');
      setSites(Array.isArray(data) ? data : []);
    } catch {
      showToast('Erro ao carregar sites', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSites(); }, [loadSites]);

  const handleUpdatePhone = async (domainId: string) => {
    if (!newPhone.trim()) return;
    setUpdating(true);
    try {
      await api.patch('/infra/deploy', { domainId, newPhone: newPhone.trim() });
      showToast('Número atualizado no site!', 'success');
      setEditingId(null);
      setNewPhone('');
    } catch {
      showToast('Erro ao atualizar número', 'error');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between rounded-2xl border border-slate-700/50 bg-slate-900 p-5">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-50">🌐 Sites Publicados</h1>
            <p className="text-sm text-slate-500">{sites.length} sites ativos</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={loadSites}
              className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-slate-700">
              🔄 Atualizar
            </button>
            <button type="button" onClick={onBack}
              className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-slate-700">
              ← Voltar
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-16 text-slate-500">Carregando sites...</div>
        ) : sites.length === 0 ? (
          <div className="text-center py-16 text-slate-500">Nenhum site publicado ainda.</div>
        ) : (
          <div className="space-y-3">
            {sites.map(site => (
              <div key={site.id} className="rounded-2xl border border-slate-700/50 bg-slate-900 p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-100 truncate">
                      {site.client?.razaoSocial || site.domainName}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {site.client?.cnpj?.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') || '—'}
                      {' · '}
                      {new Date(site.createdAt).toLocaleDateString('pt-BR')}
                      {site.user ? ` · ${site.user.name}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <CopyButton value={site.workerUrl} label="URL" />
                    <a href={site.workerUrl} target="_blank" rel="noreferrer"
                      className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:text-white transition">
                      Abrir ↗
                    </a>
                    <button type="button"
                      onClick={() => { setEditingId(editingId === site.id ? null : site.id); setNewPhone(''); }}
                      className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300 hover:bg-amber-500/20 transition">
                      ✏️ Editar nº
                    </button>
                  </div>
                </div>

                {/* URL */}
                <div className="mt-2 rounded-lg bg-slate-800/60 px-3 py-2">
                  <p className="font-mono text-xs text-emerald-400 break-all">{site.workerUrl}</p>
                </div>

                {/* Editar telefone */}
                {editingId === site.id && (
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      value={newPhone}
                      onChange={e => setNewPhone(e.target.value)}
                      placeholder="Novo número (ex: 5511999999999)"
                      className="flex-1 rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-emerald-500"
                    />
                    <button type="button"
                      onClick={() => handleUpdatePhone(site.id)}
                      disabled={updating || !newPhone.trim()}
                      className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-500 transition disabled:opacity-50 shrink-0">
                      {updating ? '...' : 'Atualizar'}
                    </button>
                    <button type="button"
                      onClick={() => setEditingId(null)}
                      className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-400 hover:text-white transition">
                      ✕
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

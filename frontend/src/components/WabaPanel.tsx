import { useCallback, useEffect, useState } from 'react';
import api from '../api/client';
import CopyButton from './ui/CopyButton';

type WabaRecord = {
  id: string;
  wabaId: string;
  displayName: string;
  phoneNumber: string | null;
  tier: 'TIER_1K' | 'TIER_10K' | 'TIER_100K' | 'UNLIMITED';
  tierLabel: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'FLAGGED' | 'UNKNOWN';
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  user: { id: string; name: string };
  bmAsset?: { client?: { razaoSocial: string; cnpj: string } } | null;
};

const TIER_OPTIONS = [
  { value: 'TIER_1K',   label: '1.000/dia  (Tier 1)',   color: 'text-slate-400' },
  { value: 'TIER_10K',  label: '10.000/dia (Tier 2)',   color: 'text-blue-400' },
  { value: 'TIER_100K', label: '100.000/dia (Tier 3)',  color: 'text-emerald-400' },
  { value: 'UNLIMITED', label: 'Ilimitado',             color: 'text-amber-400' },
];

const STATUS_OPTIONS = [
  { value: 'ACTIVE',    label: '✅ Ativa',     color: 'bg-emerald-500/20 text-emerald-300' },
  { value: 'FLAGGED',   label: '⚠️ Flagada',   color: 'bg-amber-500/20 text-amber-300' },
  { value: 'SUSPENDED', label: '🚫 Suspensa',  color: 'bg-red-500/20 text-red-300' },
  { value: 'UNKNOWN',   label: '❓ Desconhecida', color: 'bg-slate-700 text-slate-400' },
];

function tierColor(tier: string) {
  return TIER_OPTIONS.find(t => t.value === tier)?.color || 'text-slate-400';
}
function statusStyle(status: string) {
  return STATUS_OPTIONS.find(s => s.value === status)?.color || 'bg-slate-700 text-slate-400';
}
function statusLabel(status: string) {
  return STATUS_OPTIONS.find(s => s.value === status)?.label || status;
}

export default function WabaPanel({ onBack }: { onBack: () => void }) {
  const [wabas, setWabas]       = useState<WabaRecord[]>([]);
  const [loading, setLoading]   = useState(false);
  const [filterTier, setFilterTier]     = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Form novo WABA
  const [newWabaId, setNewWabaId]       = useState('');
  const [newName, setNewName]           = useState('');
  const [newPhone, setNewPhone]         = useState('');
  const [newTier, setNewTier]           = useState('TIER_1K');
  const [newStatus, setNewStatus]       = useState('ACTIVE');
  const [newNotes, setNewNotes]         = useState('');
  const [creating, setCreating]         = useState(false);
  const [createErr, setCreateErr]       = useState('');

  // Edição inline
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [editTier, setEditTier]         = useState('');
  const [editStatus, setEditStatus]     = useState('');
  const [editNotes, setEditNotes]       = useState('');
  const [saving, setSaving]             = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterTier)   params.set('tier', filterTier);
      if (filterStatus) params.set('status', filterStatus);
      const { data } = await api.get(`/bm/waba?${params}`);
      setWabas(Array.isArray(data) ? data : []);
    } catch { /* silencioso */ }
    finally { setLoading(false); }
  }, [filterTier, filterStatus]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateErr('');
    try {
      await api.post('/bm/waba', {
        wabaId: newWabaId.trim(),
        displayName: newName.trim(),
        phoneNumber: newPhone.trim() || undefined,
        tier: newTier,
        status: newStatus,
        notes: newNotes.trim() || undefined,
      });
      setNewWabaId(''); setNewName(''); setNewPhone('');
      setNewTier('TIER_1K'); setNewStatus('ACTIVE'); setNewNotes('');
      await load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Erro ao registrar WABA.';
      setCreateErr(msg);
    } finally { setCreating(false); }
  };

  const startEdit = (w: WabaRecord) => {
    setEditingId(w.id);
    setEditTier(w.tier);
    setEditStatus(w.status);
    setEditNotes(w.notes || '');
  };

  const saveEdit = async (id: string) => {
    setSaving(true);
    try {
      await api.patch(`/bm/waba?id=${id}`, {
        tier: editTier,
        status: editStatus,
        notes: editNotes || undefined,
      });
      setEditingId(null);
      await load();
    } catch { /* silencioso */ }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Remover a WABA "${name}"?`)) return;
    try {
      await api.delete(`/bm/waba?id=${id}`);
      await load();
    } catch { /* silencioso */ }
  };

  // Stats rápidas
  const total    = wabas.length;
  const tier1    = wabas.filter(w => w.tier === 'TIER_1K').length;
  const tier2    = wabas.filter(w => w.tier === 'TIER_10K').length;
  const tier3plus = wabas.filter(w => w.tier === 'TIER_100K' || w.tier === 'UNLIMITED').length;
  const active   = wabas.filter(w => w.status === 'ACTIVE').length;
  const flagged  = wabas.filter(w => w.status === 'FLAGGED' || w.status === 'SUSPENDED').length;

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between rounded-2xl border border-slate-700/50 bg-slate-900 p-5">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-50">📱 WABAs</h1>
            <p className="text-sm text-slate-500">Gestão de WhatsApp Business Accounts</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={load}
              className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-700 transition">
              🔄 Atualizar
            </button>
            <button type="button" onClick={onBack}
              className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-700 transition">
              ← Voltar
            </button>
          </div>
        </div>

        {/* Cards de resumo */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: 'Total',    value: total,    color: 'text-slate-200' },
            { label: 'Tier 1K',  value: tier1,    color: 'text-slate-400' },
            { label: 'Tier 10K', value: tier2,    color: 'text-blue-400' },
            { label: 'Tier 100K+', value: tier3plus, color: 'text-emerald-400' },
            { label: flagged > 0 ? '⚠️ Com Problema' : '✅ Todas ok', value: flagged > 0 ? flagged : active, color: flagged > 0 ? 'text-red-400' : 'text-emerald-400' },
          ].map(c => (
            <div key={c.label} className="rounded-xl border border-slate-700/50 bg-slate-900 p-4 text-center">
              <p className={`text-3xl font-extrabold ${c.color}`}>{c.value}</p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-slate-600">{c.label}</p>
            </div>
          ))}
        </div>

        {/* Formulário de registro */}
        <div className="rounded-2xl border border-slate-700/50 bg-slate-900 p-5 space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400">+ Registrar Nova WABA</h2>
          <form onSubmit={handleCreate} className="grid gap-3 sm:grid-cols-2">
            <input value={newWabaId} onChange={e => setNewWabaId(e.target.value)}
              placeholder="WABA ID (ex: 123456789012345)" required
              className="rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-emerald-500 font-mono" />
            <input value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="Nome da empresa / conta" required
              className="rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-emerald-500" />
            <input value={newPhone} onChange={e => setNewPhone(e.target.value)}
              placeholder="Número WhatsApp (opcional)"
              className="rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-emerald-500" />
            <div className="grid grid-cols-2 gap-3">
              <select value={newTier} onChange={e => setNewTier(e.target.value)}
                className="rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-emerald-500">
                {TIER_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <select value={newStatus} onChange={e => setNewStatus(e.target.value)}
                className="rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-emerald-500">
                {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <input value={newNotes} onChange={e => setNewNotes(e.target.value)}
              placeholder="Observações (opcional)"
              className="rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-emerald-500 sm:col-span-2" />
            <div className="sm:col-span-2 flex items-center gap-3">
              <button type="submit" disabled={creating}
                className="rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-emerald-500 transition disabled:opacity-50">
                {creating ? 'Registrando...' : '+ Registrar WABA'}
              </button>
              {createErr && <span className="text-sm text-red-400">{createErr}</span>}
            </div>
          </form>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">Filtrar:</span>
          <select value={filterTier} onChange={e => setFilterTier(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-300 outline-none">
            <option value="">Todos os tiers</option>
            {TIER_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-300 outline-none">
            <option value="">Todos os status</option>
            {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          {(filterTier || filterStatus) && (
            <button type="button" onClick={() => { setFilterTier(''); setFilterStatus(''); }}
              className="text-xs text-slate-500 hover:text-slate-300 transition">✕ Limpar</button>
          )}
        </div>

        {/* Lista de WABAs */}
        {loading ? (
          <div className="text-center text-slate-500 py-12">Carregando...</div>
        ) : (
          <div className="space-y-3">
            {wabas.length === 0 && (
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-600">
                Nenhuma WABA registrada ainda.
              </div>
            )}
            {wabas.map(w => (
              <div key={w.id} className={`rounded-2xl border bg-slate-900 p-5 transition ${
                w.status === 'FLAGGED' || w.status === 'SUSPENDED'
                  ? 'border-red-500/30'
                  : 'border-slate-700/50'
              }`}>
                {editingId === w.id ? (
                  // Modo edição
                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <label className="text-xs font-semibold uppercase text-slate-500 mb-1 block">Tier</label>
                        <select value={editTier} onChange={e => setEditTier(e.target.value)}
                          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500">
                          {TIER_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-semibold uppercase text-slate-500 mb-1 block">Status</label>
                        <select value={editStatus} onChange={e => setEditStatus(e.target.value)}
                          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500">
                          {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-semibold uppercase text-slate-500 mb-1 block">Observações</label>
                        <input value={editNotes} onChange={e => setEditNotes(e.target.value)}
                          placeholder="..."
                          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500" />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => saveEdit(w.id)} disabled={saving}
                        className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-bold text-white hover:bg-emerald-500 transition disabled:opacity-50">
                        {saving ? 'Salvando...' : '✓ Salvar'}
                      </button>
                      <button type="button" onClick={() => setEditingId(null)}
                        className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-1.5 text-sm text-slate-400 hover:text-slate-200 transition">
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  // Modo visualização
                  <div className="flex flex-wrap items-start gap-4 justify-between">
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-base font-bold text-slate-100 truncate">{w.displayName}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${statusStyle(w.status)}`}>
                          {statusLabel(w.status)}
                        </span>
                        <span className={`text-sm font-bold ${tierColor(w.tier)}`}>
                          {w.tierLabel}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span className="font-mono text-slate-400">{w.wabaId}</span>
                        <CopyButton value={w.wabaId} label="WABA ID" />
                        {w.phoneNumber && <span>· 📱 {w.phoneNumber}</span>}
                        {w.bmAsset?.client && <span>· {w.bmAsset.client.razaoSocial}</span>}
                      </div>
                      {w.notes && <p className="text-xs text-slate-500 italic">{w.notes}</p>}
                      <p className="text-xs text-slate-600">
                        Registrada por <strong className="text-slate-500">{w.user.name}</strong> em {new Date(w.createdAt).toLocaleDateString('pt-BR')}
                        {w.updatedAt !== w.createdAt && ` · atualizada ${new Date(w.updatedAt).toLocaleDateString('pt-BR')}`}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button type="button" onClick={() => startEdit(w)}
                        className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white transition">
                        ✏️ Editar tier
                      </button>
                      <button type="button" onClick={() => handleDelete(w.id, w.displayName)}
                        className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/20 transition">
                        🗑️
                      </button>
                    </div>
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

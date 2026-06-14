import { useCallback, useEffect, useState } from 'react';
import api from '../../api/client';
import axios from 'axios';

type TrackingBlockProps = {
  clientId: number | null;
  domainId: number | null;
  smsLogId: number | null;
};

type BmRecord = {
  id: number | string;
  bmId: string;
  profileUsed: string;
  operatorName?: string;
  operator?: { name?: string };
  createdAt: string;
};

export default function TrackingBlock({ clientId, domainId, smsLogId }: TrackingBlockProps) {
  const [bmId, setBmId] = useState('');
  const [profileUsed, setProfileUsed] = useState('');
  const [notes, setNotes] = useState('');
  const [records, setRecords] = useState<BmRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  const loadRecords = useCallback(async () => {
    try {
      const { data } = await api.get('/bm/list');
      // API retorna { items: [], pagination: {} }
      setRecords(Array.isArray(data) ? data : (data.items ?? []));
    } catch {
      // falha silenciosa — tabela fica vazia
    }
  }, []);

  const handleRegister = async () => {
    if (!clientId || !domainId || !smsLogId) {
      return;
    }
    setLoading(true);
    setError('');
    setToast('');
    try {
      await api.post('/bm/register', { bmId, profileUsed, notes, clientId, domainId, smsLogId });
      setBmId('');
      setProfileUsed('');
      setNotes('');
      setToast('BM registrado com sucesso.');
      await loadRecords();
    } catch (requestError) {
      setError(
        axios.isAxiosError(requestError)
          ? requestError.response?.data?.message || requestError.message
          : requestError instanceof Error
            ? requestError.message
            : 'Falha ao registrar BM.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadRecords();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadRecords]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-300">BM ID</label>
          <input
            value={bmId}
            onChange={(event) => setBmId(event.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-3 text-slate-100 outline-none transition focus:border-emerald-500"
            placeholder="BM-123456"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-300">Profile Used</label>
          <input
            value={profileUsed}
            onChange={(event) => setProfileUsed(event.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-3 text-slate-100 outline-none transition focus:border-emerald-500"
            placeholder="Perfil utilizado"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-300">Notes</label>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={4}
          className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-3 text-slate-100 outline-none transition focus:border-emerald-500"
          placeholder="Observações operacionais"
        />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={handleRegister}
          disabled={loading}
          className="rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Registrando...' : 'Registrar BM'}
        </button>
        {toast && <div className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300">{toast}</div>}
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-700/60">
        <table className="min-w-full divide-y divide-slate-700/60">
          <thead className="bg-slate-800/80">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">BM ID</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Profile</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Operador</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Data</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-slate-900/40">
            {records.map((record) => (
              <tr key={record.id}>
                <td className="px-4 py-3 text-sm text-slate-100">{record.bmId}</td>
                <td className="px-4 py-3 text-sm text-slate-300">{record.profileUsed}</td>
                <td className="px-4 py-3 text-sm text-slate-300">{record.operatorName || record.operator?.name || '-'}</td>
                <td className="px-4 py-3 text-sm text-slate-300">{new Date(record.createdAt).toLocaleString('pt-BR')}</td>
              </tr>
            ))}
            {records.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-400">
                  Nenhum BM registrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
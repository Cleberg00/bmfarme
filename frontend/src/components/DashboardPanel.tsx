import { useCallback, useEffect, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

type OperatorStat = {
  user: { id: string; name: string; email: string; role: string };
  count: number;
};

type DayCount = { date: string; count: number };

type RecentBm = {
  id: string;
  bmId: string;
  createdAt: string;
  operator: string;
  client: string;
  cnpj: string;
};

type DashboardData = {
  summary: { total: number; totalAll: number; todayCount: number };
  byOperator: OperatorStat[];
  byDay: DayCount[];
  recent: RecentBm[];
};

type UserRecord = {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  _count: { bmAssets: number };
};

export default function DashboardPanel({ onBack }: { onBack: () => void }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const isTeamLeader = user?.email === 'wesley@gmail.com';
  const canManageUsers = isAdmin || isTeamLeader;

  const [days, setDays] = useState(7);
  const [data, setData] = useState<DashboardData | null>(null);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loadingDash, setLoadingDash] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Form novo usuário
  const [newName, setNewName]     = useState('');
  const [newEmail, setNewEmail]   = useState('');
  const [newPass, setNewPass]     = useState('');
  const [newRole, setNewRole]     = useState<'OPERATOR' | 'ADMIN'>('OPERATOR');
  const [creating, setCreating]   = useState(false);
  const [createErr, setCreateErr] = useState('');
  const [createOk, setCreateOk]   = useState('');

  const loadDashboard = useCallback(async () => {
    setLoadingDash(true);
    try {
      const { data: d } = await api.get(`/bm/dashboard?days=${days}`);
      setData(d);
    } catch { /* silencioso */ }
    finally { setLoadingDash(false); }
  }, [days]);

  const loadUsers = useCallback(async () => {
    if (!canManageUsers) return;
    setLoadingUsers(true);
    try {
      const { data: u } = await api.get('/auth/users');
      setUsers(Array.isArray(u) ? u : []);
    } catch { /* silencioso */ }
    finally { setLoadingUsers(false); }
  }, [canManageUsers]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);
  useEffect(() => { loadUsers(); }, [loadUsers]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateErr('');
    setCreateOk('');
    try {
      await api.post('/auth/users', { name: newName, email: newEmail, password: newPass, role: newRole });
      setCreateOk(`✅ Usuário ${newName} criado com sucesso!`);
      setNewName(''); setNewEmail(''); setNewPass(''); setNewRole('OPERATOR');
      await loadUsers();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Erro ao criar usuário.';
      setCreateErr(msg);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteUser = async (id: string, name: string) => {
    if (!confirm(`Remover o usuário "${name}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await api.delete(`/auth/users?id=${id}`);
      await loadUsers();
    } catch { /* silencioso */ }
  };

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between rounded-2xl border border-slate-700/50 bg-slate-900 p-5">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-50">📊 Dashboard</h1>
            <p className="text-sm text-slate-500">Produtividade da equipe</p>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-slate-700"
          >
            ← Voltar
          </button>
        </div>

        {/* Filtro de período */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-400">Período:</span>
          {[7, 15, 30].map(d => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${days === d ? 'bg-emerald-600 text-white' : 'border border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200'}`}
            >
              {d}d
            </button>
          ))}
          <button type="button" onClick={loadDashboard} className="ml-auto rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200">
            🔄 Atualizar
          </button>
        </div>

        {loadingDash ? (
          <div className="text-center text-slate-500 py-12">Carregando...</div>
        ) : data && (
          <>
            {/* Cards de resumo */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Hoje', value: data.summary.todayCount, color: 'text-emerald-400' },
                { label: `Últimos ${days}d`, value: data.summary.total, color: 'text-blue-400' },
                { label: 'Total geral', value: data.summary.totalAll, color: 'text-slate-300' },
              ].map(c => (
                <div key={c.label} className="rounded-2xl border border-slate-700/50 bg-slate-900 p-5 text-center">
                  <p className={`text-4xl font-extrabold ${c.color}`}>{c.value}</p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-slate-500">{c.label}</p>
                </div>
              ))}
            </div>

            {/* Por operador */}
            <div className="rounded-2xl border border-slate-700/50 bg-slate-900 p-5">
              <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-slate-400">BMs por Operador — últimos {days} dias</h2>
              {data.byOperator.length === 0 ? (
                <p className="text-sm text-slate-600">Nenhum registro no período.</p>
              ) : (
                <div className="space-y-3">
                  {data.byOperator.map((op, i) => {
                    const max = data.byOperator[0]?.count || 1;
                    const pct = Math.round((op.count / max) * 100);
                    return (
                      <div key={op.user.id} className="flex items-center gap-4">
                        <div className="w-6 text-center text-xs font-bold text-slate-600">{i + 1}º</div>
                        <div className="w-36 shrink-0">
                          <p className="text-sm font-semibold text-slate-200 truncate">{op.user.name}</p>
                          <p className="text-xs text-slate-500">{op.user.role}</p>
                        </div>
                        <div className="flex-1 h-6 rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-emerald-500 transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="w-12 text-right text-lg font-extrabold text-emerald-400">{op.count}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Por dia */}
            {data.byDay.length > 0 && (
              <div className="rounded-2xl border border-slate-700/50 bg-slate-900 p-5">
                <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-slate-400">BMs por Dia</h2>
                <div className="flex items-end gap-1.5 h-32">
                  {data.byDay.map(d => {
                    const maxDay = Math.max(...data.byDay.map(x => x.count), 1);
                    const h = Math.max(Math.round((d.count / maxDay) * 100), 4);
                    return (
                      <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group">
                        <span className="text-xs text-emerald-400 opacity-0 group-hover:opacity-100 transition">{d.count}</span>
                        <div
                          className="w-full rounded-t-md bg-emerald-600 transition-all"
                          style={{ height: `${h}%` }}
                          title={`${d.date}: ${d.count}`}
                        />
                        <span className="text-xs text-slate-600 rotate-45 origin-left">{d.date.slice(5)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* BMs recentes */}
            <div className="rounded-2xl border border-slate-700/50 bg-slate-900 p-5">
              <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-slate-400">Últimos Farms Registrados</h2>
              <div className="overflow-hidden rounded-xl border border-slate-700/60">
                <table className="min-w-full divide-y divide-slate-800">
                  <thead className="bg-slate-800/80">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">BM ID</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">Empresa</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">Operador</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">Data/Hora</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 bg-slate-900/40">
                    {data.recent.map(r => (
                      <tr key={r.id} className="hover:bg-slate-800/40 transition">
                        <td className="px-4 py-3 font-mono text-sm text-slate-100">{r.bmId}</td>
                        <td className="px-4 py-3 text-sm text-slate-300 max-w-[180px] truncate">{r.client}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-300">
                            {r.operator}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {new Date(r.createdAt).toLocaleString('pt-BR')}
                        </td>
                      </tr>
                    ))}
                    {data.recent.length === 0 && (
                      <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-600">Nenhum farm registrado ainda.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Gestão de usuários — ADMIN ou líder de equipe */}
        {canManageUsers && (
          <div className="rounded-2xl border border-slate-700/50 bg-slate-900 p-5 space-y-5">
            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400">👥 Gerenciar Usuários</h2>

            {/* Form criar usuário */}
            <form onSubmit={handleCreateUser} className="grid gap-3 sm:grid-cols-2">
              <input
                value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="Nome completo" required
                className="rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-emerald-500"
              />
              <input
                value={newEmail} onChange={e => setNewEmail(e.target.value)}
                placeholder="E-mail" type="email" required
                className="rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-emerald-500"
              />
              <input
                value={newPass} onChange={e => setNewPass(e.target.value)}
                placeholder="Senha (mín. 6 caracteres)" type="password" required minLength={6}
                className="rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-emerald-500"
              />
              <select
                value={newRole} onChange={e => setNewRole(e.target.value as 'OPERATOR' | 'ADMIN')}
                className="rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-emerald-500"
              >
                <option value="OPERATOR">Operador</option>
                <option value="ADMIN">Admin</option>
              </select>
              <div className="sm:col-span-2 flex items-center gap-3">
                <button
                  type="submit" disabled={creating}
                  className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                >
                  {creating ? 'Criando...' : '+ Criar Usuário'}
                </button>
                {createOk && <span className="text-sm text-emerald-400">{createOk}</span>}
                {createErr && <span className="text-sm text-red-400">{createErr}</span>}
              </div>
            </form>

            {/* Lista de usuários */}
            {loadingUsers ? (
              <p className="text-sm text-slate-500">Carregando usuários...</p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-700/60">
                <table className="min-w-full divide-y divide-slate-800">
                  <thead className="bg-slate-800/80">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">Nome</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">E-mail</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">Cargo</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-400">BMs</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 bg-slate-900/40">
                    {users.map(u => (
                      <tr key={u.id} className="hover:bg-slate-800/40 transition">
                        <td className="px-4 py-3 text-sm font-semibold text-slate-100">{u.name}</td>
                        <td className="px-4 py-3 text-sm text-slate-400">{u.email}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${u.role === 'ADMIN' ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-700 text-slate-400'}`}>
                            {u.role === 'ADMIN' ? 'Admin' : 'Operador'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm font-bold text-emerald-400">{u._count.bmAssets}</td>
                        <td className="px-4 py-3">
                          {u.id !== user?.id && (
                            <button
                              type="button"
                              onClick={() => handleDeleteUser(u.id, u.name)}
                              className="rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs text-red-400 hover:bg-red-500/20 transition"
                            >
                              Remover
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

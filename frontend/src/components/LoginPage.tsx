import { useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [showPass, setShowPass] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (submitError) {
      const message = axios.isAxiosError(submitError)
        ? submitError.response?.data?.error || submitError.response?.data?.message || 'Credenciais inválidas.'
        : submitError instanceof Error ? submitError.message : 'Falha ao autenticar.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-slate-950">

      {/* Fundo decorativo */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-emerald-500/5 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-emerald-500/5 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-emerald-500/3 blur-3xl" />
      </div>

      {/* Logo + título */}
      <div className="relative mb-8 text-center">
        {/* Ícone ⚡ com glow */}
        <div className="flex items-center justify-center mb-4">
          <div className="relative">
            <div className="absolute inset-0 rounded-2xl bg-emerald-500/20 blur-xl scale-150" />
            <div className="relative flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 shadow-lg shadow-emerald-500/30">
              <span className="text-4xl select-none">⚡</span>
            </div>
          </div>
        </div>

        <h1 className="text-4xl font-black tracking-tight text-white">
          BM Farm<span className="text-emerald-400"> God Mode</span>
        </h1>
        <p className="mt-2 text-sm text-slate-500 font-medium tracking-widest uppercase">
          Sistema de Gestão de Farms
        </p>
      </div>

      {/* Card de login */}
      <div className="relative w-full max-w-sm">
        <div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-emerald-500/20 to-transparent" />
        <div className="relative bg-slate-900 rounded-2xl p-8 shadow-2xl shadow-slate-950/60">
          <h2 className="text-lg font-bold text-slate-100 mb-6">Acesse sua conta</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-widest text-slate-500">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-3 text-slate-100 outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
                placeholder="voce@empresa.com"
                required
                autoComplete="email"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-widest text-slate-500">Senha</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-3 pr-12 text-slate-100 outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition"
                  tabIndex={-1}
                >
                  {showPass ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                ❌ {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60 mt-2"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" className="stroke-current opacity-20" strokeWidth="4" />
                    <path d="M22 12a10 10 0 0 0-10-10" className="stroke-current" strokeWidth="4" strokeLinecap="round" />
                  </svg>
                  Entrando...
                </span>
              ) : 'Entrar'}
            </button>
          </form>
        </div>
      </div>

      <p className="relative mt-8 text-xs text-slate-700">
        © {new Date().getFullYear()} BM Farm God Mode — Acesso restrito
      </p>
    </div>
  );
}

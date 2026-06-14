import CopyButton from '../ui/CopyButton';

export default function WabaBlock() {
  return (
    <div className="space-y-5">
      {/* Link principal */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <a
          href="https://crm.datacrazy.io/login"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 font-bold text-white transition hover:bg-blue-500 w-fit"
        >
          🌐 Acessar DataCrazy CRM ↗
        </a>
        <p className="text-xs text-slate-500">
          Crie a WABA pelo CRM, depois registre o WABA ID na tela WABAs.
        </p>
      </div>

      {/* Credenciais */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-500">Login</p>
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-sm text-slate-100 break-all">euronaldoalvess@gmail.com</p>
            <CopyButton value="euronaldoalvess@gmail.com" label="login" />
          </div>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-500">Senha</p>
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-sm text-slate-100">150304Ral$</p>
            <CopyButton value="150304Ral$" label="senha" />
          </div>
        </div>
      </div>

      {/* Instrução */}
      <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-xs text-blue-300 space-y-1">
        <p className="font-semibold">📋 Passos:</p>
        <p>1. Acesse o CRM com as credenciais acima</p>
        <p>2. Crie a WABA vinculada à BM verificada</p>
        <p>3. Copie o WABA ID gerado</p>
        <p>4. Registre o WABA ID na tela <strong>📱 WABAs</strong> do sistema</p>
      </div>
    </div>
  );
}

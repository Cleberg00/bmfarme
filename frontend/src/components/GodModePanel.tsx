import { useState, type ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import CnpjBlock from './blocks/CnpjBlock';
import InfraBlock from './blocks/InfraBlock';
import SmsBlock from './blocks/SmsBlock';
import TrackingBlock from './blocks/TrackingBlock';

type ClientData = {
  razaoSocial: string;
  endereco: string;
  cep: string;
};

function StepSection({
  step, title, subtitle, children, locked,
}: {
  step: number; title: string; subtitle?: string; children: ReactNode; locked?: boolean;
}) {
  return (
    <div className={`rounded-2xl border bg-slate-900 transition-all ${locked ? 'border-slate-800' : 'border-slate-700/50'}`}>
      <div className={`flex items-center gap-4 border-b px-6 py-4 ${locked ? 'border-slate-800' : 'border-slate-700/40'}`}>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-bold ${locked ? 'bg-slate-800 text-slate-600' : 'bg-emerald-500 text-white'}`}>
          {step}
        </div>
        <div className="flex-1">
          <h2 className={`text-lg font-bold ${locked ? 'text-slate-600' : 'text-slate-100'}`}>{title}</h2>
          {subtitle && <p className={`text-xs ${locked ? 'text-slate-700' : 'text-slate-500'}`}>{subtitle}</p>}
        </div>
        {locked && (
          <span className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-medium text-slate-600">
            🔒 Complete o passo anterior
          </span>
        )}
      </div>
      <div className={`p-6 ${locked ? 'pointer-events-none select-none opacity-30' : ''}`}>
        {children}
      </div>
    </div>
  );
}

export default function GodModePanel() {
  const { logout, user } = useAuth();
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientData, setClientData] = useState<ClientData | null>(null);
  const [domainId, setDomainId] = useState<string | null>(null);
  const [workerUrl, setWorkerUrl] = useState<string | null>(null);
  const [smsLogId, setSmsLogId] = useState<string | null>(null);
  const [smsCode, setSmsCode] = useState<string | null>(null);
  const [generatingCard, setGeneratingCard] = useState(false);

  const resetPipeline = () => {
    setClientId(null);
    setClientData(null);
    setDomainId(null);
    setWorkerUrl(null);
    setSmsLogId(null);
    setSmsCode(null);
  };

  const handleOpenCard = async () => {
    if (!clientId) return;
    setGeneratingCard(true);
    try {
      // Abre o cartão CNPJ numa nova aba — o handler retorna HTML diretamente
      const token = localStorage.getItem('bmfarm.token');
      const base = import.meta.env.VITE_API_URL
        ? import.meta.env.VITE_API_URL.replace(/\/$/, '') + '/api'
        : '/api';
      const url = `${base}/bm/card?clientId=${clientId}`;

      // Fetch com auth e abre numa nova aba
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const html = await res.text();
      const blob = new Blob([html], { type: 'text/html' });
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch {
      /* silencioso */
    } finally {
      setGeneratingCard(false);
    }
  };

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-5">

        {/* Header */}
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-700/50 bg-slate-900 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-50">⚡ BM Farm God Mode</h1>
            <p className="text-sm text-slate-500">Olá, <span className="text-slate-300 font-medium">{user?.name || 'Operador'}</span></p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Cartão CNPJ — só aparece quando tem cliente */}
            {clientId && (
              <button
                type="button"
                onClick={handleOpenCard}
                disabled={generatingCard}
                className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-400 transition hover:bg-blue-500/20 disabled:opacity-50"
              >
                {generatingCard ? '⏳ Gerando...' : '📄 Cartão CNPJ'}
              </button>
            )}
            <button
              type="button"
              onClick={resetPipeline}
              className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-400 transition hover:bg-amber-500/20"
            >
              🔄 Novo Farm
            </button>
            <button
              type="button"
              onClick={logout}
              className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-slate-700"
            >
              Sair
            </button>
          </div>
        </div>

        {/* Barra de progresso */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { n: 1, label: 'CNPJ',  done: !!clientId },
            { n: 2, label: 'Infra', done: !!domainId },
            { n: 3, label: 'SMS',   done: !!smsLogId },
            { n: 4, label: 'BM',    done: false },
          ].map((s) => (
            <div key={s.n} className={`rounded-xl border px-3 py-2 text-center text-xs font-bold transition ${s.done ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400' : 'border-slate-800 bg-slate-900 text-slate-600'}`}>
              {s.done ? '✓' : s.n} {s.label}
            </div>
          ))}
        </div>

        {/* Resumo cliente ativo */}
        {clientData && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm">
            <span className="font-semibold text-emerald-400">{clientData.razaoSocial}</span>
            {workerUrl && (
              <a href={workerUrl} target="_blank" rel="noreferrer"
                className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-xs text-emerald-300 hover:text-emerald-200">
                🌐 {workerUrl.replace('https://', '')}
              </a>
            )}
            {smsCode && (
              <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 font-mono text-xs text-blue-300">
                SMS: {smsCode}
              </span>
            )}
          </div>
        )}

        {/* Step 1 — CNPJ */}
        <StepSection step={1} title="Consultar CNPJ" subtitle="Busque os dados da empresa pelo CNPJ">
          <CnpjBlock
            onClientReady={(id, data) => {
              setClientId(id);
              setClientData(data);
              setDomainId(null);
              setWorkerUrl(null);
              setSmsLogId(null);
              setSmsCode(null);
            }}
          />
        </StepSection>

        {/* Step 2 — Infra / Worker */}
        <StepSection step={2} title="Publicar Site" subtitle="Gera landing page no Cloudflare Workers para verificação Meta" locked={!clientId}>
          <InfraBlock
            clientId={clientId}
            razaoSocial={clientData?.razaoSocial}
            onDomainReady={(id, url) => {
              setDomainId(id);
              setWorkerUrl(url);
            }}
          />
        </StepSection>

        {/* Step 3 — SMS */}
        <StepSection step={3} title="Gerar SMS" subtitle="Gere um número virtual para verificação" locked={!clientId}>
          <SmsBlock
            clientId={clientId}
            onSmsReady={(id, code) => {
              setSmsLogId(id);
              setSmsCode(code);
            }}
          />
        </StepSection>

        {/* Step 4 — BM */}
        <StepSection step={4} title="Registrar BM" subtitle="Registre o BM após verificação completa" locked={!clientId || !domainId || !smsLogId}>
          <TrackingBlock clientId={clientId} domainId={domainId} smsLogId={smsLogId} />
        </StepSection>

      </div>
    </div>
  );
}

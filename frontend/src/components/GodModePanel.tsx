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
  step,
  title,
  children,
  disabled,
  disabledMessage,
}: {
  step: string;
  title: string;
  children: ReactNode;
  disabled?: boolean;
  disabledMessage?: string;
}) {
  return (
    <div className={`bg-slate-900 border border-slate-700/50 rounded-2xl p-6 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      <div className="mb-6 flex items-center gap-4">
        <div className="h-10 w-10 rounded-full bg-emerald-500 text-white font-bold flex items-center justify-center text-lg">{step}</div>
        <h2 className="text-xl font-semibold text-slate-100">{title}</h2>
      </div>
      {disabled && disabledMessage && <p className="mb-4 text-sm text-amber-300">{disabledMessage}</p>}
      {children}
    </div>
  );
}

export default function GodModePanel() {
  const { logout, user } = useAuth();
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientData, setClientData] = useState<ClientData | null>(null);
  const [domainId, setDomainId] = useState<string | null>(null);
  const [smsLogId, setSmsLogId] = useState<string | null>(null);
  const [smsCode, setSmsCode] = useState<string | null>(null);

  const resetPipeline = () => {
    setClientId(null);
    setClientData(null);
    setDomainId(null);
    setSmsLogId(null);
    setSmsCode(null);
  };

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-700/50 bg-slate-900/80 p-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-50">BM Farm God Mode</h1>
          </div>
          <div className="text-sm font-medium text-slate-300">{user?.name || 'Operador'}</div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={resetPipeline}
              className="rounded-xl border border-red-500/30 bg-red-600/20 px-4 py-2 font-semibold text-red-400 transition hover:bg-red-600/30"
            >
              Reset Pipeline
            </button>
            <button
              type="button"
              onClick={logout}
              className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-2 font-semibold text-slate-200 transition hover:bg-slate-700"
            >
              Logout
            </button>
          </div>
        </div>

        {clientData && (
          <div className="rounded-2xl border border-slate-700/50 bg-slate-900/60 p-4 text-sm text-slate-300">
            Cliente atual: <span className="font-semibold text-slate-100">{clientData.razaoSocial}</span> · {clientData.endereco} · {clientData.cep}{smsCode ? ` · SMS ${smsCode}` : ''}
          </div>
        )}

        <div className="space-y-6">
          <StepSection step="1" title="Consulta de CNPJ">
            <CnpjBlock
              onClientReady={(nextClientId, data) => {
                setClientId(nextClientId);
                setClientData(data);
                setDomainId(null);
                setSmsLogId(null);
                setSmsCode(null);
              }}
            />
          </StepSection>

          <StepSection step="2" title="Infra" disabled={!clientId} disabledMessage="Complete o passo 1 primeiro">
            <InfraBlock clientId={clientId} onDomainReady={(nextDomainId) => setDomainId(nextDomainId)} />
          </StepSection>

          <StepSection step="3" title="SMS" disabled={!clientId} disabledMessage="Complete o passo 1 primeiro">
            <SmsBlock
              clientId={clientId}
              onSmsReady={(nextSmsLogId, code) => {
                setSmsLogId(nextSmsLogId);
                setSmsCode(code);
              }}
            />
          </StepSection>

          <StepSection
            step="4"
            title="Tracking"
            disabled={!clientId || !domainId || !smsLogId}
            disabledMessage="Complete os passos anteriores primeiro"
          >
            <TrackingBlock clientId={clientId} domainId={domainId} smsLogId={smsLogId} />
          </StepSection>
        </div>
      </div>
    </div>
  );
}
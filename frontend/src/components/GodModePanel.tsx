import { useState, type ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import CnpjBlock from './blocks/CnpjBlock';
import InfraBlock from './blocks/InfraBlock';
import SmsBlock from './blocks/SmsBlock';
import TrackingBlock from './blocks/TrackingBlock';
import DashboardPanel from './DashboardPanel';
import WabaPanel from './WabaPanel';
import CnpjCardModal from './CnpjCardModal';
import ProfileModal from './ProfileModal';
import WabaBlock from './blocks/WabaBlock';

type ClientData = {
  razaoSocial: string;
  nomeFantasia?: string;
  endereco: string;
  cep: string;
};

function StepSection({
  step, title, subtitle, children,
}: {
  step: number; title: string; subtitle?: string; children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-700/50 bg-slate-900 transition-all">
      <div className="flex items-center gap-4 border-b border-slate-700/40 px-6 py-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-base font-bold text-white">
          {step}
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-slate-100">{title}</h2>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function QuickPhoneUpdate() {
  const [url, setUrl] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const handleUpdate = async () => {
    if (!url.trim() || !phone.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      // Extrai o subdomínio da URL e busca o site correspondente
      const cleanUrl = url.trim().replace(/\/$/, '');
      // Tenta extrair o subdomínio: xxx.nexusmktlucro.shop ou xxx-empresa.workers.dev
      const urlWithoutProtocol = cleanUrl.replace(/^https?:\/\//, '');
      const subdomain = urlWithoutProtocol.split('.')[0]; // pega a primeira parte

      const { data: sites } = await api.get('/infra/deploy');
      const site = sites.find((s: { workerUrl?: string; domainName?: string; cloudflareZoneId?: string; id?: string }) => {
        const sWorkerUrl = (s.workerUrl || '').replace(/\/$/, '');
        const sName = s.domainName || s.cloudflareZoneId || '';
        return sWorkerUrl === cleanUrl ||
          sWorkerUrl === `https://${urlWithoutProtocol}` ||
          sName === subdomain ||
          (s.cloudflareZoneId || '').startsWith(subdomain);
      });
      if (!site) { setResult({ ok: false, msg: `Site não encontrado (buscado: ${subdomain}). Verifique a URL.` }); return; }
      await api.patch('/infra/deploy', { domainId: site.id, newPhone: phone.trim() });
      setResult({ ok: true, msg: 'Número atualizado no site!' });
      setPhone('');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || (e instanceof Error ? e.message : 'Erro ao atualizar.');
      setResult({ ok: false, msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-700/50 bg-slate-900 transition-all">
      <div className="flex items-center gap-4 border-b border-slate-700/40 px-6 py-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500 text-base font-bold text-white">
          📞
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-slate-100">Atualizar Número em Site</h2>
          <p className="text-xs text-slate-500">Cole a URL do site já publicado e o novo número SMS</p>
        </div>
      </div>
      <div className="p-6 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="URL do site (ex: https://empresa-x7k.zaplifydisparo...)"
            className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-3 text-sm text-slate-100 outline-none focus:border-emerald-500"
          />
          <input
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="Novo número (ex: 5511999999999)"
            className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-3 text-sm text-slate-100 outline-none focus:border-emerald-500"
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleUpdate}
            disabled={loading || !url.trim() || !phone.trim()}
            className="rounded-xl bg-amber-600 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-amber-500 disabled:opacity-50"
          >
            {loading ? 'Atualizando...' : '🔄 Atualizar Número'}
          </button>
          {result && (
            <span className={`text-sm ${result.ok ? 'text-emerald-400' : 'text-red-400'}`}>
              {result.msg}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function GodModePanel() {
  const { logout, user } = useAuth();
  const [clientId, setClientId]     = useState<string | null>(null);
  const [clientData, setClientData] = useState<ClientData | null>(null);
  const [domainId, setDomainId]     = useState<string | null>(null);
  const [workerUrl, setWorkerUrl]   = useState<string | null>(null);
  const [smsLogId, setSmsLogId]     = useState<string | null>(null);
  const [smsCode, setSmsCode]       = useState<string | null>(null);
  const [smsPhone, setSmsPhone]     = useState<string | null>(null);
  const [showCard, setShowCard]           = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [showWaba, setShowWaba]           = useState(false);
  const [showProfile, setShowProfile]     = useState(false);

  if (showDashboard) return <DashboardPanel onBack={() => setShowDashboard(false)} />;
  if (showWaba)      return <WabaPanel onBack={() => setShowWaba(false)} />;

  const resetPipeline = () => {
    if (!confirm('Iniciar novo farm? Os dados atuais serão limpos.')) return;
    setClientId(null);
    setClientData(null);
    setDomainId(null);
    setWorkerUrl(null);
    setSmsLogId(null);
    setSmsCode(null);
    setSmsPhone(null);
    setShowCard(false);
  };

  return (
    <>
      <div className="min-h-screen px-4 py-8">
        <div className="mx-auto max-w-5xl space-y-5">

          {/* Header */}
          <div className="flex flex-col gap-4 rounded-2xl border border-slate-700/50 bg-slate-900 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-extrabold text-slate-50">⚡ BM Farm God Mode</h1>
              <p className="text-sm text-slate-500">Olá, <span className="text-slate-300 font-medium">{user?.name || 'Operador'}</span></p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setShowDashboard(true)}
                className="rounded-xl border border-purple-500/30 bg-purple-500/10 px-4 py-2 text-sm font-semibold text-purple-400 transition hover:bg-purple-500/20">
                📊 Dashboard
              </button>
              <button type="button" onClick={() => setShowWaba(true)}
                className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm font-semibold text-green-400 transition hover:bg-green-500/20">
                📱 WABAs
              </button>
              {clientId && (
                <button type="button" onClick={() => setShowCard(true)}
                  className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-400 transition hover:bg-blue-500/20">
                  📄 Cartão CNPJ
                </button>
              )}
              <button type="button" onClick={resetPipeline}
                className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-400 transition hover:bg-amber-500/20">
                🔄 Novo Farm
              </button>
              <button type="button" onClick={() => setShowProfile(true)}
                className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-slate-700"
                title="Meu perfil / trocar senha">
                👤
              </button>
              <button type="button" onClick={logout}
                className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-slate-700">
                Sair
              </button>
            </div>
          </div>

          {/* Barra de progresso */}
          <div className="grid grid-cols-5 gap-2">
            {[
              { n: 1, label: 'CNPJ',  done: !!clientId },
              { n: 2, label: 'SMS',   done: !!smsLogId },
              { n: 3, label: 'Site',  done: !!domainId },
              { n: 4, label: 'WABA',  done: false },
              { n: 5, label: 'BM',    done: false },
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
              workerUrl={workerUrl}
              onClientReady={(id, data) => {
                setClientId(id);
                setClientData(data);
                setDomainId(null);
                setWorkerUrl(null);
                setSmsLogId(null);
                setSmsCode(null);
                setSmsPhone(null);
              }}
            />
          </StepSection>

          {/* Step 2 — SMS */}
          <StepSection step={2} title="Gerar SMS" subtitle="Gere um número virtual para verificação">
            <SmsBlock
              clientId={clientId}
              onPhoneGenerated={(phone) => setSmsPhone(phone)}
              onSmsReady={(id, code, phone) => {
                setSmsLogId(id);
                setSmsCode(code);
                setSmsPhone(phone);
              }}
            />
          </StepSection>

          {/* Step 3 — Site */}
          <StepSection step={3} title="Publicar Site" subtitle="Gera landing page no Cloudflare Workers para verificação Meta">
            <InfraBlock
              clientId={clientId}
              razaoSocial={clientData?.razaoSocial}
              nomeFantasia={clientData?.nomeFantasia}
              smsPhone={smsPhone}
              onDomainReady={(id, url) => {
                setDomainId(id);
                setWorkerUrl(url);
              }}
            />
          </StepSection>

          {/* Step 4 — WABA */}
          <StepSection step={4} title="Criar WABA" subtitle="Acesse o DataCrazy CRM e crie a WABA vinculada à BM verificada">
            <WabaBlock />
          </StepSection>

          {/* Step 5 — BM */}
          <StepSection step={5} title="Registrar BM" subtitle="Registre o BM após verificação completa">
            <TrackingBlock clientId={clientId} domainId={domainId} smsLogId={smsLogId} />
          </StepSection>

          {/* Atualizar número em site existente */}
          <QuickPhoneUpdate />

        </div>
      </div>

      {/* Modal cartão CNPJ */}
      {showCard && clientId && (
        <CnpjCardModal clientId={clientId} onClose={() => setShowCard(false)} />
      )}

      {/* Modal perfil */}
      {showProfile && (
        <ProfileModal onClose={() => setShowProfile(false)} />
      )}
    </>
  );
}

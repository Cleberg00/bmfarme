import { useEffect, useState } from 'react';
import api from '../../api/client';
import CopyButton from '../ui/CopyButton';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import EmailInboxBlock from './EmailInboxBlock';

type VerificationMethod = 'dns_txt' | 'meta_tag' | 'html_file';

type InfraBlockProps = {
  clientId: string | null;
  razaoSocial?: string;
  nomeFantasia?: string;
  smsPhone?: string | null;
  onDomainReady: (domainId: string, workerUrl: string) => void;
};

const METHOD_OPTIONS: { value: VerificationMethod; label: string; description: string; icon: string }[] = [
  {
    value: 'dns_txt',
    label: 'TXT DNS (recomendado)',
    description: 'Cria o registro TXT no domínio raiz. Ideal para subdomínio — o Meta verifica o raiz.',
    icon: '🌐',
  },
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

export default function InfraBlock({ clientId, razaoSocial, nomeFantasia, smsPhone, onDomainReady }: InfraBlockProps) {
  const [subdomain, setSubdomain] = useState('');
  const [metaCode, setMetaCode] = useState('');
  const [method, setMethod] = useState<VerificationMethod>('dns_txt');
  const [cfAccount, setCfAccount] = useState<'empresasverrificada' | 'zaplifydisparo' | 'netlify' | 'dynadot' | 'porkbun' | 'zapliftyativos' | 'hostinger'>('empresasverrificada');
  const { user } = useAuth();
  const isRonaldo = user?.email === 'ronaldo@gmail.com' || user?.email === 'velhoronaldo@gmail.com' || user?.email === 'miguel@gmail.com';
  const isAdmin = user?.role === 'ADMIN';
  const isZaplify = user?.email === 'julia@gmail.com' || user?.email === 'maria@gmail.com';
  const isMacumbinha = user?.email === 'miguelmacumbinha@gmail.com' || user?.email === 'macumbinha@gmail.com';
  const isWesley = user?.email === 'wesley@gmail.com' || user?.email === 'denis@gmail.com' || user?.email === 'vitoria@gmail.com';
  const netlifyDomains = isRonaldo
    ? ['bmon3.com']
    : isWesley
    ? ['kikilt.com', 'vortexmidiads.com']
    : isAdmin
    ? ['perfilbr.com', 'validarfm.com', 'verificabussines.com', 'verificadorbm.com', 'validacaopf.com', 'ativoson.com', 'verifcationbm.com', 'perfilbr01.com', 'vericationbm.com', 'zaplifyativos01.com', 'zaplifyvalidation.com', 'zaplify01.com', 'zaplifydigital.com', 'zaplifyportifolio.com', 'zaplifybm08.com', 'bmzaplifydigital.com', 'bmzaplify.com', 'zaplifybmfarme.com', 'bmzaplyf08.com', 'zaplifydigital03.com', 'zaplifybm1.com', 'zaplifyfm.com', 'bmzaplify10.com', 'zaplifyflow.com', 'zaplifymanager.com', 'zaplifybr.com', 'zaplifypf02.com', 'zaplifybr010.com', 'zaplifymk.com', 'bmfarm1.com', 'bmzaplifyvali.com', 'validbmfarme.com', 'zapbm01.com', 'ativosfarmezaplify.com', 'realfarmezaplify.com', 'zaplifydigital0.com', 'vortexbr01.com', 'zaplifyvortez.com', 'zaplifyvort.com']
    : isMacumbinha
    ? ['zaplifybm10.com', 'zaplifydigital02.com', 'zaplifypf02.com', 'zaplifybr010.com', 'contasfmativo.com', 'zapfyvortex.com']
    : isZaplify
    ? ['zaplifyativos.com.br', 'verificaperfil.com.br', 'perfilvalidados.com']
    : ['verificativos.com', 'ativoscontas.com', 'verificacontas.com'];
  // Domínios exclusivos da conta zapliftyativos
  const zapliftyativosDomains = ['zapifyo9.com', 'ativosfarmezaplify.com', 'maycontexeira.com.br', 'realfarmezaplify.com', 'zaplifydigital0.com', 'kikilt.com', 'contasfmativo.com', 'bmon3.com', 'contativas2026.com', 'vortexmidiads.com', 'zapfyvortex.com', 'vortexbr01.com', 'zaplifyvortez.com', 'zaplifyvort.com'];
  const activeDomains = isWesley ? ['kikilt.com', 'vortexmidiads.com'] : cfAccount === 'zapliftyativos' ? zapliftyativosDomains : netlifyDomains;
  const [selectedNetlifyDomain, setSelectedNetlifyDomain] = useState(netlifyDomains[0]);
  const [customDomainName, setCustomDomainName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [deployed, setDeployed] = useState<{ subdomain: string; workerUrl: string; domainId: string } | null>(null);
  const [selectedLayout, setSelectedLayout] = useState<number>(0);
  const [selectedColor, setSelectedColor] = useState<number>(0);
  // Equipe Wesley: força zapliftyativos e domínio kikilt.com
  useEffect(() => {
    if (isWesley) {
      setCfAccount('zapliftyativos');
      setSelectedNetlifyDomain('kikilt.com');
    }
  }, [isWesley]);
  // Sugere subdomínio automaticamente quando a razão social chega
  useEffect(() => {
    // Usa nome fantasia se existir (mais parecido com marca), senão razão social.
    // A Meta aprova melhor quando o subdomínio bate com o nome da empresa (ex: mrvprime)
    // e reprova/pede mais info quando o subdomínio tem prefixo numérico aleatório.
    const base = nomeFantasia || razaoSocial;
    if (!base) return;
    const stopWords = new Set(['de','da','do','dos','das','e','em','a','o','para','com','ltda','eireli','me','sa','ss','epp','spe','incorporacoes','incorporacao']);
    const slug = base
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w && !stopWords.has(w) && !/^\d+$/.test(w)) // remove palavras que são só números
      .slice(0, 2)
      .join('')
      .replace(/^\d+/, '')  // remove qualquer número no início (padrão que a Meta reprova)
      .slice(0, 20);
    setSubdomain(slug || 'empresa');
    setCustomDomainName(slug || 'empresa');
  }, [razaoSocial, nomeFantasia]);

  const handleDeploy = async () => {
    if (!clientId || !subdomain || !metaCode) return;
    setLoading(true);
    setError('');
    try {
      let data;
      if (cfAccount === 'porkbun' || cfAccount === 'dynadot') {
        // Registra domínio + Cloudflare zona + DNS TXT + Workers deploy
        const domainName = `${customDomainName}.cfd`;
        const res = await api.post('/infra/deploy', {
          action: 'register_domain',
          domainName,
          registrar: 'dynadot',
          clientId,
          metaVerificationCode: metaCode.trim(),
          customRazao: razaoSocial || undefined,
          customFantasia: nomeFantasia || undefined,
          forceLayout: selectedLayout,
          forceColor: selectedColor,
        });
        data = res.data;
      } else {
        const res = await api.post('/infra/deploy', {
          subdomain: subdomain.trim().toLowerCase().replace(/[^a-z0-9-]/g, ''),
          metaVerificationCode: metaCode.trim(),
          verificationMethod: method,
          clientId,
          cfAccount,
          netlifyDomain: (cfAccount === 'netlify' || cfAccount === 'empresasverrificada' || cfAccount === 'zapliftyativos') ? selectedNetlifyDomain : undefined,
          customRazao: razaoSocial || undefined,
          customFantasia: nomeFantasia || undefined,
          forceLayout: selectedLayout,
          forceColor: selectedColor,
        });
        data = res.data;
      }
      const id: string = data.id ?? '';
      const url: string = data.workerUrl ?? '';
      setDeployed({ subdomain: data.subdomain ?? subdomain, workerUrl: url, domainId: id });
      onDomainReady(id, url);
    } catch (err) {
      const rawErr = axios.isAxiosError(err) ? err.response?.data?.error : undefined;
      setError(
        typeof rawErr === 'string' ? rawErr
          : axios.isAxiosError(err) ? err.message
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

  return (
    <div className="space-y-5">

      {/* Seletor de conta — esconde pra equipe Wesley (só zapliftyativos) */}
      {!isWesley && (
      <div className="space-y-2">
        <label className="text-sm font-semibold text-slate-300">Publicar em</label>
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setCfAccount('dynadot')}
            className={`rounded-xl border px-4 py-3 text-left transition ${
              cfAccount === 'dynadot'
                ? 'border-emerald-500 bg-emerald-500/10'
                : 'border-slate-700 bg-slate-800/60 hover:border-slate-600'
            }`}
          >
            <p className={`text-sm font-semibold ${cfAccount === 'dynadot' ? 'text-emerald-300' : 'text-slate-200'}`}>⚡ Domínio Próprio</p>
            <p className="text-xs text-slate-500 mt-0.5">.cfd ~R$1 • Cloudflare + DNS TXT • SSL instantâneo</p>
          </button>
          <button
            type="button"
            onClick={() => setCfAccount('netlify')}
            className={`rounded-xl border px-4 py-3 text-left transition ${
              cfAccount === 'netlify'
                ? 'border-cyan-500 bg-cyan-500/10'
                : 'border-slate-700 bg-slate-800/60 hover:border-slate-600'
            }`}
          >
            <p className={`text-sm font-semibold ${cfAccount === 'netlify' ? 'text-cyan-300' : 'text-slate-200'}`}>Netlify</p>
            <p className="text-xs text-slate-500 mt-0.5">Subdomínio (domínios existentes)</p>
          </button>
          <button type="button" disabled className="rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-left opacity-40 cursor-not-allowed">
            <p className="text-sm font-semibold text-slate-500">Porkbun .xyz</p>
            <p className="text-xs text-slate-600 mt-0.5">Sem saldo</p>
          </button>
          <button
            type="button"
            onClick={() => setCfAccount('empresasverrificada')}
            className={`rounded-xl border px-4 py-3 text-left transition ${
              cfAccount === 'empresasverrificada'
                ? 'border-blue-500 bg-blue-500/10'
                : 'border-slate-700 bg-slate-800/60 hover:border-slate-600'
            }`}
          >
            <p className={`text-sm font-semibold ${cfAccount === 'empresasverrificada' ? 'text-blue-300' : 'text-slate-200'}`}>☁️ empresasverrificada</p>
            <p className="text-xs text-slate-500 mt-0.5">Subdomínio Workers (grátis)</p>
          </button>
          <button
            type="button"
            onClick={() => setCfAccount('zapliftyativos')}
            className={`rounded-xl border px-4 py-3 text-left transition ${
              cfAccount === 'zapliftyativos'
                ? 'border-green-500 bg-green-500/10'
                : 'border-slate-700 bg-slate-800/60 hover:border-slate-600'
            }`}
          >
            <p className={`text-sm font-semibold ${cfAccount === 'zapliftyativos' ? 'text-green-300' : 'text-slate-200'}`}>⚡ zapliftyativos</p>
            <p className="text-xs text-slate-500 mt-0.5">Subdomínio Workers — nova conta</p>
          </button>
          <button
            type="button"
            onClick={() => setCfAccount('hostinger')}
            className={`rounded-xl border px-4 py-3 text-left transition ${
              cfAccount === 'hostinger'
                ? 'border-purple-500 bg-purple-500/10'
                : 'border-slate-700 bg-slate-800/60 hover:border-slate-600'
            }`}
          >
            <p className={`text-sm font-semibold ${cfAccount === 'hostinger' ? 'text-purple-300' : 'text-slate-200'}`}>🟣 Hostinger</p>
            <p className="text-xs text-slate-500 mt-0.5">Domínio temporário .hostingersite.com</p>
          </button>
        </div>
      </div>
      )}

      {/* Seletor de domínio */}
      {(cfAccount === 'netlify' || cfAccount === 'empresasverrificada' || cfAccount === 'zapliftyativos') && (
        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-300">Domínio</label>
          <div className="grid gap-2 sm:grid-cols-3">
            {activeDomains.map(d => (
              <button
                key={d}
                type="button"
                onClick={() => setSelectedNetlifyDomain(d)}
                className={`rounded-xl border px-3 py-2 text-left transition ${
                  selectedNetlifyDomain === d
                    ? 'border-cyan-500 bg-cyan-500/10'
                    : 'border-slate-700 bg-slate-800/60 hover:border-slate-600'
                }`}
              >
                <p className={`text-xs font-semibold ${selectedNetlifyDomain === d ? 'text-cyan-300' : 'text-slate-300'}`}>{d}</p>
              </button>
            ))}
          </div>
        </div>
      )}

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
        {/* Nome do domínio / Subdomínio */}
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-slate-300">
            {(cfAccount === 'porkbun' || cfAccount === 'dynadot') ? 'Nome do domínio' : 'Subdomínio'}
          </label>
          <div className="flex items-center rounded-xl border border-slate-700 bg-slate-800/80 overflow-hidden focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500/30">
            <input
              value={(cfAccount === 'porkbun' || cfAccount === 'dynadot') ? customDomainName : subdomain}
              onChange={(e) => {
                const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
                if (cfAccount === 'porkbun' || cfAccount === 'dynadot') setCustomDomainName(val);
                else setSubdomain(val);
              }}
              placeholder="nomedaempresa"
              maxLength={30}
              className="flex-1 bg-transparent px-4 py-3 text-slate-100 outline-none"
            />
            <span className="pr-3 text-xs text-slate-500 whitespace-nowrap">
              {cfAccount === 'porkbun' ? '.xyz' : cfAccount === 'dynadot' ? '.cfd' : cfAccount === 'hostinger' ? '.hostingersite.com' : `.${selectedNetlifyDomain}`}
            </span>
          </div>
          {(((cfAccount === 'porkbun' || cfAccount === 'dynadot') && customDomainName) || (cfAccount !== 'porkbun' && cfAccount !== 'dynadot' && subdomain)) && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm font-mono text-emerald-400 break-all">
                {cfAccount === 'porkbun' ? `${customDomainName}.xyz` : cfAccount === 'dynadot' ? `${customDomainName}.cfd` : cfAccount === 'hostinger' ? `${subdomain}.hostingersite.com` : `${subdomain}.${selectedNetlifyDomain}`}
              </span>
              <CopyButton value={cfAccount === 'porkbun' ? `${customDomainName}.xyz` : cfAccount === 'dynadot' ? `${customDomainName}.cfd` : cfAccount === 'hostinger' ? `${subdomain}.hostingersite.com` : `${subdomain}.${selectedNetlifyDomain}`} label="Domínio" />
              {(cfAccount === 'porkbun' || cfAccount === 'dynadot' || cfAccount === 'empresasverrificada' || cfAccount === 'hostinger') && <span className="text-xs text-slate-500">← cole no Meta</span>}
            </div>
          )}
          {/^\d/.test(subdomain) && cfAccount !== 'porkbun' && cfAccount !== 'dynadot' && (
            <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              ⚠️ Subdomínio começando com número tende a ser reprovado pela Meta. Use o nome da empresa (ex: <span className="font-mono">mrvprime</span>) em vez de números. As contas que passam com 2k usam o nome da empresa no subdomínio.
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

      {/* ── SELETOR DE LAYOUT + COR ── */}
      <div className="space-y-4 rounded-xl border border-slate-700 bg-slate-800/40 p-4">
        <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider">⚙️ Escolher Visual do Site</p>
        
        {/* Layouts */}
        <div>
          <p className="text-xs text-slate-400 mb-2">Layout:</p>
          <div className="grid grid-cols-5 gap-2">
            {[
              { id: 0, icon: '◧', name: 'Hero+Sidebar' },
              { id: 1, icon: '⊞', name: 'Bento Grid' },
              { id: 2, icon: '◨', name: 'Split Screen' },
              { id: 3, icon: '☰', name: 'Editorial' },
              { id: 4, icon: '⋮', name: 'Timeline' },
              { id: 5, icon: '◉', name: 'Segments' },
              { id: 6, icon: '▣', name: 'Float Cards' },
              { id: 7, icon: '▌', name: 'Brutalist' },
              { id: 8, icon: '▦', name: 'Dashboard' },
              { id: 9, icon: '▬', name: 'Full-Page' },
            ].map(l => (
              <button
                key={l.id}
                type="button"
                onClick={() => setSelectedLayout(l.id)}
                className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-center transition ${
                  selectedLayout === l.id
                    ? 'border-emerald-500 bg-emerald-500/10'
                    : 'border-slate-700 bg-slate-800/60 hover:border-slate-500'
                }`}
              >
                <span className="text-lg">{l.icon}</span>
                <span className={`text-[9px] font-medium ${selectedLayout === l.id ? 'text-emerald-300' : 'text-slate-400'}`}>{l.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Cores */}
        <div>
          <p className="text-xs text-slate-400 mb-2">Cor de destaque:</p>
          <div className="flex flex-wrap gap-2">
            {[
              { id: 0, color: '#facc15', name: 'Amarelo' },
              { id: 1, color: '#3b82f6', name: 'Azul' },
              { id: 2, color: '#22c55e', name: 'Verde' },
              { id: 3, color: '#a855f7', name: 'Roxo' },
              { id: 4, color: '#f97316', name: 'Laranja' },
              { id: 5, color: '#ec4899', name: 'Rosa' },
              { id: 6, color: '#06b6d4', name: 'Ciano' },
              { id: 7, color: '#ef4444', name: 'Vermelho' },
              { id: 8, color: '#84cc16', name: 'Limão' },
              { id: 9, color: '#f59e0b', name: 'Âmbar' },
            ].map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedColor(c.id)}
                title={c.name}
                className={`w-8 h-8 rounded-full border-2 transition ${
                  selectedColor === c.id ? 'border-white scale-110' : 'border-transparent hover:scale-105'
                }`}
                style={{ backgroundColor: c.color }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Botões */}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleDeploy}
          disabled={loading || (!subdomain && cfAccount !== 'dynadot' && cfAccount !== 'porkbun') || (!customDomainName && (cfAccount === 'dynadot' || cfAccount === 'porkbun')) || !metaCode || !clientId}
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
              if (!deployed.subdomain) return;
              setLoading(true);
              setError('');
              try {
                await api.get(`/infra/deploy?action=provision_ssl&siteName=${deployed.subdomain}`);
                alert('✅ SSL provisionado! Aguarde 1-2 min pro HTTPS ativar.');
              } catch (err) {
                const rawErr = axios.isAxiosError(err) ? err.response?.data?.error : undefined;
                setError(typeof rawErr === 'string' ? rawErr : axios.isAxiosError(err) ? err.message : 'Erro ao provisionar SSL.');
              } finally {
                setLoading(false);
              }
            }}
            className="rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-300 transition hover:bg-amber-500/20 disabled:opacity-50"
          >
            🔒 Forçar SSL
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
          {method === 'dns_txt' && (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-300 space-y-1">
              <p className="font-bold">📋 Próximo passo — TXT DNS:</p>
              <p>O registro TXT já foi criado automaticamente no DNS.</p>
              <p>1. Vá em <strong>Meta Business Manager → Configurações → Domínios</strong></p>
              <p>2. Adicione o domínio do site: <span className="font-mono text-emerald-200">{deployed.workerUrl?.replace('https://','').replace(/\/$/,'')}</span></p>
              <p>3. Escolha <strong>"Registro TXT do DNS"</strong> e clique em <strong>Verificar domínio</strong></p>
            </div>
          )}

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

          {/* Caixa de email — códigos de verificação aparecem aqui */}
          <EmailInboxBlock workerUrl={deployed.workerUrl} />
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

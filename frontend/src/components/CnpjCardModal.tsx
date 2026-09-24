import { useEffect, useState } from 'react';

type CardModel = 'br' | 'gr';

type CardData = {
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  dataAbertura: string;
  situacao: string;
  dataSituacao: string;
  porte: string;
  naturezaJuridica: string;
  atividadePrincipal: string;
  atividadesSecundarias: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cep: string;
  municipio: string;
  uf: string;
  email: string;
  telefone: string;
  smsPhone: string;
  pais: string;
};

// clientId opcional: quando não há CNPJ digitado, o modal abre em branco
// pro usuário preencher tudo manualmente e escolher o modelo (BR ou GR).
type Props = { clientId?: string | null; workerUrl?: string | null; onClose: () => void };

type Field = { key: keyof CardData; label: string; hint?: string; wide?: boolean; model?: CardModel };

const FIELDS: Field[] = [
  { key: 'pais',                 label: 'País (cabeçalho)',           hint: 'ex: CANADA', model: 'gr' },
  { key: 'razaoSocial',          label: 'Nome Empresarial',           wide: true },
  { key: 'nomeFantasia',         label: 'Nome Fantasia' },
  { key: 'cnpj',                 label: 'Número de Inscrição / CNPJ' },
  { key: 'dataAbertura',         label: 'Data de Abertura',           hint: 'ex: 11/03/2026' },
  { key: 'situacao',             label: 'Situação Cadastral' },
  { key: 'dataSituacao',         label: 'Data da Situação',           hint: 'ex: 11/03/2026' },
  { key: 'porte',                label: 'Porte',                      hint: 'EPP, ME, DEMAIS...' },
  { key: 'naturezaJuridica',     label: 'Natureza Jurídica',          wide: true, hint: 'ex: 206-2 - Sociedade Empresária Limitada' },
  { key: 'atividadePrincipal',   label: 'Atividade Principal (CNAE)', wide: true },
  { key: 'atividadesSecundarias', label: 'Atividades Secundárias',    wide: true, hint: 'default: Não informada', model: 'gr' },
  { key: 'endereco',             label: 'Logradouro',                 wide: true },
  { key: 'numero',               label: 'Número' },
  { key: 'complemento',          label: 'Complemento' },
  { key: 'bairro',               label: 'Bairro/Distrito' },
  { key: 'cep',                  label: 'CEP' },
  { key: 'municipio',            label: 'Município' },
  { key: 'uf',                   label: 'UF' },
  { key: 'email',                label: 'Endereço Eletrônico',        wide: true },
  { key: 'telefone',             label: 'Telefone' },
  { key: 'smsPhone',             label: 'Número SMS (verificação)',   hint: 'Substitui telefone no documento' },
];

const CANADIAN_PROVINCES: Record<string, { name: string; code: string }> = {
  alberta: { name: 'Alberta', code: 'AB' }, ab: { name: 'Alberta', code: 'AB' },
  'british columbia': { name: 'British Columbia', code: 'BC' }, bc: { name: 'British Columbia', code: 'BC' },
  manitoba: { name: 'Manitoba', code: 'MB' }, mb: { name: 'Manitoba', code: 'MB' },
  'new brunswick': { name: 'New Brunswick', code: 'NB' }, nb: { name: 'New Brunswick', code: 'NB' },
  'newfoundland and labrador': { name: 'Newfoundland and Labrador', code: 'NL' }, nl: { name: 'Newfoundland and Labrador', code: 'NL' },
  'nova scotia': { name: 'Nova Scotia', code: 'NS' }, ns: { name: 'Nova Scotia', code: 'NS' },
  ontario: { name: 'Ontario', code: 'ON' }, on: { name: 'Ontario', code: 'ON' },
  'prince edward island': { name: 'Prince Edward Island', code: 'PE' }, pe: { name: 'Prince Edward Island', code: 'PE' },
  quebec: { name: 'Quebec', code: 'QC' }, québec: { name: 'Quebec', code: 'QC' }, qc: { name: 'Quebec', code: 'QC' },
  saskatchewan: { name: 'Saskatchewan', code: 'SK' }, sk: { name: 'Saskatchewan', code: 'SK' },
  'northwest territories': { name: 'Northwest Territories', code: 'NT' }, nt: { name: 'Northwest Territories', code: 'NT' },
  nunavut: { name: 'Nunavut', code: 'NU' }, nu: { name: 'Nunavut', code: 'NU' },
  yukon: { name: 'Yukon', code: 'YT' }, yt: { name: 'Yukon', code: 'YT' },
};

const POSTAL_CODE_RE = /\b([ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTVWXYZ])[\s-]?(\d[ABCEGHJ-NPRSTVWXYZ]\d)\b/i;
const STREET_SUFFIX_RE = /\b(?:street|st|road|rd|avenue|ave|boulevard|blvd|drive|dr|lane|ln|court|ct|crescent|cres|parkway|pkwy|highway|hwy|trail|way|place|pl|terrace|terr|circle)(?:\s+(?:north|south|east|west|n|s|e|w))?\b/i;

type CanadianAddressResult = Partial<Pick<CardData, 'endereco' | 'numero' | 'complemento' | 'bairro' | 'cep' | 'municipio' | 'uf' | 'pais'>>;

function parseCanadianAddress(rawAddress: string): CanadianAddressResult {
  const result: CanadianAddressResult = { pais: 'CANADA' };
  const clean = rawAddress.replace(/\r/g, '').trim();
  if (!clean) return result;

  const postalMatch = clean.match(POSTAL_CODE_RE);
  if (postalMatch) result.cep = `${postalMatch[1].toUpperCase()} ${postalMatch[2].toUpperCase()}`;

  const segments = clean
    .split(/\n|,|;/)
    .map(segment => segment.trim())
    .filter(Boolean)
    .filter(segment => !/^(?:headquarters|head office|office|address|endereço|canada)$/i.test(segment));

  let provinceIndex = -1;
  let provinceText = '';
  const provinceKeys = Object.keys(CANADIAN_PROVINCES).sort((a, b) => b.length - a.length);
  for (let index = 0; index < segments.length && provinceIndex < 0; index++) {
    const normalized = segments[index].toLowerCase().replace(POSTAL_CODE_RE, '').trim();
    const key = provinceKeys.find(item => new RegExp(`(?:^|\\s)${item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|\\s)`, 'i').test(normalized));
    if (key) {
      const province = CANADIAN_PROVINCES[key];
      result.bairro = province.name;
      result.uf = province.code;
      provinceIndex = index;
      provinceText = key;

      const cityOnSameSegment = normalized
        .replace(new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'), '')
        .replace(/\s+/g, ' ')
        .trim();
      if (cityOnSameSegment && !/^[A-Z]\d[A-Z]/i.test(cityOnSameSegment)) result.municipio = cityOnSameSegment;
    }
  }

  let streetText = segments.find((segment, index) => index !== provinceIndex && /\d/.test(segment) && !POSTAL_CODE_RE.test(segment)) || '';

  if (!result.municipio && provinceIndex > 0) {
    const cityCandidate = segments[provinceIndex - 1].replace(POSTAL_CODE_RE, '').trim();
    if (cityCandidate !== streetText && !/\d/.test(cityCandidate)) result.municipio = cityCandidate;
  }

  // Também aceita tudo em uma linha: "245 Industrial Parkway North Aurora Ontario L4G 4C4".
  if (!streetText || !result.municipio) {
    let oneLine = clean
      .replace(/\b(?:headquarters|head office|office|address|endereço)\b/gi, '')
      .replace(POSTAL_CODE_RE, '')
      .replace(/\bcanada\b/gi, '')
      .replace(/[,;]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (provinceText) oneLine = oneLine.replace(new RegExp(`\\b${provinceText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'), '').trim();
    const streetCityMatch = oneLine.match(new RegExp(`^(.+?${STREET_SUFFIX_RE.source})\\s+(.+)$`, 'i'));
    if (streetCityMatch) {
      streetText ||= streetCityMatch[1].trim();
      result.municipio ||= streetCityMatch[2].trim();
    }
  }

  if (streetText) {
    let remaining = streetText.trim();
    const labelledUnit = remaining.match(/^(?:unit|suite|apt|apartment|#)\s*([\w-]+)[,\s-]+(.+)$/i);
    if (labelledUnit) {
      result.complemento = `UNIT ${labelledUnit[1].toUpperCase()}`;
      remaining = labelledUnit[2].trim();
    } else {
      const hyphenUnit = remaining.match(/^(\w+)-(\d+[A-Za-z]?\s+.+)$/);
      if (hyphenUnit) {
        result.complemento = `UNIT ${hyphenUnit[1].toUpperCase()}`;
        remaining = hyphenUnit[2].trim();
      }
    }

    const civicNumber = remaining.match(/^(\d+[A-Za-z]?)\s+(.+)$/);
    if (civicNumber) {
      result.numero = civicNumber[1];
      result.endereco = civicNumber[2].trim();
    } else {
      result.endereco = remaining;
    }
  }

  return result;
}

const EMPTY: CardData = {
  razaoSocial:'', nomeFantasia:'', cnpj:'', dataAbertura:'', situacao:'ATIVA',
  dataSituacao:'', porte:'', naturezaJuridica:'', atividadePrincipal:'',
  atividadesSecundarias:'', endereco:'', numero:'', complemento:'', bairro:'',
  cep:'', municipio:'', uf:'', email:'', telefone:'', smsPhone:'', pais:'CANADA',
};

export default function CnpjCardModal({ clientId, workerUrl, onClose }: Props) {
  const [data, setData]           = useState<CardData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [generating, setGenerating] = useState(false);
  const [model, setModel]         = useState<CardModel>('br');
  const [addressPaste, setAddressPaste] = useState('');
  const [addressMessage, setAddressMessage] = useState('');

  // Gera email do domínio a partir da workerUrl
  const domainEmail = workerUrl ? (() => {
    try {
      const u = new URL(workerUrl);
      const parts = u.hostname.split('.');
      const sub = parts[0];
      const dom = parts.slice(1).join('.');
      return `${sub}@${dom}`;
    } catch { return ''; }
  })() : '';

  useEffect(() => {
    // Sem cliente: abre em branco pra preenchimento 100% manual.
    if (!clientId) {
      setData({ ...EMPTY, email: domainEmail });
      setLoading(false);
      return;
    }

    const token = localStorage.getItem('bmfarm.token');
    const base  = import.meta.env.VITE_API_URL
      ? import.meta.env.VITE_API_URL.replace(/\/$/, '') + '/api'
      : '/api';

    fetch(`${base}/bm/card?clientId=${clientId}&format=json`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => setData({ ...EMPTY, ...d, email: domainEmail || d.email || '' }))
      .catch(() => setData({ ...EMPTY, email: domainEmail }))
      .finally(() => setLoading(false));
  }, [clientId, domainEmail]);

  const handleChange = (key: keyof CardData, value: string) =>
    setData(prev => prev ? { ...prev, [key]: value } : prev);

  const handleCanadianAddress = (value: string) => {
    setAddressPaste(value);
    if (!value.trim()) {
      setAddressMessage('');
      return;
    }

    const parsed = parseCanadianAddress(value);
    const detected = Object.entries(parsed).filter(([key, fieldValue]) => key !== 'pais' && fieldValue);
    setData(prev => prev ? { ...prev, ...parsed } : prev);
    setAddressMessage(detected.length
      ? `✓ Separado automaticamente: ${detected.map(([key]) => key).join(', ')}`
      : 'Não consegui separar. Tente colar rua, cidade, província e código postal.');
  };

  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  // Salva os dados editados no Client — o SITE passa a mostrar exatamente
  // os mesmos dados do documento (cartão), evitando divergência na Meta.
  const handleSave = async () => {
    if (!data || !clientId) return;
    setSaving(true);
    setSavedMsg('');
    try {
      const token = localStorage.getItem('bmfarm.token');
      const base  = import.meta.env.VITE_API_URL
        ? import.meta.env.VITE_API_URL.replace(/\/$/, '') + '/api'
        : '/api';
      const res = await fetch(`${base}/bm/card?action=save&clientId=${clientId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) setSavedMsg('✅ Dados salvos! Republique o site pra aplicar.');
      else setSavedMsg('❌ Erro ao salvar.');
    } catch { setSavedMsg('❌ Erro ao salvar.'); }
    finally { setSaving(false); }
  };

  const handleDownload = async () => {
    if (!data) return;
    if (!data.razaoSocial.trim()) { alert('Preencha ao menos o Nome Empresarial pra gerar o PDF.'); return; }
    setGenerating(true);
    try {
      const token = localStorage.getItem('bmfarm.token');
      const base  = import.meta.env.VITE_API_URL
        ? import.meta.env.VITE_API_URL.replace(/\/$/, '') + '/api'
        : '/api';
      const res  = await fetch(`${base}/bm/card?model=${model}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const html = await res.text();
      const blob = new Blob([html], { type: 'text/html' });
      const url  = URL.createObjectURL(blob);
      const win  = window.open(url, '_blank');
      if (win) win.focus();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } finally { setGenerating(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-slate-100">📄 Comprovante CNPJ</h2>
            <p className="text-xs text-slate-500">Edite os campos, escolha o modelo e gere o PDF</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Seletor de modelo: PDF BR (Receita Federal) ou PDF GR (gringo) */}
            <div className="flex rounded-lg border border-slate-700 bg-slate-800 p-0.5">
              <button type="button" onClick={() => setModel('br')}
                className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${model === 'br' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                PDF BR
              </button>
              <button type="button" onClick={() => setModel('gr')}
                className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${model === 'gr' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                PDF GR
              </button>
            </div>
            <button type="button" onClick={onClose}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-400 hover:text-white transition">
              ✕ Fechar
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-500">
              <svg className="h-5 w-5 animate-spin mr-2" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" className="stroke-current opacity-20" strokeWidth="4"/>
                <path d="M22 12a10 10 0 0 0-10-10" className="stroke-current" strokeWidth="4" strokeLinecap="round"/>
              </svg>
              Carregando dados...
            </div>
          ) : !data ? (
            <div className="text-center py-16 text-slate-500">Não foi possível carregar os dados.</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {model === 'gr' && (
                <div className="sm:col-span-2 rounded-xl border border-blue-500/30 bg-blue-500/10 p-4">
                  <label className="block text-xs font-semibold uppercase tracking-widest text-blue-300 mb-2">
                    📍 Cole o endereço canadense completo
                  </label>
                  <textarea
                    value={addressPaste}
                    onChange={event => handleCanadianAddress(event.target.value)}
                    rows={4}
                    placeholder={'Exemplo:\n245 Industrial Parkway North\nAurora, Ontario\nL4G 4C4'}
                    className="w-full resize-y rounded-xl border border-blue-500/30 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-blue-400 transition"
                  />
                  <p className={`mt-2 text-xs ${addressMessage.startsWith('✓') ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {addressMessage || 'Pode colar em várias linhas, separado por vírgulas ou tudo em uma linha. Os campos abaixo serão preenchidos automaticamente.'}
                  </p>
                </div>
              )}
              {FIELDS.filter(f => !f.model || f.model === model).map(f => (
                <div key={f.key} className={f.wide ? 'sm:col-span-2' : ''}>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-slate-500 mb-1">
                    {f.label}
                    {f.hint && <span className="ml-1 normal-case text-slate-600 font-normal">— {f.hint}</span>}
                  </label>
                  <input
                    value={(data as Record<string, string>)[f.key] || ''}
                    onChange={e => handleChange(f.key, e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-emerald-500 transition"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {data && (
          <div className="border-t border-slate-800 px-6 py-4 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-slate-600 flex-1 min-w-[180px]">
              {savedMsg || (clientId
                ? <>💾 "Salvar" aplica os dados no site também (documento = site). "Gerar PDF" → <kbd className="rounded bg-slate-700 px-1">Ctrl+P</kbd></>
                : <>✍️ Modo manual — preencha os campos e gere o PDF ({model.toUpperCase()}). "Gerar PDF" → <kbd className="rounded bg-slate-700 px-1">Ctrl+P</kbd></>)}
            </p>
            <div className="flex items-center gap-2 shrink-0">
              {clientId && (
                <button type="button" onClick={handleSave} disabled={saving}
                  className="flex items-center gap-2 rounded-xl border border-emerald-600 px-5 py-2.5 text-sm font-bold text-emerald-400 hover:bg-emerald-600/10 transition disabled:opacity-50">
                  {saving ? 'Salvando...' : '💾 Salvar dados'}
                </button>
              )}
              <button type="button" onClick={handleDownload} disabled={generating}
                className="flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-emerald-500 transition disabled:opacity-50">
                {generating ? (
                  <><svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" className="stroke-current opacity-20" strokeWidth="4"/>
                    <path d="M22 12a10 10 0 0 0-10-10" className="stroke-current" strokeWidth="4" strokeLinecap="round"/>
                  </svg>Gerando...</>
                ) : '🖨️ Gerar PDF'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

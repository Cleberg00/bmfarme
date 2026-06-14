import { useEffect, useState } from 'react';

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
};

type Props = { clientId: string; onClose: () => void };

const FIELDS: { key: keyof CardData; label: string; hint?: string; wide?: boolean }[] = [
  { key: 'razaoSocial',        label: 'Nome Empresarial',          wide: true },
  { key: 'nomeFantasia',       label: 'Nome Fantasia' },
  { key: 'cnpj',               label: 'CNPJ' },
  { key: 'dataAbertura',       label: 'Data de Abertura',          hint: 'ex: 11/03/2026' },
  { key: 'situacao',           label: 'Situação Cadastral' },
  { key: 'dataSituacao',       label: 'Data da Situação',          hint: 'ex: 11/03/2026' },
  { key: 'porte',              label: 'Porte',                     hint: 'EPP, ME, DEMAIS...' },
  { key: 'naturezaJuridica',   label: 'Natureza Jurídica',         wide: true, hint: 'ex: 206-2 - Sociedade Empresária Limitada' },
  { key: 'atividadePrincipal', label: 'Atividade Principal (CNAE)', wide: true },
  { key: 'endereco',           label: 'Logradouro',                wide: true },
  { key: 'numero',             label: 'Número' },
  { key: 'complemento',        label: 'Complemento' },
  { key: 'bairro',             label: 'Bairro/Distrito' },
  { key: 'cep',                label: 'CEP' },
  { key: 'municipio',          label: 'Município' },
  { key: 'uf',                 label: 'UF' },
  { key: 'email',              label: 'Endereço Eletrônico',       wide: true },
  { key: 'telefone',           label: 'Telefone' },
  { key: 'smsPhone',           label: 'Número SMS (verificação)',  hint: 'Substitui telefone no documento' },
];

const EMPTY: CardData = {
  razaoSocial:'', nomeFantasia:'', cnpj:'', dataAbertura:'', situacao:'ATIVA',
  dataSituacao:'', porte:'', naturezaJuridica:'', atividadePrincipal:'',
  endereco:'', numero:'', complemento:'', bairro:'', cep:'', municipio:'',
  uf:'', email:'', telefone:'', smsPhone:'',
};

export default function CnpjCardModal({ clientId, onClose }: Props) {
  const [data, setData]           = useState<CardData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('bmfarm.token');
    const base  = import.meta.env.VITE_API_URL
      ? import.meta.env.VITE_API_URL.replace(/\/$/, '') + '/api'
      : '/api';

    fetch(`${base}/bm/card?clientId=${clientId}&format=json`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => setData({ ...EMPTY, ...d }))
      .catch(() => setData({ ...EMPTY }))
      .finally(() => setLoading(false));
  }, [clientId]);

  const handleChange = (key: keyof CardData, value: string) =>
    setData(prev => prev ? { ...prev, [key]: value } : prev);

  const handleDownload = async () => {
    if (!data) return;
    setGenerating(true);
    try {
      const token = localStorage.getItem('bmfarm.token');
      const base  = import.meta.env.VITE_API_URL
        ? import.meta.env.VITE_API_URL.replace(/\/$/, '') + '/api'
        : '/api';
      const res  = await fetch(`${base}/bm/card`, {
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
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-100">📄 Comprovante CNPJ</h2>
            <p className="text-xs text-slate-500">Modelo oficial da Receita Federal — edite e gere o PDF</p>
          </div>
          <button type="button" onClick={onClose}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-400 hover:text-white transition">
            ✕ Fechar
          </button>
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
              {FIELDS.map(f => (
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
          <div className="border-t border-slate-800 px-6 py-4 flex items-center justify-between gap-3">
            <p className="text-xs text-slate-600">
              💡 Clique em "Gerar PDF" → na nova aba pressione <kbd className="rounded bg-slate-700 px-1">Ctrl+P</kbd> → Salvar como PDF
            </p>
            <button type="button" onClick={handleDownload} disabled={generating}
              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-emerald-500 transition disabled:opacity-50 shrink-0">
              {generating ? (
                <><svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" className="stroke-current opacity-20" strokeWidth="4"/>
                  <path d="M22 12a10 10 0 0 0-10-10" className="stroke-current" strokeWidth="4" strokeLinecap="round"/>
                </svg>Gerando...</>
              ) : '🖨️ Gerar PDF'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

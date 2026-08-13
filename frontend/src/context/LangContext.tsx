import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAuth } from './AuthContext';

type Lang = 'pt' | 'en';

const translations = {
  pt: {
    consultarCnpj: 'Consultar CNPJ',
    busqueDados: 'Busque os dados da empresa pelo CNPJ',
    gerarSms: 'Gerar SMS',
    gerarNumero: 'Gere um número virtual para verificação',
    publicarSite: 'Publicar Site',
    geraLanding: 'Gera landing page no Cloudflare Workers para verificação Meta',
    criarWaba: 'Criar WABA',
    acesseDatacrazy: 'Acesse o DataCrazy CRM e crie a WABA vinculada à BM verificada',
    registrarBm: 'Registrar BM',
    registreBm: 'Registre o BM após verificação completa',
    dashboard: 'Dashboard',
    wabas: 'WABAs',
    cartaoCnpj: 'Cartão CNPJ',
    novoFarm: 'Novo Farm',
    sair: 'Sair',
    publicarEm: 'Publicar em',
    dominio: 'Domínio',
    subdominio: 'Subdomínio',
    metaVerification: 'Meta Verification Code',
    publicar: '🚀 Publicar Site',
    republicar: '🔄 Republicar Site',
    gerarNumeroSms: '📱 Gerar Número SMS',
    cnpjEmpresa: 'CNPJ da empresa',
    consultarBtn: 'Consultar CNPJ',
    sitePubSucesso: '✅ Site publicado com sucesso!',
    urlSite: 'URL do site',
    proximoPasso: 'Próximo passo — Meta Tag:',
    olá: 'Olá',
    atualizarSite: 'Atualizar Site Publicado',
    coleUrl: 'Cole a URL e corrija o número ou a razão social',
  },
  en: {
    consultarCnpj: 'Lookup CNPJ',
    busqueDados: 'Search company data by CNPJ',
    gerarSms: 'Generate SMS',
    gerarNumero: 'Generate a virtual number for verification',
    publicarSite: 'Publish Site',
    geraLanding: 'Generate landing page on Cloudflare Workers for Meta verification',
    criarWaba: 'Create WABA',
    acesseDatacrazy: 'Access DataCrazy CRM and create WABA linked to verified BM',
    registrarBm: 'Register BM',
    registreBm: 'Register the BM after full verification',
    dashboard: 'Dashboard',
    wabas: 'WABAs',
    cartaoCnpj: 'CNPJ Card',
    novoFarm: 'New Farm',
    sair: 'Logout',
    publicarEm: 'Publish to',
    dominio: 'Domain',
    subdominio: 'Subdomain',
    metaVerification: 'Meta Verification Code',
    publicar: '🚀 Publish Site',
    republicar: '🔄 Republish Site',
    gerarNumeroSms: '📱 Generate SMS Number',
    cnpjEmpresa: 'Company CNPJ',
    consultarBtn: 'Lookup CNPJ',
    sitePubSucesso: '✅ Site published successfully!',
    urlSite: 'Site URL',
    proximoPasso: 'Next step — Meta Tag:',
    olá: 'Hello',
    atualizarSite: 'Update Published Site',
    coleUrl: 'Paste the URL and fix the phone number or company name',
  },
};

type Translations = typeof translations.pt;

const LangContext = createContext<{ lang: Lang; t: Translations }>({ lang: 'pt', t: translations.pt });

// Emails que usam inglês
const ENGLISH_USERS = ['ashik@gmail.com'];

export function LangProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const lang: Lang = user?.email && ENGLISH_USERS.includes(user.email) ? 'en' : 'pt';
  const value = useMemo(() => ({ lang, t: translations[lang] }), [lang]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang() {
  return useContext(LangContext);
}

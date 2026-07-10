import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export type ThemeName =
  | 'default'
  | 'emerald'
  | 'purple'
  | 'amber'
  | 'cyan'
  | 'rose'
  | 'indigo'
  | 'lime';

export interface ThemeColors {
  name: string;
  bg: string;
  bgGradient: string;
  card: string;
  cardBorder: string;
  accent: string;
  accentHover: string;
  accentMuted: string;
  text: string;
  textMuted: string;
  textDim: string;
  stepBg: string;
}

const themes: Record<ThemeName, ThemeColors> = {
  default: {
    name: 'Slate',
    bg: '#020617',
    bgGradient: 'linear-gradient(180deg, #020617 0%, #0f172a 100%)',
    card: '#0f172a',
    cardBorder: 'rgba(51,65,85,0.5)',
    accent: '#10b981',
    accentHover: '#34d399',
    accentMuted: 'rgba(16,185,129,0.1)',
    text: '#f1f5f9',
    textMuted: '#94a3b8',
    textDim: '#64748b',
    stepBg: '#10b981',
  },
  emerald: {
    name: 'Emerald',
    bg: '#021a0f',
    bgGradient: 'linear-gradient(180deg, #021a0f 0%, #064e3b 100%)',
    card: '#022c22',
    cardBorder: 'rgba(6,78,59,0.6)',
    accent: '#34d399',
    accentHover: '#6ee7b7',
    accentMuted: 'rgba(52,211,153,0.1)',
    text: '#ecfdf5',
    textMuted: '#6ee7b7',
    textDim: '#34d399',
    stepBg: '#059669',
  },
  purple: {
    name: 'Purple',
    bg: '#0a0014',
    bgGradient: 'linear-gradient(180deg, #0a0014 0%, #1e1044 100%)',
    card: '#140024',
    cardBorder: 'rgba(88,28,135,0.5)',
    accent: '#a855f7',
    accentHover: '#c084fc',
    accentMuted: 'rgba(168,85,247,0.1)',
    text: '#faf5ff',
    textMuted: '#c4b5fd',
    textDim: '#8b5cf6',
    stepBg: '#7c3aed',
  },
  amber: {
    name: 'Amber',
    bg: '#0f0a00',
    bgGradient: 'linear-gradient(180deg, #0f0a00 0%, #1c1004 100%)',
    card: '#1a1000',
    cardBorder: 'rgba(120,53,15,0.5)',
    accent: '#f59e0b',
    accentHover: '#fbbf24',
    accentMuted: 'rgba(245,158,11,0.1)',
    text: '#fffbeb',
    textMuted: '#fcd34d',
    textDim: '#d97706',
    stepBg: '#d97706',
  },
  cyan: {
    name: 'Cyan',
    bg: '#001014',
    bgGradient: 'linear-gradient(180deg, #001014 0%, #083344 100%)',
    card: '#002030',
    cardBorder: 'rgba(14,116,144,0.5)',
    accent: '#06b6d4',
    accentHover: '#22d3ee',
    accentMuted: 'rgba(6,182,212,0.1)',
    text: '#ecfeff',
    textMuted: '#67e8f9',
    textDim: '#0891b2',
    stepBg: '#0891b2',
  },
  rose: {
    name: 'Rose',
    bg: '#0f0008',
    bgGradient: 'linear-gradient(180deg, #0f0008 0%, #2a0a18 100%)',
    card: '#1a0010',
    cardBorder: 'rgba(136,19,55,0.5)',
    accent: '#f43f5e',
    accentHover: '#fb7185',
    accentMuted: 'rgba(244,63,94,0.1)',
    text: '#fff1f2',
    textMuted: '#fda4af',
    textDim: '#e11d48',
    stepBg: '#e11d48',
  },
  indigo: {
    name: 'Indigo',
    bg: '#020014',
    bgGradient: 'linear-gradient(180deg, #020014 0%, #0c0a3e 100%)',
    card: '#0a0828',
    cardBorder: 'rgba(49,46,129,0.5)',
    accent: '#6366f1',
    accentHover: '#818cf8',
    accentMuted: 'rgba(99,102,241,0.1)',
    text: '#eef2ff',
    textMuted: '#a5b4fc',
    textDim: '#4f46e5',
    stepBg: '#4f46e5',
  },
  lime: {
    name: 'Lime',
    bg: '#050a00',
    bgGradient: 'linear-gradient(180deg, #050a00 0%, #1a2e05 100%)',
    card: '#0f1a02',
    cardBorder: 'rgba(63,98,18,0.5)',
    accent: '#84cc16',
    accentHover: '#a3e635',
    accentMuted: 'rgba(132,204,22,0.1)',
    text: '#f7fee7',
    textMuted: '#bef264',
    textDim: '#65a30d',
    stepBg: '#4d7c0f',
  },
};

interface ThemeContextValue {
  theme: ThemeName;
  colors: ThemeColors;
  setTheme: (t: ThemeName) => void;
  themeList: { key: ThemeName; name: string; accent: string }[];
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(() => {
    const saved = localStorage.getItem('bm-theme');
    return (saved as ThemeName) || 'default';
  });

  const setTheme = (t: ThemeName) => {
    setThemeState(t);
    localStorage.setItem('bm-theme', t);
  };

  const colors = themes[theme];

  // Apply CSS variables to body
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--theme-bg', colors.bg);
    root.style.setProperty('--theme-bg-gradient', colors.bgGradient);
    root.style.setProperty('--theme-card', colors.card);
    root.style.setProperty('--theme-card-border', colors.cardBorder);
    root.style.setProperty('--theme-accent', colors.accent);
    root.style.setProperty('--theme-accent-hover', colors.accentHover);
    root.style.setProperty('--theme-accent-muted', colors.accentMuted);
    root.style.setProperty('--theme-text', colors.text);
    root.style.setProperty('--theme-text-muted', colors.textMuted);
    root.style.setProperty('--theme-text-dim', colors.textDim);
    document.body.style.background = colors.bgGradient;
    document.body.style.color = colors.text;
  }, [colors]);

  const themeList = Object.entries(themes).map(([key, val]) => ({
    key: key as ThemeName,
    name: val.name,
    accent: val.accent,
  }));

  return (
    <ThemeContext.Provider value={{ theme, colors, setTheme, themeList }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be inside ThemeProvider');
  return ctx;
}

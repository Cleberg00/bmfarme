import { useState, useRef, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';

export default function ThemeSwitcher() {
  const { theme, colors, setTheme, themeList } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="rounded-xl border px-4 py-2 text-sm font-semibold transition hover:opacity-80"
        style={{
          borderColor: colors.accent + '40',
          background: colors.accentMuted,
          color: colors.accent,
        }}
        title="Mudar paleta de cores"
      >
        🎨 Tema
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-2 w-48 rounded-xl border p-2 shadow-2xl"
          style={{
            background: colors.card,
            borderColor: colors.cardBorder,
          }}
        >
          <div className="mb-2 px-2 py-1 text-xs font-bold uppercase tracking-wider" style={{ color: colors.textDim }}>
            Paleta de Cores
          </div>
          {themeList.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => { setTheme(t.key); setOpen(false); }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition hover:opacity-80"
              style={{
                background: theme === t.key ? colors.accentMuted : 'transparent',
                color: theme === t.key ? colors.accent : colors.text,
              }}
            >
              <span
                className="h-4 w-4 rounded-full border-2"
                style={{
                  backgroundColor: t.accent,
                  borderColor: theme === t.key ? '#fff' : t.accent,
                }}
              />
              {t.name}
              {theme === t.key && <span className="ml-auto text-xs">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

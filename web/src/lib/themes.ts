import type { Theme, ThemeTokens } from './types.ts';

const FONTS = {
  geist: "'Geist Variable', 'Inter Variable', system-ui, -apple-system, 'Segoe UI', sans-serif",
  geistMono: "'Geist Mono Variable', 'JetBrains Mono', ui-monospace, monospace",
  inter: "'Inter Variable', Inter, system-ui, -apple-system, 'Segoe UI', sans-serif",
  grotesk: "'Space Grotesk', 'Inter Variable', system-ui, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  serif: "'Fraunces', Georgia, 'Times New Roman', serif",
  system: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
};

export const FONT_OPTIONS = [
  { value: FONTS.geist, label: 'Geist' },
  { value: FONTS.inter, label: 'Inter' },
  { value: FONTS.grotesk, label: 'Space Grotesk' },
  { value: FONTS.serif, label: 'Fraunces (Serif)' },
  { value: FONTS.mono, label: 'JetBrains Mono' },
  { value: FONTS.geistMono, label: 'Geist Mono' },
  { value: FONTS.system, label: 'Systemschrift' },
];

const base: Omit<ThemeTokens, 'bg' | 'surface' | 'surface2' | 'border' | 'text' | 'muted' | 'accent' | 'accentText' | 'accent2'> = {
  ok: '#57D38C',
  warn: '#E3B341',
  bad: '#F47067',
  radius: 18,
  fontBody: FONTS.inter,
  fontHeading: FONTS.grotesk,
  fontMono: FONTS.mono,
  surfaceAlpha: 1,
  blur: 0,
  density: 'normal',
};

export const PRESETS: Theme[] = [
  // Monochrome, high-contrast look with crisp hairlines (default).
  {
    id: 'geist',
    name: 'Geist',
    tokens: {
      ...base,
      bg: '#0a0a0a',
      surface: '#111111',
      surface2: '#191919',
      border: '#2a2a2a',
      text: '#ededed',
      muted: '#a1a1a1',
      accent: '#ededed',
      accentText: '#0a0a0a',
      accent2: '#52a8ff',
      ok: '#3dd68c',
      warn: '#f5b84a',
      bad: '#ff6166',
      radius: 12,
      fontBody: FONTS.geist,
      fontHeading: FONTS.geist,
      fontMono: FONTS.geistMono,
    },
  },
  {
    id: 'geist-light',
    name: 'Geist Hell',
    tokens: {
      ...base,
      bg: '#fafafa',
      surface: '#ffffff',
      surface2: '#f4f4f5',
      border: '#e4e4e7',
      text: '#171717',
      muted: '#5f5f66',
      accent: '#171717',
      accentText: '#ffffff',
      accent2: '#0062d1',
      ok: '#13804a',
      warn: '#a35c00',
      bad: '#d1242f',
      radius: 12,
      fontBody: FONTS.geist,
      fontHeading: FONTS.geist,
      fontMono: FONTS.geistMono,
    },
  },
  {
    id: 'nacht',
    name: 'Nacht',
    tokens: { ...base, bg: '#0D1117', surface: '#161B22', surface2: '#1B222C', border: '#262D36', text: '#E6EAF0', muted: '#9BA5B3', accent: '#5EE6B0', accentText: '#08251A', accent2: '#F0A35E' },
  },
  {
    id: 'papier',
    name: 'Papier',
    tokens: {
      ...base,
      bg: '#F4F1EA',
      surface: '#FFFFFF',
      surface2: '#EFEBE2',
      border: '#DDD6C9',
      text: '#1D1B18',
      muted: '#5F594F',
      accent: '#B54A26',
      accentText: '#FFFFFF',
      accent2: '#2F6F8F',
      ok: '#2E8B57',
      warn: '#A86A00',
      bad: '#C0392B',
      fontHeading: FONTS.serif,
      radius: 14,
    },
  },
  {
    id: 'fjord',
    name: 'Fjord',
    tokens: { ...base, bg: '#1E2430', surface: '#2A3242', surface2: '#323B4D', border: '#3B465A', text: '#E5EBF3', muted: '#A7B3C6', accent: '#88C0D0', accentText: '#10202A', accent2: '#B48EAD', fontHeading: FONTS.inter, radius: 12 },
  },
  {
    id: 'terminal',
    name: 'Terminal',
    tokens: {
      ...base,
      bg: '#050505',
      surface: '#0F0F0F',
      surface2: '#171717',
      border: '#2A2A2A',
      text: '#FFB347',
      muted: '#B08550',
      accent: '#FFB347',
      accentText: '#1A0F00',
      accent2: '#7CFC9A',
      ok: '#7CFC9A',
      warn: '#FFD166',
      bad: '#FF6B6B',
      radius: 0,
      fontBody: FONTS.mono,
      fontHeading: FONTS.mono,
    },
  },
  {
    id: 'glas',
    name: 'Glas',
    tokens: {
      ...base,
      bg: '#24324D',
      surface: '#FFFFFF',
      surface2: '#FFFFFF',
      border: 'rgba(255,255,255,0.22)',
      text: '#FFFFFF',
      muted: '#D7E0EE',
      accent: '#FFD27A',
      accentText: '#2B1D00',
      accent2: '#9EE6FF',
      surfaceAlpha: 0.13,
      blur: 18,
      wallpaper: 'linear-gradient(135deg, #1f2b46 0%, #3b4f7a 45%, #6a5a8e 100%)',
      fontHeading: FONTS.inter,
    },
  },
];

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function withAlpha(color: string, alpha: number): string {
  const rgb = hexToRgb(color);
  return rgb ? `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})` : color;
}

const DENSITY = { compact: 0.8, normal: 1, airy: 1.25 };

export function applyTheme(t: ThemeTokens) {
  const root = document.documentElement.style;
  const set = (k: string, v: string) => root.setProperty(k, v);
  set('--bg', t.bg);
  set('--surface', withAlpha(t.surface, t.surfaceAlpha));
  set('--surface-2', withAlpha(t.surface2, t.surfaceAlpha < 1 ? Math.min(t.surfaceAlpha + 0.08, 1) : 1));
  set('--surface-solid', t.surfaceAlpha < 1 ? t.bg : t.surface);
  set('--border', t.border);
  set('--text', t.text);
  set('--muted', t.muted);
  set('--accent', t.accent);
  set('--accent-text', t.accentText);
  set('--accent-soft', withAlpha(t.accent, 0.16));
  set('--accent-2', t.accent2);
  set('--ok', t.ok);
  set('--warn', t.warn);
  set('--bad', t.bad);
  set('--ok-soft', withAlpha(t.ok, 0.16));
  set('--warn-soft', withAlpha(t.warn, 0.16));
  set('--bad-soft', withAlpha(t.bad, 0.16));
  set('--info', t.accent2);
  set('--radius', `${t.radius}px`);
  set('--radius-sm', `${Math.round(t.radius * 0.6)}px`);
  set('--font-body', t.fontBody);
  set('--font-heading', t.fontHeading);
  set('--font-mono', t.fontMono);
  set('--blur', t.blur ? `blur(${t.blur}px)` : 'none');
  set('--space', String(DENSITY[t.density] ?? 1));
  const wp = t.wallpaper?.trim();
  set('--wallpaper', !wp ? 'none' : /^(linear|radial|conic)-gradient/.test(wp) ? wp : `url("${wp.replace(/"/g, '%22')}")`);
  const rgb = hexToRgb(t.bg);
  const light = rgb ? (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 > 140 : false;
  document.documentElement.style.colorScheme = light ? 'light' : 'dark';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.bg);
}

export function findTheme(id: string | undefined, custom: Theme[] = []): Theme {
  return [...custom, ...PRESETS].find((t) => t.id === id) ?? PRESETS[0];
}

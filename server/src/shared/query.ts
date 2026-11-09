// Query parsing shared by server and client, so both agree on what a prefix means.

export interface ParsedQuery {
  /** Text without the prefix. */
  text: string;
  /** The prefix without "!" (lower case), if any. */
  bang?: string;
  /** ">" command mode */
  command: boolean;
}

/**
 * Supported forms:
 *   "!g katzen"      prefix at the start
 *   "katzen !g"      prefix at the end (handy when you decide late)
 *   "> logout"       command palette
 */
export function parseQuery(input: string): ParsedQuery {
  const raw = input.trim();
  if (raw.startsWith('>')) return { text: raw.slice(1).trim(), command: true };
  let m = /^!([\p{L}\p{N}_-]+)(?:\s+|$)(.*)$/su.exec(raw);
  if (m) return { bang: m[1].toLowerCase(), text: m[2].trim(), command: false };
  m = /^(.*\S)\s+!([\p{L}\p{N}_-]+)$/su.exec(raw);
  if (m) return { bang: m[2].toLowerCase(), text: m[1].trim(), command: false };
  return { text: raw, command: false };
}

/** Category prefixes that target every service of a category. */
export const CATEGORY_BANGS: Record<string, { category: string; label: string }> = {
  m: { category: 'media', label: 'Medien' },
  h: { category: 'smarthome', label: 'Smart Home' },
  dl: { category: 'downloads', label: 'Downloads' },
  n: { category: 'network', label: 'Netzwerk' },
  sys: { category: 'system', label: 'System' },
};

/** Heuristics: does this look like something to ask the web rather than the homelab? */
export function webIntent(text: string): number {
  const t = text.trim().toLowerCase();
  if (!t) return 0;
  let score = 0.45;
  const words = t.split(/\s+/);
  if (t.endsWith('?')) score += 0.4;
  if (/^(wie|was|wer|wo|wann|warum|wieso|weshalb|welche[rsmn]?|kann|ist|sind|how|what|who|where|when|why|which|can|is|are|does|do)\b/.test(t)) score += 0.35;
  if (words.length >= 5) score += 0.2;
  if (/\b(rezept|wetter|news|nachrichten|preis|kaufen|definition|bedeutung|übersetzung|translate|vs)\b/.test(t)) score += 0.2;
  return Math.min(score, 0.98);
}

export function looksLikeUrl(text: string): string | null {
  const t = text.trim();
  if (/\s/.test(t)) return null;
  if (/^https?:\/\/\S+$/i.test(t)) return t;
  if (/^(localhost|(\d{1,3}\.){3}\d{1,3})(:\d+)?(\/\S*)?$/i.test(t)) return `http://${t}`;
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(:\d+)?(\/\S*)?$/i.test(t)) return `https://${t}`;
  return null;
}

/** Evaluates simple arithmetic like "12*(3+4)/2" safely (no eval). */
export function calculate(text: string): number | null {
  const src = text.replace(/,/g, '.').replace(/\s+/g, '').replace(/^=/, '');
  if (!/^[\d+\-*/().%^]+$/.test(src) || !/\d/.test(src) || !/[+\-*/%^]/.test(src.replace(/^-/, ''))) return null;
  let i = 0;
  const peek = () => src[i];
  const expr = (): number => {
    let v = term();
    while (peek() === '+' || peek() === '-') v = src[i++] === '+' ? v + term() : v - term();
    return v;
  };
  const term = (): number => {
    let v = power();
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const op = src[i++];
      const r = power();
      v = op === '*' ? v * r : op === '/' ? v / r : v % r;
    }
    return v;
  };
  const power = (): number => {
    const b = unary();
    if (peek() === '^') {
      i++;
      return Math.pow(b, power());
    }
    return b;
  };
  const unary = (): number => {
    if (peek() === '-') {
      i++;
      return -unary();
    }
    if (peek() === '+') {
      i++;
      return unary();
    }
    return atom();
  };
  const atom = (): number => {
    if (peek() === '(') {
      i++;
      const v = expr();
      if (src[i++] !== ')') throw new Error('paren');
      return v;
    }
    const m = /^\d+(\.\d+)?/.exec(src.slice(i));
    if (!m) throw new Error('num');
    i += m[0].length;
    return parseFloat(m[0]);
  };
  try {
    const v = expr();
    return i === src.length && isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

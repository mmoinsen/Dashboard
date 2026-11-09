/** Normalise text for matching: lower case, strip accents, unify umlauts. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Score how well `query` matches `text`, 0 (no match) .. 1 (exact).
 * Cheap and predictable on purpose; providers combine it with their own boosts.
 */
export function matchScore(query: string, text: string | undefined | null): number {
  if (!text) return 0;
  const q = normalize(query);
  const t = normalize(text);
  if (!q || !t) return 0;
  if (t === q) return 1;
  if (t.startsWith(q)) return 0.92;
  const words = t.split(' ');
  if (words.includes(q)) return 0.88;
  if (words.some((w) => w.startsWith(q))) return 0.8;
  if (t.includes(q)) return 0.65;
  // all query words present somewhere
  const qWords = q.split(' ');
  if (qWords.length > 1 && qWords.every((w) => t.includes(w))) return 0.7;
  // subsequence (fuzzy) match for short typos like "sonar" / "jlyfn"
  if (q.length >= 3 && isSubsequence(q.replace(/ /g, ''), t.replace(/ /g, ''))) return 0.4;
  return 0;
}

function isSubsequence(needle: string, hay: string): boolean {
  let i = 0;
  for (const ch of hay) if (ch === needle[i]) i++;
  return i === needle.length;
}

/** Best score of the query against several candidate strings. */
export function bestScore(query: string, ...texts: (string | undefined | null)[]): number {
  let best = 0;
  for (const t of texts) best = Math.max(best, matchScore(query, t));
  return best;
}

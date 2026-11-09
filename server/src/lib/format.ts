export function bytes(n: number | undefined | null, digits = 1): string {
  if (n == null || !isFinite(n)) return '–';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let i = 0;
  let v = Math.abs(n);
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  // non-breaking space: "12.4 MB" never wraps between number and unit
  return `${(n < 0 ? -v : v).toFixed(i === 0 ? 0 : digits)}\u00a0${units[i]}`;
}

export function speed(bytesPerSec: number | undefined | null): string {
  if (bytesPerSec == null) return '–';
  return `${bytes(bytesPerSec)}/s`;
}

/** Split a byte rate into value + unit, for stat tiles. */
export function speedParts(bytesPerSec: number): { value: string; unit: string } {
  const [value, unit] = bytes(bytesPerSec).split(/\s/);
  return { value, unit: `${unit}/s` };
}

export function duration(seconds: number | undefined | null): string {
  if (seconds == null || !isFinite(seconds) || seconds < 0) return '–';
  if (seconds >= 8640000) return '∞';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}\u00a0d ${h}\u00a0h`;
  if (h > 0) return `${h}\u00a0h ${m}\u00a0min`;
  if (m > 0) return `${m}\u00a0min`;
  return `${Math.floor(seconds)}\u00a0s`;
}

export function ticksToSeconds(ticks: number | undefined): number {
  return ticks ? ticks / 10_000_000 : 0;
}

export function num(n: number | undefined | null, digits = 0): string {
  if (n == null || !isFinite(n)) return '–';
  return n.toLocaleString('de-DE', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function percent(n: number | undefined | null, digits = 1): string {
  if (n == null || !isFinite(n)) return '–';
  return `${num(n, digits)}\u00a0%`;
}

const weekday = new Intl.DateTimeFormat('de-DE', { weekday: 'short' });
const dayMonth = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short' });
const time = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });

export function relativeDay(date: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'Heute';
  if (diff === 1) return 'Morgen';
  if (diff === -1) return 'Gestern';
  return `${weekday.format(date)}, ${dayMonth.format(date)}`;
}

export function timeOfDay(date: Date): string {
  return time.format(date);
}

export function ago(date: Date | string | number): string {
  const t = new Date(date).getTime();
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'gerade eben';
  if (s < 3600) return `vor ${Math.round(s / 60)} min`;
  if (s < 86400) return `vor ${Math.round(s / 3600)} h`;
  return `vor ${Math.round(s / 86400)} d`;
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function episodeCode(season?: number, episode?: number): string {
  if (season == null || episode == null) return '';
  return `S${pad2(season)}E${pad2(episode)}`;
}

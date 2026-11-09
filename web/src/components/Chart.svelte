<script lang="ts">
  import type { Tone } from '../lib/types.ts';

  /**
   * Interactive line chart: smooth lines with soft area fill, shared y-scale,
   * hover / keyboard crosshair with a tooltip showing every series at that point.
   */
  let {
    series,
    unit = '',
    label,
    times,
    big = false,
  }: { series: { label: string; points: number[]; tone?: Tone }[]; unit?: string; label?: string; times?: number[]; big?: boolean } = $props();

  const TONE: Record<string, string> = { info: 'info', accent: 'accent', ok: 'ok', warn: 'warn', bad: 'bad', muted: 'muted', default: 'accent' };
  const colorOf = (i: number) => `var(--${TONE[series[i].tone ?? (i === 0 ? 'accent' : 'info')]})`;
  const uid = Math.random().toString(36).slice(2, 8);

  let width = $state(0);
  let hover = $state<number | null>(null);
  const height = $derived(big ? 200 : 96);
  const PAD = { top: 10, right: 6, bottom: 6, left: 38 };

  const n = $derived(Math.max(...series.map((s) => s.points.length), 0));
  /** Rounded top of the axis, e.g. 13.2 → 15. */
  const yMax = $derived.by(() => {
    const m = Math.max(...series.flatMap((s) => s.points), 0);
    if (m <= 0) return 1;
    const mag = 10 ** Math.floor(Math.log10(m));
    const step = [1, 2, 2.5, 5, 10].find((f) => f * mag >= m) ?? 10;
    return step * mag;
  });
  const innerW = $derived(Math.max(width - PAD.left - PAD.right, 10));
  const innerH = $derived(height - PAD.top - PAD.bottom);
  const xAt = (i: number) => PAD.left + (n > 1 ? (i / (n - 1)) * innerW : innerW / 2);
  const yAt = (v: number) => PAD.top + innerH - (Math.max(v, 0) / yMax) * innerH;

  /** Smooth curve through the points (Catmull-Rom converted to cubic Béziers). */
  function linePath(points: number[]): string {
    if (points.length < 2) return '';
    const p = points.map((v, i) => [xAt(i), yAt(v)]);
    let d = `M${p[0][0]},${p[0][1]}`;
    for (let i = 0; i < p.length - 1; i++) {
      const p0 = p[i - 1] ?? p[i];
      const p1 = p[i];
      const p2 = p[i + 1];
      const p3 = p[i + 2] ?? p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      // keep control points inside the plot so the curve never dips below zero
      c1[1] = Math.min(c1[1], PAD.top + innerH);
      c2[1] = Math.min(c2[1], PAD.top + innerH);
      d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
    }
    return d;
  }
  const areaPath = (points: number[]) =>
    points.length < 2 ? '' : `${linePath(points)} L${xAt(points.length - 1)},${PAD.top + innerH} L${xAt(0)},${PAD.top + innerH} Z`;

  const ticks = $derived([0, 0.5, 1].map((f) => f * yMax));
  const fmt = (v: number) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString('de-DE') : v.toLocaleString('de-DE', { maximumFractionDigits: 1 }));
  const timeFmt = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  function onMove(e: PointerEvent) {
    const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
    const x = e.clientX - rect.left - PAD.left;
    hover = Math.min(Math.max(Math.round((x / innerW) * (n - 1)), 0), n - 1);
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      hover = Math.min(Math.max((hover ?? n - 1) + (e.key === 'ArrowLeft' ? -1 : 1), 0), n - 1);
    } else if (e.key === 'Escape') hover = null;
  }

  const active = $derived(hover ?? n - 1);
  const tipLeft = $derived(hover == null ? 0 : xAt(hover));
  const last = (pts: number[]) => pts[pts.length - 1] ?? 0;
</script>

<figure class="chart">
  {#if label}<figcaption>{label}</figcaption>{/if}
  <div class="plot" bind:clientWidth={width} style="height:{height}px">
    {#if width && n > 1}
      <svg
        {width}
        {height}
        role="img"
        tabindex="0"
        aria-label="{label ?? series.map((s) => s.label).join(', ')}: {series.map((s) => `${s.label} aktuell ${fmt(last(s.points))} ${unit}`).join(', ')}. Mit Pfeiltasten Werte ansehen."
        onpointermove={onMove}
        onpointerleave={() => (hover = null)}
        onkeydown={onKey}
        onblur={() => (hover = null)}
      >
        <defs>
          {#each series as _, i}
            <linearGradient id="g-{uid}-{i}" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color={colorOf(i)} stop-opacity="0.28" />
              <stop offset="100%" stop-color={colorOf(i)} stop-opacity="0" />
            </linearGradient>
          {/each}
        </defs>
        {#each ticks as t}
          <line class="grid" x1={PAD.left} x2={width - PAD.right} y1={yAt(t)} y2={yAt(t)} />
          <text class="axis" x={PAD.left - 6} y={yAt(t) + 3.5} text-anchor="end">{fmt(t)}</text>
        {/each}
        {#each series as s, i}
          <path d={areaPath(s.points)} fill="url(#g-{uid}-{i})" />
        {/each}
        {#each series as s, i}
          <path d={linePath(s.points)} fill="none" stroke={colorOf(i)} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
        {/each}
        {#if hover != null}
          <line class="cross" x1={xAt(hover)} x2={xAt(hover)} y1={PAD.top} y2={PAD.top + innerH} />
          {#each series as s, i}
            {#if s.points[hover] != null}
              <circle cx={xAt(hover)} cy={yAt(s.points[hover])} r="4.5" fill="var(--surface-solid)" stroke={colorOf(i)} stroke-width="2.5" />
            {/if}
          {/each}
        {/if}
      </svg>
      {#if hover != null}
        <div class="tip" class:flip={tipLeft > width * 0.6} style="left:{tipLeft}px">
          <div class="tip-time">{times?.[hover] ? timeFmt.format(new Date(times[hover])) : `Messung ${hover + 1} von ${n}`}</div>
          {#each series as s, i}
            <div class="tip-row"><span class="dot" style="background:{colorOf(i)}"></span>{s.label}<strong>{fmt(s.points[hover] ?? 0)} {unit}</strong></div>
          {/each}
        </div>
      {/if}
    {:else if n <= 1}
      <div class="empty">Noch zu wenige Messwerte – der Verlauf füllt sich, solange das Widget geöffnet ist.</div>
    {/if}
  </div>
  <div class="legend">
    {#each series as s, i}
      <span class="item">
        <span class="dot" style="background:{colorOf(i)}"></span>
        <span class="muted">{s.label}</span>
        <strong>{fmt(s.points[active] ?? 0)}</strong><span class="muted">{unit}</span>
        {#if s.points.length > 1}<span class="muted small">max {fmt(Math.max(...s.points))}</span>{/if}
      </span>
    {/each}
  </div>
</figure>

<style>
  .chart {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }
  figcaption {
    font-size: 12px;
    color: var(--muted);
  }
  .plot {
    position: relative;
    width: 100%;
  }
  svg {
    display: block;
    overflow: visible;
    cursor: crosshair;
    border-radius: var(--radius-sm);
  }
  svg:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 4px;
  }
  .grid {
    stroke: var(--border);
    stroke-dasharray: 3 4;
  }
  .axis {
    font-family: var(--font-mono);
    font-size: 10px;
    fill: var(--muted);
  }
  .cross {
    stroke: var(--muted);
    stroke-width: 1;
    stroke-dasharray: 2 3;
  }
  .tip {
    position: absolute;
    top: 0;
    transform: translateX(12px);
    pointer-events: none;
    background: var(--surface-solid);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow);
    padding: 8px 10px;
    font-size: 12px;
    min-width: 150px;
    z-index: 5;
  }
  .tip.flip {
    transform: translateX(calc(-100% - 12px));
  }
  .tip-time {
    color: var(--muted);
    margin-bottom: 4px;
    font-family: var(--font-mono);
    font-size: 11px;
  }
  .tip-row {
    display: flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }
  .tip-row strong {
    margin-left: auto;
    padding-left: 12px;
    font-family: var(--font-mono);
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 18px;
    font-size: 13px;
  }
  .item {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
  }
  .item .dot {
    align-self: center;
  }
  .item strong {
    font-family: var(--font-heading);
    font-size: 15px;
  }
  .small {
    font-size: 11px;
  }
  .empty {
    height: 100%;
    display: grid;
    place-items: center;
    text-align: center;
    color: var(--muted);
    font-size: 13px;
    border: 1px dashed var(--border);
    border-radius: var(--radius-sm);
    padding: 12px;
  }
</style>

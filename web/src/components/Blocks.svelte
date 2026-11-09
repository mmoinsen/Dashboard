<script lang="ts">
  import type { Block } from '../lib/types.ts';
  import { linkTarget } from '../lib/store.svelte.ts';
  import ActionButton from './ActionButton.svelte';
  import Clock from './Clock.svelte';
  import Icon from './Icon.svelte';
  import Toggle from './Toggle.svelte';

  /** Generic renderer for widget blocks – integrations never ship their own UI. */
  let { blocks, refresh }: { blocks: Block[]; refresh: () => void } = $props();

  function sparkline(points: number[], w = 300, h = 64) {
    if (points.length < 2) return '';
    const max = Math.max(...points);
    const min = Math.min(...points);
    const span = max - min || 1;
    return points.map((p, i) => `${((i / (points.length - 1)) * w).toFixed(1)},${(h - 4 - ((p - min) / span) * (h - 8)).toFixed(1)}`).join(' ');
  }
</script>

{#each blocks as b, bi (bi)}
  {#if b.type === 'stats'}
    <div class="stats" class:many={b.items.length > 3}>
      {#each b.items as s}
        <div class="stat">
          <div class="label">{s.label}</div>
          <div class="value tone-{s.tone ?? 'default'}">{s.value}{#if s.unit}<span class="unit">{s.unit}</span>{/if}</div>
        </div>
      {/each}
    </div>
  {:else if b.type === 'bars'}
    <div class="bars">
      {#each b.items as bar}
        <div class="bar">
          <div class="bar-head"><span class="muted">{bar.label}</span><span class="mono">{bar.value}</span></div>
          <div class="track"><div class="fill bg-{bar.tone ?? 'accent'}" style="width:{Math.min(Math.max(bar.percent, 0), 100)}%"></div></div>
        </div>
      {/each}
    </div>
  {:else if b.type === 'list'}
    {#if b.title}<div class="section-title">{b.title}</div>{/if}
    {#if !b.items.length}
      <div class="empty">{b.empty ?? 'Keine Einträge'}</div>
    {:else}
      <ul class="list">
        {#each b.items as it}
          <li class="row">
            {#if it.image}
              <img class="thumb" src={it.image} alt="" loading="lazy" />
            {:else if it.icon}
              <Icon name={it.icon} label={it.title} size={28} />
            {:else if it.status}
              <span class="dot bg-{it.status}"></span>
            {/if}
            <div class="row-main">
              <div class="row-top">
                {#if it.url}
                  <a class="row-title" href={it.url} target={linkTarget()} rel="noopener">{it.title}</a>
                {:else}
                  <span class="row-title">{it.title}</span>
                {/if}
                {#if it.badge}<span class="badge tone-{it.badge.tone ?? 'muted'}">{it.badge.text}</span>{/if}
              </div>
              {#if it.subtitle || it.meta}
                <div class="row-sub">
                  {#if it.subtitle}<span class="ellipsis">{it.subtitle}</span>{/if}
                  {#if it.meta}<span class="meta mono">{it.meta}</span>{/if}
                </div>
              {/if}
              {#if it.progress != null}
                <div class="track thin"><div class="fill bg-{it.status && it.status !== 'ok' ? it.status : 'accent'}" style="width:{it.progress}%"></div></div>
              {/if}
            </div>
            {#if it.actions?.length}
              <div class="row-actions">
                {#each it.actions as a}<ActionButton action={a} ondone={refresh} />{/each}
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  {:else if b.type === 'toggles'}
    <div class="toggles">
      {#each b.items as t (t.title)}<Toggle item={t} onchange={refresh} />{/each}
    </div>
  {:else if b.type === 'posters'}
    {#if b.title}<div class="section-title">{b.title}</div>{/if}
    <div class="posters">
      {#each b.items as p}
        <a class="poster" href={p.url} target={linkTarget()} rel="noopener" title={p.title}>
          {#if p.image}<img src={p.image} alt="" loading="lazy" />{:else}<span class="ph">{p.title}</span>{/if}
          <span class="pt">{p.title}</span>
          {#if p.subtitle}<span class="ps">{p.subtitle}</span>{/if}
        </a>
      {/each}
    </div>
  {:else if b.type === 'chart'}
    {#each b.series as s}
      <svg class="chart" viewBox="0 0 300 64" preserveAspectRatio="none" role="img" aria-label="{s.label}{b.unit ? ` in ${b.unit}` : ''}">
        <polyline points={sparkline(s.points)} fill="none" stroke="var(--{s.tone === 'info' ? 'info' : 'accent'})" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
      </svg>
      <div class="chart-legend muted"><span>{s.label}</span><span class="mono">min {Math.min(...s.points)} · max {Math.max(...s.points)} {b.unit ?? ''}</span></div>
    {/each}
  {:else if b.type === 'kv'}
    <dl class="kv">
      {#each b.items as kv}
        <dt>{kv.label}</dt>
        <dd class="mono">{kv.value}</dd>
      {/each}
    </dl>
  {:else if b.type === 'text'}
    <p class="text tone-{b.tone ?? 'default'}">{b.text}</p>
  {:else if b.type === 'actions'}
    <div class="actions">
      {#each b.items as a}<ActionButton action={a} ondone={refresh} />{/each}
    </div>
  {:else if b.type === 'clock'}
    <Clock seconds={b.seconds} timezone={b.timezone} showDate={b.showDate} />
  {:else if b.type === 'links'}
    <div class="links">
      {#each b.items as l}
        <a class="link" href={l.url} target={linkTarget()} rel="noopener">
          <Icon name={l.icon ?? ''} label={l.title} size={24} />
          <span class="ellipsis">{l.title}</span>
        </a>
      {/each}
    </div>
  {/if}
{/each}

<style>
  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
    gap: 8px;
  }
  .stats.many .value {
    font-size: 19px;
  }
  .stat {
    background: var(--surface-2);
    border-radius: var(--radius-sm);
    padding: calc(10px * var(--space)) 12px;
    min-width: 0;
  }
  .label {
    font-size: 12px;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .value {
    font-family: var(--font-heading);
    font-size: 22px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .value.tone-default {
    color: var(--text);
  }
  .unit {
    font-size: 12px;
    color: var(--muted);
    font-weight: 500;
    margin-left: 4px;
    font-family: var(--font-body);
  }
  .bars {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .bar-head {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 13px;
    margin-bottom: 6px;
  }
  .track {
    height: 6px;
    border-radius: 3px;
    background: color-mix(in srgb, var(--muted) 18%, transparent);
    overflow: hidden;
  }
  .track.thin {
    height: 4px;
    margin-top: 6px;
  }
  .fill {
    height: 100%;
    border-radius: inherit;
    transition: width 0.5s ease;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: calc(8px * var(--space)) 0;
    border-top: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  }
  .row:first-child {
    border-top: 0;
  }
  .thumb {
    width: 36px;
    height: 54px;
    object-fit: cover;
    border-radius: 6px;
    flex: none;
    background: var(--surface-2);
  }
  .row-main {
    flex: 1;
    min-width: 0;
  }
  .row-top {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .row-title {
    font-size: 14px;
    font-weight: 500;
    color: var(--text);
    text-decoration: none;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
  a.row-title:hover {
    text-decoration: underline;
  }
  .badge {
    margin-left: auto;
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 999px;
    background: color-mix(in srgb, currentColor 14%, transparent);
    white-space: nowrap;
    flex: none;
  }
  .row-sub {
    display: flex;
    gap: 10px;
    justify-content: space-between;
    font-size: 12px;
    color: var(--muted);
    min-width: 0;
  }
  .ellipsis {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
  .meta {
    white-space: nowrap;
    flex: none;
  }
  .row-actions {
    display: flex;
    gap: 6px;
    flex: none;
    opacity: 0;
    transition: opacity 0.15s;
  }
  .row:hover .row-actions,
  .row:focus-within .row-actions {
    opacity: 1;
  }
  @media (hover: none) {
    .row-actions {
      opacity: 1;
    }
  }
  .empty {
    color: var(--muted);
    font-size: 13px;
    padding: 8px 0;
  }
  .section-title {
    font-size: 12px;
    color: var(--muted);
  }
  .toggles {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 8px;
  }
  .posters {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
    gap: 10px;
  }
  .poster {
    display: flex;
    flex-direction: column;
    gap: 4px;
    text-decoration: none;
    color: var(--text);
    min-width: 0;
  }
  .poster img,
  .ph {
    aspect-ratio: 2 / 3;
    width: 100%;
    object-fit: cover;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    transition: transform 0.2s;
  }
  .ph {
    display: grid;
    place-items: center;
    padding: 8px;
    font-size: 12px;
    text-align: center;
    color: var(--muted);
  }
  .poster:hover img {
    transform: translateY(-2px);
  }
  .pt {
    font-size: 12px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ps {
    font-size: 11px;
    color: var(--muted);
    margin-top: -4px;
  }
  .chart {
    width: 100%;
    height: 64px;
    display: block;
  }
  .chart-legend {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    margin-top: -4px;
  }
  .kv {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 6px 16px;
    margin: 0;
    font-size: 13px;
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
    text-align: right;
    overflow-wrap: anywhere;
  }
  .text {
    margin: 0;
    font-size: 13px;
  }
  .text.tone-default {
    color: var(--text);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .links {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 8px;
  }
  .link {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    min-height: 44px;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text);
    text-decoration: none;
    font-size: 14px;
    min-width: 0;
  }
  .link:hover {
    background: color-mix(in srgb, var(--accent) 10%, var(--surface-2));
  }
</style>

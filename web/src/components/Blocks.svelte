<script lang="ts">
  import type { Block } from '../lib/types.ts';
  import { linkTarget } from '../lib/store.svelte.ts';
  import ActionButton from './ActionButton.svelte';
  import Chart from './Chart.svelte';
  import Clock from './Clock.svelte';
  import Icon from './Icon.svelte';
  import Toggle from './Toggle.svelte';

  /**
   * Generic renderer for widget blocks – integrations never ship their own UI.
   * `detail` = rendered in the large detail view: bigger charts, labelled buttons,
   * and "heading" blocks start their own section.
   */
  let { blocks, refresh, detail = false }: { blocks: Block[]; refresh: () => void; detail?: boolean } = $props();

  /** Split at headings so the detail view can show each part as its own section. */
  const sections = $derived.by(() => {
    const out: { title?: string; blocks: Block[] }[] = [];
    for (const b of blocks) {
      if (b.type === 'heading' && detail) out.push({ title: b.text, blocks: [] });
      else {
        if (!out.length) out.push({ blocks: [] });
        out[out.length - 1].blocks.push(b);
      }
    }
    return out;
  });
</script>

{#snippet render(b: Block)}
  {#if b.type === 'stats'}
    <div class="stats">
      {#each b.items as s}
        <div class="stat" title="{s.label}: {s.value}{s.unit ? ` ${s.unit}` : ''}">
          <div class="label">{s.label}</div>
          <div class="value tone-{s.tone ?? 'default'}">{s.value}{#if s.unit}<span class="unit">{s.unit}</span>{/if}</div>
        </div>
      {/each}
    </div>
  {:else if b.type === 'bars'}
    <div class="bars">
      {#each b.items as bar}
        <div class="bar">
          <div class="bar-head"><span class="muted">{bar.label}</span><span class="bar-value">{bar.value}</span></div>
          <div class="track" role="meter" aria-label={bar.label} aria-valuenow={Math.round(bar.percent)} aria-valuemin="0" aria-valuemax="100">
            <div class="fill bg-{bar.tone ?? 'accent'}" style="width:{Math.min(Math.max(bar.percent, 0), 100)}%"></div>
          </div>
        </div>
      {/each}
    </div>
  {:else if b.type === 'list'}
    {#if b.title}<div class="section-title">{b.title}</div>{/if}
    {#if !b.items.length}
      <div class="empty">{b.empty ?? 'Keine Einträge'}</div>
    {:else}
      <ul class="list" class:detail>
        {#each b.items as it}
          <li class="row" class:has-image={!!it.image}>
            {#if it.image}
              <img class="thumb" src={it.image} alt="" width="38" height="56" loading="lazy" />
            {:else if it.icon}
              <Icon name={it.icon} label={it.title} size={28} />
            {:else if it.status}
              <span class="status bg-{it.status}" aria-hidden="true"></span>
            {/if}
            <div class="row-main">
              <div class="row-top">
                {#if it.url}
                  <a class="row-title clamp-2" href={it.url} target={linkTarget()} rel="noopener" title={it.title}>{it.title}</a>
                {:else}
                  <span class="row-title clamp-2" title={it.title}>{it.title}</span>
                {/if}
                {#if it.badge}<span class="badge tone-{it.badge.tone ?? 'muted'}">{it.badge.text}</span>{/if}
              </div>
              {#if it.subtitle || it.meta}
                <div class="row-sub">
                  {#if it.subtitle}<span class="sub clamp-2" title={it.subtitle}>{it.subtitle}</span>{/if}
                  {#if it.meta}<span class="meta" translate="no">{it.meta}</span>{/if}
                </div>
              {/if}
              {#if it.progress != null}
                <div class="track thin"><div class="fill bg-{it.status && it.status !== 'ok' && it.status !== 'muted' ? it.status : 'accent'}" style="width:{it.progress}%"></div></div>
              {/if}
            </div>
            {#if it.actions?.length}
              <div class="row-actions">
                {#each it.actions as a}<ActionButton action={a} ondone={refresh} compact={!detail} />{/each}
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  {:else if b.type === 'toggles'}
    <div class="toggles" class:detail>
      {#each b.items as t (t.title)}<Toggle item={t} onchange={refresh} />{/each}
    </div>
  {:else if b.type === 'posters'}
    {#if b.title}<div class="section-title">{b.title}</div>{/if}
    <div class="posters" class:detail>
      {#each b.items as p}
        <a class="poster" href={p.url} target={linkTarget()} rel="noopener" title={p.title}>
          <span class="poster-img">
            {#if p.image}<img src={p.image} alt="" width="200" height="300" loading="lazy" />{:else}<span class="ph">{p.title}</span>{/if}
          </span>
          <span class="pt clamp-2">{p.title}</span>
          {#if p.subtitle}<span class="ps">{p.subtitle}</span>{/if}
        </a>
      {/each}
    </div>
  {:else if b.type === 'chart'}
    <Chart series={b.series} unit={b.unit} label={b.label} times={b.times} big={detail} />
  {:else if b.type === 'kv'}
    <dl class="kv">
      {#each b.items as kv}
        <div class="kv-row">
          <dt>{kv.label}</dt>
          <dd translate="no">{kv.value}</dd>
        </div>
      {/each}
    </dl>
  {:else if b.type === 'heading'}
    <h4 class="heading">{b.text}</h4>
  {:else if b.type === 'text'}
    <p class="text tone-{b.tone ?? 'default'}">{b.text}</p>
  {:else if b.type === 'actions'}
    <div class="actions">
      {#each b.items as a}<ActionButton action={a} ondone={refresh} small={!detail} />{/each}
    </div>
  {:else if b.type === 'clock'}
    <Clock seconds={b.seconds} timezone={b.timezone} showDate={b.showDate} />
  {:else if b.type === 'links'}
    <div class="links">
      {#each b.items as l}
        <a class="link" href={l.url} target={linkTarget()} rel="noopener" title={l.url}>
          <Icon name={l.icon ?? ''} label={l.title} size={24} />
          <span class="clamp-2">{l.title}</span>
        </a>
      {/each}
    </div>
  {/if}
{/snippet}

{#if detail}
  {#each sections as sec, i (i)}
    <section class="section" class:titled={!!sec.title}>
      {#if sec.title}<h3 class="section-head">{sec.title}</h3>{/if}
      {#each sec.blocks as b, bi (bi)}{@render render(b)}{/each}
    </section>
  {/each}
{:else}
  {#each blocks as b, bi (bi)}{@render render(b)}{/each}
{/if}

<style>
  /* ---------- stats: values scale down with the tile instead of being cut off ---------- */
  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(92px, 1fr));
    gap: 8px;
  }
  .stat {
    container-type: inline-size;
    background: var(--surface-2);
    border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
    border-radius: var(--radius-sm);
    padding: calc(10px * var(--space)) 12px;
    min-width: 0;
  }
  .label {
    font-size: 12px;
    color: var(--muted);
    line-height: 1.3;
    overflow-wrap: anywhere;
  }
  .value {
    margin-top: 2px;
    font-family: var(--font-heading);
    font-weight: 600;
    line-height: 1.15;
    font-size: clamp(15px, 19cqi, 24px);
    overflow-wrap: anywhere;
    font-variant-numeric: tabular-nums;
  }
  .value.tone-default {
    color: var(--text);
  }
  .unit {
    font-size: 0.55em;
    color: var(--muted);
    font-weight: 500;
    margin-left: 4px;
    font-family: var(--font-body);
    white-space: nowrap;
  }

  /* ---------- bars ---------- */
  .bars {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .bar-head {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 2px 12px;
    font-size: 13px;
    margin-bottom: 6px;
  }
  .bar-value {
    font-family: var(--font-mono);
    font-size: 12px;
  }
  .track {
    height: 6px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--muted) 18%, transparent);
    overflow: hidden;
  }
  .track.thin {
    height: 4px;
    margin-top: 7px;
  }
  .fill {
    height: 100%;
    border-radius: inherit;
    transition: width 0.5s ease;
  }

  /* ---------- lists ---------- */
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
    padding: calc(9px * var(--space)) 0;
    border-top: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
  }
  .row:first-child {
    border-top: 0;
    padding-top: 2px;
  }
  .list.detail .row {
    padding: 10px 12px;
    margin: 0 -12px;
    border-radius: var(--radius-sm);
    border-top-color: transparent;
  }
  /* long detail lists (up to 100 torrents/entities): let the browser skip off-screen rows */
  .list.detail .row {
    content-visibility: auto;
    contain-intrinsic-size: auto 64px;
  }
  .list.detail .row:hover {
    background: color-mix(in srgb, var(--surface-2) 70%, transparent);
  }
  .thumb {
    width: 38px;
    height: 56px;
    object-fit: cover;
    border-radius: 7px;
    flex: none;
    background: var(--surface-2);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  }
  .status {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex: none;
    box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 0%, transparent);
  }
  .row-main {
    flex: 1;
    min-width: 0;
  }
  .row-top {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    min-width: 0;
  }
  .row-title {
    font-size: 14px;
    font-weight: 500;
    line-height: 1.35;
    color: var(--text);
    text-decoration: none;
    min-width: 0;
    flex: 1;
  }
  a.row-title:hover {
    color: var(--accent);
  }
  .badge {
    font-size: 11px;
    font-weight: 500;
    padding: 2px 8px;
    border-radius: 999px;
    background: color-mix(in srgb, currentColor 14%, transparent);
    white-space: nowrap;
    flex: none;
    margin-top: 1px;
  }
  .row-sub {
    display: flex;
    align-items: baseline;
    gap: 4px 12px;
    justify-content: space-between;
    flex-wrap: wrap;
    margin-top: 2px;
    font-size: 12px;
    color: var(--muted);
    min-width: 0;
  }
  .sub {
    min-width: 0;
    flex: 1 1 160px;
  }
  .meta {
    white-space: nowrap;
    font-family: var(--font-mono);
    font-size: 11.5px;
    margin-left: auto;
  }
  .row-actions {
    display: flex;
    gap: 4px;
    flex: none;
  }
  .list:not(.detail) .row-actions {
    opacity: 0;
    transition: opacity 0.15s;
  }
  .list:not(.detail) .row:hover .row-actions,
  .list:not(.detail) .row:focus-within .row-actions {
    opacity: 1;
  }
  @media (hover: none) {
    .list:not(.detail) .row-actions {
      opacity: 1;
    }
  }
  .empty {
    color: var(--muted);
    font-size: 13px;
    padding: 14px;
    text-align: center;
    border: 1px dashed var(--border);
    border-radius: var(--radius-sm);
  }
  .section-title {
    font-size: 12px;
    color: var(--muted);
  }

  /* ---------- toggles / posters / links ---------- */
  .toggles {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(190px, 100%), 1fr));
    gap: 8px;
  }
  .toggles.detail {
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  }
  .posters {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
    gap: 12px;
  }
  .posters.detail {
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  }
  .poster {
    display: flex;
    flex-direction: column;
    gap: 6px;
    text-decoration: none;
    color: var(--text);
    min-width: 0;
  }
  .poster-img {
    display: block;
    aspect-ratio: 2 / 3;
    border-radius: var(--radius-sm);
    overflow: hidden;
    background: var(--surface-2);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
  }
  .poster img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    transition: transform 0.3s ease;
  }
  .poster:hover img {
    transform: scale(1.05);
  }
  .ph {
    height: 100%;
    display: grid;
    place-items: center;
    padding: 8px;
    font-size: 12px;
    text-align: center;
    color: var(--muted);
  }
  .pt {
    font-size: 12px;
    font-weight: 500;
    line-height: 1.3;
  }
  .ps {
    font-size: 11px;
    color: var(--muted);
    margin-top: -3px;
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
    min-height: 48px;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    border: 1px solid transparent;
    color: var(--text);
    text-decoration: none;
    font-size: 14px;
    min-width: 0;
    transition:
      border-color 0.15s,
      transform 0.15s;
  }
  .link:hover {
    border-color: color-mix(in srgb, var(--accent) 50%, transparent);
    transform: translateY(-1px);
  }

  /* ---------- key/value, text, actions ---------- */
  .kv {
    margin: 0;
    display: flex;
    flex-direction: column;
    font-size: 13px;
  }
  .kv-row {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 2px 16px;
    padding: 7px 0;
    border-top: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
  }
  .kv-row:first-child {
    border-top: 0;
    padding-top: 0;
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0 0 0 auto;
    text-align: right;
    font-family: var(--font-mono);
    font-size: 12.5px;
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
  .heading {
    margin: 8px 0 -4px;
    font-size: 11px;
    font-family: var(--font-body);
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }

  /* ---------- detail view sections ---------- */
  .section {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;
  }
  .section.titled {
    padding: 18px;
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--surface-2) 45%, transparent);
    border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  }
  .section-head {
    font-size: 15px;
    font-weight: 600;
    font-family: var(--font-body);
    letter-spacing: 0;
  }
</style>

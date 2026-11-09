<script lang="ts">
  import { post } from '../lib/api.ts';
  import { app, integration, linkTarget, service } from '../lib/store.svelte.ts';
  import type { WidgetData, WidgetInstance } from '../lib/types.ts';
  import Blocks from './Blocks.svelte';
  import Glyph from './Glyph.svelte';
  import Icon from './Icon.svelte';

  let {
    widget,
    onedit,
    onremove,
    onresize,
    ondetail,
    onmove,
    dragging = false,
  }: {
    widget: WidgetInstance;
    onedit: () => void;
    onremove: () => void;
    onresize: (w: number) => void;
    ondetail: () => void;
    onmove: (dir: 'left' | 'right' | 'up' | 'down') => void;
    dragging?: boolean;
  } = $props();

  /** Keyboard alternative to dragging: arrow keys on the move handle. */
  function moveKey(e: KeyboardEvent) {
    const dir = ({ ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' } as const)[e.key as 'ArrowLeft'];
    if (!dir) return;
    e.preventDefault();
    onmove(dir);
  }

  /** Width presets on the 12-column grid. */
  const SIZES = [
    { w: 3, label: '¼' },
    { w: 4, label: '⅓' },
    { w: 6, label: '½' },
    { w: 8, label: '⅔' },
    { w: 12, label: '1' },
  ];

  let data = $state<WidgetData | null>(null);
  let error = $state('');
  let loading = $state(true);
  let interval = 60;

  const svc = $derived(widget.builtin ? undefined : service(widget.service));
  const def = $derived(integration(widget.builtin ? widget.service : (svc?.type ?? '')));
  const winfo = $derived(def?.widgets.find((w) => w.id === widget.widget));
  const title = $derived(widget.title || (widget.builtin ? winfo?.name : svc?.name) || 'Widget');
  const icon = $derived(widget.builtin ? def?.icon : svc?.icon);
  const status = $derived(svc ? app.status[svc.id] : undefined);
  const isClock = $derived(widget.builtin && widget.service === 'clock');

  async function load() {
    try {
      const r = await post('/widget', { service: widget.service, builtin: widget.builtin, widget: widget.widget, options: widget.options ?? {} });
      interval = r.interval ?? 60;
      if (r.error) error = r.error;
      else {
        data = r.data;
        error = '';
      }
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  // Poll while the tab is visible; refresh immediately when coming back.
  $effect(() => {
    widget.options;
    widget.service;
    widget.widget;
    load();
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      timer = setTimeout(
        async () => {
          if (document.visibilityState === 'visible') await load();
          tick();
        },
        Math.max(interval, 2) * 1000,
      );
    };
    tick();
    const onVis = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  });

  const toneClass = $derived(data?.status && data.status !== 'ok' ? data.status : status && !status.ok ? 'bad' : null);
</script>

<article class="widget card" class:dragging class:editing={app.editing} class:bare={isClock && !app.editing}>
  {#if !isClock || app.editing}
    <header>
      {#if app.editing}
        <button class="grip" title="Ziehen oder mit den Pfeiltasten verschieben" aria-label="{title} verschieben (Pfeiltasten)" onkeydown={moveKey}><Glyph name="grip" /></button>
      {/if}
      {#if icon}<span class="icon-tile"><Icon name={icon} label={title} size={26} /></span>{/if}
      <div class="head-text">
        <h2 translate="no">
          {#if svc && !app.editing}
            <a href={svc.publicUrl} target={linkTarget()} rel="noopener">{title}</a>
          {:else}
            {title}
          {/if}
        </h2>
        {#if data?.summary}<div class="summary clamp-2" title={data.summary}>{data.summary}</div>{:else if winfo && !widget.builtin}<div class="summary">{winfo.name}</div>{/if}
      </div>
      {#if app.editing}
        <div class="edit-tools">
          <label class="size">
            <span class="sr-only">Breite von {title}</span>
            <select value={widget.w ?? 3} onchange={(e) => onresize(Number(e.currentTarget.value))} title="Breite">
              {#each SIZES as sz}<option value={sz.w}>{sz.label === '1' ? 'Voll' : sz.label}</option>{/each}
              {#if !SIZES.some((sz) => sz.w === (widget.w ?? 3))}<option value={widget.w}>{widget.w}/12</option>{/if}
            </select>
          </label>
          <div class="moves" role="group" aria-label="{title} verschieben">
            <button class="icon-btn small" aria-label="Nach links" title="Nach links" onclick={() => onmove('left')}><Glyph name="chevronLeft" size={15} /></button>
            <button class="icon-btn small up" aria-label="Nach oben" title="Nach oben" onclick={() => onmove('up')}><Glyph name="chevronDown" size={15} /></button>
            <button class="icon-btn small" aria-label="Nach unten" title="Nach unten" onclick={() => onmove('down')}><Glyph name="chevronDown" size={15} /></button>
            <button class="icon-btn small" aria-label="Nach rechts" title="Nach rechts" onclick={() => onmove('right')}><Glyph name="chevronRight" size={15} /></button>
          </div>
          <span class="spacer"></span>
          <button class="icon-btn small" aria-label="{title} bearbeiten" title="Einstellungen" onclick={onedit}><Glyph name="settings" size={16} /></button>
          <button class="icon-btn small danger" aria-label="{title} entfernen" title="Entfernen" onclick={onremove}><Glyph name="trash" size={16} /></button>
        </div>
      {:else}
        {#if toneClass}<span class="dot bg-{toneClass}" title={status?.message ?? ''}></span>{/if}
        {#if !isClock}
          <button class="icon-btn small detail-btn" aria-label="{title}: Details anzeigen" title="Details" onclick={ondetail}><Glyph name="maximize" size={15} /></button>
        {/if}
      {/if}
    </header>
  {/if}

  <div class="content">
    {#if loading && !data}
      <div class="skeleton"></div>
      <div class="skeleton short"></div>
    {:else if error && !data}
      <div class="error">
        <span class="tone-bad">{error}</span>
        <button class="btn small" onclick={load}>Erneut versuchen</button>
      </div>
    {:else if data}
      {#if error}<div class="stale tone-warn" title={error}>Veraltet: {error}</div>{/if}
      <Blocks blocks={data.blocks} refresh={load} />
    {/if}
  </div>
</article>

<style>
  .widget {
    padding: calc(18px * var(--space));
    display: flex;
    flex-direction: column;
    gap: calc(14px * var(--space));
    min-width: 0;
    transition:
      box-shadow 0.2s,
      border-color 0.2s,
      opacity 0.2s;
  }
  .widget.bare {
    background: transparent;
    border-color: transparent;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    padding-left: 4px;
  }
  .widget.editing {
    cursor: grab;
    outline: 1px dashed color-mix(in srgb, var(--accent) 50%, transparent);
    outline-offset: 2px;
  }
  .widget.dragging {
    background: var(--surface-solid);
    outline-color: var(--accent);
  }
  header {
    display: flex;
    align-items: center;
    gap: 11px;
    min-width: 0;
  }
  .editing header {
    flex-wrap: wrap;
    row-gap: 10px;
  }
  .widget:not(.editing):not(.bare):hover {
    border-color: color-mix(in srgb, var(--accent) 28%, var(--border));
  }
  .icon-tile {
    width: 40px;
    height: 40px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: calc(var(--radius-sm) + 2px);
    background: color-mix(in srgb, var(--text) 6%, var(--surface-2));
    border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
  }
  .grip {
    border: 0;
    background: none;
    padding: 4px 2px;
    border-radius: 6px;
    cursor: grab;
    color: var(--muted);
    display: grid;
  }
  .head-text {
    flex: 1;
    min-width: 0;
  }
  h2 {
    font-size: 15.5px;
    font-weight: 600;
    font-family: var(--font-body);
    letter-spacing: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  h2 a {
    color: inherit;
    text-decoration: none;
  }
  h2 a:hover {
    text-decoration: underline;
  }
  .summary {
    font-size: 12px;
    line-height: 1.35;
    color: var(--muted);
  }
  .content {
    display: flex;
    flex-direction: column;
    gap: calc(14px * var(--space));
    min-width: 0;
  }
  /* own row under the title, so the title stays readable and grabbable */
  .edit-tools {
    flex-basis: 100%;
    display: flex;
    align-items: center;
    gap: 2px;
    padding-top: 10px;
    border-top: 1px dashed var(--border);
  }
  .size select {
    height: 32px;
    padding: 0 8px;
    border-radius: 8px;
    border: 1px solid var(--border);
    font-size: 13px;
    cursor: pointer;
  }
  .moves {
    display: flex;
    margin-left: 4px;
  }
  .moves .up :global(svg) {
    transform: rotate(180deg);
  }
  .spacer {
    flex: 1;
  }
  .icon-btn.danger:hover {
    color: var(--bad);
    background: var(--bad-soft);
  }
  .detail-btn {
    opacity: 0;
    transition: opacity 0.15s;
    margin-right: -6px;
  }
  .widget:hover .detail-btn,
  .detail-btn:focus-visible {
    opacity: 1;
  }
  @media (hover: none) {
    .detail-btn {
      opacity: 1;
    }
  }
  .skeleton {
    height: 44px;
    border-radius: var(--radius-sm);
    background: linear-gradient(90deg, var(--surface-2), color-mix(in srgb, var(--surface-2) 60%, var(--border)), var(--surface-2));
    background-size: 200% 100%;
    animation: shimmer 1.4s infinite;
  }
  .skeleton.short {
    width: 60%;
    height: 16px;
  }
  @keyframes shimmer {
    to {
      background-position: -200% 0;
    }
  }
  .error {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    font-size: 13px;
  }
  .stale {
    font-size: 11px;
  }
</style>

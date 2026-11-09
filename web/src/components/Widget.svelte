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
    dragging = false,
  }: { widget: WidgetInstance; onedit: () => void; onremove: () => void; onresize: (w: number) => void; ondetail: () => void; dragging?: boolean } = $props();

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
        <span class="grip" title="Ziehen zum Verschieben"><Glyph name="grip" /></span>
      {/if}
      {#if icon}<Icon name={icon} label={title} size={30} />{/if}
      <div class="head-text">
        <h3>
          {#if svc && !app.editing}
            <a href={svc.publicUrl} target={linkTarget()} rel="noopener">{title}</a>
          {:else}
            {title}
          {/if}
        </h3>
        {#if data?.summary}<div class="summary">{data.summary}</div>{:else if winfo && !widget.builtin}<div class="summary">{winfo.name}</div>{/if}
      </div>
      {#if app.editing}
        <div class="edit-tools">
          <div class="sizes" role="group" aria-label="Breite">
            {#each SIZES as sz}
              <button class:active={(widget.w ?? 3) === sz.w} onclick={() => onresize(sz.w)} aria-label="Breite {sz.label}" title="Breite {sz.label}">{sz.label}</button>
            {/each}
          </div>
          <button class="icon-btn small" aria-label="Widget bearbeiten" onclick={onedit}><Glyph name="settings" size={16} /></button>
          <button class="icon-btn small" aria-label="Widget entfernen" onclick={onremove}><Glyph name="trash" size={16} /></button>
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
  .grip {
    color: var(--muted);
    display: grid;
  }
  .head-text {
    flex: 1;
    min-width: 0;
  }
  h3 {
    font-size: 15px;
    font-weight: 600;
    font-family: var(--font-body);
    letter-spacing: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  h3 a {
    color: inherit;
    text-decoration: none;
  }
  h3 a:hover {
    text-decoration: underline;
  }
  .summary {
    font-size: 12px;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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
  .edit-tools .sizes {
    margin-right: auto;
  }
  .sizes {
    display: flex;
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
    margin-right: 4px;
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
  .sizes button {
    width: 26px;
    height: 28px;
    border: 0;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    font-size: 12px;
  }
  .sizes button.active {
    background: var(--accent);
    color: var(--accent-text);
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

<script lang="ts">
  import { post } from '../lib/api.ts';
  import { integration, service } from '../lib/store.svelte.ts';
  import type { WidgetData, WidgetInstance } from '../lib/types.ts';
  import Blocks from './Blocks.svelte';
  import Glyph from './Glyph.svelte';
  import Icon from './Icon.svelte';
  import Modal from './Modal.svelte';

  /** Large view of a widget: more entries, history charts, all actions. */
  let { widget, onclose }: { widget: WidgetInstance; onclose: () => void } = $props();

  let data = $state<WidgetData | null>(null);
  let error = $state('');
  let interval = $state(30); // for display
  let pollEvery = 30; // for the timer (not reactive, so the effect does not restart)
  let updatedAt = $state(0);
  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(t);
  });
  const ago = $derived(updatedAt ? Math.max(0, Math.round((now - updatedAt) / 1000)) : null);

  const svc = $derived(widget.builtin ? undefined : service(widget.service));
  const def = $derived(integration(widget.builtin ? widget.service : (svc?.type ?? '')));
  const winfo = $derived(def?.widgets.find((w) => w.id === widget.widget));
  const title = $derived(widget.title || (widget.builtin ? winfo?.name : svc?.name) || 'Widget');

  async function load() {
    try {
      const r = await post('/widget', { service: widget.service, builtin: widget.builtin, widget: widget.widget, options: widget.options ?? {}, detail: true });
      interval = pollEvery = r.interval ?? 30;
      if (r.error) error = r.error;
      else {
        data = r.data;
        error = '';
        updatedAt = Date.now();
      }
    } catch (e) {
      error = (e as Error).message;
    }
  }

  $effect(() => {
    load();
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      timer = setTimeout(async () => {
        if (document.visibilityState === 'visible') await load();
        tick();
      }, Math.max(pollEvery, 3) * 1000);
    };
    tick();
    return () => clearTimeout(timer);
  });
</script>

<Modal title={title} {onclose} width={980}>
  <div class="head">
    <span class="icon-tile"><Icon name={widget.builtin ? (def?.icon ?? '') : (svc?.icon ?? '')} label={title} size={34} /></span>
    <div class="head-text">
      <div class="muted">{def?.name}{winfo ? ` · ${winfo.name}` : ''}</div>
      {#if data?.summary}<div class="summary">{data.summary}</div>{/if}
    </div>
    {#if ago != null}
      <span class="live" class:stale={!!error} title="Aktualisiert sich alle {interval} s">
        <span class="pulse"></span>{error ? 'Verbindung gestört' : ago < 3 ? 'Live' : `vor ${ago} s`}
      </span>
    {/if}
    {#if svc}
      <a class="btn" href={svc.publicUrl} target="_blank" rel="noopener"><Glyph name="external" size={16} /> {svc.name} öffnen</a>
    {/if}
  </div>
  <div class="content">
    {#if !data && !error}
      <div class="loading"><span class="spinner"></span> Lade Details…</div>
    {:else if error && !data}
      <div class="banner bad">{error}</div>
    {:else if data}
      {#if error}<div class="banner">Veraltet: {error}</div>{/if}
      <Blocks blocks={data.blocks} refresh={load} detail />
    {/if}
  </div>
</Modal>

<style>
  .head {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
  }
  .head-text {
    flex: 1;
    min-width: 0;
    font-size: 14px;
  }
  .icon-tile {
    width: 52px;
    height: 52px;
    display: grid;
    place-items: center;
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--text) 6%, var(--surface-2));
    border: 1px solid var(--border);
    flex: none;
  }
  .live {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: 12px;
    padding: 5px 10px;
    border-radius: 999px;
    background: var(--ok-soft);
    color: var(--ok);
    white-space: nowrap;
  }
  .live.stale {
    background: var(--warn-soft);
    color: var(--warn);
  }
  .pulse {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: currentColor;
    animation: pulse 2s ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      opacity: 0.35;
    }
  }
  .summary {
    font-weight: 500;
  }
  .content {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
  }
  .loading {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--muted);
    padding: 20px 0;
  }
</style>

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
  let interval = 30;

  const svc = $derived(widget.builtin ? undefined : service(widget.service));
  const def = $derived(integration(widget.builtin ? widget.service : (svc?.type ?? '')));
  const winfo = $derived(def?.widgets.find((w) => w.id === widget.widget));
  const title = $derived(widget.title || (widget.builtin ? winfo?.name : svc?.name) || 'Widget');

  async function load() {
    try {
      const r = await post('/widget', { service: widget.service, builtin: widget.builtin, widget: widget.widget, options: widget.options ?? {}, detail: true });
      interval = r.interval ?? 30;
      if (r.error) error = r.error;
      else {
        data = r.data;
        error = '';
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
      }, Math.max(interval, 3) * 1000);
    };
    tick();
    return () => clearTimeout(timer);
  });
</script>

<Modal title={title} {onclose} width={920}>
  <div class="head">
    <Icon name={widget.builtin ? (def?.icon ?? '') : (svc?.icon ?? '')} label={title} size={40} />
    <div class="head-text">
      <div class="muted">{def?.name}{winfo ? ` · ${winfo.name}` : ''}</div>
      {#if data?.summary}<div class="summary">{data.summary}</div>{/if}
    </div>
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
  .summary {
    font-weight: 500;
  }
  .content {
    display: flex;
    flex-direction: column;
    gap: 14px;
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

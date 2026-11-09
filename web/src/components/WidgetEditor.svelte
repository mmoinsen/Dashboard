<script lang="ts">
  import { uid } from '../lib/id.ts';
  import { app, integration, navigate, toast } from '../lib/store.svelte.ts';
  import type { WidgetInstance } from '../lib/types.ts';
  import FieldInput from './FieldInput.svelte';
  import Icon from './Icon.svelte';
  import Modal from './Modal.svelte';

  let { initial, onsave, onclose }: { initial?: WidgetInstance; onsave: (w: WidgetInstance) => void; onclose: () => void } = $props();

  // Source = configured service or builtin integration.
  type Source = { key: string; service: string; builtin: boolean; name: string; icon: string; type: string };
  const sources = $derived<Source[]>([
    ...app.services.map((s) => ({ key: s.id, service: s.id, builtin: false, name: s.name, icon: s.icon, type: s.type })),
    ...app.integrations.filter((i) => i.builtin).map((i) => ({ key: `builtin:${i.id}`, service: i.id, builtin: true, name: i.name, icon: i.icon, type: i.id })),
  ]);

  let sourceKey = $state(initial ? (initial.builtin ? `builtin:${initial.service}` : initial.service) : '');
  let widgetId = $state(initial?.widget ?? '');
  let title = $state(initial?.title ?? '');
  let width = $state(initial?.w ?? 1);
  let options: Record<string, any> = $state({ ...(initial?.options ?? {}) });
  let filter = $state('');

  const source = $derived(sources.find((s) => s.key === sourceKey));
  const def = $derived(source ? integration(source.type) : undefined);
  const winfo = $derived(def?.widgets.find((w) => w.id === widgetId));
  const filtered = $derived(sources.filter((s) => !filter || `${s.name} ${s.type}`.toLowerCase().includes(filter.toLowerCase())));

  function pickSource(key: string) {
    sourceKey = key;
    const d = integration(sources.find((s) => s.key === key)!.type);
    widgetId = d?.widgets.length === 1 ? d.widgets[0].id : '';
    options = {};
  }

  function pickWidget(id: string) {
    widgetId = id;
    options = {};
    width = def?.widgets.find((w) => w.id === id)?.size ?? 1;
  }

  function save() {
    if (!source || !winfo) return;
    try {
      submit(source, winfo.id);
    } catch (e) {
      toast(`Widget konnte nicht gespeichert werden: ${(e as Error).message}`, 'bad');
    }
  }

  function submit(source: Source, widget: string) {
    onsave({
      id: initial?.id ?? uid(),
      service: source.service,
      builtin: source.builtin || undefined,
      widget,
      title: title.trim() || undefined,
      options: Object.fromEntries(Object.entries(options).filter(([, v]) => v !== '' && v != null)),
      w: width,
    });
  }
</script>

<Modal title={initial ? 'Widget bearbeiten' : 'Widget hinzufügen'} {onclose} width={640}>
  {#if !source}
    <input class="input" placeholder="Dienst suchen…" bind:value={filter} />
    {#if !app.services.length}
      <div class="banner">
        Noch keine Dienste eingerichtet.
        {#if app.user?.isAdmin}<a href="#/settings/services" onclick={onclose}>Jetzt Dienst hinzufügen</a>{:else}Bitte einen Administrator, Dienste anzulegen.{/if}
      </div>
    {/if}
    <div class="grid">
      {#each filtered as s (s.key)}
        <button class="pick card" onclick={() => pickSource(s.key)}>
          <Icon name={s.icon} label={s.name} size={32} />
          <span class="pick-text">
            <strong>{s.name}</strong>
            <small class="muted">{s.builtin ? 'Eingebaut' : integration(s.type)?.name}</small>
          </span>
        </button>
      {/each}
    </div>
  {:else}
    <button class="back btn ghost small" onclick={() => (sourceKey = '')} disabled={!!initial}>
      <Icon name={source.icon} label={source.name} size={22} />
      {source.name}
      {#if !initial}<span class="muted">· ändern</span>{/if}
    </button>

    {#if !def}
      <div class="banner bad">Integration „{source.type}“ ist nicht installiert.</div>
    {:else}
      <div class="widgets">
        {#each def.widgets as w (w.id)}
          <button class="wpick" class:active={widgetId === w.id} onclick={() => pickWidget(w.id)}>
            <strong>{w.name}</strong>
            {#if w.description}<small class="muted">{w.description}</small>{/if}
          </button>
        {/each}
      </div>
    {/if}

    {#if winfo}
      <div class="form">
        <label class="field">
          <span>Titel (optional)</span>
          <input class="input" placeholder={source.builtin ? winfo.name : source.name} bind:value={title} />
        </label>
        <label class="field">
          <span>Breite</span>
          <select class="input" bind:value={width}>
            <option value={1}>1 Spalte</option>
            <option value={2}>2 Spalten</option>
            <option value={3}>3 Spalten</option>
            <option value={4}>4 Spalten (volle Breite)</option>
          </select>
        </label>
        {#each winfo.options as f (f.key)}
          <FieldInput field={f} bind:value={options[f.key]} />
        {/each}
      </div>
    {/if}
  {/if}

  {#snippet footer()}
    {#if app.user?.isAdmin && !source}
      <button class="btn ghost" onclick={() => { onclose(); navigate('/settings/services'); }}>Dienste verwalten</button>
    {/if}
    <button class="btn" onclick={onclose}>Abbrechen</button>
    <button class="btn primary" disabled={!winfo} onclick={save}>{initial ? 'Speichern' : 'Hinzufügen'}</button>
  {/snippet}
</Modal>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 8px;
  }
  .pick {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px;
    cursor: pointer;
    text-align: left;
    background: var(--surface-2);
    min-height: 56px;
  }
  .pick:hover {
    border-color: var(--accent);
  }
  .pick-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .pick-text strong {
    font-size: 14px;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .back {
    align-self: flex-start;
  }
  .widgets {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 8px;
  }
  .wpick {
    display: flex;
    flex-direction: column;
    gap: 2px;
    text-align: left;
    padding: 12px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--surface-2);
    cursor: pointer;
  }
  .wpick strong {
    font-weight: 500;
  }
  .wpick.active {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .form {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
</style>

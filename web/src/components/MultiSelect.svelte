<script lang="ts">
  import { get } from '../lib/api.ts';
  import type { FieldDef, FieldOption } from '../lib/types.ts';
  import Glyph from './Glyph.svelte';

  /**
   * Picker for `multiselect` fields whose options come from the service
   * (e.g. Home Assistant entities). The value stays a comma-separated string,
   * so widgets configured by hand keep working.
   */
  let { field, value = $bindable(), serviceId }: { field: FieldDef; value: any; serviceId?: string } = $props();

  let options = $state<FieldOption[]>([]);
  let loading = $state(true);
  let error = $state('');
  let filter = $state('');
  const listId = `ms-${Math.random().toString(36).slice(2, 8)}`;

  const selected = $derived(
    String(value ?? '')
      .split(/[\s,;]+/)
      .map((v) => v.trim())
      .filter(Boolean),
  );
  const byValue = $derived(new Map(options.map((o) => [o.value, o])));

  $effect(() => {
    if (!serviceId || !field.source) {
      loading = false;
      error = 'Erst einen Dienst wählen.';
      return;
    }
    loading = true;
    get<{ options: FieldOption[] }>(`/services/${encodeURIComponent(serviceId)}/options/${encodeURIComponent(field.source)}`)
      .then((r) => {
        options = r.options;
        error = '';
      })
      .catch((e) => (error = e.message))
      .finally(() => (loading = false));
  });

  const filtered = $derived.by(() => {
    const q = filter.trim().toLowerCase();
    const list = q ? options.filter((o) => `${o.label} ${o.value} ${o.group ?? ''}`.toLowerCase().includes(q)) : options;
    const groups = new Map<string, FieldOption[]>();
    for (const o of list.slice(0, 400)) {
      const g = o.group ?? 'Weitere';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(o);
    }
    return [...groups.entries()];
  });

  function setSelected(list: string[]) {
    value = list.join(', ');
  }
  function toggle(v: string) {
    setSelected(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  }
  function moveItem(i: number, delta: number) {
    const list = [...selected];
    const j = i + delta;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    setSelected(list);
  }
</script>

<div class="ms">
  <div class="ms-label">
    <span>{field.label}{#if field.required}<span aria-hidden="true"> *</span>{/if}</span>
    <span class="muted">{selected.length} gewählt</span>
  </div>
  {#if field.help}<small class="muted">{field.help}</small>{/if}

  {#if selected.length}
    <ol class="chosen" aria-label="Gewählte Einträge (Reihenfolge im Widget)">
      {#each selected as v, i (v)}
        {@const o = byValue.get(v)}
        <li>
          <span class="chosen-text">
            <span class="name" translate="no">{o?.label ?? v}</span>
            {#if o?.hint}<span class="muted hint">{o.hint}</span>{/if}
            {#if !o && !loading}<span class="tone-warn hint">nicht gefunden</span>{/if}
          </span>
          <button type="button" class="icon-btn small" aria-label="{o?.label ?? v} nach oben" disabled={i === 0} onclick={() => moveItem(i, -1)}><Glyph name="chevronDown" size={14} /></button>
          <button type="button" class="icon-btn small down" aria-label="{o?.label ?? v} nach unten" disabled={i === selected.length - 1} onclick={() => moveItem(i, 1)}><Glyph name="chevronDown" size={14} /></button>
          <button type="button" class="icon-btn small" aria-label="{o?.label ?? v} entfernen" onclick={() => toggle(v)}><Glyph name="x" size={14} /></button>
        </li>
      {/each}
    </ol>
  {/if}

  <label class="sr-only" for="{listId}-filter">{field.label} durchsuchen</label>
  <input id="{listId}-filter" class="input" type="search" placeholder="Entitäten durchsuchen, z. B. „licht“ oder „sensor.temp“…" autocomplete="off" spellcheck="false" bind:value={filter} />

  <div class="options" role="group" aria-label="{field.label} auswählen">
    {#if loading}
      <div class="state"><span class="spinner"></span> Lade Liste…</div>
    {:else if error}
      <div class="state tone-bad">{error}</div>
    {:else if !filtered.length}
      <div class="state muted">Keine Treffer.</div>
    {:else}
      {#each filtered as [group, items] (group)}
        <div class="group-name">{group}</div>
        {#each items as o (o.value)}
          <label class="opt">
            <input type="checkbox" checked={selected.includes(o.value)} onchange={() => toggle(o.value)} />
            <span class="opt-text">
              <span translate="no">{o.label}</span>
              <span class="muted id" translate="no">{o.value}{o.hint ? ` · ${o.hint}` : ''}</span>
            </span>
          </label>
        {/each}
      {/each}
    {/if}
  </div>
</div>

<style>
  .ms {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .ms-label {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    font-weight: 500;
    color: var(--muted);
  }
  .ms-label > span:first-child {
    color: var(--muted);
  }
  .chosen {
    list-style: none;
    margin: 0;
    padding: 4px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .chosen li {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 4px 4px 4px 10px;
    border-radius: 8px;
    background: var(--surface-2);
  }
  .chosen-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0 8px;
    align-items: baseline;
  }
  .name {
    font-size: 14px;
  }
  .hint {
    font-size: 12px;
  }
  .chosen :global(.icon-btn:disabled) {
    opacity: 0.3;
  }
  .chosen .icon-btn:first-of-type :global(svg) {
    transform: rotate(180deg);
  }
  .options {
    max-height: 260px;
    overflow-y: auto;
    overscroll-behavior: contain;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 4px;
  }
  .group-name {
    position: sticky;
    top: -4px;
    background: var(--surface-solid);
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
    padding: 8px 8px 4px;
    z-index: 1;
  }
  .opt {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 8px;
    min-height: 44px;
    border-radius: 8px;
    cursor: pointer;
  }
  .opt:hover {
    background: var(--surface-2);
  }
  .opt input {
    width: 18px;
    height: 18px;
    accent-color: var(--accent);
    flex: none;
  }
  .opt-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
    font-size: 14px;
  }
  .id {
    font-size: 12px;
    font-family: var(--font-mono);
    overflow-wrap: anywhere;
  }
  .state {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 14px;
    font-size: 13px;
  }
</style>

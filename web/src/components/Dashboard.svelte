<script lang="ts">
  import { app, saveDashboard } from '../lib/store.svelte.ts';
  import type { DashboardPage, WidgetInstance } from '../lib/types.ts';
  import Glyph from './Glyph.svelte';
  import ServiceBar from './ServiceBar.svelte';
  import Widget from './Widget.svelte';
  import WidgetEditor from './WidgetEditor.svelte';

  let { page }: { page: DashboardPage } = $props();

  let editorFor: WidgetInstance | 'new' | null = $state(null);
  let dragId: string | null = $state(null);

  const greeting = $derived.by(() => {
    const h = new Date().getHours();
    const name = app.user?.displayName ?? '';
    const g = h < 5 ? 'Gute Nacht' : h < 11 ? 'Guten Morgen' : h < 17 ? 'Hallo' : h < 22 ? 'Guten Abend' : 'Gute Nacht';
    return `${g}, ${name}.`;
  });
  const offline = $derived(app.services.filter((s) => app.status[s.id] && !app.status[s.id].ok));
  const online = $derived(app.services.filter((s) => app.status[s.id]?.ok).length);

  function saveWidget(w: WidgetInstance) {
    const i = page.widgets.findIndex((x) => x.id === w.id);
    if (i >= 0) page.widgets[i] = w;
    else page.widgets.push(w);
    editorFor = null;
    saveDashboard();
  }

  function remove(id: string) {
    page.widgets = page.widgets.filter((w) => w.id !== id);
    saveDashboard();
  }

  function resize(id: string, w: number) {
    const x = page.widgets.find((x) => x.id === id);
    if (x) x.w = w;
    saveDashboard();
  }

  // Native HTML5 drag & drop for re-ordering in edit mode.
  function dragOver(e: DragEvent, overId: string) {
    if (!dragId || dragId === overId) return;
    e.preventDefault();
    const from = page.widgets.findIndex((w) => w.id === dragId);
    const to = page.widgets.findIndex((w) => w.id === overId);
    if (from < 0 || to < 0) return;
    const list = [...page.widgets];
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    page.widgets = list;
  }
</script>

<div class="dash">
  {#if page.showSearch !== false}
    <section class="hero">
      {#if app.user?.settings.greeting !== false}
        <h1>{greeting}</h1>
        <p class="muted">
          {online} von {app.services.length} Diensten online
          {#if offline.length}· <span class="tone-warn">{offline.map((s) => s.name).join(', ')} {offline.length === 1 ? 'braucht' : 'brauchen'} Aufmerksamkeit</span>{/if}
        </p>
      {/if}
      <button class="searchbox" onclick={() => ((app.searchSeed = ''), (app.searchOpen = true))}>
        <Glyph name="search" size={20} />
        <span>Suchen, steuern, starten … Filme, Geräte, Container oder das Web</span>
        <span class="kbd">Ctrl K</span>
      </button>
    </section>
  {/if}

  {#if page.showServices !== false}
    <ServiceBar />
  {/if}

  <section class="grid" aria-label="Widgets">
    {#each page.widgets as w (w.id)}
      <div
        class="cell"
        style="--span:{w.w ?? 1}"
        draggable={app.editing}
        role="listitem"
        ondragstart={(e) => {
          dragId = w.id;
          e.dataTransfer?.setData('text/plain', w.id);
        }}
        ondragover={(e) => dragOver(e, w.id)}
        ondragend={() => {
          dragId = null;
          saveDashboard();
        }}
      >
        <Widget widget={w} dragging={dragId === w.id} onedit={() => (editorFor = w)} onremove={() => remove(w.id)} onresize={(n) => resize(w.id, n)} />
      </div>
    {/each}
    {#if app.editing || !page.widgets.length}
      <button class="add card" onclick={() => (editorFor = 'new')}>
        <Glyph name="plus" size={26} />
        <strong>Widget hinzufügen</strong>
        <span class="muted">Dienst wählen, Widget-Typ aussuchen, fertig.</span>
      </button>
    {/if}
  </section>
</div>

{#if editorFor}
  <WidgetEditor initial={editorFor === 'new' ? undefined : editorFor} onsave={saveWidget} onclose={() => (editorFor = null)} />
{/if}

<style>
  .dash {
    display: flex;
    flex-direction: column;
    gap: calc(26px * var(--space));
  }
  .hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    padding: calc(24px * var(--space)) 0 calc(6px * var(--space));
    text-align: center;
  }
  h1 {
    font-size: clamp(28px, 4vw, 40px);
    font-weight: 600;
  }
  .hero p {
    margin: -4px 0 4px;
    font-size: 15px;
  }
  .searchbox {
    width: min(760px, 100%);
    height: 60px;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 0 18px 0 20px;
    border-radius: calc(var(--radius) * 0.9);
    border: 1px solid color-mix(in srgb, var(--text) 14%, var(--border));
    background: var(--surface);
    backdrop-filter: var(--blur);
    color: var(--muted);
    font-size: 16px;
    cursor: text;
    box-shadow: var(--shadow);
    text-align: left;
  }
  .searchbox :global(svg) {
    color: var(--accent);
    flex: none;
  }
  .searchbox span:nth-child(2) {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .searchbox:hover {
    border-color: color-mix(in srgb, var(--accent) 50%, var(--border));
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(330px, 100%), 1fr));
    grid-auto-flow: dense;
    gap: calc(16px * var(--space));
    align-items: start;
  }
  .cell {
    grid-column: span var(--span);
    min-width: 0;
  }
  /* never span more columns than exist */
  @media (max-width: 1100px) {
    .cell {
      grid-column: span min(var(--span), 2);
    }
  }
  @media (max-width: 720px) {
    .cell {
      grid-column: span 1;
    }
  }
  .add {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 170px;
    border-style: dashed;
    background: transparent;
    color: var(--text);
    cursor: pointer;
    padding: 20px;
    text-align: center;
  }
  .add:hover {
    border-color: var(--accent);
  }
  .add span {
    font-size: 13px;
    max-width: 260px;
  }
</style>

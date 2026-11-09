<script lang="ts">
  import { del, get, put } from '../../lib/api.ts';
  import { app, integration, refreshServices, toast } from '../../lib/store.svelte.ts';
  import type { ServicePublic } from '../../lib/types.ts';
  import Glyph from '../Glyph.svelte';
  import Icon from '../Icon.svelte';
  import ServiceForm from './ServiceForm.svelte';

  let editing: ServicePublic | 'new' | null = $state(null);
  let dragId: string | null = $state(null);

  async function remove(s: ServicePublic) {
    if (!confirm(`Dienst „${s.name}“ löschen? Widgets, die ihn nutzen, zeigen danach einen Fehler.`)) return;
    try {
      await del(`/services/${s.id}`);
      await refreshServices();
      toast('Dienst gelöscht', 'ok');
    } catch (e) {
      toast((e as Error).message, 'bad');
    }
  }

  async function exportYaml() {
    const text = await get<string>('/services/export');
    const blob = new Blob([text], { type: 'text/yaml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'kompass-services.yaml';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function dragOver(e: DragEvent, overId: string) {
    if (!dragId || dragId === overId) return;
    e.preventDefault();
    const list = [...app.services];
    const from = list.findIndex((s) => s.id === dragId);
    const to = list.findIndex((s) => s.id === overId);
    const [m] = list.splice(from, 1);
    list.splice(to, 0, m);
    app.services = list;
  }

  async function saveOrder() {
    dragId = null;
    await put('/services-order', { ids: app.services.filter((s) => s.source === 'ui').map((s) => s.id) }).catch((e) => toast(e.message, 'bad'));
  }
</script>

<div class="row-between">
  <div>
    <h2>Dienste</h2>
    <p class="muted">Verbindungen zu deinen selbst gehosteten Anwendungen. Gilt für alle Benutzer.</p>
  </div>
  <div class="actions">
    <button class="btn" onclick={exportYaml}><Glyph name="download" size={16} /> Als YAML exportieren</button>
    <button class="btn primary" onclick={() => (editing = 'new')}><Glyph name="plus" size={16} /> Dienst hinzufügen</button>
  </div>
</div>

{#if !app.services.length}
  <div class="card empty">
    <Glyph name="server" size={28} />
    <strong>Noch keine Dienste</strong>
    <p class="muted">Füge deinen ersten Dienst hinzu – oder trage Dienste in <code>/config/kompass.yaml</code> ein.</p>
  </div>
{:else}
  <ul class="list card">
    {#each app.services as s (s.id)}
      {@const st = app.status[s.id]}
      <li
        class="item"
        draggable={s.source === 'ui'}
        ondragstart={() => (dragId = s.id)}
        ondragover={(e) => dragOver(e, s.id)}
        ondragend={saveOrder}
      >
        <Icon name={s.icon} label={s.name} size={36} />
        <div class="info">
          <div class="name">
            {s.name}
            {#if s.source === 'file'}<span class="chip">kompass.yaml</span>{/if}
          </div>
          <div class="sub muted">{integration(s.type)?.name ?? `${s.type} (nicht installiert)`} · <span class="mono">{s.url || s.config.endpoint || '–'}</span></div>
        </div>
        <div class="status">
          <span class="dot {st ? (st.ok ? 'bg-ok' : 'bg-bad') : ''}"></span>
          <span class="muted">{st ? (st.ok ? `${st.ms} ms` : st.message) : 'wird geprüft…'}</span>
        </div>
        {#if s.source === 'ui'}
          <button class="icon-btn" aria-label="{s.name} bearbeiten" onclick={() => (editing = s)}><Glyph name="edit" size={17} /></button>
          <button class="icon-btn" aria-label="{s.name} löschen" onclick={() => remove(s)}><Glyph name="trash" size={17} /></button>
        {:else}
          <span class="file-hint muted" title="Wird in kompass.yaml verwaltet">nur in Datei änderbar</span>
        {/if}
      </li>
    {/each}
  </ul>
{/if}

<details class="card help">
  <summary>Dienste per kompass.yaml verwalten</summary>
  <p class="muted">Alternativ zur Oberfläche kannst du Dienste in <code>/config/kompass.yaml</code> definieren (wird bei Änderungen automatisch neu geladen). Geheimnisse lassen sich per <code>${'{'}VARIABLE{'}'}</code> aus Umgebungsvariablen lesen:</p>
  <pre class="mono">services:
  - id: sonarr
    type: sonarr
    name: Sonarr
    url: http://sonarr:8989
    publicUrl: https://sonarr.example.com
    apiKey: ${'{'}SONARR_API_KEY{'}'}</pre>
</details>

{#if editing}
  <ServiceForm initial={editing === 'new' ? undefined : editing} onclose={() => (editing = null)} />
{/if}

<style>
  p {
    margin: 4px 0 0;
  }
  .actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .empty {
    padding: 40px 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    text-align: center;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 6px;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 10px 12px;
    border-radius: var(--radius-sm);
  }
  .item[draggable='true'] {
    cursor: grab;
  }
  .item:hover {
    background: var(--surface-2);
  }
  .info {
    flex: 1;
    min-width: 0;
  }
  .name {
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .sub {
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .status {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    max-width: 240px;
    min-width: 0;
  }
  .status span:last-child {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .file-hint {
    font-size: 12px;
  }
  @media (max-width: 720px) {
    .status,
    .file-hint {
      display: none;
    }
  }
  .help {
    padding: 16px 20px;
  }
  .help summary {
    cursor: pointer;
    font-weight: 500;
  }
  pre {
    background: var(--surface-2);
    padding: 14px;
    border-radius: var(--radius-sm);
    overflow-x: auto;
    font-size: 13px;
  }
</style>

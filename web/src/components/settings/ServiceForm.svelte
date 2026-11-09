<script lang="ts">
  import { post, put } from '../../lib/api.ts';
  import { app, integration, refreshServices, toast } from '../../lib/store.svelte.ts';
  import type { IntegrationInfo, ServicePublic, ServiceStatus } from '../../lib/types.ts';
  import { warnOnUnload } from '../../lib/unsaved.ts';
  import FieldInput from '../FieldInput.svelte';
  import Icon from '../Icon.svelte';
  import Modal from '../Modal.svelte';

  let { initial, onclose }: { initial?: ServicePublic; onclose: () => void } = $props();

  const CATEGORIES: Record<string, string> = {
    media: 'Medien',
    downloads: 'Downloads',
    smarthome: 'Smart Home',
    network: 'Netzwerk',
    system: 'System',
    productivity: 'Produktivität',
    other: 'Sonstiges',
  };

  let type = $state(initial?.type ?? '');
  let name = $state(initial?.name ?? '');
  let url = $state(initial?.url ?? '');
  let publicUrl = $state(initial && initial.publicUrl !== initial.url ? initial.publicUrl : '');
  let icon = $state(initial && initial.icon !== integration(initial.type)?.icon ? initial.icon : '');
  let id = $state('');
  let config: Record<string, any> = $state(
    initial ? Object.fromEntries(Object.entries(initial.config).map(([k, v]) => [k, typeof v === 'boolean' && isSecret(initial.type, k) ? '' : v])) : {},
  );
  let filter = $state('');
  let busy = $state(false);
  let saved = false;
  // unsaved-changes guard: compare with the state when the form opened
  let initialSnapshot = '';
  $effect(() => {
    if (type && !initialSnapshot) initialSnapshot = JSON.stringify(payload());
  });
  const dirty = () => !saved && !!initialSnapshot && JSON.stringify(payload()) !== initialSnapshot;
  $effect(() => warnOnUnload(dirty));
  const confirmClose = () => !dirty() || confirm('Ungespeicherte Änderungen verwerfen?');
  let testResult: ServiceStatus | null = $state(null);

  function isSecret(t: string, key: string) {
    return integration(t)?.fields.find((f) => f.key === key)?.type === 'secret';
  }

  const def = $derived(type ? integration(type) : undefined);
  const choices = $derived(
    app.integrations
      .filter((i) => !i.builtin)
      .filter((i) => !filter || `${i.name} ${i.description} ${i.id}`.toLowerCase().includes(filter.toLowerCase())),
  );
  const grouped = $derived(
    Object.entries(CATEGORIES)
      .map(([cat, label]) => ({ cat, label, items: choices.filter((i) => i.category === cat) }))
      .filter((g) => g.items.length),
  );

  function choose(i: IntegrationInfo) {
    type = i.id;
    if (!name) name = i.name;
    config = Object.fromEntries(i.fields.filter((f) => f.default !== undefined).map((f) => [f.key, f.default]));
  }

  function payload() {
    return { id: id || undefined, type, name, url, publicUrl, icon, config: $state.snapshot(config) };
  }

  async function test() {
    busy = true;
    testResult = null;
    try {
      const r = await post('/services/test', { ...payload(), existingId: initial?.id });
      testResult = r.status;
    } catch (e) {
      testResult = { ok: false, message: (e as Error).message, checkedAt: Date.now() };
    } finally {
      busy = false;
    }
  }

  async function save(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    try {
      if (initial) await put(`/services/${initial.id}`, payload());
      else await post('/services', payload());
      await refreshServices();
      setTimeout(() => refreshServices().catch(() => {}), 2500);
      toast(initial ? 'Dienst gespeichert' : `${name} hinzugefügt – füge jetzt ein Widget hinzu`, 'ok');
      saved = true;
      onclose();
    } catch (err) {
      toast((err as Error).message, 'bad');
    } finally {
      busy = false;
    }
  }
</script>

<Modal title={initial ? `${initial.name} bearbeiten` : def ? `${def.name} verbinden` : 'Dienst hinzufügen'} {onclose} {confirmClose} width={def ? 600 : 760}>
  {#if !def}
    <input class="input" placeholder="Integration suchen, z. B. Sonarr, Pi-hole oder Docker…" aria-label="Integration suchen" autocomplete="off" spellcheck="false" bind:value={filter} />
    {#each grouped as g (g.cat)}
      <div class="cat">{g.label}</div>
      <div class="grid">
        {#each g.items as i (i.id)}
          <button class="pick card" onclick={() => choose(i)}>
            <Icon name={i.icon} label={i.name} size={34} />
            <span class="pick-text">
              <strong>{i.name}</strong>
              <small class="muted">{i.description}</small>
            </span>
          </button>
        {/each}
      </div>
    {/each}
    <p class="muted hint">Dein Dienst fehlt? Nutze „Website / Link“ für einen Statuscheck, „Eigene JSON-API“ für beliebige Werte – oder schreibe ein Plugin (siehe docs/integrations.md).</p>
  {:else}
    <form id="svc-form" class="form" onsubmit={save}>
      <div class="intro">
        <Icon name={icon || def.icon} label={name} size={44} />
        <p class="muted">{def.description}{#if def.website} · <a href={def.website} target="_blank" rel="noopener">Website</a>{/if}</p>
      </div>
      <div class="form-grid">
        <label class="field">
          <span>Name *</span>
          <input class="input" name="name" autocomplete="off" required placeholder="z. B. {def.name}…" bind:value={name} />
        </label>
        {#if !initial}
          <label class="field">
            <span>ID (optional)</span>
            <input class="input" name="id" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="z. B. {def.id}… (sonst aus dem Namen)" bind:value={id} />
            <small>Für Präfixe in der Suche, z. B. !{id || 'sonarr'}</small>
          </label>
        {/if}
      </div>
      {#if def.needsUrl}
        <label class="field">
          <span>Interne URL *</span>
          <input class="input" type="url" inputmode="url" name="url" autocomplete="off" spellcheck="false" required placeholder="{def.urlPlaceholder ?? `http://${def.id}:port`}…" bind:value={url} />
          <small>So erreicht der Kompass-Container den Dienst, z. B. über den Containernamen im selben Docker-Netz oder die IP des Servers. Nicht „localhost“ – das wäre Kompass selbst.</small>
          {#if def.urlHelp}<small class="url-help">{def.urlHelp}</small>{/if}
        </label>
        <label class="field">
          <span>Öffentliche URL (optional)</span>
          <input class="input" type="url" inputmode="url" name="publicUrl" autocomplete="off" spellcheck="false" placeholder="z. B. https://{def.id}.meine-domain.de…" bind:value={publicUrl} />
          <small>Für Links im Browser – leer = interne URL.</small>
        </label>
      {/if}
      {#each def.fields as f (f.key)}
        <FieldInput field={f} bind:value={config[f.key]} secretSet={f.type === 'secret' && initial?.config[f.key] === true} />
      {/each}
      <div class="form-grid">
        <label class="field">
          <span>Icon (optional)</span>
          <input class="input" name="icon" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="{def.icon}…" bind:value={icon} />
          <small>Name aus <a href="https://dashboardicons.com" target="_blank" rel="noopener">dashboard-icons</a>, „mdi-…“ oder eine Bild-URL</small>
        </label>
        {#if def.needsUrl}
          <label class="check tls">
            <input type="checkbox" checked={Boolean(config.insecure)} onchange={(e) => (config.insecure = e.currentTarget.checked)} />
            <span>TLS-Zertifikat nicht prüfen (selbstsigniert)</span>
          </label>
        {/if}
      </div>
      {#if testResult}
        <div class="banner" class:bad={!testResult.ok} class:ok={testResult.ok} role="status">
          {testResult.ok ? `Verbindung erfolgreich (${testResult.ms} ms)` : `Fehler: ${testResult.message}`}
        </div>
      {/if}
    </form>
  {/if}

  {#snippet footer()}
    {#if def && !initial}
      <button class="btn ghost" onclick={() => (type = '')}>Zurück</button>
    {/if}
    <span class="spacer"></span>
    <button class="btn" onclick={() => confirmClose() && onclose()}>Abbrechen</button>
    {#if def}
      <button class="btn" onclick={test} disabled={busy}>{busy ? 'Teste…' : 'Verbindung testen'}</button>
      <button class="btn primary" type="submit" form="svc-form" disabled={busy}>{#if busy}<span class="spinner"></span>Speichere…{:else}Dienst speichern{/if}</button>
    {/if}
  {/snippet}
</Modal>

<style>
  .cat {
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: -6px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 8px;
  }
  .pick {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    background: var(--surface-2);
    text-align: left;
    cursor: pointer;
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
    font-weight: 500;
  }
  .pick-text small {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    font-size: 12px;
  }
  .hint {
    font-size: 13px;
    margin: 0;
  }
  .form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .form-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 14px 18px;
    align-items: start;
  }
  .intro {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .intro p {
    margin: 0;
    font-size: 14px;
  }
  .url-help {
    color: var(--text);
    background: var(--surface-2);
    padding: 8px 10px;
    border-radius: var(--radius-sm);
  }
  .tls {
    margin-top: 26px;
    font-size: 14px;
  }
  .banner.ok {
    background: var(--ok-soft);
    border-color: color-mix(in srgb, var(--ok) 40%, transparent);
  }
  .spacer {
    flex: 1;
  }
</style>

<script lang="ts">
  import { put } from '../../lib/api.ts';
  import { app, toast } from '../../lib/store.svelte.ts';
  import type { SearchEngine } from '../../lib/types.ts';
  import { warnOnUnload } from '../../lib/unsaved.ts';
  import Glyph from '../Glyph.svelte';

  const s = app.settings!;
  let title = $state(s.title);
  let defaultEngine = $state(s.search.defaultEngine);
  let suggestions = $state(s.search.suggestions);
  let engines: SearchEngine[] = $state(s.search.engines.map((e) => ({ ...e })));
  let lat = $state(s.weather?.latitude?.toString() ?? '');
  let lon = $state(s.weather?.longitude?.toString() ?? '');
  let place = $state(s.weather?.name ?? '');

  const snapshot = () => JSON.stringify([title, defaultEngine, suggestions, engines, lat, lon, place]);
  let savedState = snapshot();
  $effect(() => warnOnUnload(() => snapshot() !== savedState));

  async function save(e: SubmitEvent) {
    e.preventDefault();
    try {
      const r = await put('/settings', {
        settings: {
          title,
          search: { defaultEngine, suggestions, engines: $state.snapshot(engines) },
          weather: lat && lon ? { latitude: Number(lat), longitude: Number(lon), name: place } : null,
        },
      });
      app.settings = r.settings;
      savedState = snapshot();
      document.title = r.settings.title;
      toast('Gespeichert', 'ok');
    } catch (err) {
      toast((err as Error).message, 'bad');
    }
  }
</script>

<h2>Allgemein</h2>

<form class="stack" onsubmit={save}>
  <div class="card section">
    <h3>Dashboard</h3>
    <label class="field"><span>Titel</span><input class="input" name="title" autocomplete="off" placeholder="z. B. Kompass…" bind:value={title} /></label>
    <div class="form-grid">
      <label class="field"><span>Standard-Ort für Wetter</span><input class="input" name="place" autocomplete="off" placeholder="z. B. Berlin…" bind:value={place} /></label>
      <label class="field"><span>Breitengrad</span><input class="input" name="latitude" type="number" step="any" min="-90" max="90" inputmode="decimal" autocomplete="off" placeholder="z. B. 52.52…" bind:value={lat} /></label>
      <label class="field"><span>Längengrad</span><input class="input" name="longitude" type="number" step="any" min="-180" max="180" inputmode="decimal" autocomplete="off" placeholder="z. B. 13.41…" bind:value={lon} /></label>
    </div>
    <small class="muted">Neue Benutzer bekommen damit automatisch ein Wetter-Widget.</small>
  </div>

  <div class="card section">
    <h3>Suche</h3>
    <div class="form-grid">
      <label class="field">
        <span>Standard-Suchmaschine</span>
        <select class="input" bind:value={defaultEngine}>
          {#each engines as e (e.id)}<option value={e.id}>{e.name}</option>{/each}
        </select>
      </label>
      <label class="check sugg"><input type="checkbox" bind:checked={suggestions} /> Suchvorschläge anzeigen (Anfragen gehen an die Suchmaschine)</label>
    </div>
    <div class="engines">
      <div class="eh muted"><span>Name</span><span>Präfix</span><span>URL ({'{'}q{'}'} = Suchbegriff)</span><span></span></div>
      {#each engines as e, i (i)}
        <div class="er">
          <input class="input" aria-label="Name der Suchmaschine" name="engine-name-{i}" autocomplete="off" bind:value={e.name} />
          <input class="input mono" aria-label="Präfix" name="engine-bang-{i}" autocomplete="off" autocapitalize="none" spellcheck="false" bind:value={e.bang} />
          <input class="input mono" aria-label="Such-URL" type="url" inputmode="url" name="engine-url-{i}" autocomplete="off" spellcheck="false" bind:value={e.url} />
          <button type="button" class="icon-btn" aria-label="{e.name || 'Suchmaschine'} entfernen" onclick={() => engines.splice(i, 1)}><Glyph name="trash" size={16} /></button>
        </div>
      {/each}
      <div>
        <button type="button" class="btn small" onclick={() => engines.push({ id: `custom-${Date.now()}`, name: '', bang: '', url: 'https://example.com/search?q={q}' })}>
          <Glyph name="plus" size={14} /> Suchmaschine
        </button>
      </div>
    </div>
  </div>

  <div><button class="btn primary" type="submit">Einstellungen speichern</button></div>
</form>

<style>
  .stack {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .sugg {
    margin-top: 24px;
    font-size: 14px;
  }
  .engines {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .eh,
  .er {
    display: grid;
    grid-template-columns: 1.2fr 0.6fr 3fr 40px;
    gap: 8px;
    align-items: center;
  }
  .eh {
    font-size: 12px;
  }
  @media (max-width: 720px) {
    .eh {
      display: none;
    }
    .er {
      grid-template-columns: 1fr 80px 40px;
    }
    .er input:nth-child(3) {
      grid-column: 1 / -1;
      grid-row: 2;
    }
  }
</style>

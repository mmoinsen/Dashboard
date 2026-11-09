<script lang="ts">
  import { get, put } from '../../lib/api.ts';
  import { app, toast } from '../../lib/store.svelte.ts';

  interface AiSettings {
    enabled: boolean;
    model: string;
    effort: 'low' | 'medium' | 'high';
    includeContext: boolean;
    hasKey: boolean;
    keySource: 'ui' | 'env' | null;
    models: { id: string; label: string }[];
  }

  let s = $state<AiSettings | null>(null);
  let apiKey = $state('');
  let busy = $state(false);

  get<{ ai: AiSettings }>('/ai/settings')
    .then((r) => (s = r.ai))
    .catch((e) => toast(e.message, 'bad'));

  async function save(e: SubmitEvent, extra: Record<string, unknown> = {}) {
    e.preventDefault();
    if (!s) return;
    busy = true;
    try {
      const r = await put<{ ai: AiSettings }>('/ai/settings', {
        ai: { enabled: s.enabled, model: s.model, effort: s.effort, includeContext: s.includeContext, apiKey: apiKey || undefined, ...extra },
      });
      s = r.ai;
      apiKey = '';
      app.ai = { available: r.ai.enabled && r.ai.hasKey, model: r.ai.model };
      toast(r.ai.enabled && !r.ai.hasKey ? 'Gespeichert – es fehlt noch ein API-Key' : 'KI-Einstellungen gespeichert', r.ai.enabled && !r.ai.hasKey ? 'bad' : 'ok');
    } catch (err) {
      toast((err as Error).message, 'bad');
    } finally {
      busy = false;
    }
  }
</script>

<form class="card section" onsubmit={save}>
  <h3>KI-Suche (Claude)</h3>
  <p class="muted">
    Mit aktivierter KI-Suche steht in der Suche „Claude fragen“ zur Verfügung (oder Präfix <span class="kbd">!ai</span>). Anfragen gehen nur dann an
    Anthropic, wenn jemand ausdrücklich Claude fragt – nicht bei jedem Tastendruck. Abgerechnet wird über deinen API-Key.
  </p>
  {#if !s}
    <div class="muted"><span class="spinner"></span> Lade…</div>
  {:else}
    <label class="check"><input type="checkbox" name="ai-enabled" bind:checked={s.enabled} /> KI-Suche aktivieren</label>

    <label class="field">
      <span>Anthropic API-Key</span>
      <input
        class="input"
        type="password"
        name="anthropic-api-key"
        autocomplete="off"
        data-1p-ignore
        data-lpignore="true"
        spellcheck="false"
        placeholder={s.keySource === 'ui'
          ? '•••••••• (gespeichert – leer lassen zum Behalten)'
          : s.keySource === 'env'
            ? 'wird aus ANTHROPIC_API_KEY gelesen – optional hier überschreiben…'
            : 'sk-ant-…'}
        bind:value={apiKey}
      />
      <small>Erstellen unter console.anthropic.com → API Keys. Der Key wird verschlüsselt gespeichert und nie an den Browser zurückgegeben.</small>
    </label>
    {#if s.keySource === 'ui'}
      <div><button type="button" class="btn small danger" onclick={(e) => save(e as unknown as SubmitEvent, { apiKey: false })}>Gespeicherten Key entfernen</button></div>
    {/if}

    <div class="form-grid">
      <label class="field">
        <span>Modell</span>
        <select class="input" name="ai-model" bind:value={s.model}>
          {#each s.models as m (m.id)}<option value={m.id}>{m.label}</option>{/each}
        </select>
      </label>
      <label class="field">
        <span>Antworttiefe</span>
        <select class="input" name="ai-effort" bind:value={s.effort}>
          <option value="low">Schnell (low)</option>
          <option value="medium">Ausgewogen (medium)</option>
          <option value="high">Gründlich (high)</option>
        </select>
        <small>Gründlicher = langsamer und teurer.</small>
      </label>
    </div>

    <label class="check">
      <input type="checkbox" name="ai-context" bind:checked={s.includeContext} />
      Dienste und Suchtreffer als Kontext mitsenden
    </label>
    <small class="muted">
      Dann sieht Claude die Namen deiner Dienste, ob sie online sind, und die Treffer der Dashboard-Suche zur Frage (z. B. Filmtitel). Keine API-Keys,
      keine Adressen.
    </small>

    <div><button class="btn primary" type="submit" disabled={busy}>{busy ? 'Speichere…' : 'KI-Einstellungen speichern'}</button></div>
  {/if}
</form>

<style>
  p {
    margin: 0;
    font-size: 14px;
  }
</style>

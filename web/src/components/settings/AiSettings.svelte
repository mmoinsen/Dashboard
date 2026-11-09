<script lang="ts">
  import { get, put } from '../../lib/api.ts';
  import { app, toast } from '../../lib/store.svelte.ts';

  type Mode = 'off' | 'website' | 'api';
  interface AiSettings {
    mode: Mode;
    model: string;
    effort: 'low' | 'medium' | 'high';
    includeContext: boolean;
    hasKey: boolean;
    keySource: 'ui' | 'env' | null;
    models: { id: string; label: string }[];
  }

  const MODES: { id: Mode; title: string; text: string }[] = [
    {
      id: 'website',
      title: 'claude.ai – mit deinem Claude-Abo',
      text: '„Claude fragen“ öffnet claude.ai in einem neuen Tab und füllt die Frage vor; sie liegt zusätzlich in der Zwischenablage, falls das Feld leer bleibt. Keine Zusatzkosten, du nutzt dort dein eigenes Konto. Dienste-Kontext wird nicht mitgeschickt.',
    },
    {
      id: 'api',
      title: 'Antwort direkt in der Suche (API-Key)',
      text: 'Claude antwortet im Suchfenster und kennt auf Wunsch deine Dienste und Suchtreffer. Braucht einen Anthropic-API-Key und wird pro Anfrage abgerechnet – unabhängig von einem Claude-Abo.',
    },
    { id: 'off', title: 'Aus', text: 'Kein „Claude fragen“ in der Suche.' },
  ];

  let s = $state<AiSettings | null>(null);
  let apiKey = $state('');
  let busy = $state(false);

  get<{ ai: AiSettings }>('/ai/settings')
    .then((r) => (s = r.ai))
    .catch((e) => toast(e.message, 'bad'));

  async function save(e: Event, extra: Record<string, unknown> = {}) {
    e.preventDefault();
    if (!s) return;
    busy = true;
    try {
      const r = await put<{ ai: AiSettings }>('/ai/settings', {
        ai: { mode: s.mode, model: s.model, effort: s.effort, includeContext: s.includeContext, apiKey: apiKey || undefined, ...extra },
      });
      s = r.ai;
      apiKey = '';
      app.ai = { mode: r.ai.mode, available: r.ai.mode === 'api' && r.ai.hasKey, model: r.ai.model };
      const missingKey = r.ai.mode === 'api' && !r.ai.hasKey;
      toast(missingKey ? 'Gespeichert – für den API-Modus fehlt noch ein API-Key' : 'KI-Einstellungen gespeichert', missingKey ? 'bad' : 'ok');
    } catch (err) {
      toast((err as Error).message, 'bad');
    } finally {
      busy = false;
    }
  }
</script>

<form class="card section" onsubmit={save}>
  <h3>KI-Suche (Claude)</h3>
  {#if !s}
    <div class="muted"><span class="spinner"></span> Lade…</div>
  {:else}
    <fieldset class="modes">
      <legend class="sr-only">Wie soll „Claude fragen“ funktionieren?</legend>
      {#each MODES as m (m.id)}
        <label class="mode" class:active={s.mode === m.id}>
          <input type="radio" name="ai-mode" value={m.id} bind:group={s.mode} />
          <span>
            <strong>{m.title}</strong>
            <span class="muted">{m.text}</span>
          </span>
        </label>
      {/each}
    </fieldset>

    {#if s.mode === 'api'}
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
        <small>Erstellen unter console.anthropic.com → API Keys. Ein Claude-Abo (Pro/Max) enthält keinen API-Zugang. Der Key wird verschlüsselt gespeichert und nie an den Browser zurückgegeben.</small>
      </label>
      {#if s.keySource === 'ui'}
        <div><button type="button" class="btn small danger" onclick={(e) => save(e, { apiKey: false })}>Gespeicherten Key entfernen</button></div>
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
        keine Adressen. Anfragen gehen nur an Anthropic, wenn jemand ausdrücklich Claude fragt.
      </small>
    {/if}

    <div><button class="btn primary" type="submit" disabled={busy}>{busy ? 'Speichere…' : 'KI-Einstellungen speichern'}</button></div>
  {/if}
</form>

<style>
  .modes {
    border: 0;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .mode {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    padding: 12px 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    cursor: pointer;
  }
  .mode:hover {
    border-color: color-mix(in srgb, var(--text) 25%, var(--border));
  }
  .mode.active {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .mode input {
    margin-top: 3px;
    width: 18px;
    height: 18px;
    accent-color: var(--accent);
    flex: none;
  }
  .mode > span {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 14px;
  }
  .mode .muted {
    font-size: 13px;
  }
</style>

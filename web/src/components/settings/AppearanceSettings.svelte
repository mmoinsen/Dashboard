<script lang="ts">
  import { app, applyUserTheme, saveUserSettings, toast } from '../../lib/store.svelte.ts';
  import { FONT_OPTIONS, PRESETS, applyTheme, findTheme } from '../../lib/themes.ts';
  import type { Theme, ThemeTokens } from '../../lib/types.ts';
  import { copyText } from '../../lib/id.ts';
  import { rangeFill } from '../../lib/actions.ts';
  import { warnOnUnload } from '../../lib/unsaved.ts';
  import Glyph from '../Glyph.svelte';

  const custom = $derived(app.user?.settings.customThemes ?? []);
  const activeId = $derived(findTheme(app.user?.settings.theme, custom).id);

  let editing: { id?: string; name: string; tokens: ThemeTokens } | null = $state(null);
  let editStart = '';
  $effect(() => warnOnUnload(() => !!editing && JSON.stringify(editing) !== editStart));

  // Live preview while editing; restore the saved theme when the editor closes.
  $effect(() => {
    if (editing) applyTheme($state.snapshot(editing.tokens) as ThemeTokens);
  });

  function startEdit(base: Theme, asCopy: boolean) {
    editing = { id: asCopy ? undefined : base.id, name: asCopy ? `${base.name} (eigenes)` : base.name, tokens: { ...base.tokens } };
    editStart = JSON.stringify(editing);
  }

  function cancel() {
    if (editing && JSON.stringify(editing) !== editStart && !confirm('Änderungen am Theme verwerfen?')) return;
    editing = null;
    applyUserTheme();
  }

  async function saveTheme() {
    if (!editing) return;
    const theme: Theme = { id: editing.id ?? `custom-${Date.now().toString(36)}`, name: editing.name.trim() || 'Eigenes Theme', tokens: $state.snapshot(editing.tokens) as ThemeTokens, custom: true };
    const list = [...custom.filter((t) => t.id !== theme.id), theme];
    await saveUserSettings({ customThemes: list, theme: theme.id });
    editing = null;
    toast('Theme gespeichert', 'ok');
  }

  async function removeTheme(t: Theme) {
    if (!confirm(`Theme „${t.name}“ löschen?`)) return;
    await saveUserSettings({ customThemes: custom.filter((x) => x.id !== t.id), theme: activeId === t.id ? 'nacht' : app.user?.settings.theme });
  }

  async function exportTheme(t: Theme) {
    const ok = await copyText(JSON.stringify({ name: t.name, tokens: t.tokens }, null, 2));
    toast(ok ? 'Theme als JSON in die Zwischenablage kopiert' : 'Kopieren nicht möglich', ok ? 'ok' : 'bad');
  }

  async function importTheme() {
    const text = prompt('Theme-JSON einfügen');
    if (!text) return;
    try {
      const data = JSON.parse(text);
      if (!data?.tokens?.bg || !data?.tokens?.accent) throw new Error();
      editing = { name: String(data.name ?? 'Importiert'), tokens: { ...PRESETS[0].tokens, ...data.tokens } };
    } catch {
      toast('Ungültiges Theme-JSON', 'bad');
    }
  }

  const colorFields: { key: keyof ThemeTokens; label: string }[] = [
    { key: 'bg', label: 'Hintergrund' },
    { key: 'surface', label: 'Karten' },
    { key: 'surface2', label: 'Karten (innen)' },
    { key: 'border', label: 'Rahmen' },
    { key: 'text', label: 'Text' },
    { key: 'muted', label: 'Text gedämpft' },
    { key: 'accent', label: 'Akzent' },
    { key: 'accentText', label: 'Text auf Akzent' },
    { key: 'accent2', label: 'Akzent 2' },
    { key: 'ok', label: 'OK' },
    { key: 'warn', label: 'Warnung' },
    { key: 'bad', label: 'Fehler' },
  ];

  const isHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v);
</script>

<div class="row-between">
  <div>
    <h2>Aussehen</h2>
    <p class="muted">Dein Theme gilt nur für dich. Eigene Themes kannst du als JSON teilen.</p>
  </div>
  <button class="btn" onclick={importTheme}><Glyph name="upload" size={16} /> Theme importieren</button>
</div>

{#if !editing}
  <div class="themes">
    {#each [...PRESETS, ...custom] as t (t.id)}
      {@const k = t.tokens}
      <div class="theme" class:active={activeId === t.id}>
        <button class="preview" style="background:{k.wallpaper && !k.wallpaper.startsWith('http') ? k.wallpaper : k.bg};border-radius:{Math.min(k.radius, 16)}px" onclick={() => saveUserSettings({ theme: t.id })} aria-label="Theme {t.name} verwenden">
          <span class="pv-bar" style="background:{k.surfaceAlpha < 1 ? 'rgba(255,255,255,.14)' : k.surface};border-radius:{Math.min(k.radius, 10) / 2}px">
            <span class="pv-dot" style="background:{k.accent}"></span>
            <span class="pv-line" style="background:{k.muted};opacity:.5"></span>
          </span>
          <span class="pv-grid">
            <span class="pv-card" style="background:{k.surfaceAlpha < 1 ? 'rgba(255,255,255,.14)' : k.surface};border-radius:{Math.min(k.radius, 10) / 2}px">
              <span class="pv-num" style="color:{k.text};font-family:{k.fontHeading}">12.4</span>
              <span class="pv-line" style="background:{k.accent};width:70%"></span>
              <span class="pv-line" style="background:{k.accent2};width:40%"></span>
            </span>
            <span class="pv-card" style="background:{k.surfaceAlpha < 1 ? 'rgba(255,255,255,.14)' : k.surface};border-radius:{Math.min(k.radius, 10) / 2}px">
              <span class="pv-line" style="background:{k.muted};opacity:.5;width:80%"></span>
              <span class="pv-line" style="background:{k.muted};opacity:.5;width:55%"></span>
              <span class="pv-line" style="background:{k.ok};width:30%"></span>
            </span>
          </span>
        </button>
        <div class="theme-meta">
          <strong>{t.name}</strong>
          {#if activeId === t.id}<span class="chip">Aktiv</span>{/if}
        </div>
        <div class="theme-actions">
          <button class="btn small" onclick={() => startEdit(t, !t.custom)}>{t.custom ? 'Bearbeiten' : 'Anpassen'}</button>
          {#if t.custom}
            <button class="icon-btn small" aria-label="Exportieren" onclick={() => exportTheme(t)}><Glyph name="copy" size={15} /></button>
            <button class="icon-btn small" aria-label="Löschen" onclick={() => removeTheme(t)}><Glyph name="trash" size={15} /></button>
          {/if}
        </div>
      </div>
    {/each}
  </div>
{:else}
  <div class="card section editor">
    <div class="row-between">
      <h3>Theme-Editor <span class="muted live">· Live-Vorschau</span></h3>
      <div class="theme-actions">
        <button class="btn" onclick={cancel}>Abbrechen</button>
        <button class="btn primary" onclick={saveTheme}>Speichern &amp; verwenden</button>
      </div>
    </div>
    <label class="field"><span>Name</span><input class="input" name="theme-name" autocomplete="off" bind:value={editing.name} /></label>

    <div class="colors">
      {#each colorFields as f (f.key)}
        <label class="color">
          <input type="color" value={isHex(String(editing.tokens[f.key])) ? editing.tokens[f.key] : '#888888'} oninput={(e) => ((editing!.tokens as any)[f.key] = e.currentTarget.value)} />
          <span class="cl">
            <span class="muted">{f.label}</span>
            <input class="hex mono" name="color-{f.key}" autocomplete="off" spellcheck="false" value={editing.tokens[f.key]} onchange={(e) => ((editing!.tokens as any)[f.key] = e.currentTarget.value)} aria-label="{f.label} Farbwert" />
          </span>
        </label>
      {/each}
    </div>

    <div class="form-grid">
      <label class="field">
        <span>Eckenradius · {editing.tokens.radius} px</span>
        <input type="range" min="0" max="28" bind:value={editing.tokens.radius} use:rangeFill={editing.tokens.radius} />
      </label>
      <label class="field">
        <span>Karten-Deckkraft · {Math.round(editing.tokens.surfaceAlpha * 100)} %</span>
        <input type="range" min="0.05" max="1" step="0.01" bind:value={editing.tokens.surfaceAlpha} use:rangeFill={editing.tokens.surfaceAlpha} />
      </label>
      <label class="field">
        <span>Blur (Glas-Effekt) · {editing.tokens.blur} px</span>
        <input type="range" min="0" max="40" bind:value={editing.tokens.blur} use:rangeFill={editing.tokens.blur} />
      </label>
      <label class="field">
        <span>Dichte</span>
        <select class="input" bind:value={editing.tokens.density}>
          <option value="compact">Kompakt</option>
          <option value="normal">Normal</option>
          <option value="airy">Luftig</option>
        </select>
      </label>
      <label class="field">
        <span>Überschriften</span>
        <select class="input" bind:value={editing.tokens.fontHeading}>
          {#each FONT_OPTIONS as f}<option value={f.value}>{f.label}</option>{/each}
        </select>
      </label>
      <label class="field">
        <span>Fließtext</span>
        <select class="input" bind:value={editing.tokens.fontBody}>
          {#each FONT_OPTIONS as f}<option value={f.value}>{f.label}</option>{/each}
        </select>
      </label>
    </div>
    <label class="field">
      <span>Hintergrundbild (URL oder CSS-Verlauf)</span>
      <input class="input" name="wallpaper" autocomplete="off" spellcheck="false" placeholder="z. B. https://bild.jpg oder linear-gradient(135deg, #1f2b46, #6a5a8e)…" bind:value={editing.tokens.wallpaper} />
      <small>Tipp: Mit Hintergrundbild Karten-Deckkraft auf ~15 % und Blur auf ~18 px setzen.</small>
    </label>
  </div>
{/if}

<style>
  p {
    margin: 4px 0 0;
  }
  .themes {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
    gap: 18px;
  }
  .theme {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .preview {
    height: 150px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    border: 2px solid transparent;
    cursor: pointer;
    background-size: cover;
    outline: 1px solid var(--border);
  }
  .theme.active .preview {
    border-color: var(--accent);
  }
  .pv-bar {
    height: 22px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 8px;
  }
  .pv-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .pv-line {
    display: block;
    height: 5px;
    border-radius: 3px;
    width: 60%;
  }
  .pv-grid {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .pv-card {
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    text-align: left;
  }
  .pv-num {
    font-size: 16px;
    font-weight: 600;
  }
  .theme-meta {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .theme-actions {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .live {
    font-size: 13px;
    font-weight: 400;
    font-family: var(--font-body);
  }
  .colors {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: 12px;
  }
  .color {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .color input[type='color'] {
    width: 44px;
    height: 44px;
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 2px;
    background: none;
    cursor: pointer;
    flex: none;
  }
  .cl {
    display: flex;
    flex-direction: column;
    font-size: 12px;
    min-width: 0;
  }
  .hex {
    background: none;
    border: 0;
    border-bottom: 1px dashed var(--border);
    padding: 2px 0;
    font-size: 13px;
    width: 100%;
    outline: none; /* replaced by the underline below */
  }
  .hex:focus-visible {
    border-bottom: 2px solid var(--accent);
  }

</style>

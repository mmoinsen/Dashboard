<script lang="ts">
  import { post, put } from '../../lib/api.ts';
  import { app, saveUserSettings, toast } from '../../lib/store.svelte.ts';

  let displayName = $state(app.user?.displayName ?? '');
  let current = $state('');
  let next = $state('');
  let next2 = $state('');

  async function saveProfile(e: SubmitEvent) {
    e.preventDefault();
    try {
      await saveUserSettings({}, displayName);
      toast('Gespeichert', 'ok');
    } catch (err) {
      toast((err as Error).message, 'bad');
    }
  }

  async function changePassword(e: SubmitEvent) {
    e.preventDefault();
    if (next !== next2) return toast('Die neuen Passwörter stimmen nicht überein', 'bad');
    try {
      await put('/me/password', { current, next });
      current = next = next2 = '';
      toast('Passwort geändert – andere Geräte wurden abgemeldet', 'ok');
    } catch (err) {
      toast((err as Error).message, 'bad');
    }
  }

  async function logoutOthers() {
    await post('/me/logout-others');
    toast('Alle anderen Sitzungen wurden beendet', 'ok');
  }
</script>

<h2>Konto</h2>

<form class="card section" onsubmit={saveProfile}>
  <h3>Profil &amp; Verhalten</h3>
  <label class="field"><span>Anzeigename</span><input class="input" bind:value={displayName} /></label>
  <label class="field">
    <span>Websuche</span>
    <select class="input" value={app.user?.settings.searchEngine ?? ''} onchange={(e) => saveUserSettings({ searchEngine: e.currentTarget.value || undefined })}>
      <option value="">Standard ({app.settings?.search.engines.find((x) => x.id === app.settings?.search.defaultEngine)?.name})</option>
      {#each app.settings?.search.engines ?? [] as e (e.id)}
        <option value={e.id}>{e.name}</option>
      {/each}
    </select>
  </label>
  <label class="check">
    <input type="checkbox" checked={app.user?.settings.openLinksInNewTab ?? false} onchange={(e) => saveUserSettings({ openLinksInNewTab: e.currentTarget.checked })} />
    Links in neuem Tab öffnen
  </label>
  <label class="check">
    <input type="checkbox" checked={app.user?.settings.greeting !== false} onchange={(e) => saveUserSettings({ greeting: e.currentTarget.checked })} />
    Begrüßung über der Suche anzeigen
  </label>
  <div><button class="btn primary" type="submit">Speichern</button></div>
</form>

<form class="card section" onsubmit={changePassword}>
  <h3>Passwort ändern</h3>
  <div class="form-grid">
    <label class="field"><span>Aktuelles Passwort</span><input class="input" type="password" autocomplete="current-password" required bind:value={current} /></label>
    <label class="field"><span>Neues Passwort</span><input class="input" type="password" autocomplete="new-password" minlength="8" required bind:value={next} /></label>
    <label class="field"><span>Wiederholen</span><input class="input" type="password" autocomplete="new-password" required bind:value={next2} /></label>
  </div>
  <div><button class="btn primary" type="submit">Passwort ändern</button></div>
</form>

<div class="card section">
  <h3>Sitzungen</h3>
  <p class="muted">Du bleibst auf jedem Gerät bis zu 400 Tage angemeldet; jede Nutzung verlängert das. Hier kannst du alle anderen Geräte abmelden.</p>
  <div><button class="btn" onclick={logoutOthers}>Andere Geräte abmelden</button></div>
</div>

<style>
  p {
    margin: 0;
  }
</style>

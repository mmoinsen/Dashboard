<script lang="ts">
  import { post } from '../lib/api.ts';
  import { app, loadAll } from '../lib/store.svelte.ts';

  const setup = $derived(app.phase === 'setup');
  let username = $state('');
  let displayName = $state('');
  let password = $state('');
  let password2 = $state('');
  let error = $state('');
  let busy = $state(false);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    if (setup && password !== password2) {
      error = 'Die Passwörter stimmen nicht überein';
      return;
    }
    busy = true;
    try {
      await post(setup ? '/auth/setup' : '/auth/login', { username, password, displayName });
      await loadAll();
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

<main class="wrap">
  <form class="card box" onsubmit={submit}>
    <div class="brand">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /></svg>
      <span>Kompass</span>
    </div>
    {#if setup}
      <h1>Willkommen!</h1>
      <p class="muted">Lege den Administrator-Account an. Damit verwaltest du später Dienste und weitere Benutzer.</p>
    {:else}
      <h1>Anmelden</h1>
      <p class="muted">Du bleibst angemeldet, bis du dich abmeldest – auch nach einem Browser-Neustart.</p>
    {/if}

    <label class="field">
      <span>Benutzername</span>
      <input class="input" autocomplete="username" required bind:value={username} />
    </label>
    {#if setup}
      <label class="field">
        <span>Anzeigename (optional)</span>
        <input class="input" autocomplete="name" bind:value={displayName} />
      </label>
    {/if}
    <label class="field">
      <span>Passwort</span>
      <input class="input" type="password" autocomplete={setup ? 'new-password' : 'current-password'} required minlength={setup ? 8 : undefined} bind:value={password} />
    </label>
    {#if setup}
      <label class="field">
        <span>Passwort wiederholen</span>
        <input class="input" type="password" autocomplete="new-password" required bind:value={password2} />
      </label>
    {/if}

    {#if error}<div class="banner bad" role="alert">{error}</div>{/if}

    <button class="btn primary big" type="submit" disabled={busy}>
      {#if busy}<span class="spinner"></span>{/if}
      {setup ? 'Administrator anlegen' : 'Anmelden'}
    </button>
  </form>
</main>

<style>
  .wrap {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 24px 16px;
  }
  .box {
    width: min(420px, 100%);
    padding: 32px 28px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    box-shadow: var(--shadow);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    font-family: var(--font-heading);
    font-weight: 700;
    font-size: 22px;
  }
  h1 {
    font-size: 28px;
    margin-top: 8px;
  }
  p {
    margin: -6px 0 4px;
    font-size: 14px;
  }
  .big {
    min-height: 46px;
    margin-top: 4px;
  }
</style>

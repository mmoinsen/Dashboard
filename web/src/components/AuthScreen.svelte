<script lang="ts">
  import { post } from '../lib/api.ts';
  import { app, loadAll } from '../lib/store.svelte.ts';

  const setup = $derived(app.phase === 'setup');
  let username = $state('');
  let displayName = $state('');
  let password = $state('');
  let password2 = $state('');
  let error = $state('');
  let errorField = $state<'username' | 'password' | 'password2' | null>(null);
  let busy = $state(false);
  let userInput: HTMLInputElement;
  let passInput: HTMLInputElement;
  let pass2Input: HTMLInputElement | undefined = $state();

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    errorField = null;
    if (setup && password !== password2) {
      error = 'Die Passwörter stimmen nicht überein – bitte beide Felder gleich ausfüllen.';
      errorField = 'password2';
      pass2Input?.focus();
      return;
    }
    busy = true;
    try {
      await post(setup ? '/auth/setup' : '/auth/login', { username, password, displayName });
      await loadAll();
    } catch (err) {
      error = (err as Error).message;
      // put the error next to the field it belongs to and move focus there
      errorField = /benutzername/i.test(error) && !/passwort falsch/i.test(error) ? 'username' : 'password';
      (errorField === 'username' ? userInput : passInput)?.focus();
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
      <input
        bind:this={userInput}
        class="input"
        name="username"
        autocomplete="username"
        autocapitalize="none"
        spellcheck="false"
        required
        placeholder="z. B. alex…"
        aria-invalid={errorField === 'username'}
        aria-describedby={errorField === 'username' ? 'auth-error' : undefined}
        bind:value={username}
      />
      {#if errorField === 'username'}<small class="err" id="auth-error" role="alert">{error}</small>{/if}
    </label>
    {#if setup}
      <label class="field">
        <span>Anzeigename (optional)</span>
        <input class="input" name="name" autocomplete="name" placeholder="z. B. Alex…" bind:value={displayName} />
      </label>
    {/if}
    <label class="field">
      <span>Passwort</span>
      <input
        bind:this={passInput}
        class="input"
        type="password"
        name="password"
        autocomplete={setup ? 'new-password' : 'current-password'}
        required
        minlength={setup ? 8 : undefined}
        aria-invalid={errorField === 'password'}
        aria-describedby={errorField === 'password' ? 'auth-error' : setup ? 'pw-hint' : undefined}
        bind:value={password}
      />
      {#if errorField === 'password'}<small class="err" id="auth-error" role="alert">{error}</small>{:else if setup}<small id="pw-hint">Mindestens 8 Zeichen</small>{/if}
    </label>
    {#if setup}
      <label class="field">
        <span>Passwort wiederholen</span>
        <input
          bind:this={pass2Input}
          class="input"
          type="password"
          name="password-repeat"
          autocomplete="new-password"
          required
          aria-invalid={errorField === 'password2'}
          aria-describedby={errorField === 'password2' ? 'auth-error' : undefined}
          bind:value={password2}
        />
        {#if errorField === 'password2'}<small class="err" id="auth-error" role="alert">{error}</small>{/if}
      </label>
    {/if}

    {#if error && !errorField}<div class="banner bad" role="alert">{error}</div>{/if}

    <button class="btn primary big" type="submit" disabled={busy}>
      {#if busy}<span class="spinner"></span>{/if}
      {busy ? (setup ? 'Lege an…' : 'Melde an…') : setup ? 'Administrator anlegen' : 'Anmelden'}
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
  .err {
    color: var(--bad);
  }
  .big {
    min-height: 46px;
    margin-top: 4px;
  }
</style>

<script lang="ts">
  import AuthScreen from './components/AuthScreen.svelte';
  import Dashboard from './components/Dashboard.svelte';
  import Search from './components/Search.svelte';
  import Settings from './components/settings/Settings.svelte';
  import Toasts from './components/Toasts.svelte';
  import TopBar from './components/TopBar.svelte';
  import Glyph from './components/Glyph.svelte';
  import { app, navigate, refreshServices, saveDashboard } from './lib/store.svelte.ts';

  const route = $derived(app.route.split('?')[0]);
  const settingsTab = $derived(route.startsWith('/settings') ? route.split('/')[2] || 'appearance' : null);
  const pageId = $derived(route.startsWith('/p/') ? route.slice(3) : undefined);
  const page = $derived(app.dashboard?.pages.find((p) => p.id === pageId) ?? app.dashboard?.pages[0]);

  // Refresh service status regularly (dots in the service bar).
  $effect(() => {
    if (app.phase !== 'ready') return;
    const t = setInterval(() => document.visibilityState === 'visible' && refreshServices().catch(() => {}), 30_000);
    return () => clearInterval(t);
  });

  // Global shortcuts: Ctrl/Cmd+K or "/" opens the search; typing anywhere starts a search.
  function onkeydown(e: KeyboardEvent) {
    if (app.phase !== 'ready' || app.searchOpen) return;
    const target = e.target as HTMLElement;
    const typing = target.closest('input, textarea, select, [contenteditable], dialog');
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      app.searchSeed = '';
      app.searchOpen = true;
      return;
    }
    if (typing || e.ctrlKey || e.metaKey || e.altKey || settingsTab) return;
    if (e.key === '/') {
      e.preventDefault();
      app.searchSeed = '';
      app.searchOpen = true;
    } else if (e.key.length === 1 && /\S/.test(e.key) && !app.editing) {
      e.preventDefault();
      app.searchSeed = e.key;
      app.searchOpen = true;
    }
  }

  function renamePage() {
    if (!page) return;
    const name = prompt('Seitenname', page.name);
    if (name) {
      page.name = name;
      saveDashboard();
    }
  }

  function deletePage() {
    if (!page || !app.dashboard || app.dashboard.pages.length <= 1) return;
    if (!confirm(`Seite „${page.name}“ mit allen Widgets löschen?`)) return;
    app.dashboard.pages = app.dashboard.pages.filter((p) => p.id !== page.id);
    saveDashboard();
    navigate('/');
  }

  function movePage(delta: number) {
    if (!page || !app.dashboard) return;
    const pages = app.dashboard.pages;
    const i = pages.findIndex((p) => p.id === page.id);
    const j = i + delta;
    if (j < 0 || j >= pages.length) return;
    [pages[i], pages[j]] = [pages[j], pages[i]];
    saveDashboard();
  }
</script>

<svelte:window {onkeydown} />

{#if app.phase === 'loading'}
  <div class="loading"><span class="spinner"></span></div>
{:else if app.phase === 'setup' || app.phase === 'login'}
  <AuthScreen />
{:else}
  <a class="skip-link" href="#main" onclick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Zum Inhalt springen</a>
  <div class="shell">
    <TopBar currentPage={settingsTab ? '__settings' : page?.id} />

    {#if app.configError && app.user?.isAdmin}
      <div class="banner bad">Fehler in kompass.yaml: {app.configError}</div>
    {/if}

    <main id="main" tabindex="-1">
    {#if settingsTab}
      <h1 class="sr-only">Einstellungen</h1>
      <Settings tab={settingsTab} />
    {:else if page}
      {#if app.editing}
        <div class="pagebar card">
          <strong>Seite „{page.name}“</strong>
          <label class="check"><input type="checkbox" bind:checked={page.showSearch} onchange={saveDashboard} /> Suche &amp; Begrüßung</label>
          <label class="check"><input type="checkbox" bind:checked={page.showServices} onchange={saveDashboard} /> Dienste-Leiste</label>
          <span class="spacer"></span>
          <button class="btn small" onclick={() => movePage(-1)} aria-label="Seite nach links"><Glyph name="chevronLeft" size={15} /></button>
          <button class="btn small" onclick={() => movePage(1)} aria-label="Seite nach rechts"><Glyph name="chevronRight" size={15} /></button>
          <button class="btn small" onclick={renamePage}>Umbenennen</button>
          <button class="btn small danger" onclick={deletePage} disabled={(app.dashboard?.pages.length ?? 0) <= 1}>Löschen</button>
        </div>
      {/if}
      {#key page.id}
        <Dashboard {page} />
      {/key}
    {/if}
    </main>
  </div>

  {#if app.searchOpen}
    <Search seed={app.searchSeed} onclose={() => (app.searchOpen = false)} />
  {/if}
{/if}

<Toasts />

<style>
  .loading {
    min-height: 100vh;
    display: grid;
    place-items: center;
  }
  main {
    display: flex;
    flex-direction: column;
    gap: calc(22px * var(--space));
    outline: none; /* programmatic focus target of the skip link only */
  }
  .shell {
    max-width: 1480px;
    margin: 0 auto;
    padding: max(20px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(64px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
    display: flex;
    flex-direction: column;
    gap: calc(22px * var(--space));
  }
  @media (min-width: 900px) {
    .shell {
      padding: max(24px, env(safe-area-inset-top)) max(32px, env(safe-area-inset-right)) max(72px, env(safe-area-inset-bottom)) max(32px, env(safe-area-inset-left));
    }
  }
  .pagebar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 18px;
    padding: 12px 16px;
    font-size: 14px;
  }
  .spacer {
    flex: 1;
  }
</style>

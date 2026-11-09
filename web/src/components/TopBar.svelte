<script lang="ts">
  import { post } from '../lib/api.ts';
  import { app, navigate, saveDashboard } from '../lib/store.svelte.ts';
  import Glyph from './Glyph.svelte';

  let { currentPage }: { currentPage?: string } = $props();
  let now = $state(new Date());
  let menuOpen = $state(false);

  $effect(() => {
    const t = setInterval(() => (now = new Date()), 15_000);
    return () => clearInterval(t);
  });

  const fmt = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  function addPage() {
    const name = prompt('Name der neuen Seite', 'Neue Seite');
    if (!name || !app.dashboard) return;
    const id = crypto.randomUUID().slice(0, 8);
    app.dashboard.pages.push({ id, name, showSearch: false, showServices: false, widgets: [] });
    saveDashboard();
    navigate(`/p/${id}`);
  }

  async function logout() {
    await post('/auth/logout');
    location.reload();
  }
</script>

<header class="top">
  <a class="brand" href="#/">
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /></svg>
    <span>{app.settings?.title ?? 'Kompass'}</span>
  </a>

  <nav class="pages" aria-label="Seiten">
    {#each app.dashboard?.pages ?? [] as p, i (p.id)}
      <a href="#/p/{p.id}" class:active={currentPage === p.id || (!currentPage && i === 0)}>{p.name}</a>
    {/each}
    {#if app.editing}
      <button class="add-page" onclick={addPage}><Glyph name="plus" size={15} /> Seite</button>
    {/if}
  </nav>

  <div class="right">
    <span class="date muted">{fmt.format(now)}</span>
    <button class="icon-btn" aria-label="Suche öffnen (Ctrl K)" onclick={() => ((app.searchSeed = ''), (app.searchOpen = true))}><Glyph name="search" /></button>
    <button class="btn" class:primary={app.editing} onclick={() => (app.editing = !app.editing)}>
      <Glyph name={app.editing ? 'check' : 'edit'} size={16} />
      <span class="label">{app.editing ? 'Fertig' : 'Bearbeiten'}</span>
    </button>
    <div class="menu-wrap">
      <button class="icon-btn" aria-label="Menü" aria-expanded={menuOpen} onclick={() => (menuOpen = !menuOpen)}><Glyph name="user" /></button>
      {#if menuOpen}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="backdrop" onclick={() => (menuOpen = false)} onkeydown={() => {}}></div>
        <div class="menu card" role="menu">
          <div class="who">
            <strong>{app.user?.displayName}</strong>
            <span class="muted">@{app.user?.username}{app.user?.isAdmin ? ' · Admin' : ''}</span>
          </div>
          <a role="menuitem" href="#/settings/appearance" onclick={() => (menuOpen = false)}><Glyph name="palette" size={16} /> Aussehen</a>
          <a role="menuitem" href="#/settings/account" onclick={() => (menuOpen = false)}><Glyph name="user" size={16} /> Konto</a>
          {#if app.user?.isAdmin}
            <a role="menuitem" href="#/settings/services" onclick={() => (menuOpen = false)}><Glyph name="server" size={16} /> Dienste</a>
            <a role="menuitem" href="#/settings/users" onclick={() => (menuOpen = false)}><Glyph name="users" size={16} /> Benutzer</a>
            <a role="menuitem" href="#/settings/general" onclick={() => (menuOpen = false)}><Glyph name="settings" size={16} /> Allgemein</a>
          {/if}
          <button role="menuitem" onclick={logout}><Glyph name="logout" size={16} /> Abmelden</button>
        </div>
      {/if}
    </div>
  </div>
</header>

<style>
  .top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px 24px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--text);
    text-decoration: none;
    font-family: var(--font-heading);
    font-weight: 700;
    font-size: 21px;
    letter-spacing: -0.02em;
  }
  .pages {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .pages a,
  .add-page {
    padding: 8px 14px;
    border-radius: var(--radius-sm);
    color: var(--muted);
    text-decoration: none;
    font-size: 14px;
    border: 0;
    background: none;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .pages a:hover,
  .add-page:hover {
    color: var(--text);
  }
  .pages a.active {
    background: var(--surface-2);
    color: var(--text);
    font-weight: 500;
  }
  .right {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .date {
    font-size: 14px;
    margin-right: 8px;
  }
  .menu-wrap {
    position: relative;
  }
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
  }
  .menu {
    position: absolute;
    right: 0;
    top: calc(100% + 6px);
    z-index: 50;
    min-width: 230px;
    padding: 6px;
    background: var(--surface-solid);
    box-shadow: var(--shadow);
    display: flex;
    flex-direction: column;
  }
  .who {
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    border-bottom: 1px solid var(--border);
    margin-bottom: 4px;
    font-size: 14px;
  }
  .who span {
    font-size: 12px;
  }
  .menu a,
  .menu button {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 8px;
    color: var(--text);
    text-decoration: none;
    font-size: 14px;
    border: 0;
    background: none;
    cursor: pointer;
    text-align: left;
  }
  .menu a:hover,
  .menu button:hover {
    background: var(--surface-2);
  }
  @media (max-width: 720px) {
    .date,
    .label {
      display: none;
    }
  }
</style>

<script lang="ts">
  import { app } from '../../lib/store.svelte.ts';
  import Glyph from '../Glyph.svelte';
  import AccountSettings from './AccountSettings.svelte';
  import AppearanceSettings from './AppearanceSettings.svelte';
  import GeneralSettings from './GeneralSettings.svelte';
  import ServicesSettings from './ServicesSettings.svelte';
  import UsersSettings from './UsersSettings.svelte';

  let { tab }: { tab: string } = $props();

  const tabs = $derived([
    { id: 'appearance', label: 'Aussehen', glyph: 'palette' },
    { id: 'account', label: 'Konto', glyph: 'user' },
    ...(app.user?.isAdmin
      ? [
          { id: 'services', label: 'Dienste', glyph: 'server' },
          { id: 'users', label: 'Benutzer', glyph: 'users' },
          { id: 'general', label: 'Allgemein', glyph: 'settings' },
        ]
      : []),
  ]);
</script>

<div class="settings">
  <nav class="side" aria-label="Einstellungen">
    <a class="back" href="#/"><Glyph name="chevronLeft" size={16} /> Dashboard</a>
    {#each tabs as t (t.id)}
      <a href="#/settings/{t.id}" class:active={tab === t.id}><Glyph name={t.glyph} size={17} /> {t.label}</a>
    {/each}
  </nav>
  <section class="content">
    {#if tab === 'appearance'}
      <AppearanceSettings />
    {:else if tab === 'account'}
      <AccountSettings />
    {:else if tab === 'services' && app.user?.isAdmin}
      <ServicesSettings />
    {:else if tab === 'users' && app.user?.isAdmin}
      <UsersSettings />
    {:else if tab === 'general' && app.user?.isAdmin}
      <GeneralSettings />
    {:else}
      <p class="muted">Diese Seite gibt es nicht oder sie ist nur für Administratoren.</p>
    {/if}
  </section>
</div>

<style>
  .settings {
    display: flex;
    flex-wrap: wrap;
    gap: 24px;
    align-items: flex-start;
  }
  .side {
    flex: 1 1 200px;
    max-width: 240px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .side a {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: var(--radius-sm);
    color: var(--muted);
    text-decoration: none;
    font-size: 14px;
  }
  .side a:hover {
    color: var(--text);
  }
  .side a.active {
    background: var(--surface-2);
    color: var(--text);
    font-weight: 500;
  }
  .side .back {
    margin-bottom: 8px;
  }
  .content {
    flex: 999 1 560px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  @media (max-width: 720px) {
    .side {
      max-width: none;
      flex-direction: row;
      flex-wrap: wrap;
    }
  }
  .content :global(h2) {
    font-size: 26px;
  }
  .content :global(.section) {
    padding: 22px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .content :global(.section h3) {
    font-size: 17px;
  }
  .content :global(.row-between) {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .content :global(.form-grid) {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 14px 18px;
  }
</style>

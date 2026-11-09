<script lang="ts">
  import { del, get, post, put } from '../../lib/api.ts';
  import { app, toast } from '../../lib/store.svelte.ts';
  import type { UserPublic } from '../../lib/types.ts';
  import Glyph from '../Glyph.svelte';
  import Modal from '../Modal.svelte';

  let users: UserPublic[] = $state([]);
  let editing: UserPublic | 'new' | null = $state(null);
  let form = $state({ username: '', displayName: '', password: '', isAdmin: false });

  async function load() {
    users = (await get('/users')).users;
  }
  load();

  function open(u: UserPublic | 'new') {
    editing = u;
    form = u === 'new' ? { username: '', displayName: '', password: '', isAdmin: false } : { username: u.username, displayName: u.displayName, password: '', isAdmin: u.isAdmin };
  }

  async function save(e: SubmitEvent) {
    e.preventDefault();
    try {
      if (editing === 'new') await post('/users', form);
      else if (editing) await put(`/users/${editing.id}`, { ...form, password: form.password || undefined });
      toast('Gespeichert', 'ok');
      editing = null;
      await load();
    } catch (err) {
      toast((err as Error).message, 'bad');
    }
  }

  async function remove(u: UserPublic) {
    if (!confirm(`Benutzer „${u.username}“ und sein Dashboard löschen?`)) return;
    try {
      await del(`/users/${u.id}`);
      await load();
    } catch (err) {
      toast((err as Error).message, 'bad');
    }
  }
</script>

<div class="row-between">
  <div>
    <h2>Benutzer</h2>
    <p class="muted">Jeder Benutzer hat ein eigenes Dashboard und Theme. Administratoren verwalten Dienste und Benutzer.</p>
  </div>
  <button class="btn primary" onclick={() => open('new')}><Glyph name="plus" size={16} /> Benutzer anlegen</button>
</div>

<ul class="list card">
  {#each users as u (u.id)}
    <li class="item">
      <span class="avatar">{u.displayName.slice(0, 1).toUpperCase()}</span>
      <div class="info">
        <div class="name">{u.displayName} {#if u.isAdmin}<span class="chip">Admin</span>{/if}{#if u.id === app.user?.id}<span class="chip">Du</span>{/if}</div>
        <div class="muted sub">@{u.username} · seit {new Date(u.createdAt.replace(' ', 'T') + 'Z').toLocaleDateString('de-DE')}</div>
      </div>
      <button class="icon-btn" aria-label="{u.username} bearbeiten" onclick={() => open(u)}><Glyph name="edit" size={17} /></button>
      <button class="icon-btn" aria-label="{u.username} löschen" disabled={u.id === app.user?.id} onclick={() => remove(u)}><Glyph name="trash" size={17} /></button>
    </li>
  {/each}
</ul>

{#if editing}
  <Modal title={editing === 'new' ? 'Benutzer anlegen' : `${editing.username} bearbeiten`} onclose={() => (editing = null)} width={480}>
    <form id="user-form" class="form" onsubmit={save}>
      <label class="field"><span>Benutzername *</span><input class="input" required bind:value={form.username} autocomplete="off" /></label>
      <label class="field"><span>Anzeigename</span><input class="input" bind:value={form.displayName} /></label>
      <label class="field">
        <span>{editing === 'new' ? 'Passwort *' : 'Neues Passwort (optional)'}</span>
        <input class="input" type="password" autocomplete="new-password" required={editing === 'new'} minlength="8" bind:value={form.password} />
        <small>Mindestens 8 Zeichen{editing !== 'new' ? ' · meldet den Benutzer überall ab' : ''}</small>
      </label>
      <label class="check"><input type="checkbox" bind:checked={form.isAdmin} /> Administrator</label>
    </form>
    {#snippet footer()}
      <button class="btn" onclick={() => (editing = null)}>Abbrechen</button>
      <button class="btn primary" type="submit" form="user-form">Speichern</button>
    {/snippet}
  </Modal>
{/if}

<style>
  p {
    margin: 4px 0 0;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 6px;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 10px 12px;
    border-radius: var(--radius-sm);
  }
  .item:hover {
    background: var(--surface-2);
  }
  .avatar {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 600;
    flex: none;
  }
  .info {
    flex: 1;
    min-width: 0;
  }
  .name {
    font-weight: 500;
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .sub {
    font-size: 13px;
  }
  .form {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
</style>

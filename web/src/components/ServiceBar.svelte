<script lang="ts">
  import { app, linkTarget } from '../lib/store.svelte.ts';
  import Icon from './Icon.svelte';
</script>

{#if app.services.length}
  <nav class="services" aria-label="Dienste">
    {#each app.services as s (s.id)}
      {@const st = app.status[s.id]}
      <a class="svc card" href={s.publicUrl || '#'} target={linkTarget()} rel="noopener" title={st?.message ?? s.publicUrl}>
        <Icon name={s.icon} label={s.name} size={28} />
        <span class="text">
          <span class="name">{s.name}</span>
          <span class="ping mono">{st ? (st.ok ? `${st.ms} ms` : (st.message ?? 'offline')) : '…'}</span>
        </span>
        <span class="dot {st ? (st.ok ? 'bg-ok' : 'bg-bad') : ''}" aria-label={st ? (st.ok ? 'online' : 'offline') : 'unbekannt'}></span>
      </a>
    {/each}
  </nav>
{/if}

<style>
  .services {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(165px, 1fr));
    gap: 10px;
  }
  .svc {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: calc(10px * var(--space)) 12px;
    min-height: 52px;
    color: var(--text);
    text-decoration: none;
    border-radius: var(--radius-sm);
    min-width: 0;
    transition:
      border-color 0.15s,
      transform 0.15s;
  }
  .svc:hover {
    border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
    transform: translateY(-1px);
  }
  .text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .name {
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ping {
    font-size: 11px;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>

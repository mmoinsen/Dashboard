<script lang="ts">
  import { toasts } from '../lib/store.svelte.ts';
</script>

<div class="toasts" role="status" aria-live="polite">
  {#each toasts as t (t.id)}
    <div class="toast card {t.tone}">{t.text}</div>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    gap: 8px;
    z-index: 1000;
    pointer-events: none;
    width: min(420px, calc(100vw - 32px));
  }
  .toast {
    padding: 12px 16px;
    background: var(--surface-solid);
    box-shadow: var(--shadow);
    font-size: 14px;
    animation: pop 0.2s ease-out;
  }
  .toast.ok {
    border-color: color-mix(in srgb, var(--ok) 50%, var(--border));
  }
  .toast.bad {
    border-color: color-mix(in srgb, var(--bad) 60%, var(--border));
  }
  @keyframes pop {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
  }
</style>

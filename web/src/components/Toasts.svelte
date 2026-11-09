<script lang="ts">
  import { dismissToast, toasts } from '../lib/store.svelte.ts';
</script>

<div class="toasts" role="status" aria-live="polite">
  {#each toasts as t (t.id)}
    <div class="toast card {t.tone}">
      <span class="text">{t.text}</span>
      {#if t.action}
        <button
          class="btn small"
          onclick={() => {
            t.action!.run();
            dismissToast(t.id);
          }}>{t.action.label}</button
        >
      {/if}
    </div>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    bottom: max(20px, env(safe-area-inset-bottom));
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    gap: 8px;
    z-index: 1000;
    pointer-events: none;
    width: min(440px, calc(100vw - 32px));
  }
  .toast {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 10px 10px 16px;
    min-height: 48px;
    background: var(--surface-solid);
    box-shadow: var(--shadow);
    font-size: 14px;
    pointer-events: auto;
    animation: pop 0.2s ease-out;
  }
  .text {
    flex: 1;
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

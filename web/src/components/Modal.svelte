<script lang="ts">
  import type { Snippet } from 'svelte';
  import Glyph from './Glyph.svelte';

  let { title, onclose, children, footer, width = 560 }: { title: string; onclose: () => void; children: Snippet; footer?: Snippet; width?: number } = $props();

  let dialog: HTMLDialogElement;
  $effect(() => {
    dialog.showModal();
  });
</script>

<dialog bind:this={dialog} class="modal card" style="--w:{width}px" onclose={onclose} onclick={(e) => e.target === dialog && dialog.close()}>
  <header>
    <h2>{title}</h2>
    <button class="icon-btn" aria-label="Schließen" onclick={() => dialog.close()}><Glyph name="x" /></button>
  </header>
  <div class="body">{@render children()}</div>
  {#if footer}
    <footer>{@render footer()}</footer>
  {/if}
</dialog>

<style>
  .modal {
    width: min(var(--w), calc(100vw - 24px));
    max-height: calc(100vh - 48px);
    padding: 0;
    color: var(--text);
    background: var(--surface-solid);
    box-shadow: var(--shadow);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .modal[open] {
    display: flex;
  }
  .modal::backdrop {
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(3px);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 16px 8px 22px;
  }
  h2 {
    font-size: 19px;
  }
  .body {
    padding: 8px 22px 20px;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    flex-wrap: wrap;
    padding: 14px 22px;
    border-top: 1px solid var(--border);
  }
</style>

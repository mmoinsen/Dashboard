<script lang="ts">
  import type { Snippet } from 'svelte';
  import Glyph from './Glyph.svelte';

  let {
    title,
    onclose,
    children,
    footer,
    width = 560,
    confirmClose,
  }: {
    title: string;
    onclose: () => void;
    children: Snippet;
    footer?: Snippet;
    width?: number;
    /** Return false to keep the dialog open (e.g. unsaved changes). */
    confirmClose?: () => boolean;
  } = $props();

  let dialog: HTMLDialogElement;
  const titleId = `modal-title-${Math.random().toString(36).slice(2, 8)}`;
  $effect(() => {
    dialog.showModal();
  });

  function requestClose() {
    if (confirmClose && !confirmClose()) return;
    dialog.close();
  }
</script>

<dialog
  bind:this={dialog}
  class="modal card"
  style="--w:{width}px"
  aria-labelledby={titleId}
  onclose={onclose}
  oncancel={(e) => {
    e.preventDefault();
    requestClose();
  }}
  onclick={(e) => e.target === dialog && requestClose()}
>
  <header>
    <h2 id={titleId}>{title}</h2>
    <button class="icon-btn" aria-label="Schließen" onclick={requestClose}><Glyph name="x" /></button>
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
    overscroll-behavior: contain;
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

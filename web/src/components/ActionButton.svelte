<script lang="ts">
  import { actionGlyph } from '../lib/actions.ts';
  import { runAction } from '../lib/api.ts';
  import { openUrl, toast } from '../lib/store.svelte.ts';
  import type { ActionRef } from '../lib/types.ts';
  import Glyph from './Glyph.svelte';

  /**
   * Button for an integration action. `compact` = icon only (label as tooltip),
   * used inside list rows of small widgets.
   */
  let {
    action,
    ondone,
    small = true,
    primary = false,
    compact = false,
  }: { action: ActionRef; ondone?: () => void; small?: boolean; primary?: boolean; compact?: boolean } = $props();
  let busy = $state(false);
  let done = $state(false);

  const glyph = $derived(actionGlyph(action.action, action.label));
  const iconOnly = $derived(compact && !!glyph);

  async function run(e: MouseEvent) {
    e.stopPropagation();
    // "open" actions are plain links handled in the browser.
    if (action.action === 'open' && typeof action.params?.url === 'string') {
      openUrl(action.params.url, true);
      return;
    }
    if (action.confirm && !confirm(action.confirm)) return;
    busy = true;
    try {
      const r = await runAction(action);
      toast(r.message ?? (r.ok ? `${action.label}: erledigt` : 'Fehlgeschlagen'), r.ok ? 'ok' : 'bad');
      if (r.ok) {
        done = true;
        setTimeout(() => (done = false), 1200);
        ondone?.();
      }
    } catch (err) {
      toast((err as Error).message, 'bad');
    } finally {
      busy = false;
    }
  }
</script>

<button
  class="btn action"
  class:small
  class:icon-only={iconOnly}
  class:primary={primary || action.tone === 'accent'}
  class:danger={action.tone === 'bad'}
  disabled={busy}
  onclick={run}
  title={action.label}
  aria-label={action.label}
>
  {#if busy}
    <span class="spinner"></span>
  {:else if done}
    <Glyph name="check" size={15} stroke={2.4} />
  {:else if glyph}
    <Glyph name={glyph} size={15} stroke={2.1} />
  {/if}
  {#if !iconOnly}<span>{action.label}</span>{/if}
</button>

<style>
  .action {
    gap: 6px;
  }
  .icon-only {
    width: 32px;
    min-height: 32px;
    padding: 0;
    border-radius: 50%;
  }
  .action .spinner {
    width: 14px;
    height: 14px;
  }
</style>

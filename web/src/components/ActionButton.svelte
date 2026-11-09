<script lang="ts">
  import { runAction } from '../lib/api.ts';
  import { openUrl, toast } from '../lib/store.svelte.ts';
  import type { ActionRef } from '../lib/types.ts';

  let { action, ondone, small = true, primary = false }: { action: ActionRef; ondone?: () => void; small?: boolean; primary?: boolean } = $props();
  let busy = $state(false);

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
      toast(r.message ?? (r.ok ? 'Erledigt' : 'Fehlgeschlagen'), r.ok ? 'ok' : 'bad');
      if (r.ok) ondone?.();
    } catch (err) {
      toast((err as Error).message, 'bad');
    } finally {
      busy = false;
    }
  }
</script>

<button class="btn" class:small class:primary={primary || action.tone === 'accent'} class:danger={action.tone === 'bad'} disabled={busy} onclick={run}>
  {#if busy}<span class="spinner"></span>{/if}
  {action.label}
</button>

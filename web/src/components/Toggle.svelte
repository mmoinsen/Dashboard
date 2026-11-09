<script lang="ts">
  import { runAction } from '../lib/api.ts';
  import { toast } from '../lib/store.svelte.ts';
  import type { ToggleItem } from '../lib/types.ts';

  let { item, onchange, compact = false }: { item: ToggleItem; onchange?: () => void; compact?: boolean } = $props();

  // Optimistic local state so the switch reacts instantly.
  let on = $state(false);
  let level = $state(0);
  let busy = $state(false);
  $effect(() => {
    on = item.on;
    level = item.slider?.value ?? 0;
  });

  async function flip() {
    if (!item.action || item.readonly || busy) return;
    busy = true;
    on = !on;
    try {
      const r = await runAction(item.action);
      if (!r.ok) {
        on = !on;
        toast(r.message ?? 'Fehlgeschlagen', 'bad');
      } else if (r.message) toast(r.message, 'ok');
      setTimeout(() => onchange?.(), 400);
    } catch (e) {
      on = !on;
      toast((e as Error).message, 'bad');
    } finally {
      busy = false;
    }
  }

  async function slide() {
    if (!item.slider) return;
    try {
      const r = await runAction(item.slider.action, { value: level });
      if (!r.ok) toast(r.message ?? 'Fehlgeschlagen', 'bad');
      if (item.slider.unit === '%') on = level > 0;
      setTimeout(() => onchange?.(), 400);
    } catch (e) {
      toast((e as Error).message, 'bad');
    }
  }
</script>

<div class="toggle" class:on class:compact>
  <div class="top">
    <div class="text">
      <div class="title">{item.title}</div>
      {#if item.subtitle}<div class="sub">{item.subtitle}</div>{/if}
    </div>
    {#if item.action && !item.readonly}
      <button class="switch" role="switch" aria-checked={on} aria-label="{item.title} {on ? 'ausschalten' : 'einschalten'}" onclick={flip} disabled={busy}>
        <span></span>
      </button>
    {/if}
  </div>
  {#if item.slider}
    <label class="slider">
      <span class="sr-only">{item.slider.action.label}</span>
      <input type="range" min={item.slider.min} max={item.slider.max} step={item.slider.unit === '°C' ? 0.5 : 1} bind:value={level} onchange={slide} />
      <span class="val mono">{level}{item.slider.unit === '%' ? ' %' : ` ${item.slider.unit ?? ''}`}</span>
    </label>
  {/if}
</div>

<style>
  .toggle {
    padding: calc(12px * var(--space));
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    border: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 10px;
    transition:
      background 0.2s,
      border-color 0.2s;
  }
  .toggle.on {
    background: color-mix(in srgb, var(--accent) 12%, var(--surface-2));
    border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
  }
  .top {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .text {
    flex: 1;
    min-width: 0;
  }
  .title {
    font-weight: 500;
    font-size: 14px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sub {
    font-size: 12px;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .switch {
    width: 50px;
    height: 30px;
    border-radius: 999px;
    border: 0;
    padding: 3px;
    background: color-mix(in srgb, var(--muted) 45%, transparent);
    cursor: pointer;
    flex: none;
    display: flex;
    transition: background 0.2s;
  }
  .switch span {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: #fff;
    transition: transform 0.2s;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }
  .on .switch {
    background: var(--accent);
  }
  .on .switch span {
    transform: translateX(20px);
  }
  .slider {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .slider input {
    flex: 1;
    accent-color: var(--accent);
    min-height: 24px;
  }
  .val {
    font-size: 12px;
    color: var(--muted);
    min-width: 46px;
    text-align: right;
  }
</style>

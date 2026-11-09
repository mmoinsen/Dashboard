<script lang="ts">
  import { rangeFill } from '../lib/actions.ts';
  import { runAction } from '../lib/api.ts';
  import { toast } from '../lib/store.svelte.ts';
  import type { ToggleItem } from '../lib/types.ts';

  let { item, onchange, compact = false }: { item: ToggleItem; onchange?: () => void; compact?: boolean } = $props();

  // Optimistic local state so the switch reacts instantly.
  let on = $state(false);
  let level = $state(0);
  let busy = $state(false);
  let dragging = false;
  $effect(() => {
    on = item.on;
    if (!dragging) level = item.slider?.value ?? 0;
  });

  const unit = $derived(item.slider?.unit === '%' ? '%' : (item.slider?.unit ?? ''));

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
    dragging = false;
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

<div class="toggle" class:on class:compact class:readonly={item.readonly}>
  <div class="top">
    <div class="text">
      <div class="title clamp-2" title={item.title}>{item.title}</div>
      {#if item.subtitle}<div class="sub" title={item.subtitle}>{item.subtitle}</div>{/if}
    </div>
    {#if item.action && !item.readonly}
      <button class="switch" role="switch" aria-checked={on} aria-label="{item.title} {on ? 'ausschalten' : 'einschalten'}" onclick={flip} disabled={busy}>
        <span class="knob"></span>
      </button>
    {/if}
  </div>
  {#if item.slider}
    <div class="slider">
      <input
        type="range"
        min={item.slider.min}
        max={item.slider.max}
        step={item.slider.unit === '°C' ? 0.5 : 1}
        bind:value={level}
        use:rangeFill={level}
        oninput={() => (dragging = true)}
        onchange={slide}
        aria-label="{item.title}: {item.slider.action.label}"
      />
      <span class="val">{level.toLocaleString('de-DE')}<small>{unit}</small></span>
    </div>
  {/if}
</div>

<style>
  .toggle {
    padding: calc(12px * var(--space)) 14px;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
    transition:
      background 0.25s,
      border-color 0.25s,
      box-shadow 0.25s;
  }
  .toggle.on {
    background: color-mix(in srgb, var(--accent) 11%, var(--surface-2));
    border-color: color-mix(in srgb, var(--accent) 35%, transparent);
    box-shadow: inset 0 0 24px -12px color-mix(in srgb, var(--accent) 60%, transparent);
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
    line-height: 1.3;
  }
  .sub {
    margin-top: 2px;
    font-size: 12px;
    color: var(--muted);
    overflow-wrap: anywhere;
  }
  .on .sub {
    color: color-mix(in srgb, var(--accent) 55%, var(--text));
  }
  .switch {
    position: relative;
    width: 46px;
    height: 28px;
    flex: none;
    border-radius: 999px;
    border: 0;
    padding: 0;
    cursor: pointer;
    background: color-mix(in srgb, var(--muted) 38%, transparent);
    transition: background 0.25s;
  }
  .switch:disabled {
    cursor: progress;
  }
  .knob {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
    transition: transform 0.25s cubic-bezier(0.3, 1.4, 0.6, 1);
  }
  .on .switch {
    background: var(--accent);
  }
  .on .knob {
    transform: translateX(18px);
    /* contrast colour of the accent: stays visible on light accents (monochrome themes) */
    background: var(--accent-text);
    box-shadow: none;
  }
  .switch:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .slider {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .slider input {
    flex: 1;
    min-width: 0;
  }
  .val {
    flex: none;
    min-width: 52px;
    text-align: center;
    font-family: var(--font-mono);
    font-size: 12px;
    padding: 3px 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--muted) 15%, transparent);
  }
  .val small {
    font-size: 10px;
    margin-left: 2px;
    color: var(--muted);
  }
</style>

<script lang="ts">
  /**
   * Service icon. Accepts a dashboard-icons slug ("sonarr"), an "mdi-*" name
   * (rendered in the current text colour) or a full URL. Falls back to initials.
   */
  let { name = '', label = '', size = 32 }: { name?: string; label?: string; size?: number } = $props();

  let failed = $state(false);
  $effect(() => {
    name;
    failed = false;
  });

  const isUrl = $derived(/^(https?:)?\/\//.test(name) || name.startsWith('/') || name.startsWith('data:'));
  const isMdi = $derived(name.startsWith('mdi-'));
  const src = $derived(isUrl ? name : `/api/icons/${encodeURIComponent(name)}`);
  const initials = $derived(
    (label || name || '?')
      .replace(/[^\p{L}\p{N} ]/gu, ' ')
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?',
  );
  // Stable colour per label so letter avatars are distinguishable.
  const hue = $derived([...(label || name)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7));
</script>

{#if !name || failed}
  <span class="fallback" style="width:{size}px;height:{size}px;font-size:{Math.round(size * 0.38)}px;--h:{hue}" aria-hidden="true">{initials}</span>
{:else if isMdi}
  <span class="mdi" style="width:{size}px;height:{size}px;-webkit-mask-image:url({src});mask-image:url({src})" aria-hidden="true"></span>
  <img class="probe" {src} alt="" onerror={() => (failed = true)} />
{:else}
  <img class="icon" {src} alt="" width={size} height={size} loading="lazy" onerror={() => (failed = true)} />
{/if}

<style>
  .icon {
    object-fit: contain;
    flex: none;
    display: block;
  }
  .mdi {
    display: inline-block;
    flex: none;
    background: currentColor;
    -webkit-mask-size: contain;
    mask-size: contain;
    -webkit-mask-repeat: no-repeat;
    mask-repeat: no-repeat;
    -webkit-mask-position: center;
    mask-position: center;
  }
  .probe {
    display: none;
  }
  .fallback {
    display: inline-grid;
    place-items: center;
    flex: none;
    border-radius: 28%;
    font-family: var(--font-heading);
    font-weight: 600;
    background: hsl(var(--h) 45% 50% / 0.18);
    color: hsl(var(--h) 70% 72%);
  }
  :global(:root[style*='color-scheme: light']) .fallback {
    color: hsl(var(--h) 55% 35%);
  }
</style>

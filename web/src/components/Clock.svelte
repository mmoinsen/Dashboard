<script lang="ts">
  let { seconds = false, timezone, showDate = true }: { seconds?: boolean; timezone?: string; showDate?: boolean } = $props();
  let now = $state(new Date());

  $effect(() => {
    const t = setInterval(() => (now = new Date()), seconds ? 1000 : 10_000);
    return () => clearInterval(t);
  });

  const tz = $derived.by(() => {
    try {
      if (timezone) new Intl.DateTimeFormat('de-DE', { timeZone: timezone });
      return timezone || undefined;
    } catch {
      return undefined;
    }
  });
  const time = $derived(new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', second: seconds ? '2-digit' : undefined, timeZone: tz }).format(now));
  const date = $derived(new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz }).format(now));
</script>

<div class="clock">
  <div class="time">{time}</div>
  {#if showDate}<div class="date muted">{date}{tz ? ` · ${tz}` : ''}</div>{/if}
</div>

<style>
  .clock {
    padding: 4px 0;
  }
  .time {
    font-family: var(--font-heading);
    font-size: 46px;
    font-weight: 600;
    letter-spacing: -0.03em;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .date {
    margin-top: 8px;
    font-size: 14px;
  }
</style>

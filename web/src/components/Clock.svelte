<script lang="ts">
  /** Clock widget with several designs; the time comes from the browser, not the server. */
  let {
    seconds = false,
    timezone,
    showDate = true,
    style = 'digital',
    align = 'left',
    hour12 = false,
  }: {
    seconds?: boolean;
    timezone?: string;
    showDate?: boolean;
    style?: 'digital' | 'minimal' | 'analog' | 'words';
    align?: 'left' | 'center' | 'right';
    hour12?: boolean;
  } = $props();

  let now = $state(new Date());

  // Tick every second when seconds are shown (or for the analog second hand), otherwise
  // align to the next full minute so the display never lags behind.
  $effect(() => {
    const everySecond = seconds;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      now = new Date();
      const d = new Date();
      const wait = everySecond ? 1000 - d.getMilliseconds() : (60 - d.getSeconds()) * 1000 - d.getMilliseconds();
      timer = setTimeout(tick, wait + 20);
    };
    tick();
    return () => clearTimeout(timer);
  });

  const tz = $derived.by(() => {
    try {
      if (timezone) new Intl.DateTimeFormat('de-DE', { timeZone: timezone });
      return timezone || undefined;
    } catch {
      return undefined;
    }
  });

  /** Hours/minutes/seconds in the chosen time zone. */
  const parts = $derived.by(() => {
    const p = new Intl.DateTimeFormat('de-DE', { hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23', timeZone: tz }).formatToParts(now);
    const get = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
    return { h: get('hour'), m: get('minute'), s: get('second') };
  });

  const time = $derived(
    new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', second: seconds ? '2-digit' : undefined, hour12, timeZone: tz }).format(now),
  );
  const date = $derived(new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz }).format(now));
  const tzLabel = $derived(tz ? tz.split('/').pop()?.replace(/_/g, ' ') : '');

  // ---------- analog ----------
  const hourAngle = $derived(((parts.h % 12) + parts.m / 60) * 30);
  const minuteAngle = $derived((parts.m + parts.s / 60) * 6);
  const secondAngle = $derived(parts.s * 6);

  // ---------- words (German, rounded to 5 minutes) ----------
  const HOURS = ['zwölf', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf'];
  const words = $derived.by(() => {
    const m5 = Math.round((parts.m + parts.s / 60) / 5) * 5;
    let h = parts.h % 12;
    const next = (h + 1) % 12;
    const name = (x: number) => HOURS[x === 0 ? 12 : x];
    switch (m5) {
      case 0:
        return `${name(h) === 'eins' ? 'ein' : name(h)} Uhr`;
      case 5:
        return `fünf nach ${name(h)}`;
      case 10:
        return `zehn nach ${name(h)}`;
      case 15:
        return `Viertel nach ${name(h)}`;
      case 20:
        return `zwanzig nach ${name(h)}`;
      case 25:
        return `fünf vor halb ${name(next)}`;
      case 30:
        return `halb ${name(next)}`;
      case 35:
        return `fünf nach halb ${name(next)}`;
      case 40:
        return `zwanzig vor ${name(next)}`;
      case 45:
        return `Viertel vor ${name(next)}`;
      case 50:
        return `zehn vor ${name(next)}`;
      case 55:
        return `fünf vor ${name(next)}`;
      default:
        return `${name(next) === 'eins' ? 'ein' : name(next)} Uhr`;
    }
  });
</script>

<div class="clock {style} align-{align}" role="timer" aria-label="{time}, {date}{tz ? `, Zeitzone ${tz}` : ''}">
  {#if style === 'analog'}
    <svg class="face" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="47" class="rim" />
      {#each Array(60) as _, i}
        {#if i % 5 === 0}
          <line x1="50" y1="6" x2="50" y2="13" class="tick major" transform="rotate({i * 6} 50 50)" />
        {:else}
          <line x1="50" y1="6" x2="50" y2="9" class="tick" transform="rotate({i * 6} 50 50)" />
        {/if}
      {/each}
      <line x1="50" y1="54" x2="50" y2="26" class="hand hour" transform="rotate({hourAngle} 50 50)" />
      <line x1="50" y1="56" x2="50" y2="15" class="hand minute" transform="rotate({minuteAngle} 50 50)" />
      {#if seconds}
        <line x1="50" y1="60" x2="50" y2="11" class="hand second" transform="rotate({secondAngle} 50 50)" />
      {/if}
      <circle cx="50" cy="50" r="2.6" class="pin" />
    </svg>
    {#if showDate}<div class="date">{date}{tzLabel ? ` · ${tzLabel}` : ''}</div>{/if}
  {:else if style === 'words'}
    <div class="words"><span class="muted">Es ist</span> {words}</div>
    <div class="sub">{time}{showDate ? ` · ${date}` : ''}{tzLabel ? ` · ${tzLabel}` : ''}</div>
  {:else}
    <div class="time">{time}</div>
    {#if showDate}<div class="date">{date}{tzLabel ? ` · ${tzLabel}` : ''}</div>{/if}
  {/if}
</div>

<style>
  .clock {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 4px 0;
    container-type: inline-size;
  }
  .align-left {
    align-items: flex-start;
    text-align: left;
  }
  .align-center {
    align-items: center;
    text-align: center;
  }
  .align-right {
    align-items: flex-end;
    text-align: right;
  }
  .time {
    font-family: var(--font-heading);
    font-weight: 600;
    letter-spacing: -0.03em;
    line-height: 1;
    font-variant-numeric: tabular-nums;
    font-size: clamp(34px, 22cqi, 64px);
  }
  .minimal .time {
    font-weight: 300;
    letter-spacing: -0.05em;
    font-size: clamp(44px, 30cqi, 96px);
  }
  .minimal .date {
    text-transform: uppercase;
    letter-spacing: 0.14em;
    font-size: 12px;
  }
  .date,
  .sub {
    color: var(--muted);
    font-size: 14px;
  }
  .words {
    font-family: var(--font-heading);
    font-weight: 600;
    font-size: clamp(22px, 11cqi, 36px);
    line-height: 1.15;
    text-wrap: balance;
  }
  .words .muted {
    font-weight: 400;
  }
  .sub {
    font-variant-numeric: tabular-nums;
  }
  .face {
    width: min(100%, 180px);
    aspect-ratio: 1;
    display: block;
  }
  .rim {
    fill: var(--surface-2);
    stroke: var(--border);
    stroke-width: 1;
  }
  .tick {
    stroke: var(--muted);
    stroke-width: 0.8;
    stroke-linecap: round;
  }
  .tick.major {
    stroke: var(--text);
    stroke-width: 1.8;
  }
  .hand {
    stroke-linecap: round;
  }
  .hand.hour {
    stroke: var(--text);
    stroke-width: 4;
  }
  .hand.minute {
    stroke: var(--text);
    stroke-width: 2.6;
  }
  .hand.second {
    stroke: var(--accent);
    stroke-width: 1.2;
  }
  .pin {
    fill: var(--accent);
  }
</style>

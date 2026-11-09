<script lang="ts">
  import { get, post, runAction, streamSearch } from '../lib/api.ts';
  import { app, integration, navigate, openUrl, saveUserSettings, toast } from '../lib/store.svelte.ts';
  import { PRESETS } from '../lib/themes.ts';
  import { CATEGORY_BANGS, calculate, looksLikeUrl, parseQuery, webIntent, type SearchResult } from '../lib/types.ts';
  import { copyText } from '../lib/id.ts';
  import ActionButton from './ActionButton.svelte';
  import Glyph from './Glyph.svelte';
  import Icon from './Icon.svelte';
  import Toggle from './Toggle.svelte';

  let { seed = '', onclose }: { seed?: string; onclose: () => void } = $props();

  interface Item extends SearchResult {
    exec?: () => void;
    glyph?: string;
    hint?: string;
    iconLabel?: string;
  }
  interface ProviderState {
    name: string;
    icon: string;
    loading: boolean;
    error?: string;
    results: SearchResult[];
  }

  let query = $state(seed);
  let providers: Record<string, ProviderState> = $state({});
  let suggestions: string[] = $state([]);
  let streaming = $state(false);
  let selectedId = $state<string | null>(null);
  let navigated = $state(false);
  let expanded: Record<string, boolean> = $state({});
  let input: HTMLInputElement;
  let listEl: HTMLDivElement;

  const parsed = $derived(parseQuery(query));
  const engines = $derived(app.settings?.search.engines ?? []);
  const engine = $derived(engines.find((e) => e.id === (app.user?.settings.searchEngine ?? app.settings?.search.defaultEngine)) ?? engines[0]);
  const webBang = $derived(parsed.bang ? engines.find((e) => e.bang === parsed.bang) : undefined);
  const homelabBang = $derived.by(() => {
    const b = parsed.bang;
    if (!b || webBang) return null;
    const svc = app.services.find((s) => s.id.toLowerCase() === b);
    if (svc) return svc.name;
    const integ = app.integrations.find((i) => i.bang === b && app.services.some((s) => s.type === i.id));
    if (integ) return integ.name;
    return CATEGORY_BANGS[b]?.label ?? null;
  });

  function engineUrl(e: { url: string }, text: string) {
    return e.url.replace('{q}', encodeURIComponent(text));
  }

  function webSearch(text = parsed.text || query, e = webBang ?? engine) {
    if (!e || !text.trim()) return;
    openUrl(engineUrl(e, text));
  }

  // ---------- local result sources ----------

  function score(q: string, ...texts: (string | undefined)[]) {
    const n = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const nq = n(q);
    let best = 0;
    for (const t of texts) {
      if (!t) continue;
      const nt = n(t);
      if (nt === nq) best = Math.max(best, 1);
      else if (nt.startsWith(nq)) best = Math.max(best, 0.92);
      else if (nt.split(/[\s\-_.]+/).some((w) => w.startsWith(nq))) best = Math.max(best, 0.8);
      else if (nt.includes(nq)) best = Math.max(best, 0.65);
    }
    return best;
  }

  const commands = $derived<Item[]>([
    ...(app.dashboard?.pages ?? []).map((p) => ({
      id: `cmd:page:${p.id}`,
      title: `Seite „${p.name}“ öffnen`,
      group: 'Befehle',
      kind: 'command' as const,
      score: 0.5,
      glyph: 'layout',
      exec: () => navigate(`/p/${p.id}`),
    })),
    { id: 'cmd:edit', title: app.editing ? 'Bearbeiten beenden' : 'Dashboard bearbeiten', group: 'Befehle', kind: 'command', score: 0.5, glyph: 'edit', exec: () => ((app.editing = !app.editing), navigate('/')) },
    { id: 'cmd:settings', title: 'Einstellungen', group: 'Befehle', kind: 'command', score: 0.5, glyph: 'settings', exec: () => navigate('/settings/appearance') },
    ...(app.user?.isAdmin
      ? [
          { id: 'cmd:services', title: 'Dienste verwalten', group: 'Befehle', kind: 'command' as const, score: 0.5, glyph: 'server', exec: () => navigate('/settings/services') },
          { id: 'cmd:users', title: 'Benutzer verwalten', group: 'Befehle', kind: 'command' as const, score: 0.5, glyph: 'users', exec: () => navigate('/settings/users') },
        ]
      : []),
    ...[...(app.user?.settings.customThemes ?? []), ...PRESETS].map((t) => ({
      id: `cmd:theme:${t.id}`,
      title: `Theme: ${t.name}`,
      group: 'Befehle',
      kind: 'command' as const,
      score: 0.5,
      glyph: 'palette',
      exec: () => saveUserSettings({ theme: t.id }),
    })),
    {
      id: 'cmd:logout',
      title: 'Abmelden',
      group: 'Befehle',
      kind: 'command',
      score: 0.5,
      glyph: 'logout',
      exec: async () => {
        await post('/auth/logout');
        location.reload();
      },
    },
  ]);

  function bangHints(partial: string): Item[] {
    const list: { bang: string; label: string; icon?: string }[] = [
      ...engines.map((e) => ({ bang: e.bang, label: e.name, icon: e.icon })),
      ...app.integrations.filter((i) => i.bang && app.services.some((s) => s.type === i.id)).map((i) => ({ bang: i.bang!, label: i.name, icon: i.icon })),
      ...Object.entries(CATEGORY_BANGS).map(([bang, c]) => ({ bang, label: `Alle ${c.label}-Dienste` })),
    ];
    return list
      .filter((b) => b.bang.startsWith(partial))
      .map((b) => ({
        id: `bang:${b.bang}`,
        title: `!${b.bang}`,
        subtitle: b.label,
        glyph: 'command',
        group: 'Präfixe',
        kind: 'command' as const,
        score: 0.9,
        exec: () => {
          query = `!${b.bang} `;
          input.focus();
        },
        hint: 'Tab',
      }));
  }

  const items = $derived.by<Item[]>(() => {
    const text = parsed.text;
    // ">" command mode
    if (parsed.command) {
      return commands
        .map((c) => ({ ...c, score: text ? score(text, c.title) : 0.5 }))
        .filter((c) => !text || c.score > 0)
        .sort((a, b) => b.score - a.score);
    }
    // "!" alone or partial prefix: show available prefixes
    if (/^![\p{L}\p{N}_-]*$/u.test(query.trim()) && !webBang && !homelabBang) return bangHints(query.trim().slice(1).toLowerCase());

    const out: Item[] = [];
    if (!text) return out;

    // Web-only mode ("!g katzen")
    if (webBang) {
      out.push({ id: 'web:main', title: `„${text}“ mit ${webBang.name} suchen`, glyph: 'globe', group: 'Web', kind: 'web', score: 1, exec: () => webSearch(text, webBang) });
      suggestions.forEach((s, i) => out.push({ id: `web:s:${s}`, title: s, group: 'Web', kind: 'web', score: 0.9 - i * 0.01, glyph: 'search', exec: () => webSearch(s, webBang) }));
      return out;
    }

    const calc = calculate(text);
    if (calc != null) {
      const v = Number(calc.toPrecision(12));
      out.push({
        id: 'calc',
        title: `= ${v.toLocaleString('de-DE', { maximumFractionDigits: 10 })}`,
        subtitle: 'Enter kopiert das Ergebnis',
        group: 'Rechner',
        kind: 'command',
        score: 0.99,
        glyph: 'calculator',
        exec: async () => {
          const ok = await copyText(String(v));
          toast(ok ? 'Ergebnis kopiert' : 'Kopieren nicht möglich', ok ? 'ok' : 'bad');
        },
      });
    }
    const url = looksLikeUrl(text);
    if (url) out.push({ id: 'url', title: url, subtitle: 'Adresse öffnen', group: 'Öffnen', kind: 'command', score: 0.97, glyph: 'external', exec: () => openUrl(url) });

    if (!homelabBang) {
      for (const s of app.services) {
        const sc = score(text, s.name, s.type, integration(s.type)?.name);
        if (sc >= 0.65) out.push({ id: `svc:${s.id}`, title: s.name, subtitle: `${integration(s.type)?.name ?? s.type} öffnen · ${s.publicUrl}`, icon: s.icon, url: s.publicUrl, group: 'Dienste', kind: 'service', score: sc * 0.93 });
      }
      for (const c of commands) {
        const sc = score(text, c.title);
        if (sc >= 0.8) out.push({ ...c, score: sc * 0.55 });
      }
    }

    for (const p of Object.values(providers)) out.push(...p.results);

    // Web search: rank by how "webby" the query looks; if the homelab has nothing good, put it first.
    const bestLocal = out.reduce((m, r) => Math.max(m, r.score), 0);
    let w = homelabBang ? 0.05 : webIntent(text);
    if (!homelabBang && !streaming && bestLocal < 0.6) w = Math.max(w, 0.9);
    if (engine) {
      out.push({ id: 'web:main', title: `„${text}“ mit ${engine.name} suchen`, subtitle: homelabBang ? undefined : 'Ctrl ↵ springt immer direkt hierher', glyph: 'globe', group: 'Web', kind: 'web', score: w, exec: () => webSearch(text) });
      if (!homelabBang) suggestions.slice(0, 4).forEach((s, i) => out.push({ id: `web:s:${s}`, title: s, group: 'Web', kind: 'web', score: w - 0.02 - i * 0.005, glyph: 'search', exec: () => webSearch(s) }));
    }
    return out;
  });

  /** Group, order groups by their best hit, cap long groups. */
  const groups = $derived.by(() => {
    const map = new Map<string, Item[]>();
    for (const it of items) {
      if (!map.has(it.group)) map.set(it.group, []);
      map.get(it.group)!.push(it);
    }
    const explicit = Boolean(homelabBang);
    return [...map.entries()]
      .map(([name, list]) => {
        const sorted = [...list].sort((a, b) => b.score - a.score);
        const cap = expanded[name] || explicit ? 30 : name === 'Web' ? 5 : 4;
        return { name, items: sorted.slice(0, cap), more: Math.max(sorted.length - cap, 0), top: sorted[0]?.score ?? 0 };
      })
      .sort((a, b) => b.top - a.top);
  });

  const flat = $derived(groups.flatMap((g) => g.items));
  const selected = $derived(flat.find((i) => i.id === selectedId) ?? flat[0]);

  // Until the user moves the selection, always keep the best hit selected.
  $effect(() => {
    if (!navigated) selectedId = flat[0]?.id ?? null;
  });

  // ---------- remote search ----------

  let controller: AbortController | null = null;
  $effect(() => {
    const q = query;
    const p = parseQuery(q);
    navigated = false;
    expanded = {};
    controller?.abort();
    const ctrl = new AbortController();
    controller = ctrl;
    const wantsRemote = !p.command && p.text.length >= 2 && !(p.bang && engines.some((e) => e.bang === p.bang));
    const wantsSuggest = !p.command && p.text.length >= 2 && (!p.bang || engines.some((e) => e.bang === p.bang));
    const timer = setTimeout(async () => {
      if (wantsSuggest) {
        get(`/search/suggest?q=${encodeURIComponent(p.text)}`)
          .then((r) => !ctrl.signal.aborted && (suggestions = r.suggestions))
          .catch(() => {});
      } else suggestions = [];
      if (!wantsRemote) {
        providers = {};
        streaming = false;
        return;
      }
      streaming = true;
      try {
        await streamSearch(q, ctrl.signal, (e) => {
          if (ctrl.signal.aborted) return;
          if (e.type === 'start') providers = Object.fromEntries(e.providers.map((pr) => [pr.id, { name: pr.name, icon: pr.icon, loading: true, results: [] }]));
          else if (e.type === 'results') providers[e.provider] = { name: e.name, icon: e.icon, loading: false, results: e.results.map((r) => ({ ...r, icon: r.icon ?? (r.image ? undefined : e.icon), iconLabel: r.icon ? r.title : e.name })) };
          else if (e.type === 'error') providers[e.provider] = { name: e.name, icon: '', loading: false, error: e.error, results: [] };
        });
      } catch {
        /* aborted */
      } finally {
        if (!ctrl.signal.aborted) streaming = false;
      }
    }, 160);
    return () => clearTimeout(timer);
  });

  $effect(() => {
    input?.focus();
    const len = input?.value.length ?? 0;
    input?.setSelectionRange(len, len);
  });

  // ---------- execution ----------

  function execute(it: Item | undefined, opts: { newTab?: boolean } = {}) {
    if (!it) return;
    if (it.exec) {
      it.exec();
      if (it.group !== 'Präfixe' && it.id !== 'calc') onclose();
      return;
    }
    if (it.toggle?.action) {
      const t = it.toggle;
      runAction(t.action!)
        .then((r) => {
          if (!r.ok) toast(r.message ?? 'Fehlgeschlagen', 'bad');
          else t.on = !t.on;
        })
        .catch((e) => toast(e.message, 'bad'));
      return;
    }
    if (it.url) {
      openUrl(it.url, opts.newTab);
      onclose();
      return;
    }
    // Items with only actions (e.g. "add to Radarr"): never run on Enter, focus the button instead.
    document.querySelector<HTMLButtonElement>('.detail .btn, .result.selected .btn')?.focus();
  }

  function move(delta: number) {
    if (!flat.length) return;
    navigated = true;
    const i = flat.findIndex((x) => x.id === selected?.id);
    const next = flat[(i + delta + flat.length) % flat.length];
    selectedId = next.id;
    queueMicrotask(() => listEl?.querySelector('.result.selected')?.scrollIntoView({ block: 'nearest' }));
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      move(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      move(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) webSearch();
      else execute(selected, { newTab: e.shiftKey });
      if (e.ctrlKey || e.metaKey) onclose();
    } else if (e.key === 'Tab' && selected?.group === 'Präfixe') {
      e.preventDefault();
      execute(selected);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (query) query = '';
      else onclose();
    }
  }

  const loadingProviders = $derived(Object.values(providers).filter((p) => p.loading));
  const failedProviders = $derived(Object.values(providers).filter((p) => p.error));
  const showDetail = $derived(Boolean(selected?.detail));
</script>

<div class="overlay" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
  <div class="palette card" role="dialog" aria-modal="true" aria-label="Suche">
    <div class="bar">
      <Glyph name="search" size={20} />
      {#if homelabBang || webBang}
        <span class="scope">{webBang ? webBang.name : homelabBang}</span>
      {/if}
      <input
        bind:this={input}
        bind:value={query}
        {onkeydown}
        placeholder="Suchen, steuern, starten … (! für Präfixe, > für Befehle)"
        aria-label="Suche"
        aria-controls="search-results"
        aria-activedescendant={selected ? `r-${selected.id}` : undefined}
        autocomplete="off"
        spellcheck="false"
      />
      {#if streaming}<span class="spinner" title="Suche läuft"></span>{/if}
      <button class="kbd esc" onclick={onclose}>Esc</button>
    </div>

    <div class="body" class:with-detail={showDetail}>
      <div class="results" id="search-results" role="listbox" bind:this={listEl}>
        {#if !query.trim()}
          <div class="intro">
            <p>Eine Suche für alles: Dienste, Filme, Serien, Geräte, Container – und das Web.</p>
            <div class="tips">
              <span><span class="kbd">!g</span> nur Google</span>
              <span><span class="kbd">!jf</span> nur Jellyfin</span>
              <span><span class="kbd">!ha</span> nur Home Assistant</span>
              <span><span class="kbd">!m</span> alle Mediendienste</span>
              <span><span class="kbd">&gt;</span> Befehle</span>
              <span><span class="kbd">Ctrl ↵</span> direkt ins Web</span>
            </div>
          </div>
        {/if}
        {#each groups as g (g.name)}
          <div class="group">
            <div class="group-title">{g.name}</div>
            {#each g.items as it (it.id)}
              <div
                id="r-{it.id}"
                class="result"
                class:selected={selected?.id === it.id}
                role="option"
                aria-selected={selected?.id === it.id}
                tabindex="-1"
                onmousemove={() => {
                  if (selectedId !== it.id) {
                    navigated = true;
                    selectedId = it.id;
                  }
                }}
                onclick={(e) => !(e.target as HTMLElement).closest('button, input, a') && execute(it)}
                onkeydown={() => {}}
              >
                {#if it.image}
                  <img class="thumb" src={it.image} alt="" loading="lazy" />
                {:else if it.icon}
                  <span class="lead"><Icon name={it.icon} label={it.iconLabel ?? it.title} size={26} /></span>
                {:else}
                  <span class="lead glyph"><Glyph name={it.glyph ?? (it.kind === 'web' ? 'globe' : 'box')} /></span>
                {/if}
                {#if it.toggle}
                  <div class="toggle-wrap"><Toggle item={it.toggle} compact /></div>
                {:else}
                  <div class="main">
                    <div class="title">{it.title}</div>
                    {#if it.subtitle}<div class="sub">{it.subtitle}</div>{/if}
                  </div>
                  {#if it.actions?.length && !it.detail}
                    <div class="row-actions">
                      {#each it.actions.slice(0, 2) as a}<ActionButton action={a} />{/each}
                    </div>
                  {/if}
                  {#if it.hint && selected?.id === it.id}<span class="kbd">{it.hint}</span>{:else if selected?.id === it.id && (it.url || it.exec)}<span class="kbd">↵</span>{/if}
                {/if}
              </div>
            {/each}
            {#if g.more}
              <button class="more" onclick={() => (expanded[g.name] = true)}>{g.more} weitere anzeigen</button>
            {/if}
          </div>
        {/each}
        {#if query.trim() && !flat.length && !streaming}
          <div class="intro"><p>Keine Treffer.</p></div>
        {/if}
      </div>

      {#if showDetail && selected?.detail}
        {@const d = selected.detail}
        <aside class="detail">
          <div class="d-head">
            {#if d.image}<img class="poster" src={d.image} alt="" />{/if}
            <div class="d-title">
              <h3>{d.title}</h3>
              {#if d.meta?.length}<div class="d-meta">{d.meta.join(' · ')}</div>{/if}
            </div>
          </div>
          {#if d.description}<p class="d-desc">{d.description}</p>{/if}
          {#if d.progress != null}
            <div class="track"><div class="fill" style="width:{d.progress}%"></div></div>
            {#if d.progressLabel}<div class="d-meta">{d.progressLabel}</div>{/if}
          {/if}
          <div class="d-actions">
            {#each selected.actions ?? [] as a, i}<ActionButton action={a} small={false} primary={i === 0} />{/each}
            {#if selected.url}
              <button class="btn" onclick={() => openUrl(selected!.url!, true)}><Glyph name="external" size={16} /> Öffnen</button>
            {/if}
          </div>
          {#if d.source}<div class="d-source">Quelle: {d.source}</div>{/if}
        </aside>
      {/if}
    </div>

    {#if query.trim() && (loadingProviders.length || failedProviders.length || (engines.length && !parsed.command))}
      <footer>
        {#if loadingProviders.length}
          <span class="muted">Frage {loadingProviders.map((p) => p.name).join(', ')} …</span>
        {/if}
        {#each failedProviders as p}
          <span class="tone-warn" title={p.error}>{p.name}: {p.error}</span>
        {/each}
        {#if !parsed.command && parsed.text}
          <span class="engines">
            {#each engines.filter((e) => e.id !== (webBang ?? engine)?.id).slice(0, 5) as e (e.id)}
              <button class="chip" onclick={() => (webSearch(parsed.text, e), onclose())}>{e.name}</button>
            {/each}
          </span>
        {/if}
      </footer>
    {/if}
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding: min(12vh, 120px) 12px 24px;
  }
  .palette {
    width: min(980px, 100%);
    max-height: calc(100vh - min(12vh, 120px) - 24px);
    display: flex;
    flex-direction: column;
    background: var(--surface-solid);
    box-shadow: var(--shadow);
    overflow: hidden;
    animation: drop 0.14s ease-out;
  }
  @keyframes drop {
    from {
      opacity: 0;
      transform: translateY(-6px);
    }
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border);
    color: var(--accent);
  }
  .bar input {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: 0;
    outline: none;
    font-size: 19px;
    color: var(--text);
  }
  .scope {
    font-size: 12px;
    padding: 4px 10px;
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent);
    white-space: nowrap;
  }
  .esc {
    background: transparent;
    cursor: pointer;
  }
  .body {
    display: flex;
    min-height: 0;
    flex: 1;
  }
  .results {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
    padding: 6px 8px 10px;
  }
  .group-title {
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
    padding: 12px 12px 6px;
  }
  .result {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    min-height: 48px;
    border: 1px solid transparent;
  }
  .result.selected {
    background: var(--surface-2);
    border-color: var(--border);
  }
  .thumb {
    width: 34px;
    height: 50px;
    border-radius: 5px;
    object-fit: cover;
    flex: none;
    background: var(--surface-2);
  }
  .lead {
    width: 34px;
    display: grid;
    place-items: center;
    flex: none;
  }
  .lead.glyph {
    color: var(--muted);
  }
  .main {
    flex: 1;
    min-width: 0;
  }
  .title {
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sub {
    font-size: 12px;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .toggle-wrap {
    flex: 1;
    min-width: 0;
  }
  .toggle-wrap :global(.toggle) {
    background: transparent;
    border: 0;
    padding: 0;
  }
  .row-actions {
    display: flex;
    gap: 6px;
    flex: none;
  }
  .more {
    margin: 2px 12px 4px 58px;
    background: none;
    border: 0;
    color: var(--accent);
    cursor: pointer;
    font-size: 13px;
    padding: 4px 0;
  }
  .intro {
    padding: 18px 14px;
    color: var(--muted);
  }
  .intro p {
    margin: 0 0 14px;
  }
  .tips {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 18px;
    font-size: 13px;
  }
  .tips .kbd {
    margin-right: 6px;
    color: var(--text);
  }
  .detail {
    width: 340px;
    flex: none;
    border-left: 1px solid var(--border);
    padding: 22px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    overflow-y: auto;
    background: color-mix(in srgb, var(--surface-2) 50%, transparent);
  }
  .d-head {
    display: flex;
    gap: 14px;
  }
  .poster {
    width: 96px;
    border-radius: var(--radius-sm);
    object-fit: cover;
    aspect-ratio: 2 / 3;
    flex: none;
    background: var(--surface-2);
  }
  .d-title h3 {
    font-size: 20px;
  }
  .d-meta {
    font-size: 12px;
    color: var(--muted);
    margin-top: 6px;
  }
  .d-desc {
    margin: 0;
    font-size: 13px;
    line-height: 1.55;
    color: color-mix(in srgb, var(--text) 85%, var(--muted));
    display: -webkit-box;
    -webkit-line-clamp: 8;
    line-clamp: 8;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .track {
    height: 4px;
    border-radius: 2px;
    background: color-mix(in srgb, var(--muted) 20%, transparent);
  }
  .fill {
    height: 100%;
    background: var(--accent);
    border-radius: inherit;
  }
  .d-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .d-source {
    font-size: 12px;
    color: var(--muted);
  }
  footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 16px;
    padding: 10px 20px;
    border-top: 1px solid var(--border);
    font-size: 12px;
  }
  .engines {
    margin-left: auto;
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .engines .chip {
    border: 0;
    cursor: pointer;
  }
  .engines .chip:hover {
    color: var(--text);
  }
  @media (max-width: 760px) {
    .detail {
      display: none;
    }
    .overlay {
      padding-top: 12px;
    }
    .palette {
      max-height: calc(100vh - 24px);
    }
  }
</style>

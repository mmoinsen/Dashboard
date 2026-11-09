<script lang="ts">
  import { app, navigate, saveDashboard, toast } from '../lib/store.svelte.ts';
  import { GRID_COLUMNS, compact, totalHeight, type DashboardPage, type WidgetInstance } from '../lib/types.ts';
  import Glyph from './Glyph.svelte';
  import ServiceBar from './ServiceBar.svelte';
  import Widget from './Widget.svelte';
  import WidgetDetail from './WidgetDetail.svelte';
  import WidgetEditor from './WidgetEditor.svelte';

  let { page }: { page: DashboardPage } = $props();

  let editorFor: WidgetInstance | 'new' | null = $state(null);

  // The open detail view lives in the URL (#/p/<page>?detail=<widget>): deep-linkable,
  // and the browser's back button closes it.
  const detailId = $derived(new URLSearchParams(app.route.split('?')[1] ?? '').get('detail'));
  const detailFor = $derived(detailId ? (page.widgets.find((w) => w.id === detailId) ?? null) : null);
  let openedHere = false;
  function openDetail(w: WidgetInstance) {
    openedHere = true;
    navigate(`/p/${page.id}?detail=${encodeURIComponent(w.id)}`);
  }
  function closeDetail() {
    if (openedHere) history.back();
    else navigate(`/p/${page.id}`);
    openedHere = false;
  }

  const greeting = $derived.by(() => {
    const h = new Date().getHours();
    const name = app.user?.displayName ?? '';
    const g = h < 5 ? 'Gute Nacht' : h < 11 ? 'Guten Morgen' : h < 17 ? 'Hallo' : h < 22 ? 'Guten Abend' : 'Gute Nacht';
    return `${g}, ${name}.`;
  });
  const offline = $derived(app.services.filter((s) => app.status[s.id] && !app.status[s.id].ok));
  const online = $derived(app.services.filter((s) => app.status[s.id]?.ok).length);

  // ---------- layout ----------
  // 12 columns on desktop, 6 on tablets, 1 on phones. Widgets fall up into free space,
  // so there are no gaps; in edit mode they can be dragged to any column and resized.

  const GAP = 16;
  let gridWidth = $state(0);
  let heights: Record<string, number> = $state({});
  let ready = $state(false);
  const cols = $derived(gridWidth >= 980 ? GRID_COLUMNS : gridWidth >= 620 ? 6 : 1);
  const colW = $derived(cols ? (gridWidth - GAP * (cols - 1)) / cols : 0);
  const canArrange = $derived(app.editing && cols === GRID_COLUMNS);

  interface Drag {
    id: string;
    mode: 'move' | 'resize';
    startX: number;
    startY: number;
    origLeft: number;
    origTop: number;
    origWidth: number;
    left: number;
    top: number;
    targetX: number;
    targetW: number;
  }
  let drag = $state<Drag | null>(null);

  const placed = $derived(
    compact(
      page.widgets.map((w) => {
        const d = drag?.id === w.id ? drag : null;
        return {
          id: w.id,
          x: d ? d.targetX : (w.x ?? 0),
          w: d ? d.targetW : (w.w ?? 3),
          // while moving, the pointer position decides the order
          y: d && d.mode === 'move' ? d.top : (w.y ?? 0),
          h: heights[w.id] ?? 180,
        };
      }),
      cols,
      GAP,
      drag?.id,
    ),
  );
  const slots = $derived(new Map(placed.map((p) => [p.id, p])));
  const gridHeight = $derived(totalHeight(placed));

  const px = (x: number) => x * (colW + GAP);
  const widthPx = (w: number) => w * colW + (w - 1) * GAP;

  /** Report rendered heights back into the layout. */
  function measure(node: HTMLElement, id: string) {
    const ro = new ResizeObserver(() => {
      const h = node.offsetHeight;
      if (h && heights[id] !== h) heights[id] = h;
    });
    ro.observe(node);
    return { destroy: () => ro.disconnect() };
  }

  // Enable movement animations only after the first real measurement (no fly-in on load).
  $effect(() => {
    if (!ready && gridWidth && page.widgets.every((w) => heights[w.id])) requestAnimationFrame(() => (ready = true));
  });

  /** Store the rendered order as y, so the saved layout matches what you see. */
  function normalizeOrder() {
    for (const w of page.widgets) {
      const s = slots.get(w.id);
      if (s) w.y = s.top + s.x / 100;
    }
  }

  function startDrag(e: PointerEvent, w: WidgetInstance, mode: 'move' | 'resize') {
    if (!canArrange || e.button !== 0) return;
    if (mode === 'move' && (e.target as HTMLElement).closest('button, a, input, select, textarea, label, .resize')) return;
    const s = slots.get(w.id);
    if (!s) return;
    e.preventDefault();
    e.stopPropagation();
    normalizeOrder();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag = {
      id: w.id,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      origLeft: px(s.x),
      origTop: s.top,
      origWidth: widthPx(s.w),
      left: px(s.x),
      top: s.top,
      targetX: s.x,
      targetW: s.w,
    };
  }

  function moveDrag(e: PointerEvent) {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (drag.mode === 'move') {
      drag.left = drag.origLeft + dx;
      drag.top = drag.origTop + dy;
      drag.targetX = Math.min(Math.max(Math.round(drag.left / (colW + GAP)), 0), GRID_COLUMNS - drag.targetW);
    } else {
      const startX = slots.get(drag.id)?.x ?? 0;
      drag.targetW = Math.min(Math.max(Math.round((drag.origWidth + dx + GAP) / (colW + GAP)), 2), GRID_COLUMNS - startX);
    }
  }

  function endDrag() {
    if (!drag) return;
    const w = page.widgets.find((x) => x.id === drag!.id);
    if (w) {
      w.x = drag.targetX;
      w.w = drag.targetW;
      if (drag.mode === 'move') w.y = drag.top;
    }
    drag = null;
    // let the layout settle, then persist the visible order
    queueMicrotask(() => {
      normalizeOrder();
      saveDashboard();
    });
  }

  /** Free spot for a new widget: as high as possible, then as far left as possible. */
  function findSlot(width: number): { x: number; y: number } {
    let best = { x: 0, top: Infinity };
    for (let x = 0; x <= GRID_COLUMNS - width; x++) {
      const probe = compact(
        [...placed.map((p) => ({ id: p.id, x: p.x, w: p.w, y: p.top, h: p.h })), { id: '__probe', x, w: width, y: Number.MAX_SAFE_INTEGER, h: 180 }],
        GRID_COLUMNS,
        GAP,
      ).find((p) => p.id === '__probe')!;
      if (probe.top < best.top) best = { x, top: probe.top };
    }
    return { x: best.x, y: best.top };
  }

  function saveWidget(w: WidgetInstance) {
    const i = page.widgets.findIndex((x) => x.id === w.id);
    if (i >= 0) {
      const old = page.widgets[i];
      page.widgets[i] = { ...w, x: old.x, y: old.y, w: Math.min(w.w ?? 3, GRID_COLUMNS - (old.x ?? 0)) };
    } else {
      normalizeOrder();
      page.widgets.push({ ...w, ...findSlot(w.w ?? 3) });
    }
    editorFor = null;
    saveDashboard();
  }

  /** Remove with an undo window instead of deleting immediately. */
  function remove(id: string) {
    const index = page.widgets.findIndex((w) => w.id === id);
    if (index < 0) return;
    const removed = page.widgets[index];
    page.widgets = page.widgets.filter((w) => w.id !== id);
    saveDashboard();
    toast(`Widget „${removed.title || removed.widget}“ entfernt`, 'default', {
      label: 'Rückgängig',
      run: () => {
        const list = [...page.widgets];
        list.splice(Math.min(index, list.length), 0, removed);
        page.widgets = list;
        saveDashboard();
      },
    });
  }

  /** Click/keyboard alternative to dragging. */
  function move(id: string, dir: 'left' | 'right' | 'up' | 'down') {
    const w = page.widgets.find((x) => x.id === id);
    const me = slots.get(id);
    if (!w || !me) return;
    normalizeOrder();
    if (dir === 'left' || dir === 'right') {
      w.x = Math.min(Math.max((w.x ?? 0) + (dir === 'left' ? -1 : 1), 0), GRID_COLUMNS - (w.w ?? 3));
    } else {
      // swap order with the nearest widget above/below that shares columns
      const overlap = placed.filter((p) => p.id !== id && p.x < me.x + me.w && me.x < p.x + p.w);
      const target =
        dir === 'up'
          ? overlap.filter((p) => p.top < me.top).sort((a, b) => b.top - a.top)[0]
          : overlap.filter((p) => p.top > me.top).sort((a, b) => a.top - b.top)[0];
      if (!target) return;
      const tw = page.widgets.find((x) => x.id === target.id)!;
      w.y = (tw.y ?? target.top) + (dir === 'up' ? -0.001 : 0.001);
    }
    queueMicrotask(() => {
      normalizeOrder();
      saveDashboard();
    });
  }

  function resize(id: string, width: number) {
    const x = page.widgets.find((x) => x.id === id);
    if (x) {
      x.w = width;
      if ((x.x ?? 0) + width > GRID_COLUMNS) x.x = GRID_COLUMNS - width;
    }
    saveDashboard();
  }
</script>

<div class="dash">
  {#if page.showSearch === false || app.user?.settings.greeting === false}
    <h1 class="sr-only">{page.name}</h1>
  {/if}
  {#if page.showSearch !== false}
    <section class="hero">
      {#if app.user?.settings.greeting !== false}
        <h1>{greeting}</h1>
        <p class="muted">
          {online} von {app.services.length} Diensten online
          {#if offline.length}· <span class="tone-warn">{offline.map((s) => s.name).join(', ')} {offline.length === 1 ? 'braucht' : 'brauchen'} Aufmerksamkeit</span>{/if}
        </p>
      {/if}
      <button class="searchbox" onclick={() => ((app.searchSeed = ''), (app.searchOpen = true))}>
        <Glyph name="search" size={20} />
        <span>Suchen, steuern, starten … Filme, Geräte, Container oder das Web</span>
        <span class="kbd">Ctrl&nbsp;K</span>
      </button>
    </section>
  {/if}

  {#if page.showServices !== false}
    <ServiceBar />
  {/if}

  {#if app.editing && cols !== GRID_COLUMNS}
    <div class="banner">Zum Verschieben und Skalieren das Fenster breiter machen – auf schmalen Bildschirmen werden Widgets untereinander angezeigt.</div>
  {:else if app.editing}
    <p class="hint muted">Widgets mit der Maus an eine beliebige Stelle ziehen, Breite am rechten Rand anpassen.</p>
  {/if}

  <section class="grid" class:ready class:arranging={canArrange} aria-label="Widgets" bind:clientWidth={gridWidth} style="height:{gridHeight}px">
    {#if drag?.mode === 'move'}
      {@const s = slots.get(drag.id)}
      {#if s}<div class="placeholder" style="width:{widthPx(s.w)}px;height:{s.h}px;transform:translate({px(s.x)}px,{s.top}px)"></div>{/if}
    {/if}
    {#each page.widgets as w (w.id)}
      {@const s = slots.get(w.id)}
      {@const moving = drag?.id === w.id && drag.mode === 'move'}
      <div
        class="cell"
        class:moving
        class:resizing={drag?.id === w.id && drag.mode === 'resize'}
        role="listitem"
        use:measure={w.id}
        style="width:{s ? widthPx(s.w) : 0}px;transform:translate({moving ? drag!.left : px(s?.x ?? 0)}px,{moving ? drag!.top : (s?.top ?? 0)}px)"
        onpointerdown={(e) => startDrag(e, w, 'move')}
        onpointermove={moveDrag}
        onpointerup={endDrag}
        onpointercancel={endDrag}
      >
        <div class="cell-inner" inert={moving}>
        <Widget
          widget={w}
          dragging={moving}
          onedit={() => (editorFor = w)}
          onremove={() => remove(w.id)}
          onresize={(n) => resize(w.id, n)}
          ondetail={() => openDetail(w)}
          onmove={(dir) => move(w.id, dir)}
        />
        </div>
        {#if canArrange}
          <div
            class="resize"
            role="separator"
            aria-label="Breite ändern"
            title="Breite ändern"
            onpointerdown={(e) => startDrag(e, w, 'resize')}
            onpointermove={moveDrag}
            onpointerup={endDrag}
            onpointercancel={endDrag}
          ></div>
        {/if}
      </div>
    {/each}
  </section>

  {#if app.editing || !page.widgets.length}
    <button class="add card" onclick={() => (editorFor = 'new')}>
      <Glyph name="plus" size={26} />
      <strong>Widget hinzufügen</strong>
      <span class="muted">Dienst wählen, Widget-Typ aussuchen, fertig.</span>
    </button>
  {/if}
</div>

{#if editorFor}
  <WidgetEditor initial={editorFor === 'new' ? undefined : editorFor} onsave={saveWidget} onclose={() => (editorFor = null)} />
{/if}

{#if detailFor}
  <WidgetDetail widget={detailFor} onclose={closeDetail} />
{/if}

<style>
  .dash {
    display: flex;
    flex-direction: column;
    gap: calc(26px * var(--space));
  }
  .hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    padding: calc(24px * var(--space)) 0 calc(6px * var(--space));
    text-align: center;
  }
  h1 {
    font-size: clamp(28px, 4vw, 40px);
    font-weight: 600;
  }
  .hero p {
    margin: -4px 0 4px;
    font-size: 15px;
  }
  .searchbox {
    width: min(760px, 100%);
    height: 60px;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 0 18px 0 20px;
    border-radius: calc(var(--radius) * 0.9);
    border: 1px solid color-mix(in srgb, var(--text) 14%, var(--border));
    background: var(--surface);
    backdrop-filter: var(--blur);
    color: var(--muted);
    font-size: 16px;
    cursor: text;
    box-shadow: var(--shadow);
    text-align: left;
  }
  .searchbox :global(svg) {
    color: var(--accent);
    flex: none;
  }
  .searchbox span:nth-child(2) {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .searchbox:hover {
    border-color: color-mix(in srgb, var(--accent) 50%, var(--border));
  }
  .grid {
    position: relative;
    min-height: 40px;
  }
  .cell {
    position: absolute;
    left: 0;
    top: 0;
    min-width: 0;
    touch-action: auto;
  }
  .grid.ready .cell {
    transition:
      transform 0.22s ease,
      width 0.22s ease;
  }
  .grid.arranging .cell {
    cursor: grab;
    touch-action: none;
    user-select: none;
  }
  .grid .cell.moving,
  .grid .cell.resizing {
    transition: none;
    z-index: 10;
  }
  .cell.moving {
    cursor: grabbing;
    filter: drop-shadow(0 18px 30px rgba(0, 0, 0, 0.35));
  }
  .placeholder {
    position: absolute;
    left: 0;
    top: 0;
    border-radius: var(--radius);
    border: 2px dashed color-mix(in srgb, var(--accent) 60%, transparent);
    background: var(--accent-soft);
    transition: transform 0.15s ease;
  }
  .resize {
    position: absolute;
    top: 12px;
    bottom: 12px;
    right: -9px;
    width: 14px;
    cursor: ew-resize;
    touch-action: none;
    display: grid;
    place-items: center;
  }
  .resize::after {
    content: '';
    width: 4px;
    height: 40px;
    border-radius: 2px;
    background: var(--accent);
    opacity: 0.55;
  }
  .resize:hover::after,
  .resizing .resize::after {
    opacity: 1;
  }
  .hint {
    margin: -8px 0 -6px;
    font-size: 13px;
  }
  .add {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 170px;
    border-style: dashed;
    background: transparent;
    color: var(--text);
    cursor: pointer;
    padding: 20px;
    text-align: center;
  }
  .add:hover {
    border-color: var(--accent);
  }
  .add span {
    font-size: 13px;
    max-width: 260px;
  }
</style>

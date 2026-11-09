// Dashboard layout engine, shared by client (rendering, drag & drop) and tests.
//
// Widgets live on a 12-column grid: `x` = start column, `w` = width in columns.
// Heights come from the rendered content. Vertically every widget "falls up" as far
// as it can (like gravity), so there are never holes between rows – but you can
// still place widgets in any column, e.g. on the right side.
//
// `y` is only an ordering key: widgets with a smaller y are placed first.

export const GRID_COLUMNS = 12;

export interface LayoutInput {
  id: string;
  x: number;
  w: number;
  y: number;
  /** Rendered height in px. */
  h: number;
}

export interface Placed {
  id: string;
  x: number;
  w: number;
  top: number;
  h: number;
}

/** Map a 12-column position onto a narrower grid (tablet: 6 columns, phone: 1 column). */
export function scaleToColumns(x: number, w: number, cols: number): { x: number; w: number } {
  if (cols >= GRID_COLUMNS) return { x, w };
  if (cols === 1) return { x: 0, w: 1 };
  const factor = cols / GRID_COLUMNS;
  // anything narrower than half the screen becomes half width on tablets
  const sw = Math.min(cols, Math.max(Math.ceil(cols / 2), Math.round(w * factor)));
  const sx = Math.min(Math.round(x * factor), cols - sw);
  return { x: Math.max(sx, 0), w: sw };
}

/**
 * Place widgets top-down. `priority` wins ties (used for the widget being dragged,
 * so it can push in front of others).
 */
export function compact(items: LayoutInput[], cols: number, gap: number, priority?: string): Placed[] {
  const order = [...items].sort((a, b) => a.y - b.y || (a.id === priority ? -1 : b.id === priority ? 1 : 0) || a.x - b.x);
  const placed: Placed[] = [];
  for (const it of order) {
    const { x, w } = scaleToColumns(Math.max(0, Math.round(it.x)), Math.max(1, Math.round(it.w)), cols);
    let top = 0;
    // move down until nothing already placed overlaps
    for (;;) {
      const hits = placed.filter((p) => p.x < x + w && x < p.x + p.w && p.top < top + it.h && top < p.top + p.h);
      if (!hits.length) break;
      top = Math.max(...hits.map((p) => p.top + p.h + gap));
    }
    placed.push({ id: it.id, x, w, top, h: it.h });
  }
  return placed;
}

export function totalHeight(placed: Placed[]): number {
  return placed.reduce((m, p) => Math.max(m, p.top + p.h), 0);
}

/**
 * Give widgets without a position (old dashboards, newly added) a spot: left to right,
 * wrapping into a new row when the 12 columns are full.
 */
export function autoPlace<T extends { x?: number; y?: number; w?: number }>(widgets: T[], legacyColumns = false): T[] {
  let cx = 0;
  let row = 0;
  return widgets.map((w) => {
    let width = w.w ?? 3;
    if (legacyColumns) width = Math.min(Math.max(width, 1), 4) * 3; // old 4-column widths
    width = Math.min(Math.max(Math.round(width), 2), GRID_COLUMNS);
    if (w.x != null && w.y != null && !legacyColumns) return { ...w, w: width };
    if (cx + width > GRID_COLUMNS) {
      cx = 0;
      row++;
    }
    const out = { ...w, x: cx, y: row * 1000 + cx, w: width };
    cx += width;
    return out;
  });
}

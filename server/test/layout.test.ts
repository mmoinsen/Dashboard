import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoPlace, compact, scaleToColumns, totalHeight } from '../src/shared/layout.ts';

const G = 16;
const byId = (placed: ReturnType<typeof compact>) => Object.fromEntries(placed.map((p) => [p.id, p]));

test('no gap under a short widget: the next one moves right up (the screenshot bug)', () => {
  // row 1: short clock (100px) and tall sonarr (400px); row 2: home assistant under the clock
  const p = byId(
    compact(
      [
        { id: 'clock', x: 0, w: 4, y: 0, h: 100 },
        { id: 'sonarr', x: 4, w: 4, y: 0, h: 400 },
        { id: 'ha', x: 0, w: 4, y: 1000, h: 300 },
      ],
      12,
      G,
    ),
  );
  assert.equal(p.ha.top, 100 + G, 'starts right below the clock, not below sonarr');
  assert.equal(p.sonarr.top, 0);
});

test('widgets can sit on the right with empty space on the left', () => {
  const p = byId(compact([{ id: 'a', x: 8, w: 4, y: 0, h: 200 }], 12, G));
  assert.deepEqual([p.a.x, p.a.top], [8, 0]);
});

test('overlapping widgets are pushed below each other', () => {
  const p = byId(
    compact(
      [
        { id: 'a', x: 0, w: 6, y: 0, h: 200 },
        { id: 'b', x: 3, w: 6, y: 10, h: 100 },
      ],
      12,
      G,
    ),
  );
  assert.equal(p.b.top, 200 + G);
  assert.equal(totalHeight(Object.values(p)), 200 + G + 100);
});

test('dragged widget (priority) wins a tie and goes first', () => {
  const p = byId(
    compact(
      [
        { id: 'a', x: 0, w: 12, y: 0, h: 100 },
        { id: 'drag', x: 0, w: 12, y: 0, h: 50 },
      ],
      12,
      G,
      'drag',
    ),
  );
  assert.equal(p.drag.top, 0);
  assert.equal(p.a.top, 50 + G);
});

test('narrow screens: 6 columns halve, 1 column stacks', () => {
  assert.deepEqual(scaleToColumns(9, 3, 6), { x: 3, w: 3 });
  assert.deepEqual(scaleToColumns(0, 12, 6), { x: 0, w: 6 });
  assert.deepEqual(scaleToColumns(8, 4, 1), { x: 0, w: 1 });
  const p = compact(
    [
      { id: 'a', x: 0, w: 3, y: 0, h: 100 },
      { id: 'b', x: 6, w: 3, y: 0, h: 100 },
    ],
    1,
    G,
  );
  assert.deepEqual(
    p.map((x) => x.top),
    [0, 100 + G],
  );
});

test('autoPlace converts old 4-column widths and wraps rows', () => {
  const out = autoPlace<{ x?: number; y?: number; w?: number }>([{ w: 1 }, { w: 2 }, { w: 1 }, { w: 1 }], true);
  assert.deepEqual(
    out.map((w) => [w.x, w.w]),
    [
      [0, 3],
      [3, 6],
      [9, 3],
      [0, 3],
    ],
  );
  assert.ok(out[3].y! > out[2].y!, 'wrapped widget comes after the first row');
});

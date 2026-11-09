// Re-export the types shared with the server so both sides stay in sync.
export type * from '../../../server/src/shared/types.ts';
export { parseQuery, webIntent, looksLikeUrl, calculate, CATEGORY_BANGS } from '../../../server/src/shared/query.ts';
export { GRID_COLUMNS, autoPlace, compact, totalHeight, type Placed } from '../../../server/src/shared/layout.ts';

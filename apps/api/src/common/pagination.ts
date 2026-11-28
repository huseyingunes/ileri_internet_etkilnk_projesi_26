import type { Page } from '@etkinlik/shared';

/**
 * Cursor pagination over UUIDv7 public ids (time ordered, newest first).
 * Callers fetch `limit + 1` rows; the extra row only signals another page.
 */
export function toPage<Row extends { public_id: string }, Item>(
  rows: Row[],
  limit: number,
  map: (row: Row) => Item,
): Page<Item> {
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const last = pageRows.at(-1);
  return {
    items: pageRows.map(map),
    page: { nextCursor: hasMore && last !== undefined ? last.public_id : null },
  };
}

/**
 * Where the table QR scan lands: Index.tsx writes it on mount when the route
 * carries a table/bar path segment, and both the builder and the re-order
 * flow read it back before letting anything reach the cart.
 */
export const TURBO_TABLE_STORAGE_KEY = 'turbo-table';

/**
 * A table id is only valid if it came from scanning a real table QR
 * (`table-N`) or the bar QR (`bar`) - anything else (missing, malformed,
 * stale) must not be allowed to place an order. Shared between Index.tsx's
 * builder and the favourites re-order flow so the rule can never drift
 * between the two places that enforce it.
 */
export const isValidTableId = (tableId: string | null): boolean =>
  !!tableId && (tableId.includes('table-') || tableId.includes('bar'));

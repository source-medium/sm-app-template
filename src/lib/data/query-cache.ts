/**
 * How long each kind of query result may be reused (docs/data.md#the-query-cache).
 *
 * A query opts in with `cache: CACHE_POLICY.<kind>` on its QueryRequest. No
 * field means the result is never stored, which is the right default for
 * anything that lists individual orders, customers or evidence rows. Expiry is
 * hard: a stored result is served until it expires, then the warehouse runs
 * again. "Refresh data" bypasses the cache for the request that follows it.
 *
 * These are product policies about how old a repeated read may be, not
 * statements about warehouse freshness; a historical period gets the same
 * policy as the current one because backfills and refunds change it too.
 */
export type CachePolicy = { maxAgeSeconds: number };

export const CACHE_POLICY = {
  /** Which columns a metadata relation has. Changes only with a SourceMedium release. */
  schema: { maxAgeSeconds: 3600 },
  /** A store's SourceMedium time zone, read from its orders when dim_stores has none. */
  storeTimeZone: { maxAgeSeconds: 3600 },
  /** Published metric definitions and field documentation. */
  catalog: { maxAgeSeconds: 900 },
  /** The store roster: names, logos, time zones. */
  roster: { maxAgeSeconds: 300 },
  /** Period totals, daily series, ranked breakdowns and the option lists beside them. */
  aggregate: { maxAgeSeconds: 300 },
  /** The dictionary's per-store observations (has data, last data date). */
  observation: { maxAgeSeconds: 60 },
} as const satisfies Record<string, CachePolicy>;

/** Results larger than this, serialized, are not stored in any tier. */
export const CACHE_MAX_ENTRY_BYTES = 256 * 1024;

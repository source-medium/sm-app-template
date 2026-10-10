/**
 * sm-app-template integration file. Template version: 0.1.0 (unreleased).
 *
 * Every warehouse failure becomes one classified error whose remedy follows
 * the provider's reason. A generic 403 is never called revocation, quota is
 * never "rotate the key", and nothing here ever falls back to sample data.
 */

export type WarehouseErrorKind =
  | "credential_invalid"
  | "permission_denied"
  | "quota_exceeded"
  | "bytes_limit_exceeded"
  | "not_found"
  | "invalid_query"
  | "deadline_exceeded"
  | "submission_indeterminate"
  | "cancelled"
  | "transient"
  | "response_invalid"
  | "incompatible_schema"
  | "result_too_large"
  | "time_zone_unknown"
  | "unknown";

const COPY: Record<WarehouseErrorKind, { title: string; remedy: string }> = {
  credential_invalid: {
    title: "The app key was rejected",
    remedy:
      "Google rejected SM_APP_KEY: it may have been replaced, paused, or revoked. Ask your SourceMedium admin for an app-specific replacement key.",
  },
  permission_denied: {
    title: "The app cannot read this data",
    remedy:
      "The app's identity lacks permission for this dataset or job project. Ask your SourceMedium admin to check the app provisioning; if it persists, contact SourceMedium support.",
  },
  quota_exceeded: {
    title: "Query allowance used up",
    remedy:
      "BigQuery rejected the query because a quota was reached. Ask your SourceMedium admin to check the warehouse project's limits or contact SourceMedium support; rotating the key will not help.",
  },
  bytes_limit_exceeded: {
    title: "Query too large",
    remedy:
      "This query would scan more than the per-query ceiling. Narrow the date range, or raise BIGQUERY_MAX_BYTES_BILLED deliberately.",
  },
  not_found: {
    title: "Table or dataset not found",
    remedy:
      "BigQuery could not find this table in the configured location. Check BIGQUERY_LOCATION and the app-specific configuration block with your SourceMedium admin.",
  },
  invalid_query: {
    title: "The query is invalid",
    remedy: "BigQuery rejected the SQL. Inspect the table with `pnpm schema <relation>` and fix the query.",
  },
  deadline_exceeded: {
    title: "The query took too long",
    remedy: "The warehouse did not answer within 30 seconds. Try a shorter date range, then reload.",
  },
  submission_indeterminate: {
    title: "The query may not have started",
    remedy:
      "The connection dropped before BigQuery confirmed the query, so it was not resubmitted automatically. Reload to try once more.",
  },
  cancelled: { title: "The request was cancelled", remedy: "Reload the page to run the query again." },
  transient: {
    title: "The warehouse is temporarily unavailable",
    remedy: "Google returned a temporary error. Reload in a minute.",
  },
  response_invalid: {
    title: "Unexpected warehouse response",
    remedy:
      "Google returned a response the app could not read. Reload; if it persists, open Connection from the data badge and share the safe report. Locally, run `pnpm diagnose`.",
  },
  incompatible_schema: {
    title: "The data no longer matches this view",
    remedy:
      "A column this view needs changed. Inspect it with `pnpm schema <relation>` and update the view's row schema.",
  },
  result_too_large: {
    title: "Too much data for this view",
    remedy:
      "The query exceeded its row bound or the 10 MiB response limit. Narrow the filters, select fewer columns, or aggregate more in SQL.",
  },
  time_zone_unknown: {
    title: "This store's time zone is not published",
    remedy:
      "Report dates follow each store's SourceMedium time zone. This store has none in dim_stores and no recent orders to read it from. Ask your SourceMedium admin to set the store's time zone.",
  },
  unknown: {
    title: "Something went wrong",
    remedy:
      "Reload; if it persists, open Connection from the data badge and share the safe report. Locally, run `pnpm diagnose`.",
  },
};

type Details = {
  status?: number;
  reason?: string;
  /** Provider text for SQL errors only: names and positions, which an agent needs to fix the query. */
  detail?: string;
  job?: { projectId: string; jobId: string; location: string } | null;
  relation?: string;
  column?: string;
  /** Replaces the kind's generic remedy when the caller knows the specific one. */
  remedy?: string;
};

export class WarehouseError extends Error {
  readonly kind: WarehouseErrorKind;
  readonly title: string;
  readonly remedy: string;
  readonly status: number | null;
  readonly reason: string | null;
  readonly detail: string | null;
  readonly job: Details["job"];
  readonly relation: string | null;
  readonly column: string | null;

  constructor(kind: WarehouseErrorKind, details: Details = {}) {
    const copy = COPY[kind];
    const remedy = details.remedy ?? copy.remedy;
    super(`${copy.title}. ${remedy}`);
    this.name = "WarehouseError";
    this.kind = kind;
    this.title = copy.title;
    this.remedy = remedy;
    this.status = details.status ?? null;
    this.reason = details.reason ?? null;
    this.detail = details.detail ?? null;
    this.job = details.job ?? null;
    this.relation = details.relation ?? null;
    this.column = details.column ?? null;
  }

  static incompatible(relation: string, column: string): WarehouseError {
    return new WarehouseError("incompatible_schema", { relation, column, reason: "row_schema" });
  }

  /** A fetch that threw: aborts are deadline or cancellation; anything else is transport. */
  static fromTransport(error: unknown, reason: string): WarehouseError {
    if (error instanceof WarehouseError) return error;
    const name = (error as { name?: unknown } | null)?.name;
    if (name === "TimeoutError") return new WarehouseError("deadline_exceeded", { reason });
    if (name === "AbortError") return new WarehouseError("cancelled", { reason });
    return new WarehouseError("transient", { reason: `${reason}_network` });
  }
}

type GoogleErrorBody = {
  error?: { code?: number; message?: string; errors?: { reason?: string; message?: string }[] };
};

/** Classifies a non-OK BigQuery response from its status and first error reason. */
export function classifyBigQueryError(status: number, body: unknown, job: Details["job"] = null): WarehouseError {
  const error = (body as GoogleErrorBody | null)?.error;
  const reason = error?.errors?.[0]?.reason ?? "";
  const message = error?.errors?.[0]?.message ?? error?.message ?? "";
  const base = { status, reason: reason || undefined, job };

  switch (reason) {
    case "quotaExceeded":
      return new WarehouseError("quota_exceeded", base);
    case "bytesBilledLimitExceeded":
      return new WarehouseError("bytes_limit_exceeded", base);
    case "accessDenied":
    case "billingNotEnabled":
      return new WarehouseError("permission_denied", base);
    case "notFound":
      return new WarehouseError("not_found", base);
    case "invalidQuery":
      return new WarehouseError("invalid_query", { ...base, detail: message.slice(0, 500) });
    case "backendError":
    case "internalError":
    case "rateLimitExceeded": // A per-second or concurrency limit, not the daily allowance.
      return new WarehouseError("transient", base);
  }
  if (status === 401) return new WarehouseError("credential_invalid", base);
  if (status === 403) return new WarehouseError("permission_denied", base);
  if (status === 404) return new WarehouseError("not_found", base);
  if (status === 429) return new WarehouseError("quota_exceeded", base);
  if (status >= 500) return new WarehouseError("transient", base);
  if (status === 400) return new WarehouseError("invalid_query", { ...base, detail: message.slice(0, 500) });
  return new WarehouseError("unknown", base);
}

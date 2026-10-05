/**
 * sm-app-template integration file. Template version: 1.0.0.
 *
 * One JSON object per line with a fixed key set and no free text, so a host's
 * log search works on day one. Never log rows, keys, Authorization headers,
 * passwords, or SQL. Replace `emit` to forward events to an error tracker.
 */

export type LogEvent = {
  event: "bq_query" | "viewer_denied" | "config_error" | "token_exchange";
  level: "info" | "warn" | "error";
  build?: string;
  app?: string | null;
  query?: string | null;
  job_project?: string | null;
  job_id?: string | null;
  location?: string | null;
  duration_ms?: number | null;
  bytes_billed?: string | null;
  cache_hit?: boolean | null;
  rows?: number | null;
  truncated?: boolean | null;
  error_kind?: string | null;
  error_reason?: string | null;
  http_status?: number | null;
  cancel?: "requested" | "failed" | null;
  guard?: string | null;
  variables?: string[] | null;
};

const KEYS = [
  "event",
  "level",
  "build",
  "app",
  "query",
  "job_project",
  "job_id",
  "location",
  "duration_ms",
  "bytes_billed",
  "cache_hit",
  "rows",
  "truncated",
  "error_kind",
  "error_reason",
  "http_status",
  "cancel",
  "guard",
  "variables",
] as const satisfies readonly (keyof LogEvent)[];

export function formatLogLine(event: LogEvent, now: Date = new Date()): string {
  const line: Record<string, unknown> = { ts: now.toISOString() };
  for (const key of KEYS) line[key] = event[key] ?? null;
  return JSON.stringify(line);
}

export let emit = (line: string, level: LogEvent["level"]): void => {
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
};

/** Test seam: capture lines instead of printing them. */
export function setLogEmitter(next: typeof emit): void {
  emit = next;
}

export function logEvent(event: LogEvent): void {
  emit(formatLogLine(event), event.level);
}

/**
 * A local fake of the calls the REST client makes: the Google token
 * endpoint, jobs.query, jobs.getQueryResults, jobs.cancel, and the metadata
 * GETs. Each test scripts the responses it needs; every call is recorded.
 * Pure fetch, so it runs in Node and workerd alike.
 */

export type FakeCall = { kind: "token" | "submit" | "poll" | "cancel" | "metadata"; url: URL; body: unknown };
type Handler = (call: FakeCall, signal: AbortSignal | undefined) => Response | Promise<Response>;

export type FakeBigQueryScript = {
  token?: Handler;
  submit?: Handler;
  poll?: Handler;
  cancel?: Handler;
  metadata?: Handler;
};

export const JOB = { projectId: "sm-customer-apps-test", jobId: "job_abc123", location: "US" };
export const FIELDS = [
  { name: "date", type: "DATE", mode: "NULLABLE" },
  { name: "sessions", type: "INTEGER", mode: "NULLABLE" },
];

export function wireRows(values: [string, string | null][]) {
  return values.map(([date, sessions]) => ({ f: [{ v: date }, { v: sessions }] }));
}

export function queryResponse(overrides: Record<string, unknown> = {}) {
  return {
    kind: "bigquery#queryResponse",
    jobReference: JOB,
    jobComplete: true,
    schema: { fields: FIELDS },
    rows: wireRows([["2026-10-01", "12"]]),
    totalRows: "1",
    totalBytesBilled: "10485760",
    cacheHit: false,
    ...overrides,
  };
}

export function googleError(status: number, reason: string, message = "error") {
  return Response.json({ error: { code: status, message, errors: [{ reason, message }] } }, { status });
}

/** A server that never answers: settles only when the request is aborted, as fetch does. */
export function hang(signal: AbortSignal | undefined): Promise<Response> {
  return new Promise((_resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

function parseBody(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function createFakeBigQuery(script: FakeBigQueryScript) {
  const calls: FakeCall[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = (init?.method ?? "GET").toUpperCase();
    const raw = typeof init?.body === "string" ? init.body : null;
    const body = parseBody(raw);
    let kind: FakeCall["kind"];
    if (url.hostname === "oauth2.googleapis.com") kind = "token";
    else if (method === "POST" && url.pathname.endsWith("/queries")) kind = "submit";
    else if (method === "POST" && url.pathname.endsWith("/cancel")) kind = "cancel";
    else if (url.pathname.includes("/queries/")) kind = "poll";
    else kind = "metadata";
    const call = { kind, url, body };
    calls.push(call);
    const handler =
      script[kind] ??
      (kind === "token"
        ? () => Response.json({ access_token: "ya29.test-token", expires_in: 3599, token_type: "Bearer" })
        : kind === "cancel"
          ? () => Response.json({ kind: "bigquery#jobCancelResponse" })
          : () => Response.json(queryResponse()));
    return handler(call, init?.signal ?? undefined);
  };
  return {
    fetch: fetchImpl,
    calls,
    count: (kind: FakeCall["kind"]) => calls.filter((call) => call.kind === kind).length,
  };
}

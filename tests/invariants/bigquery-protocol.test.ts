/**
 * The REST client's protocol against a local fake:
 * incomplete jobs poll the same id and location, a lost submission is never
 * posted twice, one deadline spans every retry, results are bounded and
 * truncation is explicit, and a deadline or cancel asks BigQuery to cancel.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runQuery, type BigQueryClient, type QueryRequest } from "@/lib/data/bigquery-rest.server";
import { createTokenProvider } from "@/lib/data/google-token.server";
import { setLogEmitter } from "@/lib/data/log";
import { WarehouseError } from "@/lib/data/warehouse-error";
import { parseConfig } from "@/lib/config/env.server";
import {
  createFakeBigQuery,
  googleError,
  hang,
  JOB,
  queryResponse,
  wireRows,
  type FakeBigQueryScript,
} from "../fake-bigquery/fake-bigquery";
import { liveEnv, makeServiceAccountKey, TEST_APP_ID } from "../helpers/service-account";

const SQL = "SELECT date, sessions FROM `p.d.t` WHERE sm_store_id = @store_id";
const REQUEST: QueryRequest = {
  name: "overview_daily",
  sql: SQL,
  params: [{ name: "store_id", type: "STRING", value: "store-1" }],
};

let logs: string[] = [];
beforeEach(() => {
  logs = [];
  setLogEmitter((line) => logs.push(line));
});
afterEach(() => setLogEmitter(() => undefined));

async function clientFor(script: FakeBigQueryScript) {
  const key = await makeServiceAccountKey();
  const config = parseConfig(liveEnv(key));
  if (config.status !== "ok" || config.mode !== "live") throw new Error("test config must be live");
  const fake = createFakeBigQuery(script);
  const client: BigQueryClient = {
    applicationId: TEST_APP_ID,
    jobProjectId: config.live.jobProjectId,
    location: "US",
    maxBytesBilled: config.live.maxBytesBilled,
    getAccessToken: createTokenProvider(config.live.key, { fetch: fake.fetch }),
    fetch: fake.fetch,
  };
  return { client, fake, key };
}

async function failure(promise: Promise<unknown>): Promise<WarehouseError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  if (!(error instanceof WarehouseError)) throw new Error(`expected a WarehouseError, got ${String(error)}`);
  return error;
}

describe("BigQuery REST protocol", () => {
  it("submits once with labels, the byte ceiling, the location, and named parameters", async () => {
    const { client, fake } = await clientFor({});
    const result = await runQuery(client, REQUEST);
    expect(result.rows).toEqual([{ date: "2026-10-01", sessions: "12" }]);
    expect(result.truncated).toBe(false);
    expect(fake.count("submit")).toBe(1);
    const submit = fake.calls.find((call) => call.kind === "submit");
    expect(submit?.url.pathname).toBe("/bigquery/v2/projects/sm-customer-apps-test/queries");
    expect(submit?.body).toMatchObject({
      query: SQL,
      useLegacySql: false,
      location: "US",
      maximumBytesBilled: String(1024 ** 3),
      labels: { sm_app: TEST_APP_ID, sm_query: "overview_daily" },
      parameterMode: "NAMED",
      queryParameters: [{ name: "store_id", parameterType: { type: "STRING" }, parameterValue: { value: "store-1" } }],
      formatOptions: { useInt64Timestamp: true },
    });
    expect(Number((submit?.body as { jobTimeoutMs: string }).jobTimeoutMs)).toBeGreaterThan(0);
  });

  it("uses Google's fixed token endpoint, never the URL inside the key", async () => {
    const { client, fake } = await clientFor({});
    await runQuery(client, REQUEST);
    const token = fake.calls.find((call) => call.kind === "token");
    expect(token?.url.origin).toBe("https://oauth2.googleapis.com");
    expect(fake.calls.some((call) => call.url.hostname === "attacker.example")).toBe(false);
  });

  it("polls the same job and location when the job is incomplete, and never posts again", async () => {
    let polls = 0;
    const { client, fake } = await clientFor({
      submit: () => Response.json(queryResponse({ jobComplete: false, rows: undefined, schema: undefined })),
      poll: () => {
        polls += 1;
        return Response.json(polls < 3 ? { jobComplete: false, jobReference: JOB } : queryResponse());
      },
    });
    const result = await runQuery(client, REQUEST);
    expect(result.rows).toHaveLength(1);
    expect(fake.count("submit")).toBe(1);
    for (const call of fake.calls.filter((item) => item.kind === "poll")) {
      expect(call.url.pathname).toBe(`/bigquery/v2/projects/${JOB.projectId}/queries/${JOB.jobId}`);
      expect(call.url.searchParams.get("location")).toBe("US");
    }
  });

  it("reports a lost submission as indeterminate and never posts twice", async () => {
    const { client, fake } = await clientFor({
      submit: () => {
        throw new TypeError("fetch failed");
      },
    });
    expect((await failure(runQuery(client, REQUEST))).kind).toBe("submission_indeterminate");
    expect(fake.count("submit")).toBe(1);
    expect(fake.count("poll")).toBe(0);
  });

  it("treats a server error on submission as indeterminate, without a retry", async () => {
    const { client, fake } = await clientFor({ submit: () => googleError(503, "backendError") });
    expect((await failure(runQuery(client, REQUEST))).kind).toBe("submission_indeterminate");
    expect(fake.count("submit")).toBe(1);
  });

  it("retries a transient poll failure on the same job", async () => {
    let polls = 0;
    const { client, fake } = await clientFor({
      submit: () => Response.json(queryResponse({ jobComplete: false })),
      poll: () => {
        polls += 1;
        if (polls === 1) return googleError(503, "backendError");
        if (polls === 2) throw new TypeError("fetch failed");
        return Response.json(queryResponse());
      },
    });
    await runQuery(client, REQUEST);
    expect(fake.count("submit")).toBe(1);
    expect(fake.count("poll")).toBe(3);
  });

  it("keeps one deadline across retries and cancels the known job when it expires", async () => {
    const { client, fake } = await clientFor({
      submit: () => Response.json(queryResponse({ jobComplete: false })),
      poll: () => googleError(503, "backendError"),
    });
    const started = Date.now();
    const error = await failure(runQuery(client, REQUEST, { deadlineMs: 400 }));
    expect(error.kind).toBe("deadline_exceeded");
    expect(Date.now() - started).toBeLessThan(1500);
    expect(fake.count("submit")).toBe(1);
    expect(fake.count("cancel")).toBe(1);
    const cancel = fake.calls.find((call) => call.kind === "cancel");
    expect(cancel?.url.pathname).toBe(`/bigquery/v2/projects/${JOB.projectId}/jobs/${JOB.jobId}/cancel`);
    expect(cancel?.url.searchParams.get("location")).toBe("US");
  });

  it("cancels a running job when the caller aborts", async () => {
    const controller = new AbortController();
    const { client, fake } = await clientFor({
      submit: () => Response.json(queryResponse({ jobComplete: false })),
      poll: (_call, signal) => {
        controller.abort();
        return hang(signal);
      },
    });
    expect((await failure(runQuery(client, REQUEST, { signal: controller.signal }))).kind).toBe("cancelled");
    expect(fake.count("cancel")).toBe(1);
  });

  it("follows page tokens and combines pages", async () => {
    const { client, fake } = await clientFor({
      submit: () =>
        Response.json(
          queryResponse({
            rows: wireRows([
              ["2026-10-01", "1"],
              ["2026-10-02", "2"],
            ]),
            pageToken: "page-2",
          }),
        ),
      poll: (call) => {
        expect(call.url.searchParams.get("pageToken")).toBe("page-2");
        return Response.json(queryResponse({ rows: wireRows([["2026-10-03", "3"]]) }));
      },
    });
    const result = await runQuery(client, REQUEST);
    expect(result.rows.map((row) => row.sessions)).toEqual(["1", "2", "3"]);
    expect(result.truncated).toBe(false);
    expect(fake.count("submit")).toBe(1);
  });

  it("bounds rows overall, not per page, and flags truncation", async () => {
    let page = 0;
    const { client, fake } = await clientFor({
      submit: () =>
        Response.json(
          queryResponse({
            rows: wireRows([
              ["d1", "1"],
              ["d2", "2"],
            ]),
            pageToken: "p2",
          }),
        ),
      poll: () => {
        page += 1;
        return Response.json(
          queryResponse({
            rows: wireRows([
              ["d3", "3"],
              ["d4", "4"],
            ]),
            pageToken: `p${page + 2}`,
          }),
        );
      },
    });
    const result = await runQuery(client, { ...REQUEST, maxRows: 3 });
    expect(result.rows.map((row) => row.sessions)).toEqual(["1", "2", "3"]);
    expect(result.truncated).toBe(true);
    expect(fake.count("poll")).toBe(1);
  });

  it("flags truncation when the bound is reached with pages remaining", async () => {
    const { client } = await clientFor({
      submit: () =>
        Response.json(
          queryResponse({
            rows: wireRows([
              ["d1", "1"],
              ["d2", "2"],
            ]),
            pageToken: "more",
          }),
        ),
    });
    const result = await runQuery(client, { ...REQUEST, maxRows: 2 });
    expect(result.rows).toHaveLength(2);
    expect(result.truncated).toBe(true);
  });

  it.each([
    [400, "bytesBilledLimitExceeded", "bytes_limit_exceeded"],
    [403, "accessDenied", "permission_denied"],
    [403, "quotaExceeded", "quota_exceeded"],
    [403, "rateLimitExceeded", "quota_exceeded"],
    [404, "notFound", "not_found"],
    [400, "invalidQuery", "invalid_query"],
    [403, "somethingNew", "permission_denied"],
  ])("classifies HTTP %i %s as %s", async (status, reason, kind) => {
    const { client } = await clientFor({
      submit: () => googleError(status, reason, "Unrecognized name: foo at [1:8]"),
    });
    const error = await failure(runQuery(client, REQUEST));
    expect(error.kind).toBe(kind);
    // A generic 403 is never called revocation or a bad key.
    expect(error.kind).not.toBe("credential_invalid");
  });

  it("classifies a rejected key at the token endpoint as a credential problem", async () => {
    const { client, fake } = await clientFor({
      token: () =>
        Response.json({ error: "invalid_grant", error_description: "Invalid JWT Signature." }, { status: 400 }),
    });
    expect((await failure(runQuery(client, REQUEST))).kind).toBe("credential_invalid");
    expect(fake.count("submit")).toBe(0);
  });

  it("shares one token exchange between concurrent queries without tying it to either caller's deadline", async () => {
    let releaseToken: () => void = () => undefined;
    const tokenGate = new Promise<void>((resolve) => (releaseToken = resolve));
    const { client, fake } = await clientFor({
      token: async () => {
        await tokenGate;
        return Response.json({ access_token: "ya29.test-token", expires_in: 3599 });
      },
    });
    const impatient = new AbortController();
    const first = runQuery(client, REQUEST, { signal: impatient.signal });
    const second = runQuery(client, REQUEST);
    await new Promise((resolve) => setTimeout(resolve, 20));
    impatient.abort();
    expect((await failure(first)).kind).toBe("cancelled");
    releaseToken();
    await expect(second).resolves.toMatchObject({ rows: [{ date: "2026-10-01", sessions: "12" }] });
    expect(fake.count("token")).toBe(1);
  });

  it("caches the access token across queries", async () => {
    const { client, fake } = await clientFor({});
    await runQuery(client, REQUEST);
    await runQuery(client, REQUEST);
    expect(fake.count("token")).toBe(1);
  });

  it("logs one line per query with the job reference and never SQL, values, or tokens", async () => {
    const { client, key } = await clientFor({});
    await runQuery(client, REQUEST);
    expect(logs).toHaveLength(1);
    const line = JSON.parse(logs[0] ?? "{}") as Record<string, unknown>;
    expect(line).toMatchObject({
      event: "bq_query",
      query: "overview_daily",
      job_id: JOB.jobId,
      rows: 1,
      bytes_billed: "10485760",
    });
    const text = logs.join("\n");
    for (const forbidden of [SQL, "store-1", "2026-10-01", "ya29.test-token", key.base64, "PRIVATE KEY"]) {
      expect(text).not.toContain(forbidden);
    }
  });
});

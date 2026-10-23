/**
 * The managed data API adapter against SourceMedium's published contract
 * (contracts/managed-app-v1, vendored byte for byte). SourceMedium's own test
 * reproduces these examples from its handlers; this one drives the same
 * examples through the adapter, so the two sides cannot drift apart unseen.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  loadManagedContext,
  managedApiError,
  queryBody,
  runManagedQuery,
  type ManagedApiClient,
} from "@/lib/data/managed-api.server";
import { checkManagedConnection } from "@/lib/data/connection.server";
import type { Warehouse } from "@/lib/data/warehouse.server";
import type { QueryRequest } from "@/lib/data/bigquery-rest.server";
import { emit, setLogEmitter } from "@/lib/data/log";
import { connectionReportText } from "@/lib/data/connection-report";
import { refusedWarehouse } from "@/lib/data/warehouse.server";
import { WarehouseError, type WarehouseErrorKind } from "@/lib/data/warehouse-error";

type Example = { case: string; value: unknown; status?: number };
type ExampleSet = { valid: Example[]; invalid: Example[] };
const examples = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../contracts/managed-app-v1/examples.json", import.meta.url)), "utf8"),
) as Record<"query_request" | "query_response" | "context" | "error", ExampleSet>;

const example = (set: ExampleSet, name: string) => {
  const found = set.valid.find((entry) => entry.case === name);
  if (!found) throw new Error(`no example ${name}`);
  return found;
};

const TOKEN = `smapp_${"a".repeat(43)}`;
const API = "https://urchin.test/api/app-data/v1";

function client(fetch: typeof globalThis.fetch, developerToken: string | null = TOKEN): ManagedApiClient {
  return { dataApiUrl: API, developerToken, fetch };
}

/** Managed errors name SourceMedium's fix; the self-hosted Google copy never applies. */
function expectManagedCopy(error: unknown) {
  expect(error).toBeInstanceOf(WarehouseError);
  const { title, remedy } = error as WarehouseError;
  expect(`${title}. ${remedy}`).not.toMatch(/Google|BigQuery|BIGQUERY_|app key|replacement key/i);
}

const reply = (body: unknown, status = 200) =>
  vi.fn(async () =>
    typeof body === "string"
      ? new Response(body, { status })
      : Response.json(body, { status, headers: { "Content-Type": "application/json" } }),
  );

describe("the request the adapter sends", () => {
  it("is the contract's orders_by_day example", () => {
    const request: QueryRequest = {
      name: "orders_by_day",
      sql: "SELECT order_date, COUNT(*) AS orders FROM obt_orders WHERE order_date >= @start GROUP BY 1",
      params: [{ name: "start", type: "DATE", value: "2026-09-01" }],
    };
    expect(queryBody(request)).toEqual(example(examples.query_request, "orders_by_day").value);
  });

  it("carries every parameter type exactly, INT64 as a decimal string", () => {
    const request: QueryRequest = {
      name: "parameter-types",
      sql: "SELECT @store_id, @start, @local_start, @since, @order_id, @ratio, @include_test",
      params: [
        { name: "store_id", type: "STRING", value: "acme-store" },
        { name: "start", type: "DATE", value: "2026-09-01" },
        { name: "local_start", type: "DATETIME", value: "2026-09-01 00:00:00" },
        { name: "since", type: "TIMESTAMP", value: "2026-09-01T00:00:00.000000Z" },
        { name: "order_id", type: "INT64", value: 9007199254740993n },
        { name: "ratio", type: "FLOAT64", value: 0.25 },
        { name: "include_test", type: "BOOL", value: false },
      ],
      maxRows: 10_000,
      partial: true,
    };
    expect(queryBody(request)).toEqual(example(examples.query_request, "every_parameter_type").value);
  });

  it("refuses an INT64 number past exact precision before anything is sent", async () => {
    const fetch = reply({});
    await expect(
      runManagedQuery(client(fetch), {
        name: "orders",
        sql: "SELECT @id",
        params: [{ name: "id", type: "INT64", value: 2 ** 60 }],
      }),
    ).rejects.toThrow("not a safe integer");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends the token only when one is configured, and only to the data API", async () => {
    const body = example(examples.query_response, "inline_scalars").value;
    for (const token of [TOKEN, null]) {
      const fetch = reply(body);
      await runManagedQuery(client(fetch, token), { name: "orders", sql: "SELECT 1" });
      const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe(`${API}/query`);
      expect(new Headers(init.headers).get("authorization")).toBe(token ? `Bearer ${token}` : null);
      expect(init.redirect).toBe("manual");
    }
  });
});

describe("reading results", () => {
  it.each(examples.query_response.valid)("reads $case into the client's QueryResult", async ({ value }) => {
    const response = value as {
      fields: unknown;
      rows: unknown;
      truncated: boolean;
      receipt: {
        job: { project_id: string; job_id: string; location: string } | null;
        bytes_billed: string | null;
        cache_hit: boolean | null;
      };
    };
    const result = await runManagedQuery(client(reply(value)), {
      name: "orders",
      sql: "SELECT 1",
      partial: true,
    });
    expect(result).toEqual({
      fields: response.fields,
      rows: response.rows,
      truncated: response.truncated,
      job: response.receipt.job
        ? {
            projectId: response.receipt.job.project_id,
            jobId: response.receipt.job.job_id,
            location: response.receipt.job.location,
          }
        : null,
      bytesBilled: response.receipt.bytes_billed,
      cacheHit: response.receipt.cache_hit,
    });
  });

  it.each(examples.query_response.invalid)("refuses $case as an unexpected response", async ({ value }) => {
    await expect(runManagedQuery(client(reply(value)), { name: "orders", sql: "SELECT 1" })).rejects.toMatchObject({
      kind: "response_invalid",
    });
  });
});

describe("errors", () => {
  const kinds: Record<string, WarehouseErrorKind> = {
    token_invalid: "credential_invalid",
    access_denied: "permission_denied",
    relation_not_found: "not_found",
    result_too_large: "result_too_large",
    rate_limited: "quota_exceeded",
    source_unavailable: "permission_denied",
    query_timeout: "deadline_exceeded",
    internal_error: "transient",
  };

  it.each(examples.error.valid)("maps $case to its WarehouseError", async ({ case: name, value, status }) => {
    const error = await runManagedQuery(client(reply(value, status)), { name: "orders", sql: "SELECT 1" }).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(WarehouseError);
    expect((error as WarehouseError).kind).toBe(kinds[name]);
    expectManagedCopy(error);
  });

  it("titles an unreachable warehouse as one, not as a refusal", async () => {
    const unavailable = example(examples.error, "source_unavailable");
    const error = (await runManagedQuery(client(reply(unavailable.value, unavailable.status)), {
      name: "orders",
      sql: "SELECT 1",
    }).catch((caught: unknown) => caught)) as WarehouseError;
    expect(error.title).toBe("SourceMedium cannot reach this app's warehouse");
    expect(error.remedy).toMatch(/cannot reach this app's warehouse/);
  });

  it.each([
    [401, { success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } }],
    [403, "<html>Forbidden</html>"],
    [404, ""],
  ])("never reads a reply that is not the data API's (%i) as a refused token", async (status, body) => {
    const error = (await runManagedQuery(client(reply(body, status)), { name: "orders", sql: "SELECT 1" }).catch(
      (caught: unknown) => caught,
    )) as WarehouseError;
    expect(error).toMatchObject({ kind: "response_invalid", status, reason: "data_api_unreadable" });
    expect(error.remedy).toContain(`SM_DATA_API_URL answered HTTP ${status}`);
    expectManagedCopy(error);
  });

  it("keeps managed copy for edge rate limits, outages, transport failures and malformed answers", async () => {
    const failures = await Promise.all([
      runManagedQuery(client(reply("Too many requests", 429)), { name: "orders", sql: "SELECT 1" }).catch(
        (e: unknown) => e,
      ),
      loadManagedContext(client(reply("<html>Bad gateway</html>", 502))).catch((e: unknown) => e),
      loadManagedContext(
        client(
          vi.fn(async () => {
            throw new TypeError("network down");
          }),
        ),
      ).catch((e: unknown) => e),
      runManagedQuery(client(reply({ contract_version: 1 })), { name: "orders", sql: "SELECT 1" }).catch(
        (e: unknown) => e,
      ),
      loadManagedContext(client(reply({ app: null }))).catch((e: unknown) => e),
    ]);
    expect(failures.map((error) => (error as WarehouseError).kind)).toEqual([
      "quota_exceeded",
      "transient",
      "transient",
      "response_invalid",
      "response_invalid",
    ]);
    for (const error of failures) expectManagedCopy(error);
  });

  it("gives a missing relation the shape the optional-table fallbacks read, and nothing else", async () => {
    const missing = example(examples.error, "relation_not_found");
    const error = (await runManagedQuery(client(reply(missing.value, missing.status)), {
      name: "orders",
      sql: "SELECT 1",
    }).catch((caught: unknown) => caught)) as WarehouseError;
    expect(error).toMatchObject({ kind: "not_found", job: null });
    const { reason: _reason, ...withoutReason } = (missing.value as { error: Record<string, unknown> }).error;
    const plain = (await runManagedQuery(client(reply({ error: withoutReason }, 400)), {
      name: "orders",
      sql: "SELECT 1",
    }).catch((caught: unknown) => caught)) as WarehouseError;
    expect(plain.kind).toBe("invalid_query");
  });

  it("never resends a query whose response was lost", async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError("network down");
    });
    await expect(runManagedQuery(client(fetch), { name: "orders", sql: "SELECT 1" })).rejects.toMatchObject({
      kind: "submission_indeterminate",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("treats a 5xx without the API's error body as indeterminate", async () => {
    const fetch = reply("<html>Bad gateway</html>", 502);
    await expect(runManagedQuery(client(fetch), { name: "orders", sql: "SELECT 1" })).rejects.toMatchObject({
      kind: "submission_indeterminate",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("reports a deadline as deadline_exceeded", async () => {
    const fetch = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) =>
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)),
        ),
    );
    await expect(
      runManagedQuery(
        client(fetch as unknown as typeof globalThis.fetch),
        { name: "orders", sql: "SELECT 1" },
        {
          deadlineMs: 5,
        },
      ),
    ).rejects.toMatchObject({ kind: "deadline_exceeded" });
  });
});

describe("context", () => {
  const context = example(examples.context, "developer_token").value as {
    app: { id: string };
    warehouse: {
      project_id: string;
      transformed_dataset: string;
      metadata_dataset: string;
      allowed_datasets: string[];
    };
  };

  it("reads the dataset roles explicitly", async () => {
    const fetch = reply(context);
    await expect(loadManagedContext(client(fetch))).resolves.toEqual({
      appId: context.app.id,
      projectId: context.warehouse.project_id,
      transformedDatasetId: context.warehouse.transformed_dataset,
      metadataDatasetId: context.warehouse.metadata_dataset,
      allowedDatasets: context.warehouse.allowed_datasets,
    });
    expect((fetch.mock.calls[0] as unknown as [string])[0]).toBe(`${API}/context`);
  });

  it("retries one transient failure, being idempotent", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({}, { status: 503 }))
      .mockResolvedValueOnce(Response.json(context));
    await expect(loadManagedContext(client(fetch))).resolves.toMatchObject({ appId: context.app.id });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("never retries a refused token", async () => {
    const refused = example(examples.error, "token_invalid");
    const fetch = reply(refused.value, refused.status);
    await expect(loadManagedContext(client(fetch))).rejects.toMatchObject({ kind: "credential_invalid" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("managed connection checks", () => {
  it("show the adapter's own title and remedy, not the self-hosted copy for that kind", async () => {
    const denied = example(examples.error, "access_denied");
    const warehouse: Warehouse = {
      applicationId: "app",
      table: (name) => `\`project.dataset.${name}\``,
      query: async () => {
        throw managedApiError(denied.status ?? 403, denied.value);
      },
      checkConnection: async () => {
        throw new Error("unused");
      },
    };
    const context = {
      appId: "app",
      projectId: "project",
      transformedDatasetId: "dataset",
      metadataDatasetId: "metadata",
      allowedDatasets: ["dataset", "metadata"],
    };
    const report = await checkManagedConnection(context, warehouse, new AbortController().signal);
    const failed = report.checks.find((check) => check.status === "fail");
    expect(failed?.message).toMatch(/^SourceMedium refused this app's request\. /);
    expect(failed?.message).not.toMatch(/Google|BigQuery|app key|job project/i);
  });
});

describe("managed request correlation", () => {
  const id = "47ca1e6b-fa2c-4e96-aa86-39801bb3dbeb";
  it("correlates successful and refused queries with API logs without leaking request values", async () => {
    const lines: string[] = [];
    const original = emit;
    setLogEmitter((line) => lines.push(line));
    try {
      const success = { ...(example(examples.query_response, "inline_scalars").value as object), request_id: id };
      await runManagedQuery(client(reply(success)), { name: "support-test", sql: "SELECT 'private-sql'" });
      expect(JSON.parse(lines[0] ?? "{}")).toMatchObject({ request_id: id, error_kind: null });
      const body = {
        error: { code: "ACCESS_DENIED", message: "private-provider-message", retryable: false, request_id: id },
      };
      await expect(
        runManagedQuery(client(reply(body, 403)), { name: "support-test", sql: "SELECT 'private-sql'" }),
      ).rejects.toMatchObject({ requestId: id, kind: "permission_denied" });
      expect(JSON.parse(lines[1] ?? "{}")).toMatchObject({ request_id: id, error_kind: "permission_denied" });
      expect(lines.join("\n")).not.toMatch(/private-sql|private-provider-message|smapp_/);
      const report = await refusedWarehouse(managedApiError(403, body)).checkConnection();
      expect(connectionReportText(report)).toContain(`Support code: ${id}`);
    } finally {
      setLogEmitter(original);
    }
  });

  it("never treats arbitrary upstream text as a support code", () => {
    const error = managedApiError(403, {
      error: { code: "ACCESS_DENIED", message: "private", retryable: false, request_id: TOKEN },
    });
    expect(error.requestId).toBeNull();
    expect(
      connectionReportText({
        mode: "live",
        checks: [{ name: "Access", status: "fail", message: "Refused", requestId: TOKEN }],
      }),
    ).not.toContain(TOKEN);
  });
});

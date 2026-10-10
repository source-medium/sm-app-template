import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseConfig } from "@/lib/config/env.server";
import { warehouseFor } from "@/lib/data/warehouse.server";
import { connectionReportText } from "@/lib/data/connection-report";
import { liveEnv, makeServiceAccountKey } from "../helpers/service-account";
import { createFakeBigQuery, googleError, hang, queryResponse } from "../fake-bigquery/fake-bigquery";
import { emit, setLogEmitter } from "@/lib/data/log";

const originalEmit = emit;
const row = (values: unknown[]) => ({ f: values.map((v) => ({ v })) });
function fakeWarehouse(
  options: { empty?: boolean; missingDimension?: boolean; location?: string; missingColumns?: boolean } = {},
) {
  return createFakeBigQuery({
    metadata: () =>
      Response.json({
        location: options.location ?? "US",
        schema: {
          fields: (options.missingColumns ? ["date", "order_net_revenue"] : ["sm_store_id", "date"]).map((name) => ({
            name,
            type: "STRING",
          })),
        },
      }),
    submit: ({ body }) => {
      const query = body as { query: string; dryRun?: boolean };
      if (query.dryRun) return Response.json(queryResponse({ totalBytesProcessed: "1" }));
      if (options.missingDimension && query.query.includes(".dim_stores`")) return googleError(404, "notFound");
      if (query.query.includes("store_name"))
        return Response.json(
          queryResponse({
            schema: {
              fields: ["sm_store_id", "store_name", "brand_name", "store_timezone"].map((name) => ({
                name,
                type: "STRING",
              })),
            },
            rows: options.empty ? [] : [row(["private-store", "Private Brand", "Private Brand", "America/Chicago"])],
          }),
        );
      const names = query.query.includes("column_name")
        ? ["column_name", "data_type", "column_description", "table_description"]
        : ["metric_name", "metric_label", "metric_description", "calculation"];
      return Response.json(
        queryResponse({ schema: { fields: names.map((name) => ({ name, type: "STRING" })) }, rows: [] }),
      );
    },
  });
}

async function setup(fake = fakeWarehouse(), storeId: string | null = "private-store") {
  const key = await makeServiceAccountKey();
  const config = parseConfig(liveEnv(key));
  if (config.status !== "ok" || config.mode !== "live") throw new Error("Expected live config");
  config.live.applicationId = crypto.randomUUID();
  vi.stubGlobal("fetch", fake.fetch);
  return { warehouse: warehouseFor(config.live, storeId), fake, key };
}

beforeEach(() => setLogEmitter(() => undefined));
afterEach(() => {
  vi.unstubAllGlobals();
  setLogEmitter(originalEmit);
});

describe("connection diagnostics", () => {
  it("uses the real protocol, respects the deployment store, and returns no credential or data values", async () => {
    const { warehouse, fake, key } = await setup();
    const report = await warehouse.checkConnection();
    expect(report.checks.every((check) => check.status === "pass")).toBe(true);
    const text = connectionReportText(report);
    for (const value of [
      key.base64,
      "ya29.test-token",
      "private-store",
      "Private Brand",
      "sm-demotenant",
      "SELECT",
      "private_key",
    ])
      expect(text).not.toContain(value);
    const storeQueries = fake.calls.filter(
      (call) => call.kind === "submit" && String((call.body as { query: string }).query).includes("store_name"),
    );
    expect(storeQueries.length).toBeGreaterThan(0);
    for (const call of storeQueries)
      expect(call.body).toMatchObject({
        queryParameters: expect.arrayContaining([
          { name: "store_id", parameterType: { type: "STRING" }, parameterValue: { value: "private-store" } },
        ]),
      });
    expect(
      fake.calls.some((call) =>
        String((call.body as { query?: string } | null)?.query).includes("dim_semantic_metric_catalog"),
      ),
    ).toBe(true);
  });

  it("requires only the store column the shell reads; report columns belong to each view", async () => {
    const { warehouse } = await setup(fakeWarehouse({ missingColumns: true }));
    expect((await warehouse.checkConnection()).checks.at(-1)).toMatchObject({
      name: "Store column",
      status: "fail",
    });
    const { warehouse: minimal } = await setup(fakeWarehouse());
    expect((await minimal.checkConnection()).checks.every((check) => check.status === "pass")).toBe(true);
  });

  it("stops at an invalid credential without echoing provider text", async () => {
    const fake = createFakeBigQuery({
      token: () => Response.json({ error: "invalid_grant", error_description: "PRIVATE_CREDENTIAL" }, { status: 400 }),
    });
    const { warehouse } = await setup(fake);
    const report = await warehouse.checkConnection();
    expect(report.checks).toEqual([expect.objectContaining({ name: "App credential", status: "fail" })]);
    expect(JSON.stringify(report)).not.toContain("PRIVATE_CREDENTIAL");
    expect(fake.count("submit")).toBe(0);
  });

  it("reports a location mismatch without querying or revealing configured values", async () => {
    const { warehouse, fake } = await setup(fakeWarehouse({ location: "EU" }));
    const report = await warehouse.checkConnection();
    expect(report.checks.at(-1)).toMatchObject({ name: "Warehouse location", status: "fail" });
    expect(fake.count("submit")).toBe(0);
  });

  it("rejects an empty restricted roster and distinguishes the missing-dimension fallback", async () => {
    const { warehouse } = await setup(fakeWarehouse({ empty: true }));
    expect((await warehouse.checkConnection()).checks.at(-1)).toMatchObject({
      name: "Available stores",
      status: "fail",
    });
    const fallback = await setup(fakeWarehouse({ missingDimension: true }));
    expect((await fallback.warehouse.checkConnection()).checks).toContainEqual(
      expect.objectContaining({ name: "Store names", status: "warning" }),
    );
  });

  it("cancels an in-progress metadata check and does not continue to queries", async () => {
    const controller = new AbortController();
    const fake = createFakeBigQuery({
      metadata: (_call, signal) => {
        controller.abort();
        return hang(signal);
      },
    });
    const { warehouse } = await setup(fake);
    const report = await warehouse.checkConnection(controller.signal);
    expect(report.checks.at(-1)).toMatchObject({ name: "Report dataset", status: "fail" });
    expect(fake.count("submit")).toBe(0);
  });

  it("never copies BigQuery SQL error details into the report", async () => {
    const fake = createFakeBigQuery({
      metadata: () => Response.json({ location: "US" }),
      submit: () => googleError(400, "invalidQuery", "SELECT PRIVATE_VALUE"),
    });
    const { warehouse } = await setup(fake);
    const report = await warehouse.checkConnection();
    expect(report.checks.at(-1)?.status).toBe("fail");
    expect(connectionReportText(report)).not.toContain("PRIVATE_VALUE");
  });
});

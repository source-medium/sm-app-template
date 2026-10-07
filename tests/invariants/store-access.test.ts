import { afterEach, expect, it, vi } from "vitest";
import { assertStoreAccess, StoreAccessError } from "@/lib/auth/store-access";
import { parseConfig } from "@/lib/config/env.server";
import { warehouseFor } from "@/lib/data/warehouse.server";
import { queryStoreRoster } from "@/lib/data/store-roster.server";
import { createFakeBigQuery } from "../fake-bigquery/fake-bigquery";
import { rowsResponse } from "../helpers/live";
import { liveEnv, makeServiceAccountKey } from "../helpers/service-account";

afterEach(() => vi.unstubAllGlobals());

it("matches store ids exactly and denies unknown scope without leaking names", () => {
  expect(() => assertStoreAccess(null, "anything")).not.toThrow();
  expect(() => assertStoreAccess("store-a", "store-a")).not.toThrow();
  for (const value of [undefined, "", "store-b", "STORE-A", "store-a "]) {
    expect(() => assertStoreAccess("store-a", value)).toThrow(new StoreAccessError());
  }
});

it("the scoped warehouse rejects missing, mismatched and duplicate store parameters before any network call", async () => {
  const config = parseConfig(liveEnv(await makeServiceAccountKey()));
  if (config.status !== "ok" || config.mode !== "live") throw new Error("Expected live configuration");
  const fake = createFakeBigQuery({
    submit: () =>
      rowsResponse(
        [
          { name: "sm_store_id", type: "STRING" },
          { name: "store_name", type: "STRING" },
          { name: "brand_name", type: "STRING" },
        ],
        [{ sm_store_id: "store-a", store_name: "Store A", brand_name: "Brand" }],
      ),
  });
  vi.stubGlobal("fetch", fake.fetch);
  const warehouse = warehouseFor(config.live, "store-a");
  for (const params of [
    [],
    [{ name: "store_id", type: "STRING" as const, value: "store-b" }],
    [{ name: "store_id", type: "INT64" as const, value: 1 }],
    [
      { name: "store_id", type: "STRING" as const, value: "store-a" },
      { name: "store_id", type: "STRING" as const, value: "store-b" },
    ],
  ]) {
    await expect(warehouse.query({ name: "scope_test", sql: "SELECT 1", params })).rejects.toBeInstanceOf(
      StoreAccessError,
    );
  }
  expect(fake.calls).toHaveLength(0);
  expect(await queryStoreRoster(warehouse, "store-a")).toEqual({
    relation: "dim_stores",
    stores: [{ sm_store_id: "store-a", store_name: "Store A", brand_name: "Brand" }],
  });
  const body = fake.calls.find((call) => call.kind === "submit")?.body as { query: string; queryParameters: unknown[] };
  expect(body.query).toContain("AND sm_store_id = @store_id");
  expect(body.queryParameters).toContainEqual({
    name: "store_id",
    parameterType: { type: "STRING" },
    parameterValue: { value: "store-a" },
  });
});

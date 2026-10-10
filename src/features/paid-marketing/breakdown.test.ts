import { afterEach, expect, it, vi } from "vitest";
import { goLive, requestHeaders, rowsResponse } from "../../../tests/helpers/live";
import { samplePaidSource, sampleSpendBreakdown } from "./sample";
import { sumDecimals } from "@/lib/data/decimal";

vi.mock("next/headers", () => ({ headers: async () => requestHeaders.current }));
vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), cache: <T>(fn: T) => fn }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const filters = { storeId: "sample-store-a", range: { from: "2026-09-01", to: "2026-09-07" }, channel: null };
const baseline = { from: "2025-09-01", to: "2025-09-07" };
const fields = [
  { name: "dimension_key", type: "STRING" },
  { name: "label", type: "STRING" },
  ...["spend", "previous_spend", "total_spend", "minimum_spend"].map((name) => ({ name, type: "NUMERIC" })),
  ...["latest_date", "previous_latest_date"].map((name) => ({ name, type: "DATE" })),
];

it("reconciles sample spend and channel-filtered campaign shares without changing the denominator", async () => {
  const rows = (await sampleSpendBreakdown(filters, "channel", baseline)).rows;
  const sourceCents = samplePaidSource(filters.storeId, filters.range).reduce(
    (total, row) => total + row.spendCents,
    0n,
  );
  expect(rows[0]?.total_spend).toBe(sumDecimals(rows.map((row) => row.spend)));
  expect(Number(rows[0]?.total_spend) * 100).toBeCloseTo(Number(sourceCents), 5);
  const campaigns = await sampleSpendBreakdown({ ...filters, channel: "Meta" }, "campaign", null);
  expect(campaigns.rows).toHaveLength(3);
  expect(campaigns.rows.every((row) => row.previous_spend === null)).toBe(true);
  expect(campaigns.rows[0]?.total_spend).toBe(rows.find((row) => row.label === "Meta")?.spend);
});

it("uses typed parameters and SQL totals before top-N, retaining exact decimals", async () => {
  const fake = await goLive({
    submit: () =>
      rowsResponse(
        fields,
        Array.from({ length: 11 }, (_, i) => ({
          dimension_key: String(i),
          label: `Channel ${i}`,
          spend: "0.1",
          previous_spend: null,
          total_spend: "9007199254740993.123456789",
          minimum_spend: "0.1",
          latest_date: "2026-09-07",
          previous_latest_date: null,
        })),
      ),
  });
  const { getSpendBreakdown } = await import("./queries");
  const channel = "x' OR TRUE --";
  const data = await getSpendBreakdown({ ...filters, channel }, "campaign", baseline);
  expect(data.rows).toHaveLength(10);
  expect(data.hasMore).toBe(true);
  expect(data.rows[0]?.total_spend).toBe("9007199254740993.123456789");
  const body = fake.calls.find((call) => call.kind === "submit")?.body as {
    query: string;
    queryParameters: { name: string; parameterType: { type: string }; parameterValue: { value: string } }[];
  };
  expect(body.query).toContain("sm_store_id = @store_id");
  expect(body.query).toContain("SUM(spend) OVER () AS total_spend");
  expect(body.query).toContain("LIMIT 11");
  expect(body.query).not.toContain(channel);
  const params = Object.fromEntries(body.queryParameters.map((param) => [param.name, param.parameterValue.value]));
  expect(params).toMatchObject({
    store_id: filters.storeId,
    channel,
    compare: "true",
    baseline_from: baseline.from,
    baseline_to: baseline.to,
  });
});

it("rejects a truncated response instead of presenting unverified totals", async () => {
  await goLive({
    submit: () =>
      rowsResponse(
        fields,
        Array.from({ length: 11 }, () => ({
          dimension_key: "a",
          label: "A",
          spend: "1",
          previous_spend: "1",
          total_spend: "20",
          minimum_spend: "1",
          latest_date: "2026-09-07",
          previous_latest_date: null,
        })),
        { pageToken: "more" },
      ),
  });
  const { getSpendBreakdown } = await import("./queries");
  await expect(getSpendBreakdown(filters, "channel", null)).rejects.toMatchObject({ kind: "result_too_large" });
});

it("denies another store in both loaders before any warehouse call", async () => {
  const fake = await goLive({ submit: () => rowsResponse(fields, []) });
  vi.stubEnv("APP_STORE_ID", "another-store");
  const { getSpendBreakdown } = await import("./queries");
  const { querySpendBreakdown } = await import("./bigquery");
  await expect(getSpendBreakdown(filters, "channel", null)).rejects.toThrow("This store is not available");
  await expect(querySpendBreakdown(filters, "channel", null)).rejects.toThrow("This store is not available");
  expect(fake.calls).toHaveLength(0);
});

import { expect, it, vi } from "vitest";
import { GET } from "./download";
import { parseCsv } from "../../../scripts/lib/reconciliation";
import { sumDecimals } from "@/lib/data/decimal";
import { goLive } from "../../../tests/helpers/live";
it("exports independent scoped totals including all geographic groups without changing date basis", async () => {
  const response = await GET(
    new Request(
      "https://example.test/geography/export?store=sample-store-a&from=2026-09-01&to=2026-09-07&date_basis=created&country=US",
    ),
  );
  expect(response.status).toBe(200);
  const rows = parseCsv(await response.text());
  const total = rows.find((row) => row.row_type === "total");
  expect(total?.date_basis).toBe("created");
  expect(total?.population).toBe("valid");
  expect(total?.country).toBe("US");
  const groups = rows.filter((row) => row.row_type !== "total");
  expect(sumDecimals(groups.map((row) => row.net_revenue || null))).toBe(total?.net_revenue);
  expect(groups.reduce((n, row) => n + BigInt(row.valid_orders ?? "0"), 0n).toString()).toBe(total?.valid_orders);
});
it("rejects invalid date bases and other stores without a business query", async () => {
  const bad = await GET(new Request("https://example.test/geography/export?store=sample-store-a&date_basis=bad"));
  expect(bad.status).toBe(400);
  expect(await bad.json()).toEqual({ title: "Check the filters", remedy: "Choose a supported date basis." });
  const fake = await goLive({});
  vi.stubEnv("APP_STORE_ID", "allowed");
  expect((await GET(new Request("https://example.test/geography/export?store=other"))).status).toBe(403);
  expect(fake.calls).toHaveLength(0);
});

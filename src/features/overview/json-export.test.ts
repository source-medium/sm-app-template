import { expect, it, vi } from "vitest";
import { GET } from "./download-json";
import { GET as csv } from "./download";
import { parseCsv } from "../../../scripts/lib/reconciliation";
import { goLive } from "../../../tests/helpers/live";
it("exports raw values and context from the same scoped result without changing CSV", async () => {
  const url =
    "https://example.test/overview/export.json?store=sample-store-a&from=2026-09-01&to=2026-09-07&compare=off&sales_channel=amazon&grain=week";
  const response = await GET(new Request(url));
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  const body = await response.json();
  expect(body.context.filters).toMatchObject({
    storeId: "sample-store-a",
    range: { from: "2026-09-01", to: "2026-09-07" },
    channel: "amazon",
    grain: "week",
  });
  expect(body.context.query.immutableSnapshot).toBe(false);
  expect(body.context.evidence.pipelineFreshness).toBe("unknown");
  const rows = parseCsv(await (await csv(new Request(url.replace("export.json", "export")))).text());
  const total = rows.find((row) => row.row_type === "total");
  expect(body.results.current.totals.netRevenue).toBe(total?.net_revenue);
  expect(String(body.results.current.totals.orders)).toBe(total?.summary_orders);
  expect(body.results.current.totals.sessions).toBe(total?.website_sessions);
  // The raw results carry exactly the measures the report presents.
  expect(Object.keys(body.results.current.totals).sort()).toEqual(["adSpend", "netRevenue", "orders", "sessions"]);
});
it("authorizes JSON export store scope before business reads", async () => {
  const fake = await goLive({});
  vi.stubEnv("APP_STORE_ID", "allowed");
  const response = await GET(
    new Request("https://example.test/overview/export.json?store=other&from=2026-09-01&to=2026-09-02"),
  );
  expect(response.status).toBe(403);
  expect(fake.calls).toHaveLength(0);
});

it("normalizes malformed grains and multi-channel scopes identically in JSON and CSV", async () => {
  const url = new URL(
    "https://example.test/overview/export.json?store=sample-store-a&from=2026-09-01&to=2026-09-07&compare=off&grain=invalid",
  );
  url.searchParams.set("sales_channel", '["online_dtc","amazon"]');
  const json = await GET(new Request(url));
  expect(json.status).toBe(200);
  const body = await json.json();
  expect(body.context.filters).toMatchObject({ channel: '["amazon","online_dtc"]', grain: "day" });
  url.pathname = "/overview/export";
  const response = await csv(new Request(url));
  expect(response.status).toBe(200);
  const rows = parseCsv(await response.text());
  expect(rows.filter((row) => row.row_type === "period")).toHaveLength(7);
  expect(rows.every((row) => row.grain === "day" && row.sales_channel === '["amazon","online_dtc"]')).toBe(true);
  expect(rows.find((row) => row.row_type === "total")?.net_revenue).toBe(body.results.current.totals.netRevenue);
});

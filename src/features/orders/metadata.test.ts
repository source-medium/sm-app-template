import { expect, it, vi } from "vitest";
import { goLive, rowsResponse } from "../../../tests/helpers/live";
import { googleError } from "../../../tests/fake-bigquery/fake-bigquery";
import { loadReportMetadata } from "@/lib/data/report-metadata.server";
vi.unmock("@/lib/request-scope");

it("metadata denial cannot discard valid business results", async () => {
  const { getOrders } = await import("./queries");
  const filters = { storeId: "store-a", range: { from: "2026-09-01", to: "2026-09-02" }, search: null, cursor: null };
  const business = {
    order_key: "fixture-order",
    order_name: "Sample order",
    order_processed_at_local_datetime: "2026-09-01T12:00:00",
    sm_channel: "Online DTC",
    sm_sub_channel: null,
    sm_order_type: "first",
    order_payment_status: "paid",
    order_cart_quantity: "1",
    order_net_revenue: "12.123456789",
  };
  const fields = Object.keys(business).map((name) => ({ name, type: "STRING" }));
  await goLive({
    submit: (call) =>
      (call.body as { query: string }).query.includes("INFORMATION_SCHEMA")
        ? googleError(403, "accessDenied")
        : rowsResponse(fields, [business]),
  });
  const [metadata, results] = await Promise.all([
    loadReportMetadata(filters.storeId, ["obt_orders"]),
    getOrders(filters),
  ]);
  expect(metadata.catalog).toBe("denied");
  expect(results.orders[0]?.netRevenue).toBe("12.123456789");
});

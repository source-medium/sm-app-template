/** Orders' live path end to end against the fake BigQuery: keyset pages and the detail read. */
import { describe, expect, it, vi } from "vitest";
import { expectEveryQueryScopedTo, goLive, rowsResponse } from "../../../tests/helpers/live";
import { PAGE_SIZE } from "./queries";

const FIELDS = [
  "order_key",
  "order_name",
  "order_processed_at_local_datetime",
  "sm_channel",
  "sm_sub_channel",
  "sm_order_type",
  "order_payment_status",
  "order_cart_quantity",
  "order_net_revenue",
].map((name) => ({ name, type: name === "order_processed_at_local_datetime" ? "DATETIME" : "STRING" }));

const order = (index: number) => ({
  order_key: `key-${String(100 - index).padStart(3, "0")}`,
  order_name: `#${1000 + index}`,
  order_processed_at_local_datetime: `2026-10-04T13:${String(59 - index).padStart(2, "0")}:00`,
  sm_channel: "Online DTC",
  sm_sub_channel: "Email",
  sm_order_type: "repeat",
  order_payment_status: "paid",
  order_cart_quantity: "2",
  order_net_revenue: "123456789012345678901.123456789",
});
const FILTERS = { storeId: "store-1", range: { from: "2026-09-01", to: "2026-10-04" }, search: null, cursor: null };

describe("orders, live", () => {
  it("filters on the partition column and asks for one extra row to know whether another page exists", async () => {
    const fake = await goLive({
      submit: () =>
        rowsResponse(
          FIELDS,
          Array.from({ length: PAGE_SIZE + 1 }, (_, index) => order(index)),
        ),
    });
    const { getOrders } = await import("./queries");
    const page = await getOrders(FILTERS);
    expect(page.orders).toHaveLength(PAGE_SIZE);
    expect(page.orders[0]?.netRevenue).toBe("123456789012345678901.123456789");
    expect(page.nextCursor).toEqual({ processedLocal: "2026-10-04T13:35:00", key: "key-076" });
    const submit = fake.submitted(0);
    expect(submit.query).toContain("order_processed_at_local_datetime >= DATETIME(@start_date)");
    expect(submit.query).toContain("ORDER BY order_processed_at_local_datetime DESC, sm_order_key DESC");
    expect(submit.query).not.toContain("@cursor_at");
  });

  it("continues after the cursor with typed parameters and searches by parameter, never by string building", async () => {
    const fake = await goLive({ submit: () => rowsResponse(FIELDS, [order(1)]) });
    const { getOrders } = await import("./queries");
    const search = "1001' OR '1'='1";
    const page = await getOrders({
      ...FILTERS,
      search,
      channel: search,
      cursor: { processedLocal: "2026-10-04T14:00:00", key: "key-100" },
    });
    expect(page.nextCursor).toBeNull();
    const submit = fake.submitted(0);
    expect(submit.query).not.toContain(search);
    expect(submit.queryParameters.find((parameter) => parameter.name === "search")?.parameterValue.value).toBe(search);
    expect(submit.query).toContain("IFNULL(sm_channel, '(none)') = @channel");
    expect(submit.queryParameters.find((parameter) => parameter.name === "channel")).toEqual({
      name: "channel",
      parameterType: { type: "STRING" },
      parameterValue: { value: search },
    });
    const cursorAt = submit.queryParameters.find((parameter) => parameter.name === "cursor_at");
    expect(cursorAt?.parameterType.type).toBe("DATETIME");
    expect(cursorAt?.parameterValue.value).toBe("2026-10-04T14:00:00");
  });

  it("reads one order by key and processed time, pruning to its partition", async () => {
    const fake = await goLive({ submit: () => rowsResponse(FIELDS, []) });
    const { getOrderDetail } = await import("./queries");
    expect(await getOrderDetail("store-1", { processedLocal: "2026-10-04T13:22:11", key: "k" })).toBeNull();
    const submit = fake.submitted(0);
    expect(submit.query).toContain("order_processed_at_local_datetime = @processed_at");
  });
});

// Exercise direct calls as well as pages: middleware cannot be the store boundary.
it("refuses another store in dispatch and live loaders before any warehouse call", async () => {
  const fake = await goLive({ submit: () => rowsResponse([], []) });
  vi.stubEnv("APP_STORE_ID", "allowed-store");
  const { getOrderChannels, getOrders } = await import("./queries");
  const { queryOrderChannels, queryOrders } = await import("./bigquery");
  await expect(getOrders(FILTERS)).rejects.toThrow("This store is not available");
  await expect(queryOrders(FILTERS)).rejects.toThrow("This store is not available");
  await expect(getOrderChannels(FILTERS)).rejects.toThrow("This store is not available");
  await expect(queryOrderChannels(FILTERS)).rejects.toThrow("This store is not available");
  expect(fake.calls).toHaveLength(0);
});

it("denies direct order-detail lookups for another store", async () => {
  const fake = await goLive({ submit: () => rowsResponse([], []) });
  vi.stubEnv("APP_STORE_ID", "allowed-store");
  const { getOrderDetail } = await import("./queries");
  const { queryOrderDetail } = await import("./bigquery");
  const ref = { processedLocal: "2026-10-01T12:00:00", key: "another-store-order" };
  await expect(getOrderDetail("store-1", ref)).rejects.toThrow("This store is not available");
  await expect(queryOrderDetail("store-1", ref)).rejects.toThrow("This store is not available");
  expect(fake.calls).toHaveLength(0);
});

it("allows the fixed store and keeps every SQL read scoped to it", async () => {
  const fake = await goLive({ submit: () => rowsResponse([], []) });
  vi.stubEnv("APP_STORE_ID", FILTERS.storeId);
  const { getOrders } = await import("./queries");
  await getOrders(FILTERS);
  expectEveryQueryScopedTo(fake, FILTERS.storeId);
});

it("scopes the complete channel roster to store/date and refuses a truncated picker", async () => {
  let truncate = false;
  const fake = await goLive({
    submit: () =>
      rowsResponse(
        [{ name: "channel", type: "STRING" }],
        truncate
          ? Array.from({ length: 50 }, (_, i) => ({ channel: String(i) }))
          : [{ channel: "(none)" }, { channel: "Amazon" }],
        truncate ? { pageToken: "more" } : {},
      ),
  });
  const { getOrderChannels } = await import("./queries");
  expect(await getOrderChannels(FILTERS)).toEqual(["(none)", "Amazon"]);
  const body = fake.submitted(0);
  expect(body.query).toContain("SELECT DISTINCT IFNULL(sm_channel, '(none)') AS channel");
  expect(body.query).toContain("sm_store_id = @store_id");
  expect(body.query).toContain("order_processed_at_local_datetime >= DATETIME(@start_date)");
  expect(body.query).not.toContain("@channel");
  expect(body.query).not.toContain("@cursor");
  expect(body.query).not.toContain("@search");
  expect(body.query).not.toContain("is_order_sm_valid = TRUE");
  truncate = true;
  await expect(getOrderChannels(FILTERS)).rejects.toMatchObject({ kind: "result_too_large" });
});

it("explicit processed uses canonical fallback; created never prunes on processed; legacy remains unchanged", async () => {
  for (const dateBasis of ["created", "processed"] as const) {
    const fake = await goLive({ submit: () => rowsResponse(FIELDS, []) });
    const { queryOrders } = await import("./bigquery");
    await queryOrders({ ...FILTERS, dateBasis, validOnly: true, country: "US", region: "CA" });
    const body = fake.submitted(0);
    expect(body.query).toContain("is_order_sm_valid = TRUE");
    expect(body.query).toContain("@region");
    expect(body.query).toContain("@country");
    if (dateBasis === "created") {
      expect(body.query).toContain("order_created_at_local_datetime >= DATETIME(@start_date)");
      expect(body.query).not.toContain("order_processed_at_local_datetime >=");
    } else {
      // The catalog fallback is written over the bare columns so the processed partition prunes.
      expect(body.query).toContain("order_processed_at_local_datetime >= DATETIME(@start_date)");
      expect(body.query).toContain(
        "order_processed_at_local_datetime IS NULL AND order_created_at_local_datetime >= DATETIME(@start_date)",
      );
      expect(body.query).not.toContain(
        "COALESCE(order_processed_at_local_datetime, order_created_at_local_datetime) >=",
      );
      expect(body.query).toContain(
        "ORDER BY COALESCE(order_processed_at_local_datetime, order_created_at_local_datetime) DESC",
      );
    }
  }
});
it("attribution is lazy, verifies order membership, and selects no raw signals or revenue", async () => {
  const fake = await goLive({ submit: () => rowsResponse([], []) });
  const { queryOrderAttribution } = await import("./bigquery");
  expect(await queryOrderAttribution("store-1", "private-order")).toMatchObject({ winnerCount: 0n, signals: [] });
  const body = fake.submitted(0);
  expect(body.query.match(/sm_store_id = @store_id/g)).toHaveLength(2);
  expect(body.query).toContain("EXISTS (SELECT 1 FROM");
  expect(body.query).toContain("COUNTIF(sm_utm_final_source_priority = 1) OVER ()");
  expect(body.query).toContain("LIMIT 101");
  expect(body.query).not.toMatch(/raw_|gclid|fbclid|survey_answer|order_net_revenue/);
  vi.stubEnv("APP_STORE_ID", "other");
  // A fresh request is needed because authorization is request-scoped.
  const { requestHeaders } = await import("../../../tests/helpers/live");
  requestHeaders.current = new Headers(requestHeaders.current);
  await expect(queryOrderAttribution("store-1", "private-order")).rejects.toThrow("This store is not available");
});

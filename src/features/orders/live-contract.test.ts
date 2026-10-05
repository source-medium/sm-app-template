/** Orders' live path end to end against the fake BigQuery: keyset pages and the detail read. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { goLive, requestHeaders, rowsResponse } from "../../../tests/helpers/live";
import { PAGE_SIZE } from "./queries";

vi.mock("next/headers", () => ({ headers: async () => requestHeaders.current }));
vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), cache: <T>(fn: T) => fn }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const FIELDS = [
  "order_key",
  "order_name",
  "order_created_at",
  "order_created_at_local_datetime",
  "sm_channel",
  "sm_sub_channel",
  "sm_order_type",
  "order_payment_status",
  "order_cart_quantity",
].map((name) => ({
  name,
  type: name === "order_created_at" ? "TIMESTAMP" : "STRING",
}));
const order = (index: number) => ({
  order_key: `key-${String(100 - index).padStart(3, "0")}`,
  order_name: `#${1000 + index}`,
  order_created_at: String(1_759_600_000_000_000n - BigInt(index) * 1_000_000n),
  order_created_at_local_datetime: "2026-10-04T13:22:11",
  sm_channel: "Online DTC",
  sm_sub_channel: "Email",
  sm_order_type: "repeat",
  order_payment_status: "paid",
  order_cart_quantity: "2",
});
const FILTERS = { storeId: "store-1", range: { from: "2026-09-01", to: "2026-10-04" }, search: null, cursor: null };

describe("orders, live", () => {
  it("asks for one extra row to know whether another page exists, and returns an exact cursor", async () => {
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
    expect(page.nextCursor).toEqual({
      createdAtMicros: 1_759_600_000_000_000n - BigInt(PAGE_SIZE - 1) * 1_000_000n,
      key: "key-076",
    });
    const submit = fake.calls.find((call) => call.kind === "submit")?.body as { query: string };
    expect(submit.query).toContain("ORDER BY order_created_at DESC, sm_order_key DESC");
    expect(submit.query).not.toContain("@cursor_micros");
  });

  it("continues after the cursor with typed parameters and searches by parameter, never by string building", async () => {
    const fake = await goLive({ submit: () => rowsResponse(FIELDS, [order(1)]) });
    const { getOrders } = await import("./queries");
    const search = "1001' OR '1'='1";
    const page = await getOrders({
      ...FILTERS,
      search,
      cursor: { createdAtMicros: 1_759_600_000_000_000n, key: "key-100" },
    });
    expect(page.nextCursor).toBeNull();
    const submit = fake.calls.find((call) => call.kind === "submit")?.body as {
      query: string;
      queryParameters: { name: string; parameterValue: { value: string } }[];
    };
    expect(submit.query).not.toContain(search);
    expect(submit.queryParameters.find((parameter) => parameter.name === "search")?.parameterValue.value).toBe(search);
    expect(submit.queryParameters.find((parameter) => parameter.name === "cursor_micros")?.parameterValue.value).toBe(
      "1759600000000000",
    );
  });

  it("reads one order by key and creation time", async () => {
    const fake = await goLive({ submit: () => rowsResponse(FIELDS, []) });
    const { getOrderDetail } = await import("./queries");
    expect(await getOrderDetail("store-1", { createdAtMicros: 5n, key: "k" })).toBeNull();
    const submit = fake.calls.find((call) => call.kind === "submit")?.body as { query: string };
    expect(submit.query).toContain("order_created_at = TIMESTAMP_MICROS(@created_micros)");
  });
});

import { expect, it } from "vitest";
import { orderDateEquals, orderDateExpression, orderDateWindow } from "./order-scope";
import { calendarDate } from "./format";
import { datesInRange } from "./filters";
it("keeps the processed-only default separate from explicit canonical fallback and created dates", () => {
  expect(orderDateExpression()).toBe("order_processed_at_local_datetime");
  expect(orderDateExpression("processed")).toBe(
    "COALESCE(order_processed_at_local_datetime, order_created_at_local_datetime)",
  );
  expect(orderDateExpression("created")).toBe("order_created_at_local_datetime");
});
it("writes the processed fallback window over bare columns so the processed partition can prune", () => {
  const window = orderDateWindow("processed", "@start_date", "@end_date");
  expect(window).toBe(
    "((order_processed_at_local_datetime >= DATETIME(@start_date) AND order_processed_at_local_datetime < DATETIME(DATE_ADD(@end_date, INTERVAL 1 DAY)))" +
      " OR (order_processed_at_local_datetime IS NULL AND order_created_at_local_datetime >= DATETIME(@start_date) AND order_created_at_local_datetime < DATETIME(DATE_ADD(@end_date, INTERVAL 1 DAY))))",
  );
  expect(orderDateWindow("created", "@a", "@b")).toBe(
    "(order_created_at_local_datetime >= DATETIME(@a) AND order_created_at_local_datetime < DATETIME(DATE_ADD(@b, INTERVAL 1 DAY)))",
  );
  expect(orderDateWindow(null, "@a", "@b")).toBe(
    "(order_processed_at_local_datetime >= DATETIME(@a) AND order_processed_at_local_datetime < DATETIME(DATE_ADD(@b, INTERVAL 1 DAY)))",
  );
  expect(orderDateEquals("processed", "@at")).toBe(
    "(order_processed_at_local_datetime = @at OR (order_processed_at_local_datetime IS NULL AND order_created_at_local_datetime = @at))",
  );
  expect(orderDateEquals(undefined, "@at")).toBe("order_processed_at_local_datetime = @at");
});
it("uses store calendar dates through midnight, DST transitions and leap years", () => {
  expect(calendarDate(new Date("2024-03-10T07:59:59Z"), "America/Los_Angeles")).toBe("2024-03-09");
  expect(calendarDate(new Date("2024-03-10T08:00:00Z"), "America/Los_Angeles")).toBe("2024-03-10");
  expect(calendarDate(new Date("2024-03-10T10:00:00Z"), "America/Los_Angeles")).toBe("2024-03-10");
  expect(calendarDate(new Date("2024-11-03T08:30:00Z"), "America/Los_Angeles")).toBe("2024-11-03");
  expect(calendarDate(new Date("2024-11-03T09:30:00Z"), "America/Los_Angeles")).toBe("2024-11-03");
  expect(datesInRange({ from: "2024-02-28", to: "2024-03-01" })).toEqual(["2024-02-28", "2024-02-29", "2024-03-01"]);
});

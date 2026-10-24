import { describe, expect, it } from "vitest";
import { testPortOffset } from "../../scripts/lib/test-ports";

describe("local test port offset", () => {
  it("is zero unless set, and accepts the highest offset that keeps every test port valid", () => {
    expect(testPortOffset({})).toBe(0);
    expect(testPortOffset({ SM_TEST_PORT_OFFSET: "20000" })).toBe(20000);
    expect(testPortOffset({ SM_TEST_PORT_OFFSET: "62426" })).toBe(62426);
  });

  it.each(["-1", "1.5", "", "62427"])("refuses %j rather than starting servers on the wrong ports", (offset) => {
    expect(() => testPortOffset({ SM_TEST_PORT_OFFSET: offset })).toThrow(
      "SM_TEST_PORT_OFFSET must be an integer from 0 through 62426.",
    );
  });
});

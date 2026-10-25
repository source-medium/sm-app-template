import { expect, it } from "vitest";
import { encodeRef, ordersOptions } from "./queries";

const ref = { processedLocal: "2026-09-01T10:00:00", key: "order-1" };

it("names each unsupported scope value instead of widening the list", () => {
  expect(ordersOptions({ date_basis: "shipped" }).scopeIssue).toBe("Choose a supported date basis.");
  expect(ordersOptions({ region: "CA" }).scopeIssue).toBe("Choose a country before a shipping region.");
  expect(ordersOptions({ population: "everything" }).scopeIssue).toBe("Choose a supported order population.");
  expect(ordersOptions({ date_basis: "created", population: "valid" })).toMatchObject({
    dateBasis: "created",
    validOnly: true,
    scopeIssue: null,
  });
});

it("keeps a cursor only on the date basis that wrote it", () => {
  expect(ordersOptions({ cursor: encodeRef(ref) }).cursor).toEqual(ref);
  expect(ordersOptions({ cursor: encodeRef(ref), date_basis: "created" }).cursor).toBeNull();
  const created = { ...ref, dateBasis: "created" as const };
  expect(ordersOptions({ cursor: encodeRef(created), date_basis: "created" }).cursor).toEqual(created);
});

it("bounds search text and ignores unknown evidence", () => {
  expect(ordersOptions({ q: `  ${"x".repeat(80)}  ` }).search).toHaveLength(64);
  expect(ordersOptions({ q: "   " }).search).toBeNull();
  expect(ordersOptions({ evidence: "attribution" }).evidence).toBe("attribution");
  expect(ordersOptions({ evidence: "other" }).evidence).toBeNull();
});

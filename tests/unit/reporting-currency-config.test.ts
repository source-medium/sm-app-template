import { describe, expect, it } from "vitest";
import { reportingCurrencyConfig } from "@/lib/data/stores.server";
import { liveCurrencyNote } from "@/components/shell/connection-currency";

describe("reporting currency configuration summary", () => {
  it("validates the deployment code and counts per-store overrides the way reportingCurrency() applies them", () => {
    expect(reportingCurrencyConfig({ currency: null, reportingCurrencies: {} })).toEqual({
      currency: null,
      invalidCurrency: null,
      labeledStores: 0,
      unlabeledStores: 0,
    });
    expect(
      reportingCurrencyConfig({ currency: "usd", reportingCurrencies: { a: "CAD", b: null, c: "not-a-code" } }),
    ).toEqual({ currency: "USD", invalidCurrency: null, labeledStores: 1, unlabeledStores: 2 });
    expect(reportingCurrencyConfig({ currency: "usd1", reportingCurrencies: {} })).toMatchObject({
      currency: null,
      invalidCurrency: "usd1",
    });
  });

  it("describes each configuration honestly on the Connection page", () => {
    expect(liveCurrencyNote(reportingCurrencyConfig({ currency: "USD", reportingCurrencies: {} }))).toEqual({
      status: "Amounts are labeled USD",
      detail: "Set in app.config.ts. The store currency published in dim_stores never chooses the label.",
    });
    expect(
      liveCurrencyNote(reportingCurrencyConfig({ currency: "USD", reportingCurrencies: { a: "CAD", b: null } })).detail,
    ).toContain("1 store uses its own code, and 1 store is set to show no currency");
    // Overrides alone still label those stores; the page must not say nothing is set.
    expect(
      liveCurrencyNote(reportingCurrencyConfig({ currency: null, reportingCurrencies: { a: "CAD" } })),
    ).toMatchObject({ status: "Set per store for 1 store" });
    const invalid = liveCurrencyNote(reportingCurrencyConfig({ currency: "usd1", reportingCurrencies: {} }));
    expect(invalid.status).toBe("Not set: amounts show no currency");
    expect(invalid.detail).toContain('sets "usd1", which is not a recognized ISO code, so it is ignored');
  });
});

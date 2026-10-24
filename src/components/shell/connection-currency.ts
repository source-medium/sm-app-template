/**
 * The Connection page's reporting-currency note. It mirrors how
 * reportingCurrency() in stores.server.ts labels live money, so the page can
 * never describe a configuration the reports do not apply.
 */
import type { ReportingCurrencyConfig } from "@/lib/data/stores.server";

export type CurrencyNote = { status: string; detail: string };

const STORE_CURRENCY =
  "Reports use each store’s store_currency_code from dim_stores unless app.config.ts explicitly overrides it. Missing or invalid codes leave amounts unlabeled.";
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function sampleCurrencyNote(): CurrencyNote {
  return {
    status: "Sample stores report in USD",
    detail: "After you connect a warehouse, reports use each store’s currency from dim_stores.",
  };
}

/** Describe the same metadata default and explicit overrides the reports apply. */
export function liveCurrencyNote(config: ReportingCurrencyConfig): CurrencyNote {
  const ignored = config.invalidCurrency
    ? `app.config.ts sets "${config.invalidCurrency}", which is not a recognized ISO code, so it is ignored. `
    : "";
  if (config.currency) {
    const exceptions = [
      config.labeledStores
        ? count(config.labeledStores, "store uses its own code", "stores use their own codes")
        : null,
      config.unlabeledStores
        ? count(config.unlabeledStores, "store is set to show no currency", "stores are set to show no currency")
        : null,
    ].filter(Boolean);
    return {
      status: `Amounts are labeled ${config.currency}`,
      detail: `Set in app.config.ts${exceptions.length ? `; ${exceptions.join(", and ")}` : ""}. ${STORE_CURRENCY}`,
    };
  }
  if (config.labeledStores) {
    return {
      status: `Set per store for ${count(config.labeledStores, "store", "stores")}`,
      detail: `${ignored}The listed stores use their app.config.ts override. Other stores use dim_stores. ${STORE_CURRENCY}`,
    };
  }
  return {
    status: "From store metadata",
    detail: `${ignored}${STORE_CURRENCY}`,
  };
}

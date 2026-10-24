/**
 * The Connection page's reporting-currency note. It mirrors how
 * reportingCurrency() in stores.server.ts labels live money, so the page can
 * never describe a configuration the reports do not apply.
 */
import type { ReportingCurrencyConfig } from "@/lib/data/stores.server";

export type CurrencyNote = { status: string; detail: string };

const NEVER_DIM_STORES = "The store currency published in dim_stores never chooses the label.";
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function sampleCurrencyNote(): CurrencyNote {
  return {
    status: "Sample stores report in USD",
    detail:
      "After you connect a warehouse, amounts get a currency label only once you verify the warehouse's reporting currency and set it in app.config.ts.",
  };
}

/**
 * `sourceCurrency` is the code the data source vouches for (a managed app's
 * SourceMedium workspace setting); it labels stores app.config.ts leaves alone.
 */
export function liveCurrencyNote(config: ReportingCurrencyConfig, sourceCurrency: string | null = null): CurrencyNote {
  const ignored = config.invalidCurrency
    ? `app.config.ts sets "${config.invalidCurrency}", which is not a recognized ISO code, so it is ignored. `
    : "";
  if (!config.currency && sourceCurrency) {
    return {
      status: `Amounts are labeled ${sourceCurrency}`,
      detail: `SourceMedium's workspace reporting currency, as its data API publishes it${config.labeledStores ? `; ${count(config.labeledStores, "store uses its own code from app.config.ts", "stores use their own codes from app.config.ts")}` : ""}. ${ignored}${NEVER_DIM_STORES}`,
    };
  }
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
      detail: `Set in app.config.ts${exceptions.length ? `; ${exceptions.join(", and ")}` : ""}. ${NEVER_DIM_STORES}`,
    };
  }
  if (config.labeledStores) {
    return {
      status: `Set per store for ${count(config.labeledStores, "store", "stores")}`,
      detail: `${ignored}Only the stores listed in reportingCurrencies in app.config.ts are labeled; other stores show no currency. ${NEVER_DIM_STORES}`,
    };
  }
  return {
    status: "Not set: amounts show no currency",
    detail: `${ignored}Verify the warehouse's reporting currency, then set it in app.config.ts. ${NEVER_DIM_STORES}`,
  };
}

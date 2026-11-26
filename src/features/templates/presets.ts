/**
 * Starting points for common questions. A preset is a destination view plus
 * fixed URL parameters: it never adds a query, formula or layout, and the store
 * comes from the current report. The IDs match the Metabase template's Start
 * here list, so the two lists stay in step.
 */
import { AD_RELATION } from "@/features/paid-marketing/rows";
import { ASSET_RELATION } from "@/features/creatives/assets";
import { GEOGRAPHY_RELATION } from "@/features/geography/rows";
import { OVERVIEW_RELATION } from "@/features/overview/rows";
import { PRODUCTS_RELATION } from "@/features/products/rows";
import { RETENTION_RELATION } from "@/features/retention/rows";
import { withParams } from "@/lib/filters";
import type { ReportMetadata } from "@/lib/data/report-metadata.server";
import type { Availability, SourceEvidence } from "@/lib/data/evidence";

export const PRESET_GROUPS = ["Business", "Marketing", "Products", "Customers"] as const;

export type Preset = {
  id: string;
  group: (typeof PRESET_GROUPS)[number];
  question: string;
  /** The destination: an `app.config.ts` nav href. A preset whose view was removed is not offered. */
  route: `/${string}`;
  params: Readonly<Record<string, string>>;
  /** A section of the destination to open at. */
  hash?: string;
  /** What the destination opens to, in a store owner's words. */
  opens: string;
  /** Sources the destination needs rows in. */
  requires: readonly string[];
  /** Sources that add detail: without rows the preset still works, limited as stated. */
  enhances?: readonly { relation: string; limitation: string }[];
  /** Compares stores, so it is offered only with more than one. */
  severalStores?: boolean;
};

/** Source names a store owner recognizes, for readiness messages. */
const SOURCE_NAMES: Record<string, string> = {
  [OVERVIEW_RELATION]: "the daily store summary",
  [AD_RELATION]: "ad performance",
  [ASSET_RELATION]: "creative assets",
  [PRODUCTS_RELATION]: "order lines",
  [RETENTION_RELATION]: "customer cohorts",
  [GEOGRAPHY_RELATION]: "orders",
};

const creativeAssets = {
  relation: ASSET_RELATION,
  limitation: "Creative images and text are not published for this store.",
} as const;

export const PRESETS: readonly Preset[] = [
  {
    id: "weekly-review",
    group: "Business",
    question: "What changed last week?",
    route: "/overview",
    params: { range: "last-week", compare: "previous", compare2: "off" },
    opens: "Overview for last week against the week before",
    requires: [OVERVIEW_RELATION],
  },
  {
    id: "monthly-review",
    group: "Business",
    question: "How did last month compare?",
    route: "/overview",
    params: { range: "last-month", compare: "previous", compare2: "year" },
    opens: "Overview for last month against the month before and the same month last year",
    requires: [OVERVIEW_RELATION],
  },
  {
    id: "channel-contribution",
    group: "Business",
    question: "Which sales channels drove the change?",
    route: "/overview",
    params: { range: "last-28-days" },
    hash: "channel-breakdown",
    opens: "Overview's sales channel contributions for the last 28 days",
    requires: [OVERVIEW_RELATION],
  },
  {
    id: "operating-scorecard",
    group: "Business",
    question: "Which operating measures moved?",
    route: "/performance",
    params: { view: "business", range: "last-month", compare: "previous", compare2: "year" },
    opens: "Performance tables for last month against both comparisons",
    requires: [OVERVIEW_RELATION],
  },
  {
    id: "store-portfolio",
    group: "Business",
    question: "Which stores need attention?",
    route: "/stores",
    params: {},
    opens: "All stores, each on its own row",
    requires: [OVERVIEW_RELATION],
    severalStores: true,
  },
  {
    id: "paid-efficiency",
    group: "Marketing",
    question: "How are spend and platform outcomes changing?",
    route: "/paid-marketing",
    params: { breakdown: "channel" },
    opens: "Paid marketing by ad platform",
    requires: [AD_RELATION],
  },
  {
    id: "creative-spend",
    group: "Marketing",
    question: "Where is creative spend concentrated?",
    route: "/creatives",
    params: { sort: "spend" },
    opens: "Creatives with the most spend first",
    requires: [AD_RELATION],
    enhances: [creativeAssets],
  },
  {
    id: "creative-formats",
    group: "Marketing",
    question: "Which formats and launch weeks differ?",
    route: "/creatives",
    params: {},
    hash: "creative-formats-heading",
    opens: "Creatives' formats and launches",
    requires: [AD_RELATION],
    enhances: [creativeAssets],
  },
  {
    id: "product-gainers",
    group: "Products",
    question: "Which products gained revenue?",
    route: "/products",
    params: { metric: "revenue", ranking: "gainers" },
    opens: "Products ranked by net revenue gained",
    requires: [PRODUCTS_RELATION],
  },
  {
    id: "product-profit",
    group: "Products",
    question: "Which products lost gross profit?",
    route: "/products",
    params: { metric: "profit", ranking: "decliners" },
    opens: "Products ranked by gross profit lost, with lines missing a product cost flagged",
    requires: [PRODUCTS_RELATION],
  },
  {
    id: "refund-concentration",
    group: "Products",
    question: "Where are refunds concentrated?",
    route: "/products",
    params: { metric: "refunds", ranking: "value" },
    opens: "Products ranked by refund amount",
    requires: [PRODUCTS_RELATION],
  },
  {
    id: "cohort-health",
    group: "Customers",
    question: "Are newer cohorts retaining better at the same age?",
    route: "/retention",
    params: {},
    opens: "Retention cohorts by month of age",
    requires: [RETENTION_RELATION],
  },
  {
    id: "geography-mix",
    group: "Customers",
    question: "Which locations changed?",
    route: "/geography",
    params: { range: "last-28-days" },
    opens: "Geography for the last 28 days",
    requires: [GEOGRAPHY_RELATION],
  },
];

/** Every source a preset reads, for one metadata request. */
export const PRESET_RELATIONS = [
  ...new Set(PRESETS.flatMap((preset) => [...preset.requires, ...(preset.enhances ?? []).map((e) => e.relation)])),
];

/** The presets this deployment offers: their view is in the navigation, and a store comparison needs several stores. */
export function offeredPresets(
  presets: readonly Preset[],
  { routes, storeCount }: { routes: readonly string[]; storeCount: number | null },
): Preset[] {
  return presets.filter(
    (preset) => routes.includes(preset.route) && (!preset.severalStores || storeCount === null || storeCount > 1),
  );
}

export function presetHref(preset: Preset, storeId: string): string {
  return `${withParams(preset.route, {}, { store: storeId, ...preset.params })}${preset.hash ? `#${preset.hash}` : ""}`;
}

export type Readiness = { state: "ready" } | { state: "limited" | "unavailable" | "unknown"; reason: string };

const DICTIONARY_STATUS: Record<Exclude<Availability, "accessible">, string> = {
  missing: "is not published",
  denied: "cannot be read with this connection",
  incompatible: "has an unexpected shape",
  unknown: "could not be read",
};

function sourceReadiness(relation: string, sources: readonly SourceEvidence[]): Readiness {
  const name = SOURCE_NAMES[relation] ?? relation;
  const source = sources.find((item) => item.relation === relation);
  if (!source) return { state: "unknown", reason: `Availability of ${name} was not checked.` };
  if (source.metadata !== "accessible")
    return { state: "unknown", reason: `The data dictionary ${DICTIONARY_STATUS[source.metadata]}.` };
  if (source.consistency === "inconsistent")
    return { state: "unknown", reason: `Published availability of ${name} for this store conflicts.` };
  if (source.hasData === true) return { state: "ready" };
  if (source.hasData === false)
    return {
      state: "unavailable",
      reason: `SourceMedium has published no ${name} for this store. Connect or check its source in SourceMedium.`,
    };
  return { state: "unknown", reason: `Availability of ${name} for this store is not published.` };
}

/**
 * Ready when every required source has rows for the store; limited when only a
 * source that adds detail lacks them; unavailable, naming the source and its
 * fix, when a required source has none; unknown when the dictionary cannot
 * say. Rows in a period are not checked here: a quiet period still opens.
 */
export function presetReadiness(preset: Preset, metadata: ReportMetadata): Readiness {
  if (metadata.mode === "sample") return { state: "ready" };
  const required = preset.requires.map((relation) => sourceReadiness(relation, metadata.sources));
  const blocking =
    required.find((item) => item.state === "unavailable") ?? required.find((item) => item.state === "unknown");
  if (blocking) return blocking;
  const missing = (preset.enhances ?? []).find(
    (item) => sourceReadiness(item.relation, metadata.sources).state !== "ready",
  );
  return missing ? { state: "limited", reason: missing.limitation } : { state: "ready" };
}

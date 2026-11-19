import { REVIEWED_METRICS, reviewedMetric } from "@/lib/reviewed-metrics";
import type { MetricBinding, ValueFormat } from "@/lib/metric-binding";
import type { Polarity } from "@/lib/comparison";
import { CREATIVE_RELATION } from "./rows";

/**
 * Which way each compared measure should move, declared beside its definition.
 * Spend, impressions and clicks are delivery: more is neither good nor bad on
 * its own. Conversions, revenue, ROAS and CTR should rise; cost per conversion
 * should fall.
 */
export const CREATIVE_POLARITY = {
  spend: "neutral",
  impressions: "neutral",
  clicks: "neutral",
  conversions: "higher",
  revenue: "higher",
  roas: "higher",
  cpo: "lower",
  ctr: "higher",
  creatives: "neutral",
} as const satisfies Record<string, Polarity>;

const measures: [string, string, string, string, string[], ValueFormat][] = [
  ["spend", "Spend", "total_ad_spend", "SUM(ad_spend)", ["ad_spend"], "currency"],
  [
    "revenue",
    "Platform revenue",
    "platform_reported_revenue",
    "SUM(ad_platform_reported_revenue)",
    ["ad_platform_reported_revenue"],
    "currency",
  ],
  [
    "conversions",
    "Conversions",
    "platform_reported_conversions",
    "SUM(ad_platform_reported_conversions)",
    ["ad_platform_reported_conversions"],
    "count",
  ],
  [
    "roas",
    "Platform ROAS",
    "platform_return_on_ad_spend",
    "SUM(ad_platform_reported_revenue) / SUM(ad_spend)",
    ["ad_platform_reported_revenue", "ad_spend"],
    "ratio",
  ],
  [
    "cpo",
    "Cost / conversion",
    "platform_cost_per_conversion",
    "SUM(ad_spend) / SUM(ad_platform_reported_conversions)",
    ["ad_spend", "ad_platform_reported_conversions"],
    "currency",
  ],
  ["impressions", "Impressions", "total_ad_impressions", "SUM(ad_impressions)", ["ad_impressions"], "count"],
  [
    "ctr",
    "CTR",
    "click_through_rate",
    "SUM(ad_clicks) / SUM(ad_impressions)",
    ["ad_clicks", "ad_impressions"],
    "percent",
  ],
];
export const creativeBindings: readonly MetricBinding[] = measures.map(
  ([id, label, name, calculation, fields, format]) => {
    return {
      id,
      label,
      canonical: reviewedMetric(name),
      reviewedDependencies: REVIEWED_METRICS,
      calculation,
      fields,
      format,
      source: CREATIVE_RELATION,
      population:
        "Published ad delivery with a creative identity, scoped to the selected store, dates, ad platform, campaign, creative format and name filters; minimums apply to each creative after period aggregation.",
      grain: "Ad platform and creative identity over the selected period",
      dateBasis: "Published ad delivery date in the store's reporting timezone",
      attribution:
        "Platform-reported attribution. Account model, window and conversion-event settings are unverified; platforms may overlap and are not comparable winners.",
      ...(id === "roas"
        ? { numerator: "Platform revenue", denominator: "Ad spend" }
        : id === "cpo"
          ? { numerator: "Ad spend", denominator: "Platform conversions" }
          : id === "ctr"
            ? { numerator: "Ad clicks", denominator: "Ad impressions" }
            : {}),
      limitations: [
        "Canonical calculation with this report's restricted population; no live numerical reconciliation is implied.",
        "Missing ratios remain missing. Fractional conversions retain platform attribution.",
      ],
    };
  },
);

export function creativeBinding(id: string): MetricBinding {
  const binding = creativeBindings.find((item) => item.id === id);
  if (!binding) throw new Error(`Unknown creative metric ${id}`);
  return binding;
}

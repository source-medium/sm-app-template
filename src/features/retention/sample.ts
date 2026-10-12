import { fromUnits } from "@/lib/data/decimal";
import { seededRandom, randomInt } from "@/lib/sample/random";
import { SAMPLE_STORE_SCALE } from "@/lib/sample/stores";
import type { RetentionFilters, RetentionSegmentFilters } from "./queries";
import { COHORT_MONTHS, cohortMonths, monthIsElapsed } from "./filters";
import { decodeRetention } from "./rows";

/** Illustrative segment values only; live options always come from the selected warehouse. */
const SAMPLE_SEGMENTS: Record<string, string[]> = {
  "order_type_(sub_vs._one_time)": ["one_time", "subscription"],
  discount_code: ["WELCOME10", "SPRING"],
  "source/medium": ["google / cpc", "direct / none"],
  campaign: ["Prospecting", "Brand search"],
  zero_party_attribution: ["Search", "Friend referral"],
  sub_channel: ["Web", "Mobile app"],
};

export function sampleRetentionSegments(filters: RetentionSegmentFilters) {
  const values =
    SAMPLE_STORE_SCALE.has(filters.storeId) && ["online_dtc", "amazon"].includes(filters.channel)
      ? (SAMPLE_SEGMENTS[filters.dimension ?? "no_filters"] ?? [])
      : [];
  return {
    values: values.filter((value) => value.toLowerCase().includes(filters.search.toLowerCase())).sort(),
    truncated: false,
  };
}

function sampleRetentionWire(filters: RetentionFilters) {
  const scale = SAMPLE_STORE_SCALE.get(filters.storeId);
  if (!scale) return [];
  const dimension = filters.dimension ?? "no_filters";
  const segmented = dimension !== "no_filters";
  if (segmented && (!filters.segment || !SAMPLE_SEGMENTS[dimension]?.includes(filters.segment))) return [];
  return ["online_dtc", "amazon"].flatMap((channel) =>
    cohortMonths(filters.asOf).flatMap((cohort) => {
      const random = seededRandom(
        `retention|${filters.storeId}|${channel}|${cohort}${segmented ? `|${dimension}|${filters.segment}` : ""}`,
      );
      const size = Math.max(
        1,
        Math.round(randomInt(random, 180, 850) * scale * (channel === "amazon" ? 0.4 : 1) * (segmented ? 0.45 : 1)),
      );
      let revenueCents = 0n;
      return Array.from({ length: COHORT_MONTHS }, (_, age) => {
        const customers = age === 0 ? size : Math.round(size * (0.36 * Math.exp(-age / 7) + random() * 0.035));
        revenueCents += BigInt(customers * randomInt(random, 5200, 8200));
        return {
          channel,
          cohort_month: cohort,
          month_age: String(age),
          cohort_size: String(size),
          customers: String(customers),
          second_orders: String(Math.round(size * (0.08 + 0.5 * (1 - Math.exp(-age / 4))))),
          cumulative_revenue: fromUnits(revenueCents * 10_000_000n),
          cumulative_profit: fromUnits((revenueCents * 10_000_000n * 42n) / 100n),
        };
      }).filter(
        (row) =>
          monthIsElapsed(cohort, Number(row.month_age), filters.asOf) &&
          // A missing published observation, distinct from a month that has not elapsed.
          !(channel === "online_dtc" && cohort.endsWith("-01-01") && row.month_age === "2"),
      );
    }),
  );
}
export function sampleRetention(filters: RetentionFilters) {
  return decodeRetention(sampleRetentionWire(filters));
}

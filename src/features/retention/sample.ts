import { fromUnits } from "@/lib/data/decimal";
import { seededRandom, randomInt } from "@/lib/sample/random";
import { SAMPLE_STORE_SCALE } from "@/lib/sample/stores";
import type { RetentionFilters } from "./queries";
import { COHORT_MONTHS, cohortMonths, monthIsElapsed } from "./filters";
import { decodeRetention } from "./rows";

export function sampleRetentionWire(filters: RetentionFilters) {
  const scale = SAMPLE_STORE_SCALE.get(filters.storeId);
  if (!scale) return [];
  return ["online_dtc", "amazon"].flatMap((channel) =>
    cohortMonths(filters.asOf).flatMap((cohort) => {
      const random = seededRandom(`retention|${filters.storeId}|${channel}|${cohort}`);
      const size = Math.max(1, Math.round(randomInt(random, 180, 850) * scale * (channel === "amazon" ? 0.4 : 1)));
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

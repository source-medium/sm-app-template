/**
 * One sentence that answers "how did we do?" from numbers the page already
 * loaded: net revenue against the comparison period, then whether ad spend
 * moved faster than revenue and what that did to marketing efficiency. It
 * appears only when the comparison coverage gate allows period changes, so
 * it never reads a partially loaded period as a decline.
 */
import "server-only";
import { compareValues, periodChanges, type Baseline, type MetricChange, type MetricValue } from "@/lib/comparison";
import { formatMoney, formatPercent } from "@/lib/format";
import { presentOverviewMeasures } from "./measures";
import type { OverviewFilters, OverviewSlice } from "./queries";

function direction(change: Pick<MetricChange<MetricValue>, "direction" | "percent">) {
  const held = { verb: "held", amount: "", joiner: "at" };
  if (change.direction === "flat") return held;
  if (change.direction === null || change.percent === null) return null;
  const amount = formatPercent(Math.abs(Number(change.percent)) / 100);
  // A move that rounds to nothing reads as flat rather than "rose 0%".
  if (amount === "0%") return held;
  return { verb: change.direction === "up" ? "rose" : "fell", amount: ` ${amount}`, joiner: "to" };
}

export function overviewHeadline(
  report: OverviewSlice,
  filters: OverviewFilters,
  comparison: Baseline | undefined,
  currency: string | null,
): string | null {
  const baseline = comparison?.range;
  const previous = report.comparison?.data?.totals;
  const current = report.current.totals;
  if (
    !baseline ||
    !previous ||
    !current ||
    !periodChanges(filters.range, baseline, report.coverage, comparison.alignment).show
  )
    return null;
  if (current.netRevenue === null || previous.netRevenue === null) return null;

  const revenue = direction(compareValues(current.netRevenue, previous.netRevenue));
  if (!revenue) return null;
  const sentences = [
    `Net revenue ${revenue.verb}${revenue.amount} ${revenue.joiner} ${formatMoney(current.netRevenue, currency)} against the ${comparison.label}.`,
  ];

  // Marketing efficiency comes from the same presentation as the KPI card, so the sentence and the card agree.
  const mer = presentOverviewMeasures(current, currency).mer;
  const previousMer = presentOverviewMeasures(previous, currency).mer;
  const spend =
    current.adSpend !== null && previous.adSpend !== null
      ? direction(compareValues(current.adSpend, previous.adSpend))
      : null;
  if (spend && mer.amount !== null && previousMer.amount !== null) {
    const efficiency =
      mer.display === previousMer.display ? "held at" : mer.amount > previousMer.amount ? "improved to" : "slipped to";
    sentences.push(`Ad spend ${spend.verb}${spend.amount}, and marketing efficiency ${efficiency} ${mer.display}.`);
  }
  return sentences.join(" ");
}

import { KpiCard } from "@/components/patterns/kpi-card";
import { kpiDelta, slotDeltas } from "@/components/patterns/kpi-delta";
import { AD_POLARITY, adRatios, type AdPeriods } from "@/lib/ad-totals";
import type { ComparisonPlan, PeriodChanges, Polarity } from "@/lib/comparison";
import { formatMultiple, formatPercent } from "@/lib/format";

/**
 * Spend, platform ROAS, cost per conversion and CTR, each against the
 * comparison periods. The caller lays the cards out in its own KPI row.
 */
export function AdKpis({
  totals,
  plan,
  changes,
  money,
  spendLabel = "Spend",
}: {
  spendLabel?: string;
  totals: AdPeriods;
  plan?: ComparisonPlan;
  changes: readonly PeriodChanges[] | null;
  money: (value: string | number | null) => string;
}) {
  type Slot = 0 | 1 | null;
  const sums = (slot: Slot) => (slot === null ? totals.current : totals.baselines[slot]);
  const current = adRatios(totals.current);
  const baselines = [adRatios(totals.baselines[0]), adRatios(totals.baselines[1])] as const;
  const ratios = (slot: Slot) => (slot === null ? current : baselines[slot]);
  const deltas = <T extends string | number>(
    value: (slot: Slot) => T | null,
    format: (value: T | null) => string,
    better: Polarity,
  ) => slotDeltas(plan, changes, (label, slot) => kpiDelta(value(null), value(slot), format, better, label));
  return (
    <>
      <KpiCard
        label={spendLabel}
        value={money(totals.current.spend)}
        deltas={deltas((slot) => sums(slot).spend, money, AD_POLARITY.spend)}
      />
      <KpiCard
        label="Platform ROAS"
        value={formatMultiple(ratios(null).roas)}
        deltas={deltas((slot) => ratios(slot).roas, formatMultiple, AD_POLARITY.roas)}
      />
      <KpiCard
        label="Cost / conversion"
        value={money(ratios(null).cpo)}
        deltas={deltas((slot) => ratios(slot).cpo, money, AD_POLARITY.cpo)}
      />
      <KpiCard
        label="CTR"
        value={formatPercent(ratios(null).ctr)}
        deltas={deltas((slot) => ratios(slot).ctr, formatPercent, AD_POLARITY.ctr)}
      />
    </>
  );
}

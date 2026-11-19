/**
 * The creative report's totals and supporting tables: the scope's KPIs against
 * each comparison, then spend and results by format and by launch week. Every
 * number comes from the summary query's totals, never from the truncated
 * creative list.
 */
import "server-only";
import Link from "next/link";
import { KpiCard } from "@/components/patterns/kpi-card";
import { AdKpis } from "@/components/patterns/ad-kpis";
import { adRatios } from "@/lib/ad-totals";
import { ComparisonCaption } from "@/components/patterns/comparison-caption";
import { ActiveBaseline } from "@/components/patterns/baseline-switch";
import { DataTable } from "@/components/patterns/data-table";
import { SectionHeader } from "@/components/patterns/section-header";
import { changeCell, kpiDelta, slotDeltas } from "@/components/patterns/kpi-delta";
import { slotChanges, type ComparisonPlan } from "@/lib/comparison";
import { decimalToNumber, minDecimal, nonnegativeShare, sumDecimals } from "@/lib/data/decimal";
import { toChartNumber } from "@/lib/data/decode";
import { withParams, type DateRange, type SearchParams } from "@/lib/filters";
import {
  formatCount,
  formatDate,
  formatDateRange,
  formatDay,
  formatMoneyIn,
  formatMultiple,
  formatPercent,
  formatShare,
} from "@/lib/format";
import { periodRange } from "@/lib/time-grain";
import { creativeFormatLabel, isCreativeFormat, type CreativeFormat } from "./filters";
import { CREATIVE_POLARITY } from "./metrics";
import type { CreativeLaunch, CreativeSummary } from "./queries";

/** A launch week, with its year once when both ends share it: "Oct 26 – Nov 1, 2026". */
function weekLabel(week: DateRange): string {
  return week.from.slice(0, 4) === week.to.slice(0, 4) && week.from !== week.to
    ? `${formatDay(week.from)} – ${formatDate(week.to)}`
    : formatDateRange(week);
}

/** Each launch week in date order, then the creatives already running. */
export function launchOrder(launches: readonly CreativeLaunch[]): CreativeLaunch[] {
  return [...launches].sort((a, b) =>
    a.week === b.week ? 0 : a.week === null ? 1 : b.week === null ? -1 : a.week.localeCompare(b.week),
  );
}

/** The share of spend on creatives launched in these dates, or null where a share is undefined. */
export function newCreativeShare(summary: CreativeSummary): number | null {
  const launched = summary.launches.filter((row) => row.week !== null).map((row) => row.spend);
  return nonnegativeShare(
    sumDecimals(launched),
    summary.totals?.current.spend ?? null,
    minDecimal(summary.launches.map((row) => row.spend)),
  );
}

export function CreativeSummaryView({
  summary,
  plan,
  range,
  format,
  params,
  pathname,
  currency,
}: {
  summary: CreativeSummary;
  plan?: ComparisonPlan;
  range: DateRange;
  format: CreativeFormat | null;
  params: SearchParams;
  pathname: string;
  currency: string | null;
}) {
  const totals = summary.totals;
  if (!totals) return null;
  const money = formatMoneyIn(currency);
  const changes = plan ? slotChanges(plan, summary.coverage) : null;
  const newShare = newCreativeShare(summary);
  return (
    <div className="flex flex-col gap-6">
      {plan && <ComparisonCaption plan={plan} issues={changes?.map((change) => change.issue)} />}
      {/* Six cards go two across on a phone, so the totals fit about one screen. */}
      <section aria-label="Creative totals" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <AdKpis totals={totals} plan={plan} changes={changes} money={money} />
        <KpiCard
          label="Creatives with spend"
          value={formatCount(totals.current.creatives)}
          deltas={slotDeltas(plan, changes, (label, slot) =>
            kpiDelta(
              totals.current.creatives,
              totals.baselines[slot].creatives,
              formatCount,
              CREATIVE_POLARITY.creatives,
              label,
            ),
          )}
        />
        <KpiCard
          label="New creatives"
          value={formatCount(summary.newCreatives ?? 0n)}
          period={newShare === null ? undefined : `${formatShare(newShare)} of spend`}
          description={`Creatives whose first spend falls in these dates, with none in the year before ${formatDate(range.from)}. Not compared: a comparison period would need its own year of history.`}
        />
      </section>
      {summary.uncoveredSpend !== null && decimalToNumber(summary.uncoveredSpend) !== 0 && (
        <p className="text-sm text-muted-foreground">
          {money(summary.uncoveredSpend)} of ad spend in these dates has no creative and is not counted here.
        </p>
      )}
      <FormatMix summary={summary} plan={plan} format={format} params={params} pathname={pathname} money={money} />
      <Launches summary={summary} range={range} money={money} />
    </div>
  );
}

function FormatMix({
  summary,
  plan,
  format,
  params,
  pathname,
  money,
}: {
  summary: CreativeSummary;
  plan?: ComparisonPlan;
  format: CreativeFormat | null;
  params: SearchParams;
  pathname: string;
  money: (value: string | number | null) => string;
}) {
  const totals = summary.totals;
  if (!totals) return null;
  if (format)
    return (
      <p className="text-sm">
        Showing {creativeFormatLabel(format).toLowerCase()} creatives only.{" "}
        <Link
          prefetch={false}
          className="underline underline-offset-4"
          href={withParams(pathname, params, { format: null })}
        >
          Show all formats
        </Link>
      </p>
    );
  const changes = plan ? slotChanges(plan, summary.coverage) : null;
  // Highest spend first, as the query orders formats.
  const rows = summary.formats.filter((row) => row.current.spend !== null);
  const minimum = minDecimal(rows.map((row) => row.current.spend));
  const table = (slot: 0 | 1) => {
    const baseline = plan?.slots[slot];
    const compare = Boolean(changes?.[slot].show && baseline?.range);
    const versus = compare && baseline ? `vs ${baseline.short}` : null;
    const formats = (
      <DataTable
        caption="Spend and results by creative format"
        columns={[
          // What each format spent and returned reads first on a phone; counts and shares scroll.
          { key: "format", header: "Format" },
          { key: "spend", header: "Spend", align: "right" },
          { key: "roas", header: "Platform ROAS", align: "right" },
          ...(versus ? [{ key: "spendChange", header: "Spend change", align: "right" as const }] : []),
          ...(versus ? [{ key: "roasChange", header: "ROAS change", align: "right" as const }] : []),
          { key: "cpo", header: "Cost / conversion", align: "right" },
          { key: "share", header: "Share of spend", align: "right" },
          { key: "creatives", header: "Creatives", align: "right" },
        ]}
        rows={rows.map((row) => {
          const now = adRatios(row.current);
          const then = adRatios(row.baselines[slot]);
          const portion = nonnegativeShare(row.current.spend, totals.current.spend, minimum);
          return {
            id: row.format ?? "(none)",
            cells: {
              format: {
                display: creativeFormatLabel(row.format),
                // Only a format the filter can choose links; any other would reload unfiltered.
                href: isCreativeFormat(row.format) ? withParams(pathname, params, { format: row.format }) : undefined,
              },
              creatives: {
                display: formatCount(row.current.creatives),
                sort: toChartNumber(row.current.creatives ?? 0n),
              },
              spend: { display: money(row.current.spend), sort: decimalToNumber(row.current.spend) },
              share: { display: formatShare(portion), sort: portion },
              ...(compare
                ? {
                    spendChange: changeCell(
                      kpiDelta(row.current.spend, row.baselines[slot].spend, money, CREATIVE_POLARITY.spend),
                      { short: true },
                    ),
                    roasChange: changeCell(kpiDelta(now.roas, then.roas, formatMultiple, CREATIVE_POLARITY.roas), {
                      short: true,
                    }),
                  }
                : {}),
              roas: { display: formatMultiple(now.roas), sort: now.roas },
              cpo: { display: money(now.cpo), sort: now.cpo },
            },
          };
        })}
      />
    );
    // The baseline is named once, so the change headers stay short enough for the table to fit.
    if (!versus) return formats;
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">Changes are {versus}.</p>
        {formats}
      </div>
    );
  };
  return (
    <section aria-labelledby="creative-formats-heading" className="flex flex-col gap-3">
      <SectionHeader
        id="creative-formats-heading"
        title="Formats"
        description="Spend and results by creative format. Choose a format to filter the page to it."
      />
      {plan ? <ActiveBaseline a={table(0)} b={table(1)} /> : table(0)}
    </section>
  );
}

function Launches({
  summary,
  range,
  money,
}: {
  summary: CreativeSummary;
  range: DateRange;
  money: (value: string | number | null) => string;
}) {
  const total = summary.totals?.current.spend ?? null;
  const rows = launchOrder(summary.launches);
  const minimum = minDecimal(rows.map((row) => row.spend));
  if (!rows.some((row) => row.week !== null)) return null;
  return (
    <section aria-labelledby="creative-launches-heading" className="flex flex-col gap-3">
      <SectionHeader
        id="creative-launches-heading"
        title="New creatives"
        description="Creatives that started spending in these dates, by the week they launched, beside the ones already running."
      />
      <DataTable
        caption="Spend and results by launch week"
        columns={[
          { key: "launched", header: "Launched" },
          { key: "creatives", header: "Creatives", align: "right" },
          { key: "spend", header: "Spend", align: "right" },
          { key: "share", header: "Share of spend", align: "right" },
          { key: "roas", header: "Platform ROAS", align: "right" },
          { key: "cpo", header: "Cost / conversion", align: "right" },
          { key: "ctr", header: "CTR", align: "right" },
        ]}
        rows={rows.map((row) => {
          const ratios = adRatios(row);
          const portion = nonnegativeShare(row.spend, total, minimum);
          return {
            id: row.week ?? "running",
            cells: {
              launched: {
                display: row.week
                  ? weekLabel(periodRange(row.week, "week", range))
                  : `Running before ${formatDate(range.from)}`,
              },
              creatives: { display: formatCount(row.creatives), sort: toChartNumber(row.creatives ?? 0n) },
              spend: { display: money(row.spend), sort: decimalToNumber(row.spend) },
              share: { display: formatShare(portion), sort: portion },
              roas: { display: formatMultiple(ratios.roas), sort: ratios.roas },
              cpo: { display: money(ratios.cpo), sort: ratios.cpo },
              ctr: { display: formatPercent(ratios.ctr), sort: ratios.ctr },
            },
          };
        })}
      />
    </section>
  );
}

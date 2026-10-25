import "server-only";
import { DataTable, type DataTableCell, type DataTableRow } from "@/components/patterns/data-table";
import { Disclosure } from "@/components/ui/disclosure";
import { SelectFilter } from "@/components/patterns/select-filter";
import { SectionHeader } from "@/components/patterns/section-header";
import { formatCount, formatDateRange, formatMeasure, formatMoney, formatMultiple, formatPercent } from "@/lib/format";
import { periodRange } from "@/lib/time-grain";
import { toChartNumber } from "@/lib/data/decode";
import { decimalToNumber } from "@/lib/data/decimal";
import type { PerformanceFilters } from "./queries";
import { scopePlatformRecords, type BusinessRecord, type PlatformRecord } from "./rows";
import { businessRatios, platformRatios } from "./measures";

export const METRIC_GROUPS = [
  { value: "revenue", label: "Revenue and orders" },
  { value: "efficiency", label: "Marketing efficiency" },
  { value: "purchases", label: "New and repeat purchases" },
] as const;
export type MetricGroup = (typeof METRIC_GROUPS)[number]["value"];
type Metric = readonly [key: string, label: string];
const BUSINESS_COLUMNS: Record<MetricGroup, readonly Metric[]> = {
  revenue: [
    ["revenue", "Net revenue"],
    ["orders", "Summary orders"],
    ["average", "Net revenue / order"],
    ["sessions", "Sessions"],
    ["gross", "Gross revenue"],
    ["discounts", "Discounts"],
    ["demand", "Demand before returns"],
    ["refunds", "Refunds"],
  ],
  efficiency: [
    ["revenue", "Net revenue"],
    ["spend", "Ad spend"],
    ["mer", "MER"],
    ["cpo", "Spend / summary order"],
    ["cps", "Spend / session"],
    ["spend_share", "Spend / net revenue"],
  ],
  purchases: [
    ["first_revenue", "New purchase revenue"],
    ["first_orders", "New purchase orders"],
    ["first_average", "New revenue / order"],
    ["repeat_revenue", "Repeat purchase revenue"],
    ["repeat_orders", "Repeat purchase orders"],
    ["repeat_average", "Repeat revenue / order"],
    ["repeat_share", "Repeat / net revenue"],
  ],
};
const PLATFORM_COLUMNS: readonly Metric[] = [
  ["impressions", "Impressions"],
  ["clicks", "Clicks"],
  ["ctr", "CTR"],
  ["cpm", "CPM"],
  ["cpc", "CPC"],
  ["spend", "Spend"],
  ["cvr", "Platform CVR"],
  ["conversions", "Platform conversions"],
  ["revenue", "Platform revenue"],
  ["roas", "Platform ROAS"],
  ["average", "Platform revenue / conversion"],
  ["cpo", "Platform CPO"],
];
function cell(
  value: string | number | bigint | null,
  format: "money" | "count" | "multiple" | "percent",
  currency: string | null,
): DataTableCell {
  const numeric = typeof value === "bigint" ? toChartNumber(value) : value;
  return {
    display:
      format === "money"
        ? formatMoney(numeric, currency)
        : format === "count"
          ? typeof value === "number" || typeof value === "string"
            ? formatMeasure(value)
            : formatCount(value)
          : format === "multiple"
            ? formatMultiple(typeof numeric === "number" ? numeric : null)
            : formatPercent(typeof numeric === "number" ? numeric : null),
    sort: typeof numeric === "string" ? decimalToNumber(numeric) : numeric,
  };
}
function partialPeriod(date: string, filters: PerformanceFilters) {
  const full = periodRange(date, filters.grain, { from: "0001-01-01", to: "9999-12-31" });
  const selected = periodRange(date, filters.grain, filters.range);
  return full.from !== selected.from || full.to !== selected.to;
}
function periodLabel(row: BusinessRecord | PlatformRecord, filters: PerformanceFilters) {
  if (row.is_total) return "Selected period total";
  return row.period_date
    ? `${formatDateRange(periodRange(row.period_date, filters.grain, filters.range))}${partialPeriod(row.period_date, filters) ? " · partial" : ""}`
    : "Unknown period";
}
function tableRows<T extends BusinessRecord | PlatformRecord>(
  records: T[],
  filters: PerformanceFilters,
  cells: (row: T) => DataTableRow["cells"],
) {
  const present = (row: T) => ({
    id: row.is_total ? "total" : (row.period_date ?? "unknown-period"),
    cells: { period: { display: periodLabel(row, filters) }, ...cells(row) },
  });
  const total = records.find((row) => row.is_total);
  return { rows: records.filter((row) => !row.is_total).map(present), totals: total ? present(total) : undefined };
}
export function BusinessTable({
  records,
  filters,
  group,
  currency,
  actions,
}: {
  records: BusinessRecord[];
  filters: PerformanceFilters;
  group: MetricGroup;
  currency: string | null;
  actions?: React.ReactNode;
}) {
  const columns = BUSINESS_COLUMNS[group];
  const label = METRIC_GROUPS.find((item) => item.value === group)?.label ?? "Revenue and orders";
  return (
    <section className="flex flex-col gap-3" aria-labelledby="business-table-heading">
      <SectionHeader
        id="business-table-heading"
        title={label}
        description="Newest periods first. Weeks start Monday; edge weeks and months include only the selected dates. Totals cover the full selection."
      />
      <DataTable
        caption={label}
        columns={[
          { key: "period", header: "Period", sortable: false, nowrap: true },
          ...columns.map(([key, header]) => ({ key, header, align: "right" as const })),
        ]}
        {...tableRows(records, filters, (row) => {
          const values = { ...row, ...businessRatios(row) };
          return Object.fromEntries(
            columns.map(([key]) => [
              key,
              cell(
                values[key as keyof typeof values] as string | number | bigint | null,
                ["orders", "first_orders", "repeat_orders", "sessions"].includes(key)
                  ? "count"
                  : key === "mer"
                    ? "multiple"
                    : ["spend_share", "repeat_share"].includes(key)
                      ? "percent"
                      : "money",
                currency,
              ),
            ]),
          );
        })}
      />
      {actions && <div className="flex flex-wrap items-end gap-3">{actions}</div>}
      <p className="text-sm text-muted-foreground">
        Summary orders are published order measures. New and repeat purchases are not unique customers.
      </p>
      <Disclosure summary="Metric definitions">
        <p className="max-w-prose text-sm text-muted-foreground">
          Demand is the published gross revenue after discounts, before returns. Refunds and discounts retain their
          published signs. Summary orders include every selected sales channel. New and repeat figures are order
          measures, not unique customers; classification may not cover every order. MER uses net revenue. Ratios use
          period sums; missing or zero denominators stay blank.
        </p>
      </Disclosure>
    </section>
  );
}
export const platformLabel = (value: string) =>
  ({ meta_ads: "Meta", facebook_ads: "Meta", google_ads: "Google", pinterest_ads: "Pinterest", tiktok_ads: "TikTok" })[
    value
  ] ?? value;
export function PlatformFilter({ records = [], platform }: { records?: PlatformRecord[]; platform: string }) {
  const platforms = [
    ...new Set(records.filter((row) => !row.combined).map((row) => row.platform ?? "(unknown platform)")),
  ];
  return (
    <SelectFilter
      name="platform"
      label="Platform detail"
      value={platform}
      options={[
        { value: "", label: "Combined platforms" },
        ...[...new Set([...platforms, ...(platform ? [platform] : [])])].map((value) => ({
          value,
          label: platformLabel(value),
        })),
      ]}
    />
  );
}
export function PlatformTables({
  records,
  filters,
  currency,
  platform,
  actions,
}: {
  records: PlatformRecord[];
  filters: PerformanceFilters;
  currency: string | null;
  platform: string;
  actions?: React.ReactNode;
}) {
  const comparison = records.filter((row) => row.is_total && !row.combined);
  const total = records.find((row) => row.is_total && row.combined);
  const compact = (row: PlatformRecord): DataTableRow => ({
    id: row.platform ?? "combined",
    cells: {
      platform: { display: row.combined ? "Combined platforms" : platformLabel(row.platform ?? "(unknown platform)") },
      spend: cell(row.spend, "money", currency),
      revenue: cell(row.revenue, "money", currency),
      roas: cell(platformRatios(row).roas, "multiple", currency),
      clicks: cell(row.clicks, "count", currency),
      conversions: cell(row.conversions, "count", currency),
    },
  });
  const scoped = scopePlatformRecords(records, platform);
  const label = platform ? platformLabel(platform) : "Combined platforms";
  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-prose text-sm text-muted-foreground">
        Platform attribution can overlap. Combined revenue and conversions sum platform claims, not deduplicated store
        sales or orders.
      </p>
      <section className="space-y-3" aria-labelledby="platform-comparison-heading">
        <SectionHeader
          id="platform-comparison-heading"
          title="Platform comparison"
          description="Totals for the full selected dates and sales channels."
        />
        <DataTable
          caption="Platform comparison"
          columns={[
            { key: "platform", header: "Platform" },
            { key: "spend", header: "Spend", align: "right" },
            { key: "revenue", header: "Platform revenue", align: "right" },
            { key: "roas", header: "Platform ROAS", align: "right" },
            { key: "clicks", header: "Clicks", align: "right" },
            { key: "conversions", header: "Platform conversions", align: "right" },
          ]}
          rows={comparison.map(compact)}
          totals={total ? compact(total) : undefined}
        />
      </section>
      <section className="space-y-3" aria-labelledby="platform-detail-heading">
        <SectionHeader
          id="platform-detail-heading"
          title={label}
          description="Newest periods first. Edge periods are labeled partial; totals cover the full selection."
          actions={actions}
        />
        <DataTable
          caption={label}
          columns={[
            { key: "period", header: "Period", sortable: false, nowrap: true },
            ...PLATFORM_COLUMNS.map(([key, header]) => ({ key, header, align: "right" as const })),
          ]}
          {...tableRows(scoped, filters, (row) => {
            const values = { ...row, ...platformRatios(row) };
            return Object.fromEntries(
              PLATFORM_COLUMNS.map(([key]) => [
                key,
                cell(
                  values[key as keyof typeof values] as string | number | bigint | null,
                  ["impressions", "clicks", "conversions"].includes(key)
                    ? "count"
                    : ["ctr", "cvr"].includes(key)
                      ? "percent"
                      : key === "roas"
                        ? "multiple"
                        : "money",
                  currency,
                ),
              ]),
            );
          })}
        />
        {!scoped.length && (
          <p className="text-sm text-muted-foreground">No rows for this platform. Choose a listed platform above.</p>
        )}
      </section>
      <Disclosure summary="Attribution and ratio definitions">
        <p className="max-w-prose text-sm text-muted-foreground">
          CVR is platform conversions / clicks. CPO is spend / platform conversions. CTR is clicks / impressions. CPM is
          spend per thousand impressions. CPC is spend / clicks. ROAS is platform revenue / spend. Ratios use period
          sums and stay blank for missing or zero denominators. Weeks start Monday. Clicks use ad_clicks; reference
          dashboards may use a different click field or attribution window.
        </p>
      </Disclosure>
    </div>
  );
}

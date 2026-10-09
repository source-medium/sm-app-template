import { RETENTION_RELATION } from "./rows";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ReportPage } from "@/components/shell/report-page";
import { DataRegion } from "@/components/patterns/data-region";
import { EmptyState, LoadingState } from "@/components/patterns/data-states";
import { CohortMatrix } from "@/components/patterns/cohort-matrix";
import { SelectFilter } from "@/components/patterns/select-filter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMonth } from "@/lib/format";
import { REPORT_FILTER_FORM_ID, type SearchParams } from "@/lib/filters";
import { getRetention } from "./queries";
import { RetentionCurves } from "./curves";
import { COHORT_WINDOWS, COHORT_MONTHS, RETENTION_METRICS, retentionOptions } from "./filters";
import { retentionMatrix } from "./matrix";

export const metadata: Metadata = { title: "Retention" };
export default async function RetentionPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const options = retentionOptions(params, new Date());
  const applied = {
    ...params,
    as_of: options.asOf,
    channel: options.channel,
    measure: options.metric,
    cohorts: options.curveWindow,
  };
  const metricLabel = RETENTION_METRICS.find((item) => item.value === options.metric)?.label ?? "Monthly retention";
  return (
    <ReportPage
      sources={[
        {
          relation: RETENTION_RELATION,
          scope:
            "Monthly acquisition cohorts at each month of age, using the unsegmented slice and one acquisition sales channel. Incomplete months are hidden.",
        },
      ]}
      title="Retention"
      description="Compare monthly purchase cohorts at the same age, one sales channel at a time."
      pathname="/retention"
      params={applied}
      agentFilters={{
        as_of: options.asOf,
        channel: options.channel,
        measure: options.metric,
        cohorts: options.curveWindow,
      }}
      dates={false}
    >
      {({ filters }) => {
        return (
          <>
            <div className="flex flex-wrap items-end gap-4">
              <div role="group" aria-label="Cohort observation window" className="flex items-end gap-2">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="cohort-as-of" className="text-xs font-medium text-muted-foreground">
                    Through completed month
                  </label>
                  <Input
                    id="cohort-as-of"
                    type="month"
                    name="as_of"
                    form={REPORT_FILTER_FORM_ID}
                    defaultValue={options.asOf}
                    min="0002-01"
                    max={options.maxMonth}
                    required
                  />
                </div>
                <Button type="submit" form={REPORT_FILTER_FORM_ID} variant="secondary">
                  Apply month
                </Button>
              </div>
            </div>
            <details className="text-sm text-muted-foreground">
              <summary className="cursor-pointer font-medium">About these cohorts</summary>
              <p className="mt-2 max-w-prose">
                Twelve acquisition cohorts through {formatMonth(`${options.asOf}-01`)}. Month 0 is the acquisition
                calendar month, followed by calendar months 1–11. Only fully elapsed months are shown; elapsed time does
                not prove the warehouse is complete.
              </p>
            </details>
            <Suspense
              key={`${filters.storeId}|${options.asOf}|${options.channel}|${options.metric}|${options.curveWindow}`}
              fallback={<LoadingState variant="table" label="Loading retention cohorts" />}
            >
              <DataRegion
                load={() => getRetention({ storeId: filters.storeId, asOf: options.asOf })}
                isEmpty={(rows) => rows.length === 0}
                emptyMessage="No published acquisition cohorts for this store and observation window."
              >
                {(rows) => {
                  const channels = [...new Set([options.channel, ...rows.map((row) => row.channel)])].sort();
                  return (
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-wrap gap-4">
                        <SelectFilter
                          name="channel"
                          label="Acquisition sales channel"
                          value={options.channel}
                          options={channels.map((value) => ({
                            value,
                            label: value === "online_dtc" ? "Online DTC" : value === "amazon" ? "Amazon" : value,
                          }))}
                        />
                        <SelectFilter
                          name="cohorts"
                          label="Chart cohorts"
                          value={options.curveWindow}
                          options={[...COHORT_WINDOWS]}
                        />
                      </div>
                      {rows.some((row) => row.channel === options.channel) && (
                        <RetentionCurves
                          rows={rows}
                          channel={options.channel}
                          asOf={options.asOf}
                          window={options.curveWindow}
                        />
                      )}
                      <div className="flex flex-wrap items-end justify-between gap-4 border-t pt-6">
                        <h2 className="text-lg font-semibold">All twelve cohorts</h2>
                        <SelectFilter
                          name="measure"
                          label="Matrix measure"
                          value={options.metric}
                          options={[...RETENTION_METRICS]}
                        />
                      </div>
                      <p data-metric-definition={metricLabel} className="max-w-prose text-sm text-muted-foreground">
                        {options.metric === "retention"
                          ? "Monthly retention is customers who purchased in that month divided by the original cohort size. Month 0 includes the acquisition purchase. A customer may return after skipping a month."
                          : options.metric === "revenue"
                            ? "LTR is cumulative net revenue divided by the original cohort size. It includes the acquisition month and all subsequent months through the displayed age."
                            : "LTV here is cumulative gross profit divided by the original cohort size. It includes published product, shipping, fulfillment and payment costs; missing cost inputs can overstate profit."}
                      </p>
                      {rows.some((row) => row.channel === options.channel) ? (
                        <CohortMatrix
                          caption={metricLabel}
                          columns={Array.from({ length: COHORT_MONTHS }, (_, index) => `Month ${index}`)}
                          rows={retentionMatrix(rows, options.channel, options.metric, options.asOf)}
                        />
                      ) : (
                        <EmptyState message="No cohorts for this channel. Choose another acquisition sales channel." />
                      )}
                      <p className="text-xs text-muted-foreground">
                        Stronger shading means higher values within this measure. “No data” means a published value is
                        missing; “—” means the month has not elapsed. Published cohorts cover online DTC and Amazon
                        separately. There is no cross-channel or cross-store total.
                      </p>
                    </div>
                  );
                }}
              </DataRegion>
            </Suspense>
          </>
        );
      }}
    </ReportPage>
  );
}

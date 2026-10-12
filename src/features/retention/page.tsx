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
import { getRetention, getRetentionSegments } from "./queries";
import { RetentionCurves } from "./curves";
import { COHORT_WINDOWS, COHORT_MONTHS, RETENTION_METRICS, retentionOptions } from "./filters";
import { retentionMatrix } from "./matrix";
import { AcquisitionDimensionFilter, AcquisitionSegmentFilter } from "./segmentation-controls";

export const metadata: Metadata = { title: "Retention" };
export default async function RetentionPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  return (
    <ReportPage
      sources={[
        {
          relation: RETENTION_RELATION,
          scope:
            "Monthly acquisition cohorts at each month of age, using exactly one acquisition dimension/value slice and one acquisition sales channel. Incomplete months are hidden.",
        },
      ]}
      title="Retention"
      description="Compare monthly purchase cohorts at the same age, one sales channel at a time."
      pathname="/retention"
      params={params}
      // The latest complete month depends on the store's date, so the shell applies these once it knows it.
      defaults={(today) => {
        const options = retentionOptions(params, today);
        return {
          as_of: options.asOf,
          channel: options.channel,
          measure: options.metric,
          cohorts: options.curveWindow,
          acquisition_dimension: options.dimension,
        };
      }}
      agentOmissions={[
        ...(params.acquisition_segment ? ["acquisition segment"] : []),
        ...(params.segment_search ? ["segment search"] : []),
      ]}
      dates={false}
    >
      {({ filters, today, timeZone, currency }) => {
        const options = retentionOptions(params, today);
        const metricLabel =
          RETENTION_METRICS.find((item) => item.value === options.metric)?.label ?? "Monthly retention";
        return (
          <>
            <div className="flex flex-wrap items-end gap-4">
              <div
                role="group"
                aria-label="Cohort observation window"
                className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-end"
              >
                <div className="flex min-w-0 flex-col gap-1.5">
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
            <div className="flex flex-wrap items-end gap-4">
              <SelectFilter
                name="channel"
                label="Acquisition sales channel"
                value={options.channel}
                options={[...new Set(["online_dtc", "amazon", options.channel])].map((value) => ({
                  value,
                  label: value === "online_dtc" ? "Online DTC" : value === "amazon" ? "Amazon" : value,
                }))}
              />
              <AcquisitionDimensionFilter dimension={options.dimension} />
            </div>
            {options.dimension !== "no_filters" && (
              <Suspense
                key={`${filters.storeId}|${options.asOf}|${options.channel}|${options.dimension}|${options.segmentSearch}`}
                fallback={<LoadingState variant="control" label="Loading acquisition segments" />}
              >
                <DataRegion
                  timestamp={false}
                  load={() =>
                    getRetentionSegments({
                      storeId: filters.storeId,
                      asOf: options.asOf,
                      dimension: options.dimension,
                      channel: options.channel,
                      search: options.segmentSearch,
                    })
                  }
                  isEmpty={() => false}
                  emptyMessage="No acquisition segments."
                  errorContent={
                    <AcquisitionSegmentFilter
                      segment={options.segment}
                      search={options.segmentSearch}
                      values={[]}
                      truncated={false}
                      unavailable
                    />
                  }
                >
                  {(segments) => (
                    <AcquisitionSegmentFilter
                      segment={options.segment}
                      search={options.segmentSearch}
                      values={segments.values}
                      truncated={segments.truncated}
                    />
                  )}
                </DataRegion>
              </Suspense>
            )}
            <div role="group" aria-label="Cohort presentation" className="flex flex-wrap items-end gap-4">
              <SelectFilter
                name="cohorts"
                label="Chart cohorts"
                value={options.curveWindow}
                options={[...COHORT_WINDOWS]}
              />
              <SelectFilter
                name="measure"
                label="Matrix measure"
                value={options.metric}
                options={[...RETENTION_METRICS]}
              />
            </div>
            <details className="text-sm text-muted-foreground">
              <summary className="cursor-pointer font-medium">About these cohorts</summary>
              <p className="mt-2 max-w-prose">
                Twelve acquisition cohorts through {formatMonth(`${options.asOf}-01`)}. Month 0 is the acquisition
                calendar month, followed by calendar months 1–11. Only fully elapsed months are shown; elapsed time does
                not prove the warehouse is complete. Segments describe the first valid acquisition order, not subsequent
                orders. Only one dimension and one segment are read at a time; overlapping segment populations are never
                added together. Product and SKU segments are not published in this report.
              </p>
            </details>
            <Suspense
              key={`${filters.storeId}|${options.asOf}|${options.channel}|${options.metric}|${options.curveWindow}|${options.dimension}|${options.segment}`}
              fallback={<LoadingState variant="table" label="Loading retention cohorts" />}
            >
              <DataRegion
                timestamp={timeZone}
                load={() =>
                  getRetention({
                    storeId: filters.storeId,
                    asOf: options.asOf,
                    dimension: options.dimension,
                    segment: options.segment,
                  })
                }
                isEmpty={(rows) => rows.length === 0}
                emptyMessage={
                  options.dimension === "no_filters"
                    ? "No published acquisition cohorts for this store and observation window."
                    : options.segment
                      ? "No published cohorts match this acquisition segment and observation window. Choose another segment."
                      : "Choose an acquisition segment to load its cohorts."
                }
              >
                {(rows) => {
                  return (
                    <div className="flex flex-col gap-4">
                      {rows.some((row) => row.channel === options.channel) && (
                        <RetentionCurves
                          rows={rows}
                          channel={options.channel}
                          asOf={options.asOf}
                          window={options.curveWindow}
                          currency={currency}
                        />
                      )}
                      <div className="flex flex-wrap items-end justify-between gap-4 border-t pt-6">
                        <h2 className="text-lg font-semibold">All twelve cohorts</h2>
                      </div>
                      <p data-metric-definition={metricLabel} className="max-w-prose text-sm text-muted-foreground">
                        {options.metric === "retention"
                          ? "Monthly retention is customers who purchased in that month divided by the original cohort size. Month 0 includes the acquisition purchase. A customer may return after skipping a month."
                          : options.metric === "second"
                            ? "Customers who have placed a second order by this calendar month of age / original cohort size. Cumulative, including second orders in Month 0; this is different from purchasing again in a particular month. Ages are calendar months, not rolling 30-day windows."
                            : options.metric === "revenue"
                              ? "LTR is cumulative net revenue divided by the original cohort size. It includes the acquisition month and all subsequent months through the displayed age."
                              : "LTV here is cumulative gross profit divided by the original cohort size. It includes published product, shipping, fulfillment and payment costs; missing cost inputs can overstate profit."}
                      </p>
                      {rows.some((row) => row.channel === options.channel) ? (
                        <CohortMatrix
                          caption={metricLabel}
                          columns={Array.from({ length: COHORT_MONTHS }, (_, index) => `Month ${index}`)}
                          rows={retentionMatrix(rows, options.channel, options.metric, options.asOf, currency)}
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

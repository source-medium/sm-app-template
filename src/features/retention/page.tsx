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
import type { SearchParams } from "@/lib/filters";
import { getRetention } from "./queries";
import { COHORT_MONTHS, RETENTION_METRICS, retentionOptions } from "./filters";
import { retentionMatrix } from "./matrix";

export const metadata: Metadata = { title: "Retention" };
export default async function RetentionPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const options = retentionOptions(params, new Date());
  const applied = { ...params, as_of: options.asOf, channel: options.channel, measure: options.metric };
  const metricLabel = RETENTION_METRICS.find((item) => item.value === options.metric)?.label ?? "Monthly retention";
  return (
    <ReportPage
      title="Retention"
      description="Compare monthly purchase cohorts at the same age, one sales channel at a time."
      pathname="/retention"
      params={applied}
      preserve={["as_of", "channel", "measure"]}
      dates={false}
    >
      {({ filters }) => {
        const preserved = {
          store: filters.storeId,
          as_of: options.asOf,
          channel: options.channel,
          measure: options.metric,
        };
        return (
          <>
            <div className="flex flex-wrap items-end gap-4">
              <form action="/retention" aria-label="Cohort observation window" className="flex items-end gap-2">
                {Object.entries(preserved)
                  .filter(([key]) => key !== "as_of")
                  .map(([key, value]) => (
                    <input key={key} type="hidden" name={key} value={value} />
                  ))}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="cohort-as-of" className="text-xs font-medium text-muted-foreground">
                    Through completed month
                  </label>
                  <Input
                    id="cohort-as-of"
                    type="month"
                    name="as_of"
                    defaultValue={options.asOf}
                    min="0002-01"
                    max={options.maxMonth}
                    required
                  />
                </div>
                <Button type="submit" variant="secondary">
                  Apply month
                </Button>
              </form>
              <SelectFilter
                pathname="/retention"
                name="measure"
                label="Cohort measure"
                value={options.metric}
                options={[...RETENTION_METRICS]}
                preserved={preserved}
              />
            </div>
            <p className="max-w-prose text-sm text-muted-foreground">
              Twelve acquisition cohorts through {formatMonth(`${options.asOf}-01`)}. Month 0 is the acquisition
              calendar month, followed by calendar months 1–11. Only fully elapsed months are shown; elapsed time does
              not prove the warehouse is complete.
            </p>
            <Suspense
              key={`${filters.storeId}|${options.asOf}|${options.channel}|${options.metric}`}
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
                      <SelectFilter
                        pathname="/retention"
                        name="channel"
                        label="Acquisition sales channel"
                        value={options.channel}
                        options={channels.map((value) => ({ value, label: value }))}
                        preserved={preserved}
                      />
                      <p className="max-w-prose text-sm text-muted-foreground">
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

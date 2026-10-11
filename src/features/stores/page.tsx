import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { ReportPage } from "@/components/shell/report-page";
import { DataRegion } from "@/components/patterns/data-region";
import { LoadingState } from "@/components/patterns/data-states";
import { StoreComparisonTable } from "./comparison-table";
import { ComparisonCaption } from "@/components/patterns/comparison-caption";
import { requireViewer } from "@/lib/auth/require-viewer";
import { single, type SearchParams } from "@/lib/filters";
import { storeReportPath, switchStoreHref } from "@/lib/store-navigation";
import { STORES_RELATION } from "./rows";
import { getStoreComparison } from "./queries";

export const metadata: Metadata = { title: "All stores" };

export default async function StoresPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const supplied = single(params, "store");
  const access = await requireViewer(supplied === undefined ? undefined : { storeId: supplied });
  if (access.storeId !== null) {
    const destination = storeReportPath();
    if (!destination) notFound();
    redirect(switchStoreHref(destination, params, access.storeId));
  }
  return (
    <ReportPage
      title="All stores"
      description="Compare performance across stores, then open a store to explore what changed."
      pathname="/stores"
      params={params}
      allStores
      comparisons
      sources={[
        {
          relation: STORES_RELATION,
          scope:
            "Daily executive summary, aggregated separately for each available store. No channel filters or cross-store totals.",
        },
      ]}
    >
      {({ filters, comparison, timeZone, params: applied }) => {
        const baseline = comparison?.range ?? null;
        return (
          <>
            {comparison && <ComparisonCaption comparison={comparison} />}
            <Suspense
              key={`${filters.range.from}|${filters.range.to}|${comparison?.mode}`}
              fallback={<LoadingState variant="table" label="Loading stores" />}
            >
              <DataRegion
                timestamp={timeZone}
                load={() => getStoreComparison(filters.range, baseline)}
                isEmpty={(data) => !data.length}
                emptyMessage="No stores are available yet."
              >
                {(data) => {
                  return (
                    <StoreComparisonTable
                      data={data}
                      range={filters.range}
                      baseline={baseline}
                      params={applied}
                      now={new Date()}
                    />
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

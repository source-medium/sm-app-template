import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { appConfig } from "@/app.config";
import { ReportPage } from "@/components/shell/report-page";
import { DataRegion } from "@/components/patterns/data-region";
import { LoadingState } from "@/components/patterns/data-states";
import { SelectFilter } from "@/components/patterns/select-filter";
import { parseChoice, single, withParams, REPORT_FILTER_FORM_ID, type SearchParams } from "@/lib/filters";
import { formatDate } from "@/lib/format";
import { getDefinitions } from "./queries";
import { DATA_SOURCES, DATA_TABS } from "./rows";
import { DataFields } from "./fields";
import { MetricExplorer } from "./explorer";
import { explorerCatalog, type ExplorerReport } from "./catalog";

export const metadata: Metadata = { title: "Explore your data" };

/** Views that declare the canonical metrics they present (app.config.ts nav `metrics`). */
const REPORTS: ExplorerReport[] = appConfig.nav
  .filter((item) => item.metrics?.length)
  .map((item) => ({ href: item.href, label: item.label, metrics: item.metrics ?? [] }));

export default async function DataPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const requested = parseChoice(params, "tab", DATA_TABS, "explore");
  const tab = requested === "metrics" ? "explore" : requested;
  const source = parseChoice(params, "source", DATA_SOURCES, "obt_orders");
  const search = (single(params, "q") ?? "").slice(0, 120);
  const category = (single(params, "category") ?? "").slice(0, 120);
  return (
    <ReportPage
      title="Explore your data"
      description="Find any published metric, understand what it means, and open the report that shows it."
      pathname="/data"
      params={params}
      dates={false}
      agentFilters={{ tab, source }}
      agentOmissions={search ? ["Metric search"] : []}
      clientPresentationParams={["q", "category"]}
    >
      {({ filters, params: applied }) => (
        <div className="space-y-5">
          <nav aria-label="Data sections" className="flex flex-wrap gap-2">
            {(
              [
                ["explore", "Explore"],
                ["fields", "Fields"],
                ["health", "Data health"],
              ] as const
            ).map(([value, label]) => (
              <Link
                prefetch={false}
                key={value}
                href={withParams("/data", applied, { tab: value, q: null, category: null })}
                aria-current={tab === value ? "page" : undefined}
                className="rounded-md border px-3 py-2 text-sm aria-[current=page]:bg-accent aria-[current=page]:font-medium"
              >
                {label}
              </Link>
            ))}
          </nav>
          <input type="hidden" form={REPORT_FILTER_FORM_ID} name="tab" value={tab} />
          {tab === "fields" ? (
            <>
              <SelectFilter
                name="source"
                label="Published source"
                value={source}
                options={DATA_SOURCES.map((value) => ({ value, label: value }))}
              />
              <DataFields key={`${filters.storeId}|${source}`} storeId={filters.storeId} relation={source} />
            </>
          ) : (
            <Suspense
              key={`${filters.storeId}|${tab}`}
              fallback={
                // Explore shows a search box, chips and one row per metric; reserve that height.
                <LoadingState variant="table" rows={tab === "explore" ? 18 : 6} label="Loading published metadata" />
              }
            >
              <DataRegion
                timestamp={false}
                load={() => getDefinitions(filters.storeId)}
                isEmpty={() => false}
                emptyMessage="No published metadata."
              >
                {(data) =>
                  tab === "health" ? (
                    <div className="space-y-4 text-sm">
                      <p className="max-w-prose">
                        What the published dictionary says about each source this app reads. A published date or a
                        successful query does not prove a complete period or a successful delivery; pipeline freshness,
                        period completeness and quality checks are not published.
                      </p>
                      {data.mode === "sample" ? (
                        <p className="font-medium">Sample data: not assessed. No warehouse was queried.</p>
                      ) : (
                        <p>Metric catalog: {data.catalog}. Its update time describes definitions, not business data.</p>
                      )}
                      <ul className="divide-y rounded-xl border bg-card">
                        {data.sources.map((row) => (
                          <li key={`${row.dataset}.${row.relation}`} className="space-y-1 px-4 py-3">
                            <p className="font-medium break-all">{row.relation}</p>
                            <p className="text-muted-foreground">
                              {row.consistency === "inconsistent"
                                ? "Conflicting metadata for this store; not combined."
                                : row.observedDate
                                  ? `Latest published metadata date: ${formatDate(row.observedDate)}.`
                                  : row.metadata === "accessible"
                                    ? "No selected-store date published."
                                    : `Metadata ${row.metadata}.`}
                            </p>
                          </li>
                        ))}
                        {data.sources.length === 0 && (
                          <li className="px-4 py-3 text-muted-foreground">No sources to assess.</li>
                        )}
                      </ul>
                    </div>
                  ) : (
                    <>
                      {data.catalog !== "accessible" && data.mode === "live" && (
                        <p className="text-sm" role="status">
                          Metric catalog {data.catalog}: no published definitions could be read for this warehouse.
                        </p>
                      )}
                      <MetricExplorer
                        {...explorerCatalog(data.metrics)}
                        reports={REPORTS}
                        storeId={filters.storeId}
                        mode={data.mode}
                        truncated={data.truncated}
                        initialQuery={search}
                        initialCategory={category}
                      />
                    </>
                  )
                }
              </DataRegion>
            </Suspense>
          )}
        </div>
      )}
    </ReportPage>
  );
}

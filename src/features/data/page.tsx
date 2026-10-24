import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { ReportPage } from "@/components/shell/report-page";
import { DataRegion } from "@/components/patterns/data-region";
import { LoadingState } from "@/components/patterns/data-states";
import { SelectFilter } from "@/components/patterns/select-filter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Disclosure } from "@/components/ui/disclosure";
import { parseChoice, single, withParams, REPORT_FILTER_FORM_ID, type SearchParams } from "@/lib/filters";
import { dependencyIds } from "@/lib/metric-binding";
import { getDefinitions } from "./queries";
import { DATA_SOURCES, PAGE_SIZE } from "./rows";
import { DataFields } from "./fields";

export const metadata: Metadata = { title: "Data & definitions" };
export default async function DataPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const tab = parseChoice(params, "tab", ["health", "metrics", "fields"] as const, "health");
  const source = parseChoice(params, "source", DATA_SOURCES, "obt_orders");
  const search = (single(params, "q") ?? "").slice(0, 120);
  const page = Math.max(1, Math.min(30, Number.parseInt(single(params, "page") ?? "1", 10) || 1));
  return (
    <ReportPage
      title="Data & definitions"
      description="Inspect published definitions, field documentation and the limits of available evidence."
      pathname="/data"
      params={params}
      dates={false}
      agentFilters={{ tab, source }}
      agentOmissions={search ? ["Definition search"] : []}
    >
      {({ filters, params: applied }) => (
        <div className="space-y-5">
          <nav aria-label="Data sections" className="flex flex-wrap gap-2">
            {(
              [
                ["health", "Availability & health"],
                ["metrics", "Metrics"],
                ["fields", "Fields"],
              ] as const
            ).map(([value, label]) => (
              <Link
                prefetch={false}
                key={value}
                href={withParams("/data", applied, { tab: value, page: null })}
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
            <>
              {tab === "metrics" && (
                <div className="max-w-md space-y-2">
                  <label htmlFor="metric-search" className="text-sm font-medium">
                    Search metrics
                  </label>
                  <Input
                    id="metric-search"
                    name="q"
                    type="search"
                    defaultValue={search}
                    form={REPORT_FILTER_FORM_ID}
                    placeholder="Name, definition or source"
                  />
                  <Button type="submit" form={REPORT_FILTER_FORM_ID} size="sm">
                    Search metrics
                  </Button>
                </div>
              )}
              <Suspense
                key={`${filters.storeId}|${tab}|${search}|${page}`}
                fallback={<LoadingState variant="table" label="Loading published metadata" />}
              >
                <DataRegion
                  timestamp={false}
                  load={() => getDefinitions(filters.storeId)}
                  isEmpty={() => false}
                  emptyMessage="No published metadata."
                >
                  {(data) => {
                    const counts = new Map<string, number>();
                    for (const metric of data.metrics)
                      counts.set(metric.metric_name, (counts.get(metric.metric_name) ?? 0) + 1);
                    const conflicts = [...counts].filter(([, count]) => count > 1).map(([name]) => name);
                    const metrics = data.metrics
                      .filter((metric) => !conflicts.includes(metric.metric_name))
                      .filter((metric) =>
                        `${metric.metric_name} ${metric.metric_label} ${metric.metric_description} ${metric.underlying_model}`
                          .toLowerCase()
                          .includes(search.toLowerCase()),
                      );
                    return tab === "health" ? (
                      <div className="space-y-4">
                        <p className="max-w-prose text-sm">
                          Availability, matching results, freshness, coverage, quality and attribution answer different
                          questions. A recent record or successful query does not prove a complete period or a
                          successful delivery.
                        </p>
                        {data.mode === "sample" && (
                          <p>Sample data: health is not assessed. No warehouse was queried.</p>
                        )}
                        <dl className="grid gap-4 sm:grid-cols-3">
                          {["Pipeline freshness", "Period completeness", "Quality checks"].map((label) => (
                            <div key={label}>
                              <dt className="font-medium">{label}</dt>
                              <dd className="text-muted-foreground">Unknown</dd>
                            </div>
                          ))}
                        </dl>
                        <p>
                          Metric catalog access: {data.catalog}. Catalog update time describes definitions, not
                          business-data freshness.
                        </p>
                        <ul className="divide-y">
                          {data.sources.map((row) => (
                            <li key={`${row.dataset}.${row.relation}`} className="space-y-1 py-3">
                              <p className="font-medium break-all">
                                {row.dataset}.{row.relation}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                Metadata {row.metadata}. Scope: {row.scope}.{" "}
                                {row.consistency === "inconsistent"
                                  ? "Conflicting metadata; evidence cannot be combined."
                                  : row.observedDate
                                    ? `Published metadata date: ${row.observedDate}. Pipeline freshness unavailable.`
                                    : "Selected-store record-date evidence unavailable."}
                              </p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                          {data.mode === "sample"
                            ? "Bundled, reviewed published definitions. Your warehouse may differ."
                            : `Catalog ${data.catalog}.`}{" "}
                          Definition matches do not establish live numerical reconciliation.
                        </p>
                        {data.truncated && (
                          <p>
                            Partial catalog. Search covers only the loaded definitions; missing dependencies remain
                            unknown.
                          </p>
                        )}
                        {!!conflicts.length && (
                          <p role="status">
                            Conflicting published definitions: {conflicts.join(", ")}. These definitions require source
                            review and are not selected arbitrarily.
                          </p>
                        )}
                        {!metrics.length && (
                          <p>
                            {data.catalog === "accessible"
                              ? "No definitions match this search."
                              : `Metric catalog ${data.catalog}; search results are unavailable.`}
                          </p>
                        )}
                        {metrics.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((metric) => (
                          <Disclosure
                            key={metric.metric_name}
                            summary={metric.metric_label ?? metric.metric_name}
                            className="border-b pb-3"
                          >
                            <div className="max-w-prose space-y-2 text-sm">
                              <p className="font-mono break-all">{metric.metric_name}</p>
                              <p>{metric.metric_description}</p>
                              <p className="font-mono break-words">{metric.calculation}</p>
                              <p>
                                Published filter:{" "}
                                {metric.filter_condition ??
                                  (metric.has_filter ? "Not statically published; inspect dependencies" : "None")}
                              </p>
                              <p>
                                Source: {metric.underlying_model ?? "Unknown"}. Time:{" "}
                                {metric.metric_time_expression ?? "See dependencies"}. Grains:{" "}
                                {metric.metric_time_grains ?? "Unknown"}.
                              </p>
                              <p>
                                Dependencies: {dependencyIds(metric.dependent_metrics).join(", ") || "None published"}.
                              </p>
                              <p>
                                Aliases: {metric.abbreviations_list ?? "None published"}. Preferred name:{" "}
                                {metric.preferred_metric_name ?? metric.metric_name}.
                              </p>
                              <p>
                                Display unit: {metric.value_format ?? "Not published"}. Catalog updated:{" "}
                                {metric.catalog_updated_at ?? "Not published"}.
                              </p>
                            </div>
                          </Disclosure>
                        ))}
                        <nav aria-label="Metric pages" className="flex gap-4">
                          {page > 1 && (
                            <Link
                              prefetch={false}
                              className="underline"
                              href={withParams("/data", applied, { page: String(page - 1) })}
                            >
                              Previous metrics
                            </Link>
                          )}
                          {page * PAGE_SIZE < metrics.length && (
                            <Link
                              prefetch={false}
                              className="underline"
                              href={withParams("/data", applied, { page: String(page + 1) })}
                            >
                              Next metrics
                            </Link>
                          )}
                        </nav>
                      </div>
                    );
                  }}
                </DataRegion>
              </Suspense>
            </>
          )}
        </div>
      )}
    </ReportPage>
  );
}

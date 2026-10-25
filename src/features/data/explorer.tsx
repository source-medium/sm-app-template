"use client";

/**
 * Explore your data: every published metric in one searchable list, grouped by
 * the categories the catalog publishes, with a drawer that explains a metric
 * in plain words first and its technical definition on request. Search and
 * chips filter the loaded catalog locally and record the choice in the URL
 * through native history, so they never start a warehouse request. No metric
 * value is queried to decorate a row.
 */
import { useId, useMemo, useState } from "react";
import { BookOpen, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Disclosure } from "@/components/ui/disclosure";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { dependencyIds } from "@/lib/metric-binding";
import { REPORT_FILTER_FORM_ID } from "@/lib/filters";
import { usePresentationParams, writePresentationUrl } from "@/hooks/use-presentation-params";
import { firstSentence, matchesSearch, UNIT_LABELS, type ExplorerMetric, type ExplorerReport } from "./catalog";
import { USE_AGENT_METRIC, type AgentMetric } from "@/lib/report-data";
import { cn } from "@/lib/utils";

function toAgentMetric(metric: ExplorerMetric, reports: ExplorerReport[], origin: "sample" | "live"): AgentMetric {
  return {
    name: metric.metric_name,
    label: metric.metric_label,
    description: metric.metric_description,
    calculation: metric.calculation,
    filter: metric.filter_condition,
    model: metric.underlying_model,
    timeExpression: metric.metric_time_expression,
    unit: metric.value_format,
    dependencies: dependencyIds(metric.dependent_metrics),
    reports: reports.map((report) => report.href),
    origin,
  };
}

function updateUrl(changes: Record<string, string | null>) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(changes)) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  writePresentationUrl(url, "replace");
}

export function MetricExplorer({
  metrics,
  conflicts,
  reports,
  storeId,
  mode,
  truncated,
}: {
  metrics: ExplorerMetric[];
  /** Names published with conflicting definitions; listed, never shown as a metric. */
  conflicts: string[];
  reports: ExplorerReport[];
  storeId: string;
  mode: "sample" | "live";
  truncated: boolean;
}) {
  const id = useId();
  const params = usePresentationParams();
  const query = (params.get("q") ?? "").slice(0, 120);
  const category = (params.get("category") ?? "").slice(0, 120);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const categories = useMemo(() => [...new Set(metrics.map((metric) => metric.category))].sort(), [metrics]);
  const active = categories.includes(category) ? category : "";
  const shown = metrics.filter((metric) => (!active || metric.category === active) && matchesSearch(metric, query));
  const selected = metrics.find((metric) => metric.metric_name === selectedName) ?? null;
  const byName = new Map(metrics.map((metric) => [metric.metric_name, metric]));
  const reportsFor = (metric: ExplorerMetric) =>
    reports.filter((report) => report.metrics.includes(metric.metric_name));
  const reportHref = (report: ExplorerReport) => `${report.href}?${new URLSearchParams({ store: storeId })}`;

  return (
    <div className="flex flex-col gap-4" data-agent-target="Explore your data" data-agent-component="MetricExplorer">
      {/* The report form carries the choice too, so a filter change keeps it. */}
      {query && <input type="hidden" name="q" value={query} form={REPORT_FILTER_FORM_ID} />}
      {active && <input type="hidden" name="category" value={active} form={REPORT_FILTER_FORM_ID} />}
      <div className="flex flex-col gap-1.5 sm:max-w-md">
        <label htmlFor={`${id}-search`} className="text-sm font-medium">
          Search metrics
        </label>
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id={`${id}-search`}
            type="search"
            value={query}
            maxLength={120}
            onChange={(event) => updateUrl({ q: event.currentTarget.value || null })}
            placeholder="Net revenue, AOV, sessions…"
            className="pl-9"
            autoComplete="off"
          />
        </div>
      </div>
      {categories.length > 1 && (
        <div role="group" aria-label="Metric categories" className="flex flex-wrap gap-2">
          {["", ...categories].map((value) => (
            <Button
              key={value || "all"}
              type="button"
              size="sm"
              variant={active === value ? "default" : "outline"}
              aria-pressed={active === value}
              className="h-auto min-h-8 max-w-full py-1.5 text-left break-all whitespace-normal"
              onClick={() => updateUrl({ category: value || null })}
            >
              {value || "All categories"}
            </Button>
          ))}
        </div>
      )}
      <p className="text-sm text-muted-foreground" data-slot="metric-count">
        {shown.length === metrics.length
          ? `${metrics.length} published ${metrics.length === 1 ? "metric" : "metrics"}.`
          : `${shown.length} of ${metrics.length} metrics match.`}{" "}
        {truncated && "Partial catalog: only the loaded definitions are searchable."}{" "}
        {mode === "sample" && "Bundled, reviewed definitions; your warehouse may publish more."}
      </p>
      {conflicts.length > 0 && (
        <p className="text-sm" role="status">
          Conflicting published definitions: {conflicts.join(", ")}. These need source review and are not selected
          arbitrarily.
        </p>
      )}
      {shown.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-6 text-sm">
          <p className="font-medium">No metrics match</p>
          <p className="mt-1 text-muted-foreground">Try another word, or clear the search and category.</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => updateUrl({ q: null, category: null })}
          >
            Show all metrics
          </Button>
        </div>
      ) : (
        <ul className="divide-y rounded-xl border bg-card" aria-label="Published metrics">
          {shown.map((metric) => (
            <li key={metric.metric_name}>
              <button
                type="button"
                onClick={() => setSelectedName(metric.metric_name)}
                aria-haspopup="dialog"
                className="flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:flex-row sm:items-baseline sm:gap-4"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{metric.metric_label ?? metric.metric_name}</span>
                  <span className="block text-sm text-muted-foreground">
                    {firstSentence(metric.metric_description)}
                  </span>
                </span>
                <span className="flex shrink-0 flex-wrap gap-1.5 text-xs text-muted-foreground">
                  <Badge>{UNIT_LABELS[metric.value_format ?? ""] ?? "Unit not published"}</Badge>
                  <Badge>{metric.category}</Badge>
                  {reportsFor(metric).length > 0 && <Badge tone="accent">In a report</Badge>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelectedName(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>{selected.metric_label ?? selected.metric_name}</SheetTitle>
                <SheetDescription>{selected.category}</SheetDescription>
              </SheetHeader>
              <div className="flex min-w-0 flex-col gap-5 px-4 pb-6 text-sm">
                <p className="max-w-prose leading-relaxed">
                  {selected.metric_description ?? "No published description."}
                </p>
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-xs">
                  <dt className="text-muted-foreground">Unit</dt>
                  <dd>{UNIT_LABELS[selected.value_format ?? ""] ?? "Not published"}</dd>
                  <dt className="text-muted-foreground">Source</dt>
                  <dd className="font-mono break-all">{selected.underlying_model ?? "Not published"}</dd>
                </dl>
                <section aria-label="Where it appears" className="flex flex-col gap-2">
                  <h3 className="font-medium">Where it appears</h3>
                  {reportsFor(selected).length ? (
                    <ul className="flex flex-wrap gap-2">
                      {reportsFor(selected).map((report) => (
                        <li key={report.href}>
                          <Link
                            prefetch={false}
                            href={reportHref(report)}
                            className={buttonVariants({ variant: "outline", size: "sm" })}
                          >
                            <BookOpen aria-hidden /> View in {report.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground">
                      No report in this app shows this metric yet. Ask your coding agent to add it.
                    </p>
                  )}
                  <div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        const detail = toAgentMetric(selected, reportsFor(selected), mode);
                        setSelectedName(null);
                        window.dispatchEvent(new CustomEvent<AgentMetric>(USE_AGENT_METRIC, { detail }));
                      }}
                    >
                      <Sparkles aria-hidden /> Use in Vibe code
                    </Button>
                  </div>
                </section>
                <Disclosure summary="Technical details" className="rounded-md border p-3">
                  <dl className="space-y-2 text-xs">
                    <Row label="Canonical name">
                      <span className="font-mono break-all">{selected.metric_name}</span>
                    </Row>
                    <Row label="Calculation">
                      <span className="font-mono break-words">{selected.calculation ?? "Not published"}</span>
                    </Row>
                    <Row label="Filter">
                      <span className="font-mono break-words">
                        {selected.filter_condition ??
                          (selected.has_filter ? "Not statically published; inspect dependencies" : "None")}
                      </span>
                    </Row>
                    <Row label="Time basis">
                      <span className="font-mono break-words">
                        {selected.metric_time_expression ?? "See dependencies"}
                      </span>
                    </Row>
                    <Row label="Grains">{selected.metric_time_grains ?? "Not published"}</Row>
                    {selected.cumulative_settings && <Row label="Cumulative">{selected.cumulative_settings}</Row>}
                    <Row label="Depends on">
                      {dependencyIds(selected.dependent_metrics).length ? (
                        <span className="flex flex-wrap gap-1.5">
                          {dependencyIds(selected.dependent_metrics).map((name) =>
                            byName.has(name) ? (
                              <button
                                key={name}
                                type="button"
                                className="font-mono underline underline-offset-4"
                                onClick={() => setSelectedName(name)}
                              >
                                {name}
                              </button>
                            ) : (
                              <span key={name} className="font-mono">
                                {name} (not in the loaded catalog)
                              </span>
                            ),
                          )}
                        </span>
                      ) : (
                        "None published"
                      )}
                    </Row>
                    <Row label="Also known as">{selected.aliases.join(", ") || "No published aliases"}</Row>
                    <Row label="Catalog updated">{selected.catalog_updated_at ?? "Not published"}</Row>
                  </dl>
                  <p className="mt-3 text-xs text-muted-foreground">
                    The calculation documents SourceMedium&apos;s definition; it is not executable SQL and does not
                    establish live reconciliation.
                  </p>
                </Disclosure>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Badge({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "accent" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs",
        tone === "accent" ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-medium text-foreground">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

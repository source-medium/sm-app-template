import type { MetricBinding } from "@/lib/metric-binding";
/**
 * The report's title row: About this data, refresh, and a share link, with
 * the page's context for agent prompts on the element itself.
 */
import type { AgentReportContext } from "@/lib/agent-prompt";
import type { ViewerAccess } from "@/lib/auth/require-viewer";
import { planParams, type ComparisonPlan } from "@/lib/comparison";
import { withDates, withParams, type DateParams, type DateRange, type SearchParams } from "@/lib/filters";
import type { ReportSource } from "@/lib/report-data";
import { AboutData } from "./about-data";
import { CopyReportLink } from "./copy-report-link";
import { RefreshReport } from "./refresh-report";
import { SavedReports } from "./saved-reports";

/** The applied report state, once the store's date is known. */
export type ReportView = {
  range: DateRange;
  issue: string | null;
  plan?: ComparisonPlan;
  /** The view's date-derived defaults, which apply like URL parameters. */
  derived: Record<string, string>;
  /** The applied dates, pinned with the preset they are. */
  fixed: DateParams;
  /** Saved views preserve rolling presets rather than pinning today's dates. */
  live: DateParams;
};

export function ReportHeader({
  title,
  description,
  pathname,
  params,
  dates,
  agentFilters,
  agentOmissions,
  sources,
  bindings = [],
  clientPresentationParams = [],
  timeZone,
  mode,
  storeId,
  currency = null,
  allStores = false,
  view,
}: {
  title: string;
  description: string;
  pathname: string;
  params: SearchParams;
  dates: boolean;
  agentFilters: Record<string, string | null>;
  agentOmissions: string[];
  sources: readonly ReportSource[];
  bindings?: readonly MetricBinding[];
  clientPresentationParams?: readonly string[];
  timeZone?: string;
  mode: ViewerAccess["mode"];
  /** Absent when no store can be shown; then the report is not loaded. */
  storeId?: string;
  /** The selected store's reporting currency (dim_stores or an app.config.ts override), or null when unknown. */
  currency?: string | null;
  allStores?: boolean;
  /** Absent when the store's date is unknown; then the report is not loaded. */
  view?: ReportView;
}) {
  // Shared links pin the applied dates, so a colleague sees exactly this period and its comparisons.
  const shareHref =
    storeId && view ? withParams(pathname, dates ? withDates(params, view.fixed) : params, { store: storeId }) : null;
  const agentContext: AgentReportContext = {
    pathname,
    title,
    filters: {
      ...agentFilters,
      ...view?.derived,
      ...(storeId ? { store: storeId } : {}),
      ...(view && dates && !view.issue ? view.range : {}),
      ...(view?.plan && !view.issue ? planParams(view.plan) : {}),
    },
    currency,
    ...(allStores ? { storeScope: "all" as const } : {}),
    sources: sources.map((source) => source.relation),
    status: view?.issue
      ? `Report not loaded: ${view.issue}`
      : storeId && view
        ? undefined
        : "Store context is unavailable; report not loaded.",
    omitted: agentOmissions,
  };
  return (
    <header data-agent-page={JSON.stringify(agentContext)} className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="max-w-prose text-sm text-muted-foreground">{description}</p>
        <p data-slot="report-trust" className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>{mode === "sample" ? "Synthetic sample data" : "Warehouse freshness: unknown"}</span>
          <span>
            {allStores
              ? "Currencies shown per store; no combined totals"
              : currency
                ? `Reporting currency: ${currency}`
                : "Currency unknown; amounts are unlabeled"}
          </span>
        </p>
      </div>
      <div className="flex flex-wrap items-start gap-2">
        {sources.length > 0 && (
          <AboutData
            key={JSON.stringify(agentContext)}
            context={agentContext}
            sources={sources}
            mode={mode}
            bindings={bindings}
            timeZone={timeZone}
          />
        )}
        <RefreshReport />
        {storeId && view && !view.issue && (
          <SavedReports
            href={withParams(pathname, dates ? withDates(params, view.live) : params, { store: storeId })}
            clientPresentationParams={clientPresentationParams}
          />
        )}
        {shareHref && (
          <CopyReportLink key={shareHref} href={shareHref} clientPresentationParams={clientPresentationParams} />
        )}
      </div>
    </header>
  );
}

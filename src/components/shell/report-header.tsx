/**
 * The report's title row: About this data, refresh, and a share link, with
 * the page's context for agent prompts on the element itself.
 */
import { appConfig } from "@/app.config";
import type { AgentReportContext } from "@/lib/agent-prompt";
import type { ViewerAccess } from "@/lib/auth/require-viewer";
import type { Comparison } from "@/lib/comparison";
import { withParams, type DateRange, type SearchParams } from "@/lib/filters";
import type { ReportSource } from "@/lib/report-data";
import { AboutData } from "./about-data";
import { CopyReportLink } from "./copy-report-link";
import { RefreshReport } from "./refresh-report";

/** The applied report state, once the store's date is known. */
export type ReportView = {
  range: DateRange;
  issue: string | null;
  comparison?: Comparison;
  /** The view's date-derived defaults, which apply like URL parameters. */
  derived: Record<string, string>;
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
  mode,
  storeId,
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
  mode: ViewerAccess["mode"];
  /** Absent when no store can be shown; then the report is not loaded. */
  storeId?: string;
  /** Absent when the store's date is unknown; then the report is not loaded. */
  view?: ReportView;
}) {
  const shareHref =
    storeId && view ? withParams(pathname, params, { store: storeId, ...(dates ? view.range : {}) }) : null;
  const agentContext: AgentReportContext = {
    pathname,
    title,
    filters: {
      ...agentFilters,
      ...view?.derived,
      ...(storeId ? { store: storeId } : {}),
      ...(view && dates && !view.issue ? view.range : {}),
      ...(view?.comparison && !view.issue ? { compare: view.comparison.mode } : {}),
    },
    currency: appConfig.currency,
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
        {appConfig.currency && (
          <p className="text-xs text-muted-foreground">Reporting currency: {appConfig.currency}</p>
        )}
      </div>
      <div className="flex flex-wrap items-start gap-2">
        {sources.length > 0 && (
          <AboutData key={JSON.stringify(agentContext)} context={agentContext} sources={sources} mode={mode} />
        )}
        <RefreshReport />
        {shareHref && <CopyReportLink key={shareHref} href={shareHref} />}
      </div>
    </header>
  );
}

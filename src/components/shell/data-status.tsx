import { loadReportMetadata } from "@/lib/data/report-metadata.server";
import { metricCompatibility, type MetricBinding } from "@/lib/metric-binding";
import type { ReportSource } from "@/lib/report-data";
import type { SourceEvidence } from "@/lib/data/evidence";
import { formatDate } from "@/lib/format";
import { Disclosure } from "@/components/ui/disclosure";

const frame = "text-sm text-muted-foreground";

export function PendingDataStatus() {
  return (
    <aside aria-label="Data status" className={`min-h-9 content-center ${frame}`}>
      Checking published metadata…
    </aside>
  );
}

/** One short clause per source: what the dictionary published, never what it implies. */
function describe(source: SourceEvidence): string {
  if (source.consistency === "inconsistent") return "conflicting metadata, not combined";
  if (source.observedDate) return `latest published metadata date ${formatDate(source.observedDate)}`;
  if (source.metadata === "accessible") return "no selected-store date published";
  return `metadata ${source.metadata}`;
}

/** The one line a viewer needs. It names a published date only when every source agrees on it. */
function headline(sources: readonly SourceEvidence[]): string {
  if (sources.some((source) => source.consistency === "inconsistent"))
    return "Sources disagree on their published dates";
  const dates = [...new Set(sources.map((source) => source.observedDate))];
  if (dates.length === 1 && dates[0]) return `Latest published date: ${formatDate(dates[0])}`;
  return dates.some(Boolean) ? "Published dates vary by source" : "No published date for this store";
}

export async function DataStatus({
  storeId,
  sources,
  bindings,
}: {
  storeId: string;
  sources: readonly ReportSource[];
  bindings: readonly MetricBinding[];
}) {
  const data = await loadReportMetadata(
    storeId,
    sources.map((source) => source.relation),
  );
  if (data.mode === "sample") return null;
  const findings = bindings.flatMap((binding) =>
    metricCompatibility(binding, data.metrics).map((finding) => `${binding.label}: ${finding}`),
  );
  return (
    <aside aria-label="Data status" className={frame}>
      <Disclosure
        summary={`${headline(data.sources)}${findings.length ? ` (${findings.length} definition ${findings.length === 1 ? "finding" : "findings"})` : ""}`}
      >
        <div className="max-w-prose space-y-2">
          {findings.length > 0 && (
            <ul role="status" className="space-y-1 text-foreground">
              {findings.map((finding) => (
                <li key={finding}>{finding}</li>
              ))}
            </ul>
          )}
          <p>
            {data.sources.map((source) => (
              <span key={`${source.dataset}.${source.relation}`}>
                <span className="font-medium text-foreground">{source.relation}</span>: {describe(source)}.{" "}
              </span>
            ))}
            Pipeline freshness, period completeness and quality checks are not published.
          </p>
          {data.truncated && <p>Partial metadata list. Missing dependencies are not passes.</p>}
          <p>
            The published metadata date may describe business activity, a carried observation, or a table modification,
            depending on its producer ({data.sources.map((source) => `${source.dataset}.${source.relation}`).join(", ")}
            ). It is not a successful load or completeness watermark. Metadata availability does not establish
            business-data access or completeness. Report sections show their own results and failures.
          </p>
        </div>
      </Disclosure>
    </aside>
  );
}

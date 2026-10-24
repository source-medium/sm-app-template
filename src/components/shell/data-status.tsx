import { loadReportMetadata } from "@/lib/data/report-metadata.server";
import { metricCompatibility, type MetricBinding } from "@/lib/metric-binding";
import type { ReportSource } from "@/lib/report-data";
import type { SourceEvidence } from "@/lib/data/evidence";
import { formatDate } from "@/lib/format";

const frame = "rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground";

export function PendingDataStatus() {
  return (
    <aside aria-label="Data status" className={frame}>
      Checking published metadata… Pipeline freshness, period completeness and quality checks are not published.
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
  if (data.mode === "sample")
    return (
      <aside aria-label="Data status" className={frame}>
        Sample data. Coverage and pipeline health are not assessed.
      </aside>
    );
  const findings = bindings.flatMap((binding) =>
    metricCompatibility(binding, data.metrics).map((finding) => `${binding.label}: ${finding}`),
  );
  return (
    <aside aria-label="Data status" className={`space-y-1 ${frame}`}>
      <p>
        {data.sources.map((source) => (
          <span key={`${source.dataset}.${source.relation}`}>
            <span className="font-medium text-foreground">{source.relation}</span>: {describe(source)}.{" "}
          </span>
        ))}
        Pipeline freshness, period completeness and quality checks are not published.
      </p>
      <details>
        <summary className="cursor-pointer rounded-sm py-1 focus-visible:outline-2 focus-visible:outline-ring">
          About this evidence
          {findings.length ? ` (${findings.length} definition ${findings.length === 1 ? "finding" : "findings"})` : ""}
        </summary>
        {findings.length > 0 && (
          <ul role="status" className="mt-2 space-y-1 text-foreground">
            {findings.map((finding) => (
              <li key={finding}>{finding}</li>
            ))}
          </ul>
        )}
        {data.truncated && <p className="mt-2">Partial metadata list. Missing dependencies are not passes.</p>}
        <p className="mt-2">
          The published metadata date may describe business activity, a carried observation, or a table modification,
          depending on its producer ({data.sources.map((source) => `${source.dataset}.${source.relation}`).join(", ")}).
          It is not a successful load or completeness watermark. Metadata availability does not establish business-data
          access or completeness. Report sections show their own results and failures.
        </p>
      </details>
    </aside>
  );
}

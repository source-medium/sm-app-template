/** Safe to copy into an agent conversation: no configured values or provider text. */
export type ConnectionCheck = {
  name: string;
  status: "pass" | "fail" | "warning";
  message: string;
};

export type ConnectionReport = {
  mode: "sample" | "live";
  checks: ConnectionCheck[];
};

export function connectionReportText(report: ConnectionReport): string {
  return [
    `SourceMedium connection: ${report.mode === "live" ? "live configuration" : "sample data"}`,
    ...report.checks.map((check) => `${check.status.toUpperCase()} ${check.name}: ${check.message}`),
    "This checks connectivity, not metric accuracy or data freshness.",
  ].join("\n");
}

export const SAMPLE_CONNECTION_REPORT: ConnectionReport = {
  mode: "sample",
  checks: [
    {
      name: "Sample data",
      status: "pass",
      message: "No warehouse credential is configured. No Google requests were made.",
    },
  ],
};

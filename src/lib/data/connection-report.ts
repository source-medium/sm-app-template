import { supportRequestId } from "./warehouse-error";

/** Safe to copy: no credentials, warehouse coordinates or provider text. */
export type ConnectionCheck = {
  name: string;
  status: "pass" | "fail" | "warning";
  message: string;
  requestId?: string;
};

export type ConnectionReport = {
  mode: "sample" | "live";
  checks: ConnectionCheck[];
  checkedAt?: string;
  instance?: { environment: string; build: string; requireLive: boolean };
};

export function connectionReportText(report: ConnectionReport): string {
  return [
    ...(report.instance
      ? [
          `Instance: ${report.instance.environment}; build ${report.instance.build}; live required: ${report.instance.requireLive ? "yes" : "no"}.`,
        ]
      : []),
    `SourceMedium connection: ${report.mode === "live" ? "live configuration" : "sample data"}`,
    ...(report.checkedAt ? [`Checked at: ${report.checkedAt}`] : []),
    ...report.checks.map(
      (check) =>
        `${check.status.toUpperCase()} ${check.name}: ${check.message}${supportRequestId(check.requestId) ? ` Support code: ${check.requestId}` : ""}`,
    ),
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

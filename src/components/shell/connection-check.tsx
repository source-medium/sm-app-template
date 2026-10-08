"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { connectionReportText, type ConnectionReport } from "@/lib/data/connection-report";

export function ConnectionCheck({ mode }: { mode: "sample" | "live" }) {
  const [report, setReport] = useState<ConnectionReport | null>(null);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);

  async function check() {
    setRunning(true);
    setReport(null);
    setMessage("");
    setCopied(false);
    try {
      const response = await fetch("/connection/check", { method: "POST" });
      if (!response.ok) throw new Error("Connection check unavailable");
      const result: ConnectionReport = await response.json();
      setReport(result);
    } catch {
      setMessage(
        "The check could not finish. Reload this page to check your sign-in and configuration, then try again.",
      );
    } finally {
      setRunning(false);
    }
  }

  async function copy() {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(connectionReportText(report));
      setCopied(true);
    } catch {
      setMessage("Copy is unavailable in this browser. Select and copy the report below.");
    }
  }

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4" aria-label="Connection check">
      <p className="text-sm text-muted-foreground">
        {mode === "live"
          ? "Checks the credential, dataset access, store roster and query allowance. Runs small warehouse queries with a 30-second limit."
          : "Checks sample mode without making any warehouse requests."}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={check} disabled={running}>
          {running ? "Checking…" : "Check connection"}
        </Button>
        {report && (
          <Button variant="outline" onClick={copy}>
            {copied ? "Copied" : "Copy safe report"}
          </Button>
        )}
      </div>
      <div role="status" aria-live="polite">
        {running && <p className="text-sm">Checking the connection…</p>}
        {message && <p className="text-sm text-destructive">{message}</p>}
        {report && (
          <div className="space-y-3">
            <p className="text-sm font-medium">
              {report.checks.some((check) => check.status === "fail")
                ? "The connection needs attention."
                : report.mode === "sample"
                  ? "Sample mode is ready."
                  : "Connection checks passed."}
            </p>
            <pre className="font-sans text-sm break-words whitespace-pre-wrap">{connectionReportText(report)}</pre>
            <p className="text-xs text-muted-foreground">
              This report contains no credentials, configured values, SQL or warehouse rows. You can share it with your
              coding agent or SourceMedium support.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

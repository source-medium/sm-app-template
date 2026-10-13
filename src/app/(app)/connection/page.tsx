import type { Metadata } from "next";
import { requireViewer } from "@/lib/auth/require-viewer";
import { reportingCurrencyConfig } from "@/lib/data/stores.server";
import { ConnectionCheck } from "@/components/shell/connection-check";
import { liveCurrencyNote, sampleCurrencyNote } from "@/components/shell/connection-currency";

export const metadata: Metadata = { title: "Connection" };

export default async function ConnectionPage() {
  const access = await requireViewer();
  const currency = access.mode === "sample" ? sampleCurrencyNote() : liveCurrencyNote(reportingCurrencyConfig());
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Connection</h1>
        <p className="text-sm text-muted-foreground">
          {access.mode === "live"
            ? "Live configuration is present. Run a check to verify the app can reach your warehouse."
            : "Sample data is loaded; nothing is connected yet. Three steps take you live."}
        </p>
      </div>
      {access.mode === "sample" && (
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>
            Ask an organization admin to create an app on the <strong>Apps</strong> page of your SourceMedium workspace.
            It shows a configuration block once; keep it like a password.
          </li>
          <li>
            Enter the block privately where this app runs: the Cloudflare Worker&apos;s runtime settings for a hosted
            app, or <code>.env.local</code> for a local checkout. Never paste it into a chat.
          </li>
          <li>
            Reload this page and run <strong>Check connection</strong>. The top bar then reads{" "}
            <strong>Live data</strong>. docs/connect.md has the details, and your coding agent can walk you through
            them.
          </li>
        </ol>
      )}
      <ConnectionCheck mode={access.mode} />
      <section aria-labelledby="currency-heading" className="space-y-2 rounded-xl border bg-card p-4 text-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="currency-heading" className="font-semibold">
            Reporting currency
          </h2>
          <p className="font-medium">{currency.status}</p>
        </div>
        <p className="text-muted-foreground">
          {currency.detail} A label never converts amounts, and amounts are never added across stores.
        </p>
      </section>
      {access.mode === "live" && (
        <p className="text-sm text-muted-foreground">
          To replace or revoke the app credential, follow docs/connect.md in your repository. Enter credentials
          privately in the Worker&apos;s runtime settings, never in an agent conversation.
        </p>
      )}
    </div>
  );
}

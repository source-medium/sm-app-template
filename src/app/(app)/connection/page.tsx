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
            : "You are using sample data. Connect your warehouse when you are ready to go live."}
        </p>
      </div>
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
      <p className="text-sm text-muted-foreground">
        Follow docs/connect.md in your repository to connect or replace the app credential. Enter credentials privately
        in Cloudflare’s runtime settings for this deployment, never in an agent conversation. Hosted preview setup is in
        docs/cloud.md#connect-preview-data.
      </p>
    </div>
  );
}

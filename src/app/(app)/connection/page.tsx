import type { Metadata } from "next";
import { appConfig } from "@/app.config";
import { requireViewer } from "@/lib/auth/require-viewer";
import { ConnectionCheck } from "@/components/shell/connection-check";

export const metadata: Metadata = { title: "Connection" };

export default async function ConnectionPage() {
  const access = await requireViewer();
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
      <div className="space-y-2 rounded-lg border bg-card p-4 text-sm">
        <h2 className="font-semibold">Reporting currency</h2>
        <p>
          Live reports label money with the verified reporting currency set in app.config.ts: <code>currency</code> for
          the deployment, with per-store overrides in <code>reportingCurrencies</code>. The nominal store currency in
          dim_stores never chooses that label. Sample stores use USD.
        </p>
        <p className="text-muted-foreground">
          {appConfig.currency
            ? `Live amounts are currently labeled ${appConfig.currency} unless a store has its own override.`
            : "No reporting currency is configured, so live amounts stay unlabeled until you verify the warehouse's reporting currency and set it in app.config.ts (docs/data.md#money-and-currency)."}{" "}
          This labels amounts. It does not convert them, and amounts are never added across stores.
        </p>
      </div>
      <p className="text-sm text-muted-foreground">
        Follow docs/connect.md in your repository to connect or replace the app credential. Enter credentials privately
        in Cloudflare’s runtime settings for this deployment, never in an agent conversation. Hosted preview setup is in
        docs/cloud.md#connect-preview-data.
      </p>
    </div>
  );
}

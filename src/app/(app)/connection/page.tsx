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
          {appConfig.currency
            ? `Configured as ${appConfig.currency}. Confirm that your included sources report in this currency.`
            : "Not set. Ask your agent to set the workspace reporting currency in app.config.ts after confirming it with SourceMedium."}
        </p>
        <p className="text-muted-foreground">
          Store currency does not establish reporting currency. This setting formats money; it does not convert it.
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

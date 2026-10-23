import { instanceInfo, readConfig } from "@/lib/config/env.server";
import type { Metadata } from "next";
import { requireViewer } from "@/lib/auth/require-viewer";
import { reportingCurrencyConfig } from "@/lib/data/stores.server";
import { ConnectionCheck } from "@/components/shell/connection-check";
import { liveCurrencyNote, sampleCurrencyNote } from "@/components/shell/connection-currency";

export const metadata: Metadata = { title: "Connection" };

export default async function ConnectionPage() {
  const access = await requireViewer();
  const info = instanceInfo();
  const config = readConfig();
  const auth = config.status === "ok" ? config.guard?.kind : null;
  const managed = config.status === "ok" && (config.mode === "managed-dev" || config.mode === "managed");
  const hosted = config.status === "ok" && config.mode === "managed";
  const currency = access.mode === "sample" ? sampleCurrencyNote() : liveCurrencyNote(reportingCurrencyConfig());
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Connection</h1>
        <p className="text-sm text-muted-foreground">
          {access.mode === "live"
            ? "Live configuration is present. Run a check to verify the app can reach your warehouse."
            : "Sample data is loaded; nothing is connected yet. Follow the steps below to connect this instance."}
        </p>
      </div>
      <section aria-label="This instance" className="space-y-3 rounded-xl border bg-card p-4 text-sm">
        <h2 className="font-semibold">This instance</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2">
          <dt className="text-muted-foreground">Environment</dt>
          <dd>{info.environment}</dd>
          <dt className="text-muted-foreground">Data</dt>
          <dd>
            {managed
              ? "Live, through SourceMedium's data API"
              : access.mode === "live"
                ? "Live configuration present"
                : "Sample data"}
          </dd>
          <dt className="text-muted-foreground">Sign-in</dt>
          <dd>
            {hosted
              ? "SourceMedium sign-in, for your workspace's members"
              : managed
                ? "This computer only (managed development)"
                : auth === "access"
                  ? "Individual email via Cloudflare Access"
                  : auth === "basic"
                    ? "Shared password"
                    : "Public sample"}
          </dd>
          <dt className="text-muted-foreground">Live data required</dt>
          <dd>{info.requireLive ? "Yes" : "No"}</dd>
          <dt className="text-muted-foreground">Build</dt>
          <dd className="font-mono text-xs break-all">{info.build}</dd>
          <dt className="text-muted-foreground">Verification</dt>
          <dd>Check this instance below; its result includes the time and build.</dd>
        </dl>
      </section>
      {access.mode === "sample" && (
        <section className="space-y-3 text-sm" aria-labelledby="connect-heading">
          <h2 id="connect-heading" className="font-semibold">
            Connect this app
          </h2>
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              Choose sign-in and targets with your coding agent using <code>pnpm app:setup plan</code>. Choose live data
              before publishing a connected app.
            </li>
            <li>
              In SourceMedium, create a Production app for production and a Development app for local use and previews.
              Save their configuration blocks privately.
            </li>
            <li>
              {auth === "access" ? (
                <>
                  Add only <code>SM_CONNECTION</code> from the issued block as an encrypted secret. Keep Access settings
                  and remove <code>APP_BASIC_AUTH</code>.
                </>
              ) : (
                <>
                  For shared password sign-in, enter <code>SM_CONNECTION</code> and <code>APP_BASIC_AUTH</code>{" "}
                  privately. For individual email sign-in, enter only <code>SM_CONNECTION</code>, configure Access, and
                  omit <code>APP_BASIC_AUTH</code>.
                </>
              )}
            </li>
            <li>
              Use <code>pnpm app:setup credentials production</code> (or preview/local) for the exact destination. Save,
              deploy, reload, and check this instance.
            </li>
          </ol>
          <p className="text-muted-foreground">
            Never paste a credential into chat. Local, preview, and production settings are independent. docs/setup.md
            walks through each.
          </p>
        </section>
      )}
      <ConnectionCheck key={`${info.environment}|${info.build}|${access.mode}|${auth}`} mode={access.mode} />
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

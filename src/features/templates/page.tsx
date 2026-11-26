import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { appConfig } from "@/app.config";
import { ReportPage } from "@/components/shell/report-page";
import { LoadingState } from "@/components/patterns/data-states";
import { SectionHeader } from "@/components/patterns/section-header";
import { Card, CardContent, cardGridStyles } from "@/components/ui/card";
import { requireViewer } from "@/lib/auth/require-viewer";
import { loadStores } from "@/lib/data/stores.server";
import type { SearchParams } from "@/lib/filters";
import { PRESET_GROUPS, PRESETS, offeredPresets, presetHref, presetReadiness, type Readiness } from "./presets";
import { getPresetSources } from "./queries";

export const metadata: Metadata = { title: "Templates" };

const READINESS_LABEL: Record<Readiness["state"], string> = {
  ready: "Ready",
  limited: "Limited",
  unavailable: "Unavailable",
  unknown: "Availability unknown",
};

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  return (
    <ReportPage
      title="Templates"
      description="Starting points for common questions. Each opens a report already set up to answer it."
      pathname="/templates"
      params={params}
      dates={false}
    >
      {({ filters }) => (
        <Suspense
          key={filters.storeId}
          fallback={<LoadingState variant="grid" label="Checking which templates are ready" />}
        >
          <PresetList storeId={filters.storeId} />
        </Suspense>
      )}
    </ReportPage>
  );
}

async function PresetList({ storeId }: { storeId: string }) {
  const access = await requireViewer({ storeId });
  const [metadata, storeCount] = await Promise.all([
    getPresetSources(storeId),
    // A fixed-store deployment has one store; otherwise the request's cached list, or unknown.
    access.storeId !== null
      ? 1
      : loadStores().then(
          (stores) => stores.length,
          () => null,
        ),
  ]);
  const presets = offeredPresets(PRESETS, { routes: appConfig.nav.map((item) => item.href), storeCount });
  return (
    <div className="flex flex-col gap-8">
      {PRESET_GROUPS.map((group) => {
        const items = presets.filter((preset) => preset.group === group);
        if (!items.length) return null;
        const heading = `templates-${group.toLowerCase()}`;
        return (
          <section key={group} aria-labelledby={heading} className="flex flex-col gap-3">
            <SectionHeader id={heading} title={group} />
            <ul aria-label={`${group} templates`} className={cardGridStyles}>
              {items.map((preset) => {
                const readiness = presetReadiness(preset, metadata);
                return (
                  <li key={preset.id} className="min-w-0">
                    <Card className="h-full py-0" data-preset={preset.id} data-readiness={readiness.state}>
                      <CardContent className="flex h-full flex-col gap-2 p-4">
                        <h3 className="font-medium">
                          {/* Opening a report with no rows for this store would only show a blank page. */}
                          {readiness.state === "unavailable" ? (
                            preset.question
                          ) : (
                            <Link
                              prefetch={false}
                              href={presetHref(preset, storeId)}
                              className="underline-offset-4 hover:underline"
                            >
                              {preset.question}
                            </Link>
                          )}
                        </h3>
                        <p className="text-sm text-muted-foreground">{preset.opens}</p>
                        <p className="mt-auto text-sm">
                          <span className="font-medium">{READINESS_LABEL[readiness.state]}</span>
                          {readiness.state !== "ready" && (
                            <span className="text-muted-foreground">: {readiness.reason}</span>
                          )}
                        </p>
                      </CardContent>
                    </Card>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

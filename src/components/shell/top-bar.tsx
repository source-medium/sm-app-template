import { SidebarTrigger } from "@/components/ui/sidebar";
import type { Viewer } from "@/lib/auth/require-viewer";
import { buildId, instanceInfo, readConfig } from "@/lib/config/env.server";
import { AgentPrompt } from "./agent-prompt";
import { ModeChip } from "./mode-chip";
import { STORE_SWITCHER_SLOT } from "@/lib/store-navigation";

export function TopBar({ mode, viewer }: { mode: "sample" | "live"; viewer: Viewer }) {
  const info = instanceInfo();
  const config = readConfig();
  const probe = config.status === "ok" && config.mode === "managed" && config.hosted.authMethod === "probe";
  return (
    <header className="sticky top-0 z-20 flex min-h-14 flex-wrap items-center gap-x-2 border-b bg-background/90 px-2 py-1 backdrop-blur sm:gap-3 sm:px-4 lg:h-14 lg:flex-nowrap lg:py-0">
      <SidebarTrigger aria-label="Toggle navigation" />
      <div id={STORE_SWITCHER_SLOT} className="order-last min-w-0 basis-full lg:order-none lg:flex-1 lg:basis-auto" />
      <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">
        {viewer.kind === "access" && (
          <span className="hidden truncate text-sm text-muted-foreground sm:inline" title={viewer.email}>
            {viewer.email}
          </span>
        )}
        {!probe && viewer.kind === "sourcemedium" && (viewer.name ?? viewer.email) && (
          <span className="hidden truncate text-sm text-muted-foreground sm:inline" title={viewer.email ?? undefined}>
            {viewer.name ?? viewer.email}
          </span>
        )}
        <AgentPrompt
          mode={mode}
          build={buildId()}
          hosting={config.status === "ok" && config.mode === "managed" ? "sourcemedium" : undefined}
        />
        <ModeChip mode={mode} />
        {(probe || info.environment === "Staging") && (
          <span className="text-xs text-muted-foreground">{probe ? "Staging probe" : "Staging"}</span>
        )}
      </div>
    </header>
  );
}

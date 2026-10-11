import { SidebarTrigger } from "@/components/ui/sidebar";
import { cookies } from "next/headers";
import type { Viewer } from "@/lib/auth/require-viewer";
import { buildId } from "@/lib/config/env.server";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import { AgentPrompt } from "./agent-prompt";
import { ModeChip } from "./mode-chip";
import { ThemeControl } from "./theme-control";
import { STORE_SWITCHER_SLOT } from "@/lib/store-navigation";

export async function TopBar({ mode, viewer }: { mode: "sample" | "live"; viewer: Viewer }) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <header className="sticky top-0 z-20 flex min-h-14 flex-wrap items-center gap-x-2 border-b bg-background/90 px-2 py-1 backdrop-blur sm:h-14 sm:flex-nowrap sm:gap-3 sm:px-4 sm:py-0">
      <SidebarTrigger aria-label="Toggle navigation" />
      <div id={STORE_SWITCHER_SLOT} className="order-last min-w-0 basis-full sm:order-none sm:flex-1 sm:basis-auto" />
      <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">
        {viewer.kind === "access" && (
          <span className="hidden truncate text-sm text-muted-foreground sm:inline" title={viewer.email}>
            {viewer.email}
          </span>
        )}
        <AgentPrompt mode={mode} build={buildId()} />
        <ModeChip mode={mode} />
        <ThemeControl initialTheme={theme} />
      </div>
    </header>
  );
}

import { SidebarTrigger } from "@/components/ui/sidebar";
import { cookies } from "next/headers";
import type { Viewer } from "@/lib/auth/require-viewer";
import { buildId } from "@/lib/config/env.server";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import { AgentPrompt } from "./agent-prompt";
import { ModeChip } from "./mode-chip";
import { ThemeControl } from "./theme-control";

export async function TopBar({ mode, viewer }: { mode: "sample" | "live"; viewer: Viewer }) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/90 px-2 backdrop-blur sm:gap-3 sm:px-4">
      <SidebarTrigger aria-label="Toggle navigation" />
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

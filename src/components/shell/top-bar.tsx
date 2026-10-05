import { SidebarTrigger } from "@/components/ui/sidebar";
import type { Viewer } from "@/lib/auth/require-viewer";
import { ModeChip } from "./mode-chip";

export function TopBar({ mode, viewer }: { mode: "sample" | "live"; viewer: Viewer }) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur">
      <SidebarTrigger aria-label="Toggle navigation" />
      <div className="ml-auto flex min-w-0 items-center gap-3">
        {viewer.kind === "access" && (
          <span className="hidden truncate text-sm text-muted-foreground sm:inline" title={viewer.email}>
            {viewer.email}
          </span>
        )}
        <ModeChip mode={mode} />
      </div>
    </header>
  );
}

"use client";

import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { requestRefresh } from "@/lib/refresh";

/**
 * Re-read the current report from the warehouse without changing its URL or
 * resetting client state. The server action's response carries the re-rendered
 * page, read past the query cache (src/lib/refresh.ts).
 */
export function RefreshReport() {
  const [pending, startTransition] = useTransition();

  return (
    <div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            disabled={pending}
            aria-label="Refresh data"
            data-agent-target="Refresh data"
            data-agent-component="RefreshReport"
            aria-busy={pending}
            onClick={() =>
              startTransition(async () => {
                await requestRefresh();
              })
            }
          >
            <RefreshCw aria-hidden className={pending ? "motion-safe:animate-spin" : undefined} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{pending ? "Refreshing…" : "Refresh data"}</TooltipContent>
      </Tooltip>
      <span aria-live="polite" className="sr-only">
        {pending ? "Refreshing report data." : ""}
      </span>
    </div>
  );
}

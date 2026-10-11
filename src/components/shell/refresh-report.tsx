"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Re-read the current report without changing its URL or resetting client state. */
export function RefreshReport() {
  const router = useRouter();
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
            onClick={() => startTransition(() => router.refresh())}
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

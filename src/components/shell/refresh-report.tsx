"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Re-read the current report without changing its URL or resetting client state. */
export function RefreshReport() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        aria-label="Refresh data"
        aria-busy={pending}
        onClick={() => startTransition(() => router.refresh())}
      >
        <RefreshCw aria-hidden className={pending ? "motion-safe:animate-spin" : undefined} />
        {pending ? "Refreshing…" : "Refresh data"}
      </Button>
      <span aria-live="polite" className="sr-only">
        {pending ? "Refreshing report data." : ""}
      </span>
    </div>
  );
}

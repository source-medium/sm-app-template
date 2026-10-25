"use client";

import { useId, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useHydrated } from "@/hooks/use-hydrated";

/** Keep one mounted set of form fields, with an applied summary while collapsed. */
export function ReportControls({
  summary,
  children,
  collapseOnDesktop = false,
}: {
  summary: string;
  children: React.ReactNode;
  collapseOnDesktop?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const hydrated = useHydrated();
  return (
    <div className="flex flex-col gap-3">
      <div className={cn("flex items-start justify-between gap-3", !collapseOnDesktop && "sm:hidden")}>
        <p className="min-w-0 text-sm break-words text-muted-foreground">{summary}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={open}
          disabled={!hydrated}
          aria-controls={id}
          onClick={() => setOpen(!open)}
        >
          <SlidersHorizontal aria-hidden />
          {collapseOnDesktop ? "More filters" : "Filters"}
        </Button>
      </div>
      <div
        id={id}
        className={cn("flex flex-wrap items-start gap-4", !open && (collapseOnDesktop ? "hidden" : "max-sm:hidden"))}
      >
        {children}
      </div>
    </div>
  );
}

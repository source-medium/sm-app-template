"use client";

import { useId, useState } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useHydrated } from "@/hooks/use-hydrated";

/**
 * Every report's own filters, folded behind one button that says what is
 * applied, styled like the date button so the two read as the page's
 * controls. One mounted set of form fields, so a draft in one still travels
 * with a choice in another. `summary` lists each applied choice in words, one
 * entry per filter (empty entries are dropped); update it with the filters, or
 * the button describes a filter that no longer applies. `keepOpen` holds the
 * fields on screen when the report cannot load until one is corrected.
 */
export function ReportControls({
  summary,
  keepOpen = false,
  children,
}: {
  summary: readonly (string | null | undefined | false)[];
  keepOpen?: boolean;
  children: React.ReactNode;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const hydrated = useHydrated();
  const shown = open || keepOpen;
  const applied = summary.filter(Boolean).join(" · ");
  return (
    <div className="flex flex-col gap-3">
      <Button
        type="button"
        variant="outline"
        aria-label={`Filters: ${applied}`}
        aria-expanded={shown}
        aria-controls={id}
        data-agent-element="Filters"
        disabled={!hydrated || keepOpen}
        onClick={() => setOpen(!open)}
        className="h-auto min-h-9 w-fit max-w-full justify-start py-1.5 text-left whitespace-normal max-sm:w-full"
      >
        <SlidersHorizontal aria-hidden className="text-muted-foreground" />
        <span className="flex min-w-0 flex-wrap gap-x-2">
          <span>Filters</span>
          <span className="font-normal text-muted-foreground">{applied}</span>
        </span>
        <ChevronDown aria-hidden className={cn("ml-auto size-3.5", shown && "rotate-180")} />
      </Button>
      <div id={id} className={cn("flex flex-wrap items-start gap-4 rounded-lg border bg-card p-3", !shown && "hidden")}>
        {children}
      </div>
    </div>
  );
}

"use client";

import { useId, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Keep one mounted set of form fields, with an applied summary on phones. */
export function ReportControls({ summary, children }: { summary: string; children: React.ReactNode }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3 sm:hidden">
        <p className="min-w-0 text-sm break-words text-muted-foreground">{summary}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
        >
          <SlidersHorizontal aria-hidden />
          Filters
        </Button>
      </div>
      <div id={id} className={cn("flex flex-wrap items-start gap-4", !open && "max-sm:hidden")}>
        {children}
      </div>
    </div>
  );
}

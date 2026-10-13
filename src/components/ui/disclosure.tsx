import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A native details/summary with one look: a chevron that turns when open, a
 * medium-weight summary with a pointer and a touch-sized target, and no
 * browser marker. Pass `open`/`onToggle` to control it; the body gets one
 * consistent gap below the summary.
 */
export function Disclosure({
  summary,
  className,
  children,
  ...props
}: React.ComponentProps<"details"> & { summary: React.ReactNode }) {
  return (
    <details className={cn("group/disclosure", className)} {...props}>
      <summary className="flex min-h-9 w-fit cursor-pointer list-none items-center gap-1.5 rounded-sm text-sm font-medium text-foreground transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden">
        <ChevronRight
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open/disclosure:rotate-90"
        />
        {summary}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

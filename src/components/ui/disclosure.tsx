import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A native details/summary with one look: a chevron that turns when open, a
 * summary with a pointer and a touch-sized target, and no browser marker.
 * `content` folds part of the report (More metrics); `note` is an explanation
 * that ends the section it explains (About these numbers), quieter so the two
 * never read as the same kind of thing. Pass `open`/`onToggle` to control it;
 * the body gets one consistent gap below the summary.
 */
export function Disclosure({
  summary,
  variant = "content",
  className,
  children,
  ...props
}: React.ComponentProps<"details"> & { summary: React.ReactNode; variant?: "content" | "note" }) {
  const note = variant === "note";
  return (
    <details className={cn("group/disclosure", note && "text-sm text-muted-foreground", className)} {...props}>
      <summary
        className={cn(
          "flex min-h-9 w-fit min-w-9 cursor-pointer list-none items-center gap-1.5 rounded-sm text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden",
          note ? "text-muted-foreground hover:text-foreground" : "font-medium text-foreground hover:text-primary",
        )}
      >
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

/**
 * Always visible. The worst outcome is someone presenting synthetic numbers
 * as real, so the sample chip is loud and the live chip is calm.
 */
import { CircleCheck, FlaskConical } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function ModeChip({ mode }: { mode: "sample" | "live" }) {
  const sample = mode === "sample";
  return (
    <Link
      href="/connection"
      title="Connection details and diagnostics"
      data-testid="mode-chip"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring pointer-coarse:min-h-11",
        sample ? "border-warning/50 bg-warning-soft text-warning" : "border-success/40 bg-success-soft text-success",
      )}
    >
      {sample ? <FlaskConical className="size-3.5" aria-hidden /> : <CircleCheck className="size-3.5" aria-hidden />}
      {sample ? "Sample data" : "Live data"}
    </Link>
  );
}

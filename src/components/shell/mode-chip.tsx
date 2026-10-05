/**
 * Always visible. The worst outcome is someone presenting synthetic numbers
 * as real, so the sample chip is loud and the live chip is calm.
 */
import { CircleCheck, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";

export function ModeChip({ mode }: { mode: "sample" | "live" }) {
  const sample = mode === "sample";
  return (
    <span
      data-testid="mode-chip"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold",
        sample ? "border-warning/50 bg-warning-soft text-warning" : "border-success/40 bg-success-soft text-success",
      )}
    >
      {sample ? <FlaskConical className="size-3.5" aria-hidden /> : <CircleCheck className="size-3.5" aria-hidden />}
      {sample ? "Sample data" : "Live data"}
    </span>
  );
}

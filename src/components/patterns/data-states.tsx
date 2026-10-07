/**
 * The four states every data region renders, shipped as one contract:
 * loading, empty, error (with the doctor's remedy), and incompatible schema
 * (naming the relation and column). Use DataRegion to get all four.
 */
import { AlertTriangle, FileWarning, Inbox } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cardGridStyles } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function LoadingState({ variant, label }: { variant: "kpis" | "chart" | "table" | "grid"; label: string }) {
  return (
    <div role="status" aria-live="polite" aria-label={label} className="flex flex-col gap-4">
      {variant === "kpis" && (
        <div className={cardGridStyles}>
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <Skeleton key={index} className="h-28 rounded-lg" />
          ))}
        </div>
      )}
      {variant === "chart" && <Skeleton className="h-72 rounded-lg" />}
      {variant === "table" && (
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <Skeleton key={index} className="h-10 rounded-md" />
          ))}
        </div>
      )}
      {variant === "grid" && (
        <div className={cardGridStyles}>
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <Skeleton key={index} className="h-64 rounded-lg" />
          ))}
        </div>
      )}
      <span className="sr-only">{label}</span>
    </div>
  );
}

function StateFrame({
  icon,
  title,
  children,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  children?: React.ReactNode;
  tone: "neutral" | "error";
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-2 rounded-lg border p-6 text-sm",
        tone === "error" ? "border-destructive/40 bg-destructive/5" : "border-dashed bg-card",
      )}
    >
      <div className="flex items-center gap-2 font-medium">
        {icon}
        <span>{title}</span>
      </div>
      {children && <div className="max-w-prose text-muted-foreground">{children}</div>}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <StateFrame icon={<Inbox className="size-4" aria-hidden />} title="No data" tone="neutral">
      {message}
    </StateFrame>
  );
}

export function ErrorState({ title, remedy, detail }: { title: string; remedy: string; detail?: string | null }) {
  return (
    <div role="alert" data-slot="data-error">
      <StateFrame icon={<AlertTriangle className="size-4 text-destructive" aria-hidden />} title={title} tone="error">
        <p>{remedy}</p>
        {detail && (
          <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 text-xs whitespace-pre-wrap">{detail}</pre>
        )}
      </StateFrame>
    </div>
  );
}

export function IncompatibleState({ relation, column }: { relation: string; column: string }) {
  return (
    <div role="alert" data-slot="data-error">
      <StateFrame
        icon={<FileWarning className="size-4 text-destructive" aria-hidden />}
        title="The data no longer matches this view"
        tone="error"
      >
        <p>
          Column <code className="font-mono">{column}</code> in <code className="font-mono">{relation}</code> is missing
          or has a different type. Inspect it with <code className="font-mono">pnpm schema {relation}</code> and update
          the view&apos;s row schema.
        </p>
      </StateFrame>
    </div>
  );
}

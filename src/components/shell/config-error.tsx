/**
 * Shown instead of the app when configuration is invalid. Lists each
 * problem as one sentence naming the variable and the fix; never a value.
 * No query runs and no sample data is shown in its place.
 */
import { AlertTriangle } from "lucide-react";
import { instanceInfo, type ConfigProblem } from "@/lib/config/env.server";
import { SupportCode } from "@/components/patterns/data-states";

export function ConfigErrorScreen({ problems }: { problems: ConfigProblem[] }) {
  const info = instanceInfo();
  return (
    <main className="mx-auto flex min-h-svh max-w-2xl flex-col justify-center gap-6 p-6">
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-5 text-destructive" aria-hidden />
        <h1 className="text-xl font-semibold">This app&apos;s configuration needs attention</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Instance: {info.environment}. Build: <code>{info.build}</code>. Update this instance's settings, save and
        deploy.
      </p>
      <ul className="flex list-disc flex-col gap-2 pl-5 text-sm">
        {problems.map((problem) => (
          <li key={`${problem.variable}:${problem.message}`}>{problem.message}</li>
        ))}
      </ul>
      <p className="text-sm text-muted-foreground">
        Locally, run <code className="font-mono">pnpm diagnose</code>. On your host, update the runtime variables and
        redeploy. See <code className="font-mono">docs/connect.md</code>.
      </p>
    </main>
  );
}

/**
 * Shown instead of an app SourceMedium manages when the data API refuses or
 * cannot answer the request that loads the app's data context: the app was
 * paused or removed, the viewer's access changed, or SourceMedium is
 * unavailable. The title and remedy are the managed adapter's fixed copy,
 * never provider text. No sample data is shown in its place.
 */
export function DataAccessErrorScreen({
  title,
  remedy,
  requestId,
}: {
  title: string;
  remedy: string;
  requestId?: string | null;
}) {
  return (
    <main className="mx-auto flex min-h-svh max-w-2xl flex-col justify-center gap-4 p-6">
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-5 text-destructive" aria-hidden />
        <h1 className="text-xl font-semibold">{title}</h1>
      </div>
      <p className="text-sm text-muted-foreground">{remedy}</p>
      <SupportCode requestId={requestId} />
    </main>
  );
}

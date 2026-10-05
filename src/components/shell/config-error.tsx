/**
 * Shown instead of the app when configuration is invalid. Lists each
 * problem as one sentence naming the variable and the fix; never a value.
 * No query runs and no sample data is shown in its place.
 */
import { AlertTriangle } from "lucide-react";
import type { ConfigProblem } from "@/lib/config/env.server";

export function ConfigErrorScreen({ problems }: { problems: ConfigProblem[] }) {
  return (
    <main className="mx-auto flex min-h-svh max-w-2xl flex-col justify-center gap-6 p-6">
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-5 text-destructive" aria-hidden />
        <h1 className="text-xl font-semibold">This app&apos;s configuration needs attention</h1>
      </div>
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

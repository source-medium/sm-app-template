"use client";

/**
 * The backstop for anything a data region did not handle, so a thrown error
 * never leaves a blank page. Server error details are redacted in
 * production; the digest matches the server log line.
 */
import { ErrorState } from "@/components/patterns/data-states";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const denied = error.name === "ViewerDeniedError";
  return (
    <div className="flex flex-col items-start gap-4">
      <ErrorState
        title={denied ? "Sign in required" : "This page could not load"}
        remedy={
          denied
            ? "Reload the page and sign in to view this app."
            : `Reload the page; if it keeps failing, run \`pnpm diagnose\`.${error.digest ? ` Reference: ${error.digest}.` : ""}`
        }
      />
      <Button variant="outline" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}

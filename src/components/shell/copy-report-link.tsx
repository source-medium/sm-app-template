"use client";

import { useEffect, useState } from "react";
import { Check, Link as LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** href already contains the applied store and dates, including defaults. */
export function CopyReportLink({ href }: { href: string }) {
  const [state, setState] = useState<"idle" | "copying" | "copied" | "failed">("idle");
  const [manualLink, setManualLink] = useState("");

  useEffect(() => {
    if (state !== "copied") return;
    const timer = window.setTimeout(() => setState("idle"), 2000);
    return () => window.clearTimeout(timer);
  }, [state]);

  async function copyLink() {
    const link = new URL(href, window.location.origin).href;
    setState("copying");
    try {
      await navigator.clipboard.writeText(link);
      setState("copied");
    } catch {
      setManualLink(link);
      setState("failed");
    }
  }

  return (
    <div className="flex max-w-full flex-col items-start gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void copyLink()}
        disabled={state === "copying"}
        aria-label="Copy report link"
      >
        {state === "copied" ? <Check aria-hidden /> : <LinkIcon aria-hidden />}
        {state === "copied" ? "Copied" : state === "copying" ? "Copying…" : "Copy link"}
      </Button>
      <span aria-live="polite" className={state === "failed" ? "text-xs text-muted-foreground" : "sr-only"}>
        {state === "copied"
          ? "Report link copied."
          : state === "failed"
            ? "Could not copy. Select and copy the link below."
            : ""}
      </span>
      {state === "failed" && (
        <input
          aria-label="Report link"
          readOnly
          value={manualLink}
          onFocus={(event) => event.currentTarget.select()}
          className="h-9 w-64 max-w-full rounded-md border border-input bg-background px-2 text-sm"
        />
      )}
    </div>
  );
}

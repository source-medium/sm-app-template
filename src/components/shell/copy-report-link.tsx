"use client";

import { useState } from "react";
import { Check, Link as LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCopy } from "@/lib/use-copy";

/** href already contains the applied store and dates, including defaults. */
export function CopyReportLink({ href }: { href: string }) {
  const { state, copy } = useCopy();
  const [manualLink, setManualLink] = useState("");

  async function copyLink() {
    const link = new URL(href, window.location.origin).href;
    setManualLink(link);
    await copy(link);
  }

  return (
    <div className="flex max-w-full flex-col items-start gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => void copyLink()}
            disabled={state === "copying"}
            aria-label="Copy report link"
            data-agent-target="Copy report link"
            data-agent-component="CopyReportLink"
            className={state === "copied" ? "border-success/40 bg-success-soft text-success" : undefined}
          >
            {state === "copied" ? (
              <Check aria-hidden className="motion-safe:animate-in motion-safe:duration-150 motion-safe:zoom-in-75" />
            ) : (
              <LinkIcon aria-hidden />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {state === "copied" ? "Link copied" : state === "copying" ? "Copying…" : "Copy report link"}
        </TooltipContent>
      </Tooltip>
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

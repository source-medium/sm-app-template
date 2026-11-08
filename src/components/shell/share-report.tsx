"use client";

import { useId, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useHydrated } from "@/hooks/use-hydrated";
import { readSavedReports, writeSavedReports } from "@/hooks/use-saved-reports";
import { resolveReportLink } from "@/lib/report-link";
import { useCopy } from "@/lib/use-copy";

/**
 * Keep or pass on what is on screen: copy a link that pins the applied dates,
 * or save the view in this browser, where the sidebar lists it. Neither stores
 * report data. `saveHref` keeps rolling presets rolling; it is absent while the
 * report cannot load, since a broken view is not worth saving.
 */
export function ShareReport({
  shareHref,
  saveHref,
  clientPresentationParams = [],
}: {
  shareHref: string;
  saveHref?: string;
  clientPresentationParams?: readonly string[];
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [manualLink, setManualLink] = useState("");
  const { state, copy } = useCopy();
  const hydrated = useHydrated();
  const id = useId();

  async function copyLink() {
    const link = resolveReportLink(shareHref, clientPresentationParams).href;
    setManualLink(link);
    await copy(link);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setMessage("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!hydrated}
          data-agent-target="Share"
          data-agent-component="ShareReport"
        >
          Share
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        role="dialog"
        aria-label="Share this view"
        className="flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-3 p-4"
      >
        <div>
          <h2 className="font-medium">Share this view</h2>
          <p className="mt-1 text-xs text-muted-foreground">The link opens these exact dates and filters.</p>
        </div>
        <Button type="button" variant="secondary" onClick={() => void copyLink()} disabled={state === "copying"}>
          {state === "copied" && <Check aria-hidden />}
          {state === "copied" ? "Link copied" : "Copy link"}
        </Button>
        <span aria-live="polite" className={state === "failed" ? "text-xs text-muted-foreground" : "sr-only"}>
          {state === "copied"
            ? "Report link copied."
            : state === "failed"
              ? "Could not copy. Select and copy the link below."
              : ""}
        </span>
        {state === "failed" && (
          <Input
            aria-label="Report link"
            readOnly
            value={manualLink}
            onFocus={(event) => event.currentTarget.select()}
          />
        )}
        {saveHref && (
          <form
            aria-label="Save this view"
            className="flex flex-col gap-2 border-t pt-3"
            onSubmit={(event) => {
              event.preventDefault();
              const label = name.trim();
              if (!label) return setMessage("Enter a name for this view.");
              const current = readSavedReports();
              if (current.some((report) => report.name.toLowerCase() === label.toLowerCase()))
                return setMessage("A view with this name already exists. Choose another name.");
              const url = resolveReportLink(saveHref, clientPresentationParams);
              if (
                !writeSavedReports([
                  ...current,
                  { id: crypto.randomUUID(), name: label, href: `${url.pathname}${url.search}` },
                ])
              )
                return setMessage("Could not save. Browser storage may be unavailable or full.");
              setName("");
              setMessage("Saved. Find it under Saved views in the sidebar.");
            }}
          >
            <label htmlFor={id} className="text-xs font-medium">
              Save in this browser as
            </label>
            <div className="flex gap-2">
              <Input
                id={id}
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={80}
                placeholder="Weekly sales"
              />
              <Button type="submit" variant="outline">
                Save
              </Button>
            </div>
            <p role="status" className="text-xs text-muted-foreground">
              {message}
            </p>
          </form>
        )}
      </PopoverContent>
    </Popover>
  );
}

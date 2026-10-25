"use client";

import Link from "next/link";
import { useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Bookmark, Trash2 } from "lucide-react";
import { appConfig } from "@/app.config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { parseSavedReports, SAVED_REPORTS_KEY, type SavedReport } from "@/lib/saved-reports";
import { resolveReportLink } from "@/lib/report-link";
import { useHydrated } from "@/hooks/use-hydrated";

const CHANGED = "sm-saved-reports-changed";
const paths = appConfig.nav.map((item) => item.href);
function subscribe(update: () => void) {
  window.addEventListener("storage", update);
  window.addEventListener(CHANGED, update);
  return () => {
    window.removeEventListener("storage", update);
    window.removeEventListener(CHANGED, update);
  };
}
function snapshot() {
  try {
    return window.localStorage.getItem(SAVED_REPORTS_KEY);
  } catch {
    return null;
  }
}
const serverSnapshot = () => null;

/** Browser bookmarks of applied URL state. No server writes or stored warehouse results. */
export function SavedReports({
  href,
  clientPresentationParams,
}: {
  href: string;
  clientPresentationParams: readonly string[];
}) {
  const raw = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const reports = useMemo(() => parseSavedReports(raw, paths), [raw]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const id = useId();
  const nameInput = useRef<HTMLInputElement>(null);
  const hydrated = useHydrated();
  const write = (next: SavedReport[]) => {
    try {
      window.localStorage.setItem(SAVED_REPORTS_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event(CHANGED));
      return true;
    } catch {
      setMessage("Could not save changes. Browser storage may be unavailable or full.");
      return false;
    }
  };
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
          variant="outline"
          size="icon-sm"
          className="sm:w-auto sm:px-3"
          aria-label="Saved views"
          title="Saved views"
          disabled={!hydrated}
        >
          <Bookmark aria-hidden />
          <span className="hidden sm:inline">Saved views</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        role="dialog"
        aria-label="Saved report views"
        className="w-80 max-w-[calc(100vw-2rem)] p-4"
      >
        <h2 className="font-medium">Saved views</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Saved only in this browser. Includes filters, not report data.
        </p>
        {reports.length ? (
          <ul aria-label="Saved views" className="mt-3 max-h-64 overflow-y-auto">
            {reports.map((report) => (
              <li key={report.id} className="flex min-w-0 items-center gap-2 border-b py-2 last:border-0">
                <Link
                  href={report.href}
                  prefetch={false}
                  onClick={() => setOpen(false)}
                  className="min-w-0 flex-1 rounded-sm text-sm font-medium wrap-anywhere text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {report.name}
                  <span className="block text-xs font-normal text-muted-foreground">
                    {
                      appConfig.nav.find((item) => item.href === new URL(report.href, "https://saved.invalid").pathname)
                        ?.label
                    }
                  </span>
                </Link>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${report.name}`}
                  onClick={() => {
                    // Re-read at the mutation boundary so another tab's saved views are preserved.
                    if (write(parseSavedReports(snapshot(), paths).filter((item) => item.id !== report.id))) {
                      setMessage("View removed.");
                      nameInput.current?.focus();
                    }
                  }}
                >
                  <Trash2 aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">No saved views yet.</p>
        )}
        <form
          aria-label="Save current report view"
          className="mt-4 flex flex-col gap-2 border-t pt-3"
          onSubmit={(event) => {
            event.preventDefault();
            const label = name.trim();
            if (!label) return setMessage("Enter a name for this view.");
            const current = parseSavedReports(snapshot(), paths);
            if (current.some((report) => report.name.toLowerCase() === label.toLowerCase()))
              return setMessage("A view with this name already exists. Choose another name.");
            const url = resolveReportLink(href, clientPresentationParams);
            if (write([...current, { id: crypto.randomUUID(), name: label, href: `${url.pathname}${url.search}` }])) {
              setName("");
              setMessage("View saved.");
            }
          }}
        >
          <label htmlFor={id} className="text-xs font-medium">
            View name
          </label>
          <Input
            ref={nameInput}
            id={id}
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={80}
            placeholder="For example, Weekly sales"
          />
          <Button type="submit" variant="secondary">
            Save current view
          </Button>
        </form>
        <p role="status" className="mt-2 text-xs text-muted-foreground">
          {message}
        </p>
      </PopoverContent>
    </Popover>
  );
}

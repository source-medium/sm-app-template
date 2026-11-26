"use client";

/**
 * How a report's controls change its URL. A control changes only its own keys
 * (`navigate`) over the applied report, so a draft in another field (typed
 * dates, unapplied channel checkboxes) never travels with it and never blocks
 * it. Links and form submissions built from the applied URL go through `go`,
 * which keeps any choice still on its way. Everything shares one transition, so
 * the report says it is updating whichever control started the change.
 *
 * Next.js writes the URL when the new page commits and drops a navigation a
 * newer one replaced, so the URL, Share and downloads always describe the data
 * on screen. Nothing here stores report data.
 */
import { createContext, useContext, useEffect, useRef, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { REPORT_FILTER_FORM_ID } from "@/lib/filters";
import { cn } from "@/lib/utils";

/** URL keys to set (an empty string included) or remove (null). */
export type ReportPatch = Readonly<Record<string, string | null>>;

/**
 * Row positions and open rows belong to the results they came from. Any change
 * clears them unless it sets them, as the report form always has (it has no
 * field for them).
 */
export const ROW_STATE_PARAMS = ["cursor", "order", "evidence", "page"] as const;

type ReportNavigation = {
  /** A navigation this report started has not committed yet. */
  pending: boolean;
  navigate: (patch: ReportPatch) => void;
  go: (href: string) => void;
};

const outsideReport = () => {
  throw new Error("Render report controls inside ReportNavigationProvider (ReportPage does).");
};
/** Outside a report (a component rendered on its own) nothing is pending, and a change has nowhere to go. */
const NavigationContext = createContext<ReportNavigation>({
  pending: false,
  navigate: outsideReport,
  go: outsideReport,
});

/** The keys whose values differ between two queries: a value to set, or null to remove. */
export function changedParams(next: URLSearchParams, base: URLSearchParams): Record<string, string | null> {
  const patch: Record<string, string | null> = {};
  for (const key of new Set([...next.keys(), ...base.keys()])) {
    const value = next.get(key);
    if (value !== base.get(key)) patch[key] = value;
  }
  return patch;
}

/**
 * The report as applied: the URL, then the report form's hidden fields, which
 * name what the page applied without the URL naming it (the store it chose, the
 * measure a chart shows), as an explicit Apply submits them. A hidden field
 * that carries a draft for Apply says so with `data-draft` and is left out.
 */
function appliedParams(url: URLSearchParams): URLSearchParams {
  const applied = new URLSearchParams(url);
  const form = document.getElementById(REPORT_FILTER_FORM_ID);
  if (!(form instanceof HTMLFormElement)) return applied;
  for (const field of form.elements) {
    if (field instanceof HTMLInputElement && field.type === "hidden" && field.name && !field.disabled)
      if (field.dataset.draft === undefined) applied.set(field.name, field.value);
  }
  return applied;
}

export function patchedParams(base: URLSearchParams, patch: ReportPatch): URLSearchParams {
  const next = new URLSearchParams(base);
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) next.delete(key);
    else next.set(key, value);
  }
  return next;
}

export function ReportNavigationProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  // Changes since the URL last committed, so a second choice builds on the first instead of undoing it.
  const queued = useRef<Record<string, string | null>>({});
  useEffect(() => {
    if (!pending) queued.current = {};
  }, [pending]);

  /** `patch` over `base`, keeping choices still on their way. */
  function change(base: URLSearchParams, patch: ReportPatch) {
    const applied = new URLSearchParams(searchParams.toString());
    const rows = Object.fromEntries(ROW_STATE_PARAMS.map((key) => [key, null]));
    const next = patchedParams(base, { ...rows, ...queued.current, ...patch });
    queued.current = changedParams(next, applied);
    const unchanged = Object.keys(queued.current).length === 0;
    // Choosing the applied value again needs no request, unless it replaces one on its way.
    if (unchanged && !pending) return;
    const query = next.toString();
    const href = query ? `${pathname}?${query}` : pathname;
    startTransition(() => (unchanged ? router.replace(href, { scroll: false }) : router.push(href, { scroll: false })));
  }

  // A control changes its own keys over the report as applied.
  function navigate(patch: ReportPatch) {
    change(appliedParams(new URLSearchParams(searchParams.toString())), patch);
  }

  function go(href: string) {
    const url = new URL(href, window.location.origin);
    if (url.pathname !== pathname) {
      queued.current = {};
      startTransition(() => router.push(`${url.pathname}${url.search}`, { scroll: false }));
      return;
    }
    // A link goes where it says, with choices still on their way.
    const current = new URLSearchParams(searchParams.toString());
    change(current, changedParams(url.searchParams, current));
  }

  return <NavigationContext.Provider value={{ pending, navigate, go }}>{children}</NavigationContext.Provider>;
}

export function useReportNavigation(): ReportNavigation {
  return useContext(NavigationContext);
}

/** The report below its controls: marked busy, and visibly held back, until the change it waits for commits. */
export function ReportBusy({ children }: { children: React.ReactNode }) {
  const { pending } = useReportNavigation();
  return (
    <div
      aria-busy={pending || undefined}
      data-pending={pending || undefined}
      className={cn("flex flex-col gap-4 motion-safe:transition-opacity", pending && "opacity-60")}
    >
      {children}
    </div>
  );
}

/** Says, once and on screen, that the report is loading the viewer's change; nothing while it is not. */
export function ReportPendingStatus() {
  const { pending } = useReportNavigation();
  if (!pending) return null;
  return (
    <span role="status" className="flex min-h-8 items-center gap-1.5 px-1 text-xs text-muted-foreground">
      <LoaderCircle aria-hidden className="size-3.5 motion-safe:animate-spin" />
      Updating…
    </span>
  );
}

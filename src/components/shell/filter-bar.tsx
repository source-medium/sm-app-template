"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { COMPARISON_OPTIONS, type ComparisonMode } from "@/lib/comparison";
import { dateRangeIssue, REPORT_FILTER_FORM_ID } from "@/lib/filters";
import { useReportNavigation } from "./report-navigation";
import { useHydrated } from "@/hooks/use-hydrated";

/** `quick` presets sit beside the date button with the active one; the rest open with it. */
export type FilterPreset = { label: string; href: string; active: boolean; quick?: boolean };

/**
 * One GET form holds every report control, including streamed fields associated
 * by form id. A select applies only its own choice (report-navigation.tsx); an
 * explicit Apply submits the form, so the choices typed into it travel together.
 */
export function FilterBar({
  pathname,
  storeId,
  from,
  to,
  rolling = false,
  preset,
  maxDate,
  maxDays,
  presets,
  dates = true,
  comparison,
  comparison2,
  comparison2Default,
  comparisonLabel = "Compare with",
  carriedComparison,
  carriedComparison2,
  rangeLabel,
  defaultOpen = false,
}: {
  pathname: string;
  storeId: string;
  /** Absent when the store's date is unknown; the date controls are then hidden. */
  from?: string;
  to?: string;
  /** The applied dates roll with today (a preset, or the default) rather than being fixed. */
  rolling?: boolean;
  /** The `range` preset the URL keeps, rolling or with its fixed dates. */
  preset?: string;
  maxDate?: string;
  maxDays?: number;
  presets: FilterPreset[];
  dates?: boolean;
  /** The first and second comparison slots' modes; absent on a report without comparisons. */
  comparison?: ComparisonMode;
  comparison2?: ComparisonMode;
  /** The second slot's default for the applied range; a submit that keeps it leaves `compare2` out, so new dates get their own default. */
  comparison2Default?: ComparisonMode;
  comparisonLabel?: string;
  /** Another report's comparison choices, carried through a report that has none. */
  carriedComparison?: string;
  carriedComparison2?: string;
  /** The applied range as text; the date fields stay folded behind it until someone wants to change them. */
  rangeLabel?: string;
  /** Start unfolded, so a suggested range that still needs applying is on screen. */
  defaultOpen?: boolean;
}) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const [datesOpen, setDatesOpen] = useState(defaultOpen);
  const hydrated = useHydrated();
  const { pending, navigate, go } = useReportNavigation();
  // The From field takes focus once it is in the layout: after the dates unfold, or after an invalid submit.
  const focusFrom = useRef(false);
  useEffect(() => {
    if (!focusFrom.current) return;
    focusFrom.current = false;
    document.getElementById(`${id}-from`)?.focus();
  });
  // Keep the form for controls rendered by the report, even when it has no visible fields of its own.
  const hasControls = dates || comparison !== undefined;
  // Choices apply on change; typed dates wait for Apply. A second comparison left at its default is not a choice.
  const applyComparison = (event: React.ChangeEvent<HTMLSelectElement>) =>
    navigate({ compare: event.currentTarget.value });
  const applyComparison2 = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.currentTarget.value;
    navigate({ compare2: value === comparison2Default ? null : value });
  };
  const optionLabel = (mode: ComparisonMode) => COMPARISON_OPTIONS.find((option) => option.value === mode)?.label ?? "";
  // Reads as a continuation of the dates: "Oct 10 – Nov 6, 2026 vs previous period and same period last year".
  const comparisonSummary =
    comparison === undefined
      ? null
      : comparison === "off"
        ? "No comparison"
        : `vs ${[comparison, ...(comparison2 !== undefined && comparison2 !== "off" ? [comparison2] : [])]
            .map((mode) => optionLabel(mode).toLowerCase())
            .join(" and ")}`;
  const presetLink = (preset: FilterPreset) => (
    <Link
      prefetch={false}
      key={preset.label}
      data-agent-element={preset.label}
      href={preset.href}
      aria-current={preset.active ? "true" : undefined}
      onClick={(event) => {
        // A plain click keeps choices still on their way; a modified click opens the link as usual.
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        go(preset.href);
      }}
      className={cn(
        "flex min-h-9 items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring pointer-coarse:min-h-11",
        preset.active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted",
      )}
    >
      {preset.label}
    </Link>
  );
  return (
    <form
      id={REPORT_FILTER_FORM_ID}
      action={pathname}
      aria-label="Report filters"
      data-agent-target="Report filters"
      data-agent-component="FilterBar"
      className={hasControls ? "flex flex-col gap-3" : "hidden"}
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form, event.nativeEvent.submitter);
        if (dates && maxDate !== undefined) {
          const issue =
            data.has("from") || data.has("to")
              ? dateRangeIssue(
                  { from: String(data.get("from") ?? ""), to: String(data.get("to") ?? "") },
                  maxDate,
                  maxDays,
                )
              : null;
          setError(issue);
          if (issue) {
            setDatesOpen(true);
            focusFrom.current = true;
            return;
          }
        }
        // Edited dates are custom, so they drop the preset; unedited rolling dates submit as only their preset
        // (nothing, for the default), so other choices and bookmarks keep rolling. Before scripts load, the form
        // submits its dates as typed, so an early edit is never lost.
        if (dates) {
          if (data.get("from") !== (from ?? null) || data.get("to") !== (to ?? null)) data.delete("range");
          else if (rolling) {
            data.delete("from");
            data.delete("to");
          }
        }
        // A second comparison left at its default is not a choice: drop it, so Yesterday gets the same weekday last year.
        if (comparison2Default && data.get("compare2") === comparison2Default) data.delete("compare2");
        // The query a native GET submission would send, applied without leaving the page.
        const query = new URLSearchParams();
        for (const [key, value] of data) if (typeof value === "string") query.append(key, value);
        const search = query.toString();
        go(search ? `${pathname}?${search}` : pathname);
      }}
    >
      {comparison === undefined && carriedComparison && (
        <input type="hidden" name="compare" value={carriedComparison} />
      )}
      {comparison === undefined && carriedComparison2 && (
        <input type="hidden" name="compare2" value={carriedComparison2} />
      )}
      <input type="hidden" name="store" value={storeId} />
      {preset && <input type="hidden" name="range" value={preset} />}
      {dates && rangeLabel && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button
            type="button"
            variant="outline"
            aria-label={[`Change dates, ${rangeLabel}`, comparisonSummary].filter(Boolean).join(" ")}
            aria-expanded={datesOpen}
            aria-controls={`${id}-dates`}
            data-agent-element="Change dates"
            // A click before hydration would be lost; presets are plain links and work at once.
            disabled={!hydrated}
            onClick={() => {
              if (!datesOpen) focusFrom.current = true;
              setDatesOpen(!datesOpen);
            }}
            className="h-auto min-h-9 max-w-full justify-start py-1.5 text-left whitespace-normal max-sm:w-full"
          >
            <CalendarDays aria-hidden className="text-muted-foreground" />
            <span className="flex min-w-0 flex-wrap gap-x-2">
              <span>{rangeLabel}</span>
              {/* On a phone the comparison switch below says this, so the trigger keeps to one line of dates. */}
              {comparisonSummary && (
                <>
                  {" "}
                  <span className="font-normal text-balance text-muted-foreground max-sm:hidden">
                    {comparisonSummary}
                  </span>
                </>
              )}
            </span>
            <ChevronDown aria-hidden className={cn("ml-auto size-3.5", datesOpen && "rotate-180")} />
          </Button>
          {presets.length > 0 && (
            <nav aria-label="Date presets" className="flex flex-wrap items-center gap-1">
              {presets.filter((preset) => preset.quick || preset.active).map(presetLink)}
            </nav>
          )}
        </div>
      )}
      {dates ? (
        <div
          id={`${id}-dates`}
          hidden={Boolean(rangeLabel) && !datesOpen}
          className="flex flex-col gap-3 rounded-lg border bg-card p-3"
        >
          {presets.length > 0 && (
            <nav aria-label="More date presets" className="flex flex-wrap items-center gap-1">
              {presets.filter((preset) => !preset.quick && !preset.active).map(presetLink)}
            </nav>
          )}
          <div className="grid grid-cols-1 items-end gap-3 min-[24rem]:grid-cols-2 sm:flex sm:flex-wrap">
            <div className="flex min-w-0 flex-col gap-1.5 sm:w-36">
              <label htmlFor={`${id}-from`} className="text-xs font-medium text-muted-foreground">
                From
              </label>
              <Input
                data-agent-element="From"
                id={`${id}-from`}
                type="date"
                name="from"
                defaultValue={from}
                max={maxDate}
                min="0001-01-01"
                required
                aria-invalid={Boolean(error)}
                aria-describedby={error ? `${id}-error` : undefined}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5 sm:w-36">
              <label htmlFor={`${id}-to`} className="text-xs font-medium text-muted-foreground">
                To
              </label>
              <Input
                data-agent-element="To"
                id={`${id}-to`}
                type="date"
                name="to"
                defaultValue={to}
                max={maxDate}
                min="0001-01-01"
                required
                aria-invalid={Boolean(error)}
                aria-describedby={error ? `${id}-error` : undefined}
              />
            </div>
            <Button data-agent-element="Apply" type="submit" className="col-span-full sm:col-auto">
              {pending ? "Updating…" : "Apply"}
            </Button>
            {comparison !== undefined && (
              <div className="flex min-w-0 flex-col gap-1.5 sm:w-48">
                <label htmlFor={`${id}-compare`} className="text-xs font-medium text-muted-foreground">
                  {comparisonLabel}
                </label>
                <NativeSelect
                  data-agent-element="Compare with"
                  id={`${id}-compare`}
                  name="compare"
                  defaultValue={comparison}
                  onChange={applyComparison}
                >
                  {COMPARISON_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            )}
            {comparison2 !== undefined && (
              <div className="flex min-w-0 flex-col gap-1.5 sm:w-48">
                <label htmlFor={`${id}-compare2`} className="text-xs font-medium text-muted-foreground">
                  Second comparison
                </label>
                <NativeSelect
                  data-agent-element="Second comparison"
                  id={`${id}-compare2`}
                  name="compare2"
                  defaultValue={comparison2}
                  disabled={comparison === "off"}
                  onChange={applyComparison2}
                >
                  {COMPARISON_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            )}
          </div>
          {error && (
            <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      ) : (
        !rolling &&
        from !== undefined &&
        to !== undefined && (
          <>
            <input type="hidden" name="from" value={from} />
            <input type="hidden" name="to" value={to} />
          </>
        )
      )}
    </form>
  );
}

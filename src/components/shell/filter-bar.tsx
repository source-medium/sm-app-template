"use client";

import Form from "next/form";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { COMPARISON_OPTIONS, type ComparisonMode } from "@/lib/comparison";
import { dateRangeIssue, REPORT_FILTER_FORM_ID } from "@/lib/filters";
import { LinkPending, SubmitAnnouncement, SubmitPending } from "./pending";
import { useHydrated } from "@/hooks/use-hydrated";

/** `quick` presets sit beside the date button with the active one; the rest open with it. */
export type FilterPreset = { label: string; href: string; active: boolean; quick?: boolean };

/** One GET form owns every report control, including streamed fields associated by form id. */
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
  const formRef = useRef<HTMLFormElement>(null);
  // The From field takes focus once it is in the layout: after the dates unfold, or after an invalid submit.
  const focusFrom = useRef(false);
  useEffect(() => {
    if (!focusFrom.current) return;
    focusFrom.current = false;
    document.getElementById(`${id}-from`)?.focus();
  });
  // Edited dates are custom, so they drop the preset; unedited rolling dates submit as only their preset
  // (nothing, for the default), so other choices and bookmarks keep rolling. Before scripts load, the form
  // submits its dates as typed, so an early edit is never lost.
  useEffect(() => {
    const form = formRef.current;
    if (!form || !dates) return;
    const keepPreset = ({ formData }: FormDataEvent) => {
      if (formData.get("from") !== (from ?? null) || formData.get("to") !== (to ?? null)) formData.delete("range");
      else if (rolling) {
        formData.delete("from");
        formData.delete("to");
      }
    };
    form.addEventListener("formdata", keepPreset);
    return () => form.removeEventListener("formdata", keepPreset);
  }, [dates, rolling, from, to]);
  // A second comparison left at its default is not a choice: drop it, so Yesterday gets the same weekday last year.
  useEffect(() => {
    const form = formRef.current;
    if (!form || !comparison2Default) return;
    const keepDefault = ({ formData }: FormDataEvent) => {
      if (formData.get("compare2") === comparison2Default) formData.delete("compare2");
    };
    form.addEventListener("formdata", keepDefault);
    return () => form.removeEventListener("formdata", keepDefault);
  }, [comparison2Default]);
  // Keep the form for controls rendered by the report, even when it has no visible fields of its own.
  const hasControls = dates || comparison !== undefined;
  /** Choices apply on change; typed dates wait for Apply. The form's own submit handler still validates dates. */
  const applyOnChange = (event: React.ChangeEvent<HTMLSelectElement>) => event.currentTarget.form?.requestSubmit();
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
      className={cn(
        "flex min-h-9 items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring pointer-coarse:min-h-11",
        preset.active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted",
      )}
    >
      {preset.label}
      <LinkPending />
    </Link>
  );
  return (
    <Form
      ref={formRef}
      prefetch={false}
      id={REPORT_FILTER_FORM_ID}
      action={pathname}
      aria-label="Report filters"
      data-agent-target="Report filters"
      data-agent-component="FilterBar"
      className={hasControls ? "flex flex-col gap-3" : "hidden"}
      onSubmit={(event) => {
        if (!dates || maxDate === undefined) return;
        const data = new FormData(event.currentTarget);
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
          event.preventDefault();
          setDatesOpen(true);
          focusFrom.current = true;
        }
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
            aria-label={`Change dates, ${rangeLabel}`}
            aria-describedby={comparison !== undefined ? `${id}-comparison-summary` : undefined}
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
              {comparisonSummary && (
                <span id={`${id}-comparison-summary`} className="font-normal text-muted-foreground">
                  {comparisonSummary}
                </span>
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
              <SubmitPending idle="Apply" pending="Updating…" />
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
                  onChange={applyOnChange}
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
                  onChange={applyOnChange}
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
      <SubmitAnnouncement pending="Updating the report." />
    </Form>
  );
}

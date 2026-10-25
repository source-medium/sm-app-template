"use client";

import Form from "next/form";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { COMPARISON_OPTIONS, type ComparisonMode } from "@/lib/comparison";
import { dateRangeIssue, REPORT_FILTER_FORM_ID } from "@/lib/filters";
import { LinkPending, SubmitAnnouncement, SubmitPending } from "./pending";

export type FilterPreset = { label: string; href: string; active: boolean };

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
  comparisonLabel = "Compare with",
  carriedComparison,
  carriedComparison2,
  rangeLabel,
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
  comparisonLabel?: string;
  /** Another report's comparison choices, carried through a report that has none. */
  carriedComparison?: string;
  carriedComparison2?: string;
  /** The applied range as text; on phones the date fields collapse behind it. */
  rangeLabel?: string;
}) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const [datesOpen, setDatesOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  // The From field takes focus once it is in the layout: after Change reveals it, or after an invalid submit.
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
  // Keep the form for controls rendered by the report, even when it has no visible fields of its own.
  const hasControls = dates || comparison !== undefined;
  /** Choices apply on change; typed dates wait for Apply. The form's own submit handler still validates dates. */
  const applyOnChange = (event: React.ChangeEvent<HTMLSelectElement>) => event.currentTarget.form?.requestSubmit();
  const frequent = new Set(["Last 7 days", "Last 28 days"]);
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
      className={
        hasControls
          ? "grid grid-cols-1 items-end gap-3 rounded-xl border bg-card p-3 min-[24rem]:grid-cols-2 sm:flex sm:flex-wrap"
          : "hidden"
      }
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
      {comparison !== undefined && (
        <div
          className={cn(
            "flex min-w-0 flex-col gap-1.5 sm:order-2 sm:w-48",
            dates && rangeLabel && !datesOpen && "max-sm:hidden",
          )}
        >
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
        <div
          className={cn(
            "flex min-w-0 flex-col gap-1.5 sm:order-2 sm:w-48",
            dates && rangeLabel && !datesOpen && "max-sm:hidden",
          )}
        >
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
      {dates && rangeLabel && !datesOpen && (
        // Phones: the applied range reads as text until someone wants to change it; wider screens show the fields.
        <button
          type="button"
          aria-label={`Change dates, ${rangeLabel}`}
          aria-describedby={comparison !== undefined ? `${id}-comparison-summary` : undefined}
          data-agent-element="Change dates"
          onClick={() => {
            setDatesOpen(true);
            focusFrom.current = true;
          }}
          className="col-span-full flex min-h-11 items-center justify-between gap-3 rounded-md border border-input bg-background px-3 py-2 text-left text-sm sm:hidden"
        >
          <span className="min-w-0">
            <span className="block text-xs font-medium text-muted-foreground">Dates</span>
            <span className="block">{rangeLabel}</span>
            {comparison !== undefined && (
              <span id={`${id}-comparison-summary`} className="block text-xs text-muted-foreground">
                {comparisonLabel}: {COMPARISON_OPTIONS.find((option) => option.value === comparison)?.label}
                {comparison2 !== undefined &&
                  comparison !== "off" &&
                  `; and ${COMPARISON_OPTIONS.find((option) => option.value === comparison2)?.label?.toLowerCase()}`}
              </span>
            )}
          </span>
          <span className="shrink-0 text-xs font-medium text-primary">Change</span>
        </button>
      )}
      {dates ? (
        <div
          className={cn(
            "col-span-full grid min-w-0 grid-cols-1 gap-3 min-[24rem]:grid-cols-2 sm:order-1",
            rangeLabel && !datesOpen && "max-sm:hidden",
          )}
        >
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
      <Button
        data-agent-element="Apply"
        type="submit"
        variant="secondary"
        className={cn("sm:order-3", dates && rangeLabel && !datesOpen && "max-sm:hidden")}
      >
        <SubmitPending idle="Apply" pending="Updating…" />
      </Button>
      <SubmitAnnouncement pending="Updating the report." />
      {error && (
        <p id={`${id}-error`} role="alert" className="col-span-full basis-full text-sm text-destructive sm:order-4">
          {error}
        </p>
      )}
      {presets.length > 0 && (
        <nav aria-label="Date presets" className="col-span-full flex basis-full flex-wrap items-start gap-1 sm:order-5">
          {presets.filter((preset) => frequent.has(preset.label)).map(presetLink)}
          <details className="group">
            <summary className="flex min-h-9 w-fit cursor-pointer list-none items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden">
              More dates
              <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="flex flex-wrap gap-1">
              {presets.filter((preset) => !frequent.has(preset.label)).map(presetLink)}
            </div>
          </details>
        </nav>
      )}
    </Form>
  );
}

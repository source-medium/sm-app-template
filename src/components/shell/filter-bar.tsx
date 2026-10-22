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

export type FilterPreset = { label: string; href: string; active: boolean };

/** One GET form owns every report control, including streamed fields associated by form id. */
export function FilterBar({
  pathname,
  storeId,
  from,
  to,
  maxDate,
  maxDays,
  presets,
  dates = true,
  comparison,
  comparisonLabel = "Compare with",
  carriedComparison,
  rangeLabel,
}: {
  pathname: string;
  storeId: string;
  /** Absent when the store's date is unknown; the date controls are then hidden. */
  from?: string;
  to?: string;
  maxDate?: string;
  maxDays?: number;
  presets: FilterPreset[];
  dates?: boolean;
  comparison?: ComparisonMode;
  comparisonLabel?: string;
  carriedComparison?: string;
  /** The applied range as text; on phones the date fields collapse behind it. */
  rangeLabel?: string;
}) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const [datesOpen, setDatesOpen] = useState(false);
  // The From field takes focus once it is in the layout: after Change reveals it, or after an invalid submit.
  const focusFrom = useRef(false);
  useEffect(() => {
    if (!focusFrom.current) return;
    focusFrom.current = false;
    document.getElementById(`${id}-from`)?.focus();
  });
  // Keep the form for controls rendered by the report, even when it has no visible fields of its own.
  const hasControls = dates || comparison !== undefined;
  /** Choices apply on change; typed dates wait for Apply. The form's own submit handler still validates dates. */
  const applyOnChange = (event: React.ChangeEvent<HTMLSelectElement>) => event.currentTarget.form?.requestSubmit();
  const frequent = new Set(["Last 7 days", "Last 28 days"]);
  const presetLink = (preset: FilterPreset) => (
    <Link
      key={preset.label}
      data-agent-element={preset.label}
      href={preset.href}
      aria-current={preset.active ? "true" : undefined}
      className={cn(
        "flex min-h-9 items-center justify-center rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring pointer-coarse:min-h-11",
        preset.active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted",
      )}
    >
      {preset.label}
    </Link>
  );
  return (
    <Form
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
        const issue = dateRangeIssue(
          { from: String(data.get("from") ?? ""), to: String(data.get("to") ?? "") },
          maxDate,
          maxDays,
        );
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
      <input type="hidden" name="store" value={storeId} />
      {comparison !== undefined && (
        <div className="flex min-w-0 flex-col gap-1.5 sm:order-2 sm:w-48">
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
      {dates && rangeLabel && !datesOpen && (
        // Phones: the applied range reads as text until someone wants to change it; wider screens show the fields.
        <button
          type="button"
          aria-label={`Change dates, ${rangeLabel}`}
          data-agent-element="Change dates"
          onClick={() => {
            setDatesOpen(true);
            focusFrom.current = true;
          }}
          className="col-span-full flex min-h-11 items-center justify-between gap-3 rounded-md border border-input bg-background px-3 text-left text-sm sm:hidden"
        >
          <span className="min-w-0">
            <span className="block text-xs font-medium text-muted-foreground">Dates</span>
            <span className="block truncate">{rangeLabel}</span>
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
        Apply
      </Button>
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

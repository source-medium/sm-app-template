"use client";

import Form from "next/form";
import Link from "next/link";
import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { COMPARISON_OPTIONS, type ComparisonMode } from "@/lib/comparison";
import { dateRangeIssue, REPORT_FILTER_FORM_ID } from "@/lib/filters";
import type { StoreOption } from "@/lib/data/stores.server";

export type FilterPreset = { label: string; href: string; active: boolean };

/** One GET form owns every report control, including streamed fields associated by form id. */
export function FilterBar({
  pathname,
  stores,
  storeId,
  from,
  to,
  maxDate,
  presets,
  dates = true,
  comparison,
  comparisonLabel = "Compare with",
  carriedComparison,
  fixedStore = false,
}: {
  pathname: string;
  stores: StoreOption[];
  storeId: string;
  /** Absent when the store's date is unknown; the date controls are then hidden. */
  from?: string;
  to?: string;
  maxDate?: string;
  presets: FilterPreset[];
  dates?: boolean;
  comparison?: ComparisonMode;
  comparisonLabel?: string;
  carriedComparison?: string;
  fixedStore?: boolean;
}) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const brands = new Map<string | null, StoreOption[]>();
  const labelCounts = new Map<string, number>();
  for (const store of stores) {
    const group = brands.get(store.brand) ?? [];
    group.push(store);
    brands.set(store.brand, group);
    labelCounts.set(store.label, (labelCounts.get(store.label) ?? 0) + 1);
  }
  const storeOption = (store: StoreOption) => (
    <option key={store.id} value={store.id}>
      {(labelCounts.get(store.label) ?? 0) > 1 ? `${store.label} (${store.id})` : store.label}
    </option>
  );
  /** Choices apply on change; typed dates wait for Apply. The form's own submit handler still validates dates. */
  const applyOnChange = (event: React.ChangeEvent<HTMLSelectElement>) => event.currentTarget.form?.requestSubmit();
  const frequent = new Set(["Last 7 days", "Last 28 days"]);
  const presetLink = (preset: FilterPreset) => (
    <Link
      key={preset.label}
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
      className="grid grid-cols-2 items-end gap-3 rounded-xl border bg-card p-3 sm:flex sm:flex-wrap"
      onSubmit={(event) => {
        if (!dates || maxDate === undefined) return;
        const data = new FormData(event.currentTarget);
        const issue = dateRangeIssue(
          { from: String(data.get("from") ?? ""), to: String(data.get("to") ?? "") },
          maxDate,
        );
        setError(issue);
        if (issue) {
          event.preventDefault();
          (event.currentTarget.elements.namedItem("from") as HTMLInputElement)?.focus();
        }
      }}
    >
      {comparison === undefined && carriedComparison && (
        <input type="hidden" name="compare" value={carriedComparison} />
      )}
      <div className="flex min-w-0 flex-col gap-1.5 sm:w-48">
        {fixedStore && <input type="hidden" name="store" value={storeId} />}
        <label htmlFor={`${id}-store`} className="text-xs font-medium text-muted-foreground">
          Store
        </label>
        <NativeSelect
          id={`${id}-store`}
          name="store"
          defaultValue={storeId}
          disabled={fixedStore}
          onChange={applyOnChange}
        >
          {!stores.some((store) => store.id === storeId) && <option value={storeId}>Choose a store</option>}
          {Array.from(brands, ([brand, members]) =>
            brand ? (
              <optgroup key={brand} label={brand}>
                {members.map(storeOption)}
              </optgroup>
            ) : (
              members.map(storeOption)
            ),
          )}
        </NativeSelect>
      </div>
      {comparison !== undefined && (
        <div className="flex min-w-0 flex-col gap-1.5 sm:order-2 sm:w-48">
          <label htmlFor={`${id}-compare`} className="text-xs font-medium text-muted-foreground">
            {comparisonLabel}
          </label>
          <NativeSelect id={`${id}-compare`} name="compare" defaultValue={comparison} onChange={applyOnChange}>
            {COMPARISON_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}
      {dates ? (
        <div className="col-span-full grid min-w-0 grid-cols-2 gap-3 sm:order-1">
          <div className="flex min-w-0 flex-col gap-1.5 sm:w-36">
            <label htmlFor={`${id}-from`} className="text-xs font-medium text-muted-foreground">
              From
            </label>
            <Input
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
      <Button type="submit" variant="secondary" className="sm:order-3">
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

"use client";

/**
 * Store and date filters as a plain GET form, so the URL holds the state and
 * the page works without JavaScript. Changing the store submits at once;
 * dates apply with the button. Everything shown here (dates, preset links)
 * is computed on the server.
 */
import Form from "next/form";
import Link from "next/link";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { COMPARISON_OPTIONS, type ComparisonMode } from "@/lib/comparison";

export type FilterPreset = { label: string; href: string; active: boolean };

export function FilterBar({
  pathname,
  stores,
  storeId,
  from,
  to,
  maxDate,
  presets,
  preserved,
  dates = true,
  comparison,
}: {
  pathname: string;
  stores: { id: string; label: string }[];
  storeId: string;
  from: string;
  to: string;
  maxDate: string;
  presets: FilterPreset[];
  /** Other URL parameters this view keeps when filters change, such as a channel. */
  preserved: Record<string, string>;
  /** False hides the date inputs; the URL's dates still pass through for other views. */
  dates?: boolean;
  /** Only reports that implement comparisons show this control. */
  comparison?: ComparisonMode;
}) {
  const id = useId();
  return (
    <Form
      action={pathname}
      aria-label="Report filters"
      className="grid grid-cols-1 items-end gap-3 rounded-xl border bg-card p-4 min-[360px]:grid-cols-2 sm:flex sm:flex-wrap"
    >
      {Object.entries(preserved)
        .filter(([name]) => name !== "compare" || comparison === undefined)
        .map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
      <div className="col-span-full flex min-w-0 flex-col gap-1.5 sm:w-48">
        <label htmlFor={`${id}-store`} className="text-xs font-medium text-muted-foreground">
          Store
        </label>
        <NativeSelect
          id={`${id}-store`}
          name="store"
          defaultValue={storeId}
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
        >
          {!stores.some((store) => store.id === storeId) && <option value={storeId}>Choose a store</option>}
          {stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.label}
            </option>
          ))}
        </NativeSelect>
      </div>
      {dates ? (
        <div className="col-span-full grid min-w-0 grid-cols-1 gap-3 min-[360px]:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1.5 sm:w-36">
            <label htmlFor={`${id}-from`} className="text-xs font-medium text-muted-foreground">
              From
            </label>
            <Input id={`${id}-from`} type="date" name="from" defaultValue={from} max={maxDate} required />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5 sm:w-36">
            <label htmlFor={`${id}-to`} className="text-xs font-medium text-muted-foreground">
              To
            </label>
            <Input id={`${id}-to`} type="date" name="to" defaultValue={to} max={maxDate} required />
          </div>
        </div>
      ) : (
        <>
          <input type="hidden" name="from" value={from} />
          <input type="hidden" name="to" value={to} />
        </>
      )}
      {comparison !== undefined && (
        <div className="col-span-full flex min-w-0 flex-col gap-1.5 sm:w-48">
          <label htmlFor={`${id}-compare`} className="text-xs font-medium text-muted-foreground">
            Compare with
          </label>
          <NativeSelect id={`${id}-compare`} name="compare" defaultValue={comparison}>
            {COMPARISON_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}
      <Button type="submit" variant="secondary" className="col-span-full">
        Apply
      </Button>
      <nav aria-label="Date presets" className="col-span-full grid grid-cols-3 gap-1 sm:ml-auto sm:flex">
        {presets.map((preset) => (
          <Link
            key={preset.label}
            href={preset.href}
            aria-current={preset.active ? "true" : undefined}
            className={cn(
              "flex min-h-9 flex-1 items-center justify-center rounded-md px-1.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:px-2.5 pointer-coarse:min-h-11",
              preset.active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {preset.label}
          </Link>
        ))}
      </nav>
    </Form>
  );
}

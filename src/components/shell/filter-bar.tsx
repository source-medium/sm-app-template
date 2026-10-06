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
import { cn } from "@/lib/utils";

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
}) {
  const id = useId();
  return (
    <Form
      action={pathname}
      aria-label="Report filters"
      className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3"
    >
      {Object.entries(preserved).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <div className="flex min-w-48 flex-col gap-1">
        <label htmlFor={`${id}-store`} className="text-xs font-medium text-muted-foreground">
          Store
        </label>
        <select
          id={`${id}-store`}
          name="store"
          defaultValue={storeId}
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          {!stores.some((store) => store.id === storeId) && <option value={storeId}>Choose a store</option>}
          {stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.label}
            </option>
          ))}
        </select>
      </div>
      {dates ? (
        <>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-from`} className="text-xs font-medium text-muted-foreground">
              From
            </label>
            <input
              id={`${id}-from`}
              type="date"
              name="from"
              defaultValue={from}
              max={maxDate}
              required
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-to`} className="text-xs font-medium text-muted-foreground">
              To
            </label>
            <input
              id={`${id}-to`}
              type="date"
              name="to"
              defaultValue={to}
              max={maxDate}
              required
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            />
          </div>
        </>
      ) : (
        <>
          <input type="hidden" name="from" value={from} />
          <input type="hidden" name="to" value={to} />
        </>
      )}
      <Button type="submit" variant="secondary">
        Apply
      </Button>
      <nav aria-label="Date presets" className="flex flex-wrap gap-1 sm:ml-auto">
        {presets.map((preset) => (
          <Link
            key={preset.label}
            href={preset.href}
            aria-current={preset.active ? "true" : undefined}
            className={cn(
              "rounded-md px-2.5 py-1.5 text-xs font-medium",
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

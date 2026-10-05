"use client";

/**
 * One dimension filter (a channel, a sort order) as a GET form, so the
 * choice lives in the URL. Submits on change; the Apply button appears on
 * keyboard focus and works without JavaScript.
 */
import Form from "next/form";
import { useId } from "react";
import { Button } from "@/components/ui/button";

export function SelectFilter({
  pathname,
  name,
  label,
  value,
  options,
  preserved,
}: {
  pathname: string;
  name: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  /** The other URL parameters to keep, such as store and dates. */
  preserved: Record<string, string>;
}) {
  const id = useId();
  return (
    <Form action={pathname} className="flex items-end gap-2">
      {Object.entries(preserved).map(([key, preservedValue]) => (
        <input key={key} type="hidden" name={key} value={preservedValue} />
      ))}
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
          {label}
        </label>
        <select
          id={id}
          name={name}
          defaultValue={value}
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
          className="h-9 min-w-40 rounded-md border border-input bg-background px-2 text-sm"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {/* Changing the selection submits; this button serves keyboard users and pages without JavaScript. */}
      <Button type="submit" variant="secondary" size="sm" className="sr-only focus:not-sr-only">
        Apply
      </Button>
    </Form>
  );
}

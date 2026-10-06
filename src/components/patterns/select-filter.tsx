"use client";

/**
 * One dimension filter (a channel, a sort order) as a GET form, so the
 * choice lives in the URL. Submits on change; the Apply button appears on
 * keyboard focus and works without JavaScript.
 */
import Form from "next/form";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";

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
  /** URL parameters to keep. This picker excludes its own name. */
  preserved: Record<string, string>;
}) {
  const id = useId();
  return (
    <Form action={pathname} className="flex items-end gap-2">
      {Object.entries(preserved)
        .filter(([key]) => key !== name)
        .map(([key, preservedValue]) => (
          <input key={key} type="hidden" name={key} value={preservedValue} />
        ))}
      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
          {label}
        </label>
        <NativeSelect
          id={id}
          name={name}
          defaultValue={value}
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
          className="min-w-40"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
      </div>
      {/* Changing the selection submits; this button serves keyboard users and pages without JavaScript. */}
      <Button type="submit" variant="secondary" size="sm" className="sr-only focus:not-sr-only">
        Apply
      </Button>
    </Form>
  );
}

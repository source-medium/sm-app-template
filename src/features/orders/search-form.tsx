"use client";

import { REPORT_FILTER_FORM_ID } from "@/lib/filters";
import { useId } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Order search as a GET form; the term lives in the URL like every other filter. */
export function OrderSearchForm({ search }: { search: string }) {
  const id = useId();
  return (
    // The label sits beside the field from a tablet up, so the search is one row level with the section's title.
    <div role="search" className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
      <label htmlFor={id} className="text-sm font-medium">
        Find an order
      </label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="search"
          name="q"
          form={REPORT_FILTER_FORM_ID}
          defaultValue={search}
          maxLength={64}
          placeholder="Name, number, or id"
          className="min-w-0 flex-1 sm:w-64 sm:flex-none"
        />
        <Button type="submit" form={REPORT_FILTER_FORM_ID} variant="secondary">
          <Search aria-hidden />
          Search
        </Button>
      </div>
    </div>
  );
}

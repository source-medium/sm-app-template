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
    <div role="search" className="flex items-end gap-2">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-none">
        <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
          Find an order
        </label>
        <Input
          id={id}
          type="search"
          name="q"
          form={REPORT_FILTER_FORM_ID}
          defaultValue={search}
          maxLength={64}
          placeholder="Name, number, or id"
          className="sm:w-64"
        />
      </div>
      <Button type="submit" form={REPORT_FILTER_FORM_ID} variant="secondary">
        <Search aria-hidden />
        Search
      </Button>
    </div>
  );
}

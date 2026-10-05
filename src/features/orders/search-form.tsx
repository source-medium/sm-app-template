"use client";

import Form from "next/form";
import { useId } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Order search as a GET form; the term lives in the URL like every other filter. */
export function OrderSearchForm({
  pathname,
  search,
  preserved,
}: {
  pathname: string;
  search: string;
  preserved: Record<string, string>;
}) {
  const id = useId();
  return (
    <Form action={pathname} role="search" className="flex items-end gap-2">
      {Object.entries(preserved).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
          Find an order
        </label>
        <Input
          id={id}
          type="search"
          name="q"
          defaultValue={search}
          maxLength={64}
          placeholder="Order name, number, or id"
          className="w-64"
        />
      </div>
      <Button type="submit" variant="secondary">
        <Search aria-hidden />
        Search
      </Button>
    </Form>
  );
}

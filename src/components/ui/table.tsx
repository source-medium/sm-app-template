"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

function Table({
  className,
  containerClassName,
  regionLabel,
  ...props
}: React.ComponentProps<"table"> & {
  containerClassName?: string;
  /** Names the scroll container as a focusable region, so a keyboard can scroll a table wider or taller than it. */
  regionLabel?: string;
}) {
  return (
    <div
      data-slot="table-container"
      className={cn(
        "relative w-full overflow-auto",
        regionLabel && "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        containerClassName,
      )}
      {...(regionLabel ? { tabIndex: 0, role: "region", "aria-label": regionLabel } : {})}
    >
      <table
        data-slot="table"
        className={cn(
          "w-full caption-bottom text-sm [&_tbody_tr:focus-within>:first-child]:bg-muted [&_tbody_tr:hover>:first-child]:bg-muted [&_tbody_tr>:first-child]:bg-card [&_tfoot_tr>:first-child]:bg-muted [&_thead_tr>:first-child]:bg-muted [&_tr>:first-child]:sticky [&_tr>:first-child]:left-0 [&_tr>:first-child]:z-1 [&_tr>:first-child]:max-w-48 [&_tr>:first-child]:break-words [&_tr>:first-child]:whitespace-normal",
          className,
        )}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead data-slot="table-header" className={cn("[&_tr]:border-b", className)} {...props} />;
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors focus-within:bg-muted hover:bg-muted has-aria-expanded:bg-muted data-[state=selected]:bg-muted",
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-11 px-3 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "px-3 py-2.5 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className,
      )}
      {...props}
    />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return <tfoot data-slot="table-footer" className={cn("border-t bg-muted font-medium", className)} {...props} />;
}

export { TableFooter, Table, TableHeader, TableBody, TableHead, TableRow, TableCell };

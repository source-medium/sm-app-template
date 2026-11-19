"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useScrollEdges } from "@/hooks/use-scroll-edges";

/**
 * Shades each edge of the scroll frame that has more rows or columns beyond it
 * (`data-more-*` from useScrollEdges), so a cut-off column or row reads as
 * "scroll for more", not as the end of the table. Shades take no space and
 * let the pointer through.
 */
const EDGE_SHADES = [
  // The frame's own pseudo-elements share the table's grid cell, so they stick to its bottom and end edges.
  "before:pointer-events-none before:sticky before:bottom-0 before:z-20 before:h-8 before:self-end before:bg-linear-to-t before:from-scroll-cue before:opacity-0 before:transition-opacity before:[grid-area:1/1] data-more-bottom:before:opacity-100",
  "after:pointer-events-none after:sticky after:right-0 after:z-20 after:w-8 after:justify-self-end after:bg-linear-to-l after:from-scroll-cue after:opacity-0 after:transition-opacity after:[grid-area:1/1] data-more-end:after:opacity-100",
  // The pinned header row and first column cast the same shade over what scrolls beneath them.
  "[&_thead_th]:before:pointer-events-none [&_thead_th]:before:absolute [&_thead_th]:before:inset-x-0 [&_thead_th]:before:top-full [&_thead_th]:before:h-5 [&_thead_th]:before:bg-linear-to-b [&_thead_th]:before:from-scroll-cue [&_thead_th]:before:opacity-0 [&_thead_th]:before:transition-opacity data-more-top:[&_thead_th]:before:opacity-100",
  "[&_tr>:first-child]:after:pointer-events-none [&_tr>:first-child]:after:absolute [&_tr>:first-child]:after:inset-y-0 [&_tr>:first-child]:after:left-full [&_tr>:first-child]:after:w-5 [&_tr>:first-child]:after:bg-linear-to-r [&_tr>:first-child]:after:from-scroll-cue [&_tr>:first-child]:after:opacity-0 [&_tr>:first-child]:after:transition-opacity data-more-start:[&_tr>:first-child]:after:opacity-100",
].join(" ");

/** A table in a frame that scrolls when the table is wider or taller than it, with its first column pinned. */
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
  const container = React.useRef<HTMLDivElement>(null);
  useScrollEdges(container);
  return (
    <div
      ref={container}
      data-slot="table-container"
      className={cn(
        // A grid, so the table and the frame's edge shades can share one cell.
        "relative grid w-full [scrollbar-width:thin] overflow-auto",
        EDGE_SHADES,
        regionLabel && "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        containerClassName,
      )}
      {...(regionLabel ? { tabIndex: 0, role: "region", "aria-label": regionLabel } : {})}
    >
      <table
        data-slot="table"
        className={cn(
          "w-full caption-bottom text-sm [grid-area:1/1] [&_tbody_tr:focus-within>:first-child]:bg-muted [&_tbody_tr:hover>:first-child]:bg-muted [&_tbody_tr>:first-child]:bg-card [&_tfoot_tr>:first-child]:bg-muted [&_thead_th]:relative [&_thead_tr>:first-child]:bg-muted [&_tr>:first-child]:sticky [&_tr>:first-child]:left-0 [&_tr>:first-child]:z-1 [&_tr>:first-child]:max-w-48 [&_tr>:first-child]:min-w-28 [&_tr>:first-child]:break-words [&_tr>:first-child]:whitespace-normal",
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

"use client";

/**
 * The shadcn data-table pattern on TanStack Table: sortable columns, client
 * pagination over the rows the server sent, and a sticky header. Cells
 * arrive formatted from the server; `sort` carries the raw value to sort by.
 * When the query helper reported truncation, a footer says so, so a table is
 * never silently shorter than the data.
 */
import Link from "next/link";
import { useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type CellContext,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type DataTableColumn = { key: string; header: string; align?: "left" | "right"; sortable?: boolean };
export type DataTableCell = { display: string; sort?: string | number | null; href?: string };
export type DataTableRow = { id: string; cells: Record<string, DataTableCell> };

/** A stable component identity preserves focused links when rows or sorting update. */
function DataCell({ row, column }: CellContext<DataTableRow, unknown>) {
  const cell = row.original.cells[column.id];
  if (!cell) return null;
  return cell.href ? (
    <Link href={cell.href} scroll={false} className="font-medium text-primary underline-offset-4 hover:underline">
      {cell.display}
    </Link>
  ) : (
    cell.display
  );
}

export function DataTable({
  caption,
  columns,
  rows,
  pageSize = 10,
  paginate = true,
  truncated = false,
  totals,
}: {
  caption: string;
  columns: DataTableColumn[];
  rows: DataTableRow[];
  pageSize?: number;
  paginate?: boolean;
  truncated?: boolean;
  /** Full-query totals supplied by the server, never the visible page's sum. */
  totals?: DataTableRow;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const columnDefs: ColumnDef<DataTableRow>[] = columns.map((column) => ({
    id: column.key,
    header: column.header,
    accessorFn: (row) => row.cells[column.key]?.sort ?? row.cells[column.key]?.display ?? null,
    enableSorting: column.sortable ?? true,
    sortUndefined: "last",
    cell: DataCell,
  }));

  const table = useReactTable({
    data: rows,
    columns: columnDefs,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    ...(paginate ? { getPaginationRowModel: getPaginationRowModel(), initialState: { pagination: { pageSize } } } : {}),
  });

  return (
    <div className="flex flex-col gap-3">
      <Table
        containerClassName="max-h-[32rem] rounded-xl border bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        containerProps={{ tabIndex: 0, role: "region", "aria-label": caption }}
      >
        <caption className="sr-only">{caption}</caption>
        <TableHeader className="sticky top-0 z-10 bg-muted">
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => {
                const column = columns.find((item) => item.key === header.column.id);
                const sorted = header.column.getIsSorted();
                const Icon = sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ArrowUpDown;
                return (
                  <TableHead
                    key={header.id}
                    className={cn(column?.align === "right" && "text-right")}
                    aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                  >
                    {header.column.getCanSort() ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className={cn(
                          "inline-flex min-h-9 items-center gap-2 rounded-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring pointer-coarse:min-h-11",
                          column?.align === "right" && "flex-row-reverse",
                        )}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <Icon className="size-3.5 text-muted-foreground" aria-hidden />
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => {
                const column = columns.find((item) => item.key === cell.column.id);
                return (
                  <TableCell key={cell.id} className={cn(column?.align === "right" && "text-right tabular-nums")}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
        {totals && (
          <TableFooter>
            <TableRow>
              {columns.map((column, index) =>
                index === 0 ? (
                  <TableHead key={column.key} scope="row">
                    {totals.cells[column.key]?.display}
                  </TableHead>
                ) : (
                  <TableCell key={column.key} className={cn(column.align === "right" && "text-right tabular-nums")}>
                    {totals.cells[column.key]?.display}
                  </TableCell>
                ),
              )}
            </TableRow>
          </TableFooter>
        )}
      </Table>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          {truncated
            ? `Showing the first ${rows.length} rows; more rows matched than this view loads.`
            : `${rows.length} ${rows.length === 1 ? "row" : "rows"}`}
        </span>
        {paginate && table.getPageCount() > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Previous
            </Button>
            <span>
              Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
            </span>
            <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

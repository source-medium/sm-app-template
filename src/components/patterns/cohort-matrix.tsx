import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type CohortCell = {
  display: string;
  description: string;
  intensity: number | null;
  state: "value" | "missing" | "immature";
};
const SHADES = ["bg-primary/5", "bg-primary/10", "bg-primary/15", "bg-primary/20", "bg-primary/25"] as const;

/** Accessible presentation only. The feature supplies age eligibility, values, labels and color scale. */
export function CohortMatrix({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: string[];
  rows: { id: string; label: string; size: string; cells: CohortCell[] }[];
}) {
  return (
    <Table
      containerClassName="max-h-[40rem] rounded-xl border bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      containerProps={{ tabIndex: 0, role: "region", "aria-label": caption }}
    >
      <caption className="sr-only">{caption}</caption>
      <TableHeader className="sticky top-0 z-10 bg-muted">
        <TableRow>
          <TableHead>Cohort</TableHead>
          <TableHead className="text-right">Customers</TableHead>
          {columns.map((column) => (
            <TableHead key={column} className="text-right">
              {column}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableHead scope="row" className="font-medium text-foreground">
              {row.label}
            </TableHead>
            <TableCell className="text-right tabular-nums">{row.size}</TableCell>
            {row.cells.map((cell, index) => (
              <TableCell
                key={columns[index]}
                title={cell.description}
                aria-label={`${row.label}, ${columns[index]}: ${cell.description}`}
                data-state={cell.state}
                className={cn(
                  "min-w-20 text-right tabular-nums",
                  cell.state === "immature" && "bg-muted/30 text-muted-foreground",
                  cell.state === "missing" && "text-muted-foreground",
                  cell.state === "value" &&
                    cell.intensity !== null &&
                    SHADES[Math.min(4, Math.max(0, Math.floor(cell.intensity * 5)))],
                )}
              >
                {cell.display}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

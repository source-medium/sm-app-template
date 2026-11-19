import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type CohortCell = {
  display: string;
  description: string;
  intensity: number | null;
  state: "value" | "missing" | "immature";
};
/**
 * Accessible presentation only. The feature supplies age eligibility, values,
 * labels and each cell's intensity, or null for a cell it leaves unshaded.
 * Shades run continuously from the lowest to the highest intensity, so equal
 * values match and the order of shades is the order of values.
 */
export function CohortMatrix({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: string[];
  rows: { id: string; label: string; size: string; cells: CohortCell[] }[];
}) {
  const intensities = rows.flatMap((row) =>
    row.cells.flatMap((cell) => (cell.state === "value" && cell.intensity !== null ? [cell.intensity] : [])),
  );
  const lowest = Math.min(...intensities);
  const highest = Math.max(...intensities);
  /** The cell's place from the lowest (0) to the highest (1) intensity, or none for a cell without one. */
  const shade = (cell: CohortCell) => {
    if (cell.state !== "value" || cell.intensity === null) return undefined;
    return highest > lowest ? Math.round(((cell.intensity - lowest) / (highest - lowest)) * 100) / 100 : 1;
  };
  return (
    <Table
      data-agent-target={caption}
      data-agent-component="CohortMatrix"
      containerClassName="max-h-[40rem] rounded-xl border bg-card"
      regionLabel={caption}
    >
      <caption className="sr-only">{caption}</caption>
      <TableHeader className="sticky top-0 z-10 bg-muted">
        <TableRow>
          <TableHead>Cohort</TableHead>
          <TableHead className="text-right">Customers</TableHead>
          {columns.map((column) => (
            <TableHead key={column} className="px-2 text-right">
              {column}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableHead scope="row" className="font-medium whitespace-nowrap! text-foreground">
              {row.label}
            </TableHead>
            <TableCell className="text-right tabular-nums">{row.size}</TableCell>
            {row.cells.map((cell, index) => {
              const position = shade(cell);
              return (
                <TableCell
                  key={columns[index]}
                  title={cell.description}
                  aria-label={`${row.label}, ${columns[index]}: ${cell.description}`}
                  data-state={cell.state}
                  data-shade={position}
                  style={
                    position === undefined
                      ? undefined
                      : {
                          // The theme sets the lightest and darkest shares (tokens.css); each cell sits between them by value.
                          backgroundColor: `color-mix(in oklab, var(--color-primary) calc(var(--cohort-lightest) + ${position} * (var(--cohort-darkest) - var(--cohort-lightest))), transparent)`,
                        }
                  }
                  className={cn(
                    "min-w-16 px-2 text-right tabular-nums",
                    cell.state === "immature" && "bg-muted/30 text-muted-foreground",
                    cell.state === "missing" && "text-muted-foreground",
                  )}
                >
                  {cell.display}
                </TableCell>
              );
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

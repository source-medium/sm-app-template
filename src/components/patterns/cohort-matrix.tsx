import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type CohortCell = {
  display: string;
  description: string;
  intensity: number | null;
  state: "value" | "missing" | "immature";
};
/** Primary's share of a shaded cell, lowest to highest value; the lightest still stands apart from an empty cell. */
const SHADE = { lightest: 12, darkest: 52 } as const;

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
  /** Primary's percentage in the cell's background, or none for a cell without an intensity. */
  const shade = (cell: CohortCell) => {
    if (cell.state !== "value" || cell.intensity === null) return undefined;
    const position = highest > lowest ? (cell.intensity - lowest) / (highest - lowest) : 1;
    return Math.round(SHADE.lightest + position * (SHADE.darkest - SHADE.lightest));
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
              const percent = shade(cell);
              return (
                <TableCell
                  key={columns[index]}
                  title={cell.description}
                  aria-label={`${row.label}, ${columns[index]}: ${cell.description}`}
                  data-state={cell.state}
                  data-shade={percent}
                  style={
                    percent === undefined
                      ? undefined
                      : { backgroundColor: `color-mix(in oklab, var(--color-primary) ${percent}%, transparent)` }
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
